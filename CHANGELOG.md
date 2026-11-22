# Changelog

This project follows [Semantic Versioning](https://semver.org/) and [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Each milestone release has a dated `## [X.Y.Z] - YYYY-MM-DD` section; the release workflow publishes that section as the GitHub release notes. See [docs/releases.md](docs/releases.md).

## [Unreleased]

Planned as `0.1.0 - Foundation`. No release tag has been published yet.

### Added

- T3 App Router foundation with Prisma/PostgreSQL, tRPC, Auth.js, Tailwind and shadcn/ui conventions.
- Public tournament list, accessible match schedule, health endpoint, and native Android client skeleton.
- Idempotent synthetic demo seed and a bounded match simulator.
- PR policy, required CI checks, Android APK artifacts, and separate staging/production deployment configuration.
- Contributor, user, architecture, connector, accessibility, and operations documentation.
- GitHub epics and user stories mapped to the deliverable requirements.
- Tag-driven release workflow: SemVer, web/Android version and changelog checks, a production-targeted APK and its checksum attached to each GitHub release.

### Hosting

- Replace the Render blueprint with Vercel configuration and two isolated Neon database targets.
- Run deployment as a reusable workflow after successful protected-branch CI, including the first staging merge.
- Use direct database connections for migrations and seed, and pooled connections for the application.
- Verify the exact revision on a staged deployment before promoting its public domain.

### Changed

- Android `versionCode` is derived from the version (`major × 10000 + minor × 100 + patch`, `100` for 0.1.0) so every release installs over the previous one.
