# CI/CD, staging and production

## Environment separation

| Environment | Source                                 | GitHub environment | Render web service       | Database                    |
| ----------- | -------------------------------------- | ------------------ | ------------------------ | --------------------------- |
| Local       | Feature branch                         | None               | Docker Compose           | Local PostgreSQL volume     |
| Staging     | `develop` after reviewed merge         | `staging`          | `openbracket-staging`    | `openbracket-staging-db`    |
| Production  | `main` after release PR from `develop` | `production`       | `openbracket-production` | `openbracket-production-db` |

Each environment has independent URLs, auth secrets, sessions, databases and deploy hooks. Never copy a production database into staging. Only synthetic records are permitted in either demo environment. Hosting activation is explicitly deferred by the user; there is no online URL yet.

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

## Activate hosting later

1. Connect the repository to Render and apply `render.yaml`. It defines two Docker services and two distinct PostgreSQL databases. Free services may sleep; free databases may expire. Confirm current hosting limits before depending on them.
2. Set each service's `AUTH_URL` to its actual public HTTPS origin. Keep generated `AUTH_SECRET` values separate. Set `AUTH_TRUST_HOST=true` only behind the trusted platform proxy. Demo login stays synthetic and opt-in.
3. In each corresponding GitHub environment, add secret `RENDER_DEPLOY_HOOK`, variable `APP_URL` and variable `DEPLOY_ENABLED=true`. Keep every hook and API token out of commits and logs. There are no repository-wide deploy secrets.
4. Render automatic deployment is disabled. The Deploy workflow runs only after a successful push CI on `develop` or `main`, selects the matching environment, deploys that exact SHA, and waits for the health endpoint to report that SHA. PR builds never deploy. Superseded commits are skipped before deployment.
5. Verify staging first. Open a release PR from `develop` to `main`, review, merge, and verify production. Add both actual URLs to the README once activation is complete.

Both environments are created with deployment branch policies. Automatic deployment needs no additional manual approval after the protected branch is merged, matching the manual's continuous-deployment requirement. Hosting is currently disabled intentionally, not silently skipped for a missing secret.

## Database and rollback

The image starts by applying committed Prisma migrations and an idempotent seed before launching the server. Seed records are created only when absent and never reset user changes. Use additive, backward-compatible migrations; split destructive changes across releases and require a tested backup first. Migration failure prevents startup and the health check keeps the previous service revision serving.

For code rollback, revert through a reviewed PR on the affected branch and let CI redeploy. In an outage, redeploy the last known healthy SHA in Render, then reconcile with a reviewed revert. Reverting code does not revert the database: use a reviewed forward repair migration and restore only from a verified backup when necessary. Never run `prisma migrate reset` against staging or production.

## Operations

`/api/health` checks the database and returns no connection details on failure. Check service logs for migration/startup errors and GitHub Actions for build/test failures. Source API retries, durable worker scheduling, full audit history, rate limiting, backup restore rehearsal, load capacity and production monitoring are future issues. No capacity claims are made by this foundation.
