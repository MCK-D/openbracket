# ADR 0001: T3 foundation and independent native client

Status: accepted for the foundation. The hosting decision below is superseded by [ADR 0002](0002-vercel-neon.md).

## Context

The user selected T3, Prisma instead of Drizzle, App Router, shadcn/ui and Tailwind, English source/documentation, Conventional Commits, GitHub Projects, and separate staging/production. The manual requires reviewed PRs, protected branches, web/server/mobile CI, automatic online updates and mobile build artifacts. It prohibits wrapped websites and real personal demo data.

## Decision

Keep the web app at the repository root using the generated T3 App Router structure. Use PostgreSQL for transactional domain state and Prisma migrations. Use tRPC for web type safety and a small versioned REST read API for native consumers. Keep Auth.js server-side, with only an opt-in synthetic spectator provider until real identity work is reviewed. Use Kotlin Android as the single native target.

Use `develop` for staging and `main` for production. Render Blueprint configuration defines independent web services, databases and secrets. GitHub Actions gates deploy hooks on successful push CI and the exact tested SHA. Hosting remains disabled until the user activates it.

## Alternatives and consequences

Drizzle was excluded by the user. A monorepo framework would add layout and tooling overhead for this early foundation. React Native could share more TypeScript, but a minimal native Kotlin app produces an independently testable APK without introducing a second JavaScript application toolchain. iOS would require macOS build infrastructure. A PWA or WebView would violate the manual.

Prisma is kept on the stable v6 line used by the T3 generator; a major ORM migration should be a separate reviewed change. Next.js is updated from the generator's older major to the current npm release. Lockfiles, explicit tool versions, CI and Dependabot keep changes reviewable. The future native mutation/auth API must be designed before mobile predictions are implemented.
