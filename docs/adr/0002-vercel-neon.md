# ADR 0002: Free Vercel and Neon environments

Status: selected by the user. Separate projects, application environment variables and protected GitHub secrets were configured on 2026-11-19; Vercel Hobby is confirmed. Staging authentication, database preparation and upload work, but promotion awaits a Prisma runtime packaging fix and live verification. Production remains disabled; see [deployment status](../deployment.md).

## Context

The showcase must remain on ongoing free plans and have separate staging and production. The original Render plan cannot provide two lasting free PostgreSQL databases: its free databases are limited and expire. The user selected Vercel after comparing the options and reported completing Vercel and Neon plugin setup.

## Decision

Use two Vercel Hobby projects, `openbracket-staging` and `openbracket`, with two separate Neon Free projects, `openbracket-staging` and `openbracket-production`. Prefer Frankfurt for both providers to keep database and app traffic close together. Each Vercel project uses its own Production configuration: the application calls one staging and the other production. This avoids depending on paid custom environment features and gives the native client stable URLs.

Keep Prisma and Auth.js. Use a pooled Neon URL for requests and the matching direct URL for migrations. Migrations and idempotent seed run once in the selected environment's CI job, never inside a serverless request handler. Do not share credentials, records or quotas between database projects.

CI calls a reusable deployment workflow after all required checks pass on a protected-branch push. `develop` selects staging; `main` selects production. This also works before the deployment workflow exists on the repository's default branch. Disable Vercel's automatic Git deploys with `git.deploymentEnabled=false`, build with a pinned CLI, stage a production build without assigning the domain, verify its tested SHA, and promote that same build. An older healthy release cannot satisfy the gate.

## Consequences

Free plans impose usage limits and cold starts. No capacity or uptime guarantee is claimed. Long-running source synchronization and realtime workloads will need a separate reviewed design within available free quotas. Public synthetic showcase pages and native API access require an appropriate public deployment access setting; no real personal data may be added. Tokens remain in protected GitHub environment secrets, while application credentials remain in each Vercel project. Local development and container smoke tests still use Docker Compose.

## References

- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [Neon pricing](https://neon.com/pricing)
- [Vercel Git deployment controls](https://vercel.com/docs/project-configuration/git-configuration)
- [Neon and Prisma connections](https://neon.com/docs/guides/prisma)
