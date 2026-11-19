# Contributing

Read the [README](README.md) and [developer guide](docs/development.md). All code, comments, issues, and documentation use English.

1. Select an unassigned story from the [roadmap](docs/roadmap.md), agree on ownership with the team, and move it to In progress. This foundation deliberately leaves everyone unassigned.
2. Branch from `develop`: `feat/<issue>-short-name`, `fix/<issue>-short-name`, `docs/<issue>-short-name`, or `chore/<issue>-short-name`.
3. Implement the acceptance criteria, meaningful tests, and documentation. Keep commits small and use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `feat(tournaments): add registration deadlines`. Use `!` or a `BREAKING CHANGE:` footer for breaking changes.
4. Run `npm run format:write`, `npm run check`, `npm test`, and relevant browser/mobile tests. Local Husky hooks check formatting and commit messages; CI enforces the same rules independently.
5. Open a PR to `develop` using the template. Include `Refs #123` for a partially completed story or `Closes #123` when all criteria are satisfied. PR titles and all branch commits must be conventional.
6. Obtain at least one independent approving review and all required checks. Resolve review conversations. Never bypass protections, force-push protected branches, or merge failing checks.
7. Merge the reviewed feature into `develop` for staging. Promote a tested staging commit with a PR from `develop` to `main` for production. Emergency fixes use `hotfix/*` and must also be brought back into `develop` through review.

Feature PRs may squash with a conventional title. Release promotions should use merge commits to retain shared branch ancestry; synchronize `main` back into `develop` through a PR when necessary. The repository therefore permits both squash and merge, and does not require linear history.

Use semantic versions for milestone releases: `v0.1.0` foundation, `v0.2.0` tournament core, `v0.3.0` engagement, and `v1.0.0` final demonstration. Create tags only after the matching release PR is reviewed and merged. Never mark planned features as complete.

## Security and data

Use server-side authorization for every mutation, database transactions for related writes, and server time for deadlines. Generated demo identities must use reserved example domains. Never commit `.env`, tokens, private source data, signing keys, or real player identities. External-source tests use mocks and must pass offline. Report vulnerabilities according to [SECURITY.md](SECURITY.md).

## Review responsibility

AI-generated contributions have the same review standard as other code. Team members must understand and be able to explain every delivered component. An author cannot approve their own GitHub PR; the initial foundation remains open for an independent reviewer if none is available.
