# CI/CD, staging and production

## Environment separation

| Environment | Source                                 | GitHub environment | Vercel project        | Neon project             |
| ----------- | -------------------------------------- | ------------------ | --------------------- | ------------------------ |
| Local       | Feature branch                         | None               | Docker Compose        | Local PostgreSQL volume  |
| Staging     | `develop` after reviewed merge         | `staging`          | `openbracket-staging` | `openbracket-staging`    |
| Production  | `main` after release PR from `develop` | `production`       | `openbracket`         | `openbracket-production` |

The two hosted environments have independent stable URLs, auth secrets, databases and deployment project IDs. They use ongoing free plans, not paid trials. Both Vercel projects use the provider's Production deployment target: one is our staging application and the other is our production application. This does not require Vercel's paid custom-environment features. Never copy production data or credentials into staging. All demo identities remain synthetic.

The user selected Vercel and Neon and reported completing plugin setup. Hosted resources and URLs have not yet been verified by this session. GitHub deployment activation remains disabled until account configuration is verified.

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

| Setting             | Type                 | Value                                                     |
| ------------------- | -------------------- | --------------------------------------------------------- |
| `VERCEL_TOKEN`      | Environment secret   | A deploy token scoped to the intended Vercel account/team |
| `VERCEL_ORG_ID`     | Environment variable | Actual account/team ID                                    |
| `VERCEL_PROJECT_ID` | Environment variable | Actual project ID for this environment                    |
| `APP_URL`           | Environment variable | Its stable HTTPS origin                                   |
| `DEPLOY_ENABLED`    | Environment variable | `true` after configuration and initial verification       |

A plugin's interactive OAuth session does not automatically supply GitHub Actions with a deploy token. Configure the token directly in GitHub's environment secret UI; never paste it into chat, commit it, or put it in a command argument. The Vercel CLI reads `VERCEL_TOKEN` only in authenticated steps. Project IDs are ordinary configuration, not credentials.

6. Test staging first, then promote a reviewed release from `develop` to `main`. Record both verified URLs in the README. The first activation may use a manual deployment of the reviewed commit; all subsequent protected-branch merges run automatically.

## Release sequence

`ci.yml` calls the reusable `deploy.yml` only after `CI passed` succeeds on a push to `develop` or `main`. Pull requests never receive deployment secrets or deploy. Reusable workflow calls allow the first staging merge to deploy without waiting for a deployment workflow to be present on the default branch.

The job selects the matching GitHub environment, skips superseded commits, installs the lockfile and pinned Vercel CLI 66.2.0, and pulls that project's Production settings into the ignored `.vercel/` directory. It applies migrations and idempotent seed through the direct connection, builds the exact successful SHA, and uploads the prebuilt output with `--prod --skip-domain`. It injects `APP_REVISION` with the SHA, waits for the unique deployment's health endpoint to report that SHA, and only then promotes the deployment to its stable domain. The public domain must report the same SHA afterward. Downloaded environment values are removed and never uploaded as artifacts.

Both environments have deployment branch policies. No additional manual deployment approval is added after the protected PR review, preserving continuous deployment. Activation is explicit with `DEPLOY_ENABLED`; no missing secret is silently treated as a successful release.

## Database and rollback

Migrations must be additive and backward compatible. They run before promotion while the old release can still serve traffic. A failed migration prevents promotion, but reverting code does not revert a migration. Test migrations against production-like synthetic data and verify restore procedures before destructive schema changes. The seed creates missing demo records only; it never overwrites results.

Normally revert code through a reviewed PR and let CI redeploy. For an urgent rollback, use Vercel's rollback to the last known healthy deployment, then reconcile the source through a reviewed revert. Vercel rollback can disable automatic domain assignment until a deployment is promoted again; this pipeline explicitly promotes each verified release. Use a reviewed forward repair migration for schema problems, or a verified backup restore when necessary. Never use `prisma migrate reset` on either hosted environment.

## Operations

`/api/health` verifies the database and returns the deployed SHA without exposing connection details. Failed exact-revision checks prevent promotion. Inspect Vercel runtime/build logs, GitHub job output and Neon metrics for failures. Source retries, full realtime synchronization, load capacity, manual accessibility audits, backup rehearsal and monitoring remain roadmap work. Free-plan quotas and database scale-to-zero must be considered when designing background activity; no uptime or load-test result is claimed.
