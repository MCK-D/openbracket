# Developer guide

## Quick start

Prerequisites: Git, Node.js 24, Docker Engine with Compose, and an available local port 3000. The database uses port 55432 to avoid a common conflict. From a fresh clone, run `npm run setup`. The script creates a local `.env` with a random auth secret, builds the app image, starts PostgreSQL, applies committed migrations, and seeds three synthetic tournaments. It waits until the health endpoint responds. No host-side dependency install is required for this path.

Open <http://localhost:3000>. Run tests inside the container with `docker compose exec app npm test`; run one simulation step with `docker compose exec app npm run demo`. Reload a tournament's schedule to see the result. The initial image build needs network access and can take several minutes. The 15-minute newcomer target still requires a fresh-machine timed rehearsal.

For active development:

```sh
npm ci
docker compose up db --detach --wait
npm run db:migrate
npm run db:seed
npm run dev
```

After the initial setup, `.env` already exists. Otherwise copy `.env.example` to `.env` and replace `AUTH_SECRET` with a random value of at least 32 characters before running the commands. `npm ci` generates Prisma Client. Use `npm run db:generate` if you change the schema.

## Layout

```text
prisma/                 Schema, immutable migrations and idempotent seed
public/                 Static assets
src/app/                Next.js App Router pages and route handlers
src/app/api/auth/       Auth.js route
src/app/api/trpc/       Typed backend transport
src/app/api/v1/         Versioned native-client read API
src/components/ui/     shadcn/ui components
src/server/api/         tRPC context, root router and feature routers
src/server/auth/        Server-only authentication
src/server/domain/      Framework-independent rules
src/server/connectors/  External-source contracts and future adapters
src/server/db.ts        Shared Prisma client
src/trpc/               React Query, RSC and client helpers
src/env.js              Validated server environment
src/styles/             Tailwind and design tokens
mobile/                 Independent native Android client
tests/                  Server, web and browser tests
docs/                   Versioned English documentation
```

This follows the [T3 App Router structure](https://create.t3.gg/en/folder-structure-app), choosing Prisma instead of Drizzle. Mobile is kept alongside the root web app so the web's recommended folder structure stays recognizable.

## Commands

| Command                                         | Purpose                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `npm run check`                                 | ESLint and TypeScript                                                    |
| `npm run format:write` / `npm run format:check` | Apply / verify formatting                                                |
| `npm test`                                      | All web and server unit/route tests, offline                             |
| `npm test -- tests/server/predictions.test.ts`  | Run one test file                                                        |
| `npm run build`                                 | Production web build                                                     |
| `npm run test:e2e`                              | Production browser/API/accessibility tests; requires seeded DB and build |
| `npm run db:migrate`                            | Apply committed migrations                                               |
| `npx prisma migrate dev --name description`     | Create a development migration                                           |
| `npm run db:seed`                               | Add missing demo records without overwriting existing records            |
| `npm run demo`                                  | Simulate one pending synthetic match                                     |
| `docker compose logs app`                       | Startup and database diagnostics                                         |
| `docker compose down`                           | Stop services while preserving the DB volume                             |

Run `npx playwright install chromium` once before browser tests. Native tests are run with `cd mobile && ./gradlew testDebugUnitTest`; see [mobile](mobile.md). CI is the single cross-platform entry point for all suites and builds.

## Extension points

Add a tournament format in the Prisma enum, add a pure engine under `src/server/domain/formats`, and cover byes, deterministic seeding, qualification and tie-breaks with unit tests before adding a router. No engine is currently implemented; the format enum describes planned support.

Add Pick'em question templates under a new `src/server/domain/pickem` module. Each template must declare required capabilities, validate its scoring configuration, and cancel rather than guess if resolution data is missing. Add tests for every resolution state before exposing a builder.

Register a new tRPC router in `src/server/api/root.ts`. All writes must use protected procedures, load current permissions from the DB, and include transactionally consistent audit records for sensitive changes. Avoid importing the database into pure domain modules.

## Current simulator boundary

The smoke simulator writes a result only for IDs prefixed with `demo-`. It does not generate brackets, resolve predictions, or broadcast events. Full simulation and load testing are separate roadmap stories. Keep this distinction in demos and documentation.
