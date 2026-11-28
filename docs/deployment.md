# CI/CD, staging and production

## Environment separation

| Environment | Source                                 | GitHub environment | Vercel project        | Neon project             |
| ----------- | -------------------------------------- | ------------------ | --------------------- | ------------------------ |
| Local       | Feature branch                         | None               | Docker Compose        | Local PostgreSQL volume  |
| Staging     | `develop` after reviewed merge         | `staging`          | `openbracket-staging` | `openbracket-staging`    |
| Production  | `main` after release PR from `develop` | `production`       | `openbracket`         | `openbracket-production` |

The two hosted environments have independent stable URLs, auth secrets, databases and deployment project IDs. They use ongoing free plans, not paid trials. Both Vercel projects use the provider's Production deployment target: one is our staging application and the other is our production application. This does not require Vercel's paid custom-environment features. Never copy production data or credentials into staging. All demo identities remain synthetic.

The projects and environment configuration were provisioned and checked on 2026-11-19. Neon organization `MCK` is on the Free plan, and the owner confirmed Vercel Hobby. Vercel projects target Node.js 24, Frankfurt, and public deployment access. Both protected GitHub environments contain the required `VERCEL_TOKEN`, database URL and auth secrets. Staging deployment is enabled; production remains disabled until staging is verified. PR #61 fixed secret forwarding: Vercel authentication, migrations, seed, build and upload succeeded for commit `8c6ad7c2838bbd1d853b26539589e12888413592`. Its unique deployment returned HTTP 503 because Prisma lacked the RHEL runtime engine, so the health gate correctly prevented promotion. The fix includes `rhel-openssl-3.0.x` alongside the native Prisma binary, explicitly traces it into the bundle, pins package engines to Node.js 24, and checks the prebuilt runtime and engine before upload. The package's earlier broad Node range had overridden Vercel's Node.js 24 project setting. No stable public origin is verified yet.

PRs #60, #61 and #62 were each merged after successful CI under separate explicit one-time owner-authorized independent-review exceptions while collaborator invitations were pending. The one-approval requirement, latest-push approval and administrator enforcement were immediately restored and verified after each merge. These exceptions do not authorize bypassing review for subsequent fixes.

PR #62's runtime fix is merged as `59c6c4305a16896f8bc9bef82cc2230586832f85`. Its deployment was stopped before upload by an overly strict bundle check that searched only physical `.func` files. An isolated Linux build with the pinned Vercel CLI reproduced this behavior: modern Vercel output instead references project dependencies through each function's `filePathMap`, including the required RHEL engine. The follow-up verifier checks those mapped source files (and supports traditional physical bundles), while still rejecting missing engines and non-24 Node runtimes. It passes against the real Linux build output; five regression tests cover mapped and physical bundles, missing source files, missing mappings and wrong runtimes.

| Environment | Vercel project ID                  | Neon project ID         | Configured domain (not live yet)       |
| ----------- | ---------------------------------- | ----------------------- | -------------------------------------- |
| Staging     | `prj_0ut0DXDhhhvyb1ZHhrBUvafEMOYt` | `falling-term-87859056` | `openbracket-staging-mck-d.vercel.app` |
| Production  | `prj_04RuSJjM7g0fEzdlU1XKHAhsD8fN` | `winter-bird-12737603`  | `openbracket-mck-d.vercel.app`         |

Both Vercel projects belong to `team_MFLlVhpivL75zeDl6TnqXvRd` (`micka-daouds-projects`). Both Neon projects belong to `org-lively-pond-75734198` (`MCK`), use PostgreSQL 17 in Frankfurt, and have independent `openbracket` databases. Each Vercel Production configuration contains its matching pooled/direct database URLs, a unique sensitive auth secret, auth origin, trusted-host flag and synthetic demo flag. The matching protected GitHub environment holds copies of the database URLs and auth secret for CI migrations and local builds: Vercel Secret values cannot be downloaded by `vercel pull`. GitHub environment variables contain the corresponding Vercel account/project IDs and origin; `DEPLOY_ENABLED` is `true` for staging and `false` for production. Provider secrets are not stored in the repository.

## Required PR checks

`.github/workflows/ci.yml` runs on every PR to `develop` or `main`, on pushes to those branches, and manually. Jobs check:

- Linked issue, production promotion source, Conventional Commit PR title, and every branch commit.
- ESLint, Prettier (including YAML and Markdown), and strict TypeScript.
- Offline server domain/route tests and web component tests.
- PostgreSQL migrations, seed, production build, and Playwright API/UI/axe checks.
- Native Android logic/UI unit tests with Robolectric, Android lint and an installable debug APK.
- Production Docker image build.

The `CI passed` aggregation check fails unless every job succeeds. It is required on both branches. Configure at least one approving review, dismissal of stale approvals, resolved conversations, strict/up-to-date checks, blocked force pushes/deletions, and enforcement for administrators. Initial empty-repository bootstrapping is the only direct branch initialization. PR review cannot be supplied by the PR author.

The workflow runs without hosting or connector secrets. No production secret is available to untrusted PR code. Failed browser traces and per-commit APKs are retained as artifacts. Android signing is the debug key for emulator/device demos; store publication and release signing are outside this foundation.

## Configure the two free environments

1. In Neon, select the Free plan and create two distinct projects. Prefer Frankfurt (`aws-eu-central-1`) to match Vercel's `fra1` region. Keep each project's default branch isolated. Record the actual project IDs after creation; do not assume a project name is an ID.
2. In Vercel, create the two projects under the intended Hobby account, select Next.js and Node.js 24, and retain `vercel.json`. Do not enable a Pro trial. Disable automatic Git deployments so only reviewed, successful GitHub CI can release code. The file sets `git.deploymentEnabled=false`.
3. Configure the following values separately in each Vercel project's **Production** environment:

| Variable                | Value                                                           |
| ----------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`          | That Neon project's pooled connection string, with TLS required |
| `DATABASE_URL_UNPOOLED` | The matching direct connection string, with TLS required        |
| `AUTH_SECRET`           | A unique random value of at least 32 characters                 |
| `AUTH_URL`              | That Vercel project's stable public HTTPS origin                |
| `AUTH_TRUST_HOST`       | `true` behind Vercel's trusted proxy                            |
| `DEMO_AUTH_ENABLED`     | `true` for the synthetic spectator demonstration                |

Both database URLs must identify the same database and user in the selected environment. `scripts/prepare-database.mjs` checks their host/database/user pairing and rejects a pooled migration endpoint before running migrations or seed. Prisma's `directUrl` points at `DATABASE_URL_UNPOOLED`; application requests continue using `DATABASE_URL`.

4. Make these synthetic showcase deployments public, including their unique deployment URLs, so the native API and pre-promotion health checks do not encounter Vercel Authentication. A private deployment requires a separately designed automation-bypass setup; do not weaken access controls on unrelated Vercel projects.
5. In the corresponding protected GitHub environment, set:

| Setting                 | Type                 | Value                                                     |
| ----------------------- | -------------------- | --------------------------------------------------------- |
| `VERCEL_TOKEN`          | Environment secret   | A deploy token scoped to the intended Vercel account/team |
| `DATABASE_URL`          | Environment secret   | Same pooled database URL as this Vercel project           |
| `DATABASE_URL_UNPOOLED` | Environment secret   | Same direct database URL as this Vercel project           |
| `AUTH_SECRET`           | Environment secret   | Same auth secret as this Vercel project                   |
| `VERCEL_ORG_ID`         | Environment variable | Actual account/team ID                                    |
| `VERCEL_PROJECT_ID`     | Environment variable | Actual project ID for this environment                    |
| `APP_URL`               | Environment variable | Its stable HTTPS origin                                   |
| `DEPLOY_ENABLED`        | Environment variable | `true` after configuration and initial verification       |

A plugin's interactive OAuth session does not automatically supply GitHub Actions with a deploy token. Configure the token directly in GitHub's environment secret UI; never paste it into chat, commit it, or put it in a command argument. The Vercel CLI reads `VERCEL_TOKEN` only in authenticated steps. Project IDs are ordinary configuration, not credentials.

Vercel credentials use its Secret type. After pulling project configuration, CI appends the three matching protected GitHub secrets to the downloaded environment file, overriding Vercel's redacted placeholders for the local build and migrations. Rotate both copies together. See [Vercel Secret variables](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types).

6. Test staging first, then promote a reviewed release from `develop` to `main`. Record both verified URLs in the README. The first activation may use a manual deployment of the reviewed commit; all subsequent protected-branch merges run automatically.

## Release sequence

`ci.yml` calls the reusable `deploy.yml` only after `CI passed` succeeds on a push to `develop` or `main`. Pull requests never receive deployment secrets or deploy. Reusable workflow calls allow the first staging merge to deploy without waiting for a deployment workflow to be present on the default branch.

The caller explicitly forwards `VERCEL_TOKEN`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `AUTH_SECRET`. The reusable job binds to the selected protected environment, whose secret values take precedence. Declaring the environment alone does not forward secrets: an omitted mapping resolves to an empty string. The workflow declares required secrets and checks for missing values without printing them before performing deployment work. See [GitHub reusable workflow secrets](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#using-inputs-and-secrets-in-a-reusable-workflow).

The job selects the matching GitHub environment, skips superseded commits, installs the lockfile and pinned Vercel CLI 66.2.0, and pulls that project's Production settings into the ignored `.vercel/` directory. It applies migrations and idempotent seed through the direct connection, builds the exact successful SHA, and uploads the prebuilt output with `--prod --skip-domain`. It injects `APP_REVISION` with the SHA, waits for the unique deployment's health endpoint to report that SHA, and only then promotes the deployment to its stable domain. The public domain must report the same SHA afterward. Downloaded environment values are removed and never uploaded as artifacts.

Both environments have deployment branch policies. No additional manual deployment approval is added after the protected PR review, preserving continuous deployment. Activation is explicit with `DEPLOY_ENABLED`; no missing secret is silently treated as a successful release.

## Database and rollback

The release-level procedure, tagging and the full code, database and Android rollback constraints are in [releases.md](releases.md).

Migrations must be additive and backward compatible. They run before promotion while the old release can still serve traffic. A failed migration prevents promotion, but reverting code does not revert a migration. Test migrations against production-like synthetic data and verify restore procedures before destructive schema changes. The seed creates missing demo records only; it never overwrites results.

Normally revert code through a reviewed PR and let CI redeploy. For an urgent rollback, use Vercel's rollback to the last known healthy deployment, then reconcile the source through a reviewed revert. Vercel rollback can disable automatic domain assignment until a deployment is promoted again; this pipeline explicitly promotes each verified release. Use a reviewed forward repair migration for schema problems, or a verified backup restore when necessary. Never use `prisma migrate reset` on either hosted environment.

## Operations

`/api/health` verifies the database and returns the deployed SHA without exposing connection details. Failed exact-revision checks prevent promotion. Inspect Vercel runtime/build logs, GitHub job output and Neon metrics for failures. Source retries, full realtime synchronization, load capacity, manual accessibility audits, backup rehearsal and monitoring remain roadmap work. Free-plan quotas and database scale-to-zero must be considered when designing background activity; no uptime or load-test result is claimed.
