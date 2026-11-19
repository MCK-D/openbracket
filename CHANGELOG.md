# Changelog

This project follows semantic versioning and Conventional Commits.

## Unreleased

- T3 App Router foundation with Prisma/PostgreSQL, tRPC, Auth.js, Tailwind and shadcn/ui conventions.
- Public tournament list, accessible match schedule, health endpoint, and native Android client skeleton.
- Idempotent synthetic demo seed and a bounded match simulator.
- PR policy, required CI checks, Android APK artifacts, and separate staging/production deployment configuration.
- Contributor, user, architecture, connector, accessibility, and operations documentation.
- GitHub epics and user stories mapped to the deliverable requirements.

No release tag has been published. The foundation must receive an independent review before merging.

### Hosting update

- Replace the Render blueprint with Vercel configuration and two isolated Neon database targets.
- Run deployment as a reusable workflow after successful protected-branch CI, including the first staging merge.
- Use direct database connections for migrations and seed, and pooled connections for the application.
- Verify the exact revision on a staged deployment before promoting its public domain.
