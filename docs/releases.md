# Releases

Each roadmap milestone ships as one reviewed, tagged and reproducible release.

| Milestone                          | Tag      | Android `versionCode` |
| ---------------------------------- | -------- | --------------------- |
| v0.1.0 - Foundation                | `v0.1.0` | `100`                 |
| v0.2.0 - Tournament core           | `v0.2.0` | `200`                 |
| v0.3.0 - Predictions and live data | `v0.3.0` | `300`                 |
| v1.0.0 - Final demonstration       | `v1.0.0` | `10000`               |

Tags are stable [SemVer](https://semver.org/) with a `v` prefix. A patch release (`v0.1.1`) fixes a published milestone; it never replaces its tag. The Android `versionCode` is `major × 10000 + minor × 100 + patch`, so every release installs over the previous one.

## Publish a release

1. **Prepare on `develop`.** Open a `chore(release): X.Y.Z` PR to `develop` that sets the same version in `package.json`/`package-lock.json` (`npm version X.Y.Z --no-git-tag-version`) and `versionName`/`versionCode` in `mobile/app/build.gradle.kts`, and renames `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` above a new empty `## [Unreleased]`. Check it locally with `npx tsx scripts/prepare-release.ts vX.Y.Z /tmp/notes.md`.
2. **Verify staging.** After the merge, CI deploys `develop` to staging. Confirm that `https://openbracket-staging-mck-d.vercel.app/api/health` reports the merge SHA and walk through the milestone's acceptance criteria there.
3. **Promote to production.** Open a PR from `develop` to `main` titled `chore(release): vX.Y.Z`, with `Refs #<milestone story>`. It needs an independent approval and `CI passed`. Merge it with a **merge commit**, not a squash, so `main` and `develop` keep shared history.
4. **Check production.** The push to `main` runs CI, then deploys and promotes production only if `/api/health` on the new deployment reports the merge SHA. Wait for the `Deploy environment` job to succeed.
5. **Tag the merge commit.**

   ```sh
   git fetch origin
   git tag -a vX.Y.Z origin/main -m "OpenBracket vX.Y.Z"
   git push origin vX.Y.Z
   ```

6. **Let the release workflow publish.** `.github/workflows/release.yml` runs on the tag push. It refuses to publish unless:
   - the tag is stable SemVer and points to a commit on `main`;
   - `CI passed` succeeded on that commit;
   - `package.json`, Android `versionName` and `versionCode` all match the tag;
   - `CHANGELOG.md` has a dated, non-empty section for the version.

   It then runs the Android tests and lint, builds an APK pointed at the production origin, and creates the GitHub release with the changelog section, `openbracket-vX.Y.Z.apk` and `SHA256SUMS`.

If a check fails, fix the source through a reviewed PR and tag a new patch version. Never move, delete or re-push a published tag: downstream users and reviewers rely on it identifying one commit.

## Reproduce a release

```sh
git clone https://github.com/MCK-D/openbracket.git
cd openbracket
git checkout vX.Y.Z
npm run setup
```

The seeded local stack is the same code that production ran at that tag. Download the APK and `SHA256SUMS` from the [release page](https://github.com/MCK-D/openbracket/releases), then check it with `sha256sum -c SHA256SUMS` (`shasum -a 256 -c SHA256SUMS` on macOS) before `adb install`. The APK is debug-signed for emulator and device demonstrations; it is not a store build. To rebuild it, run `./gradlew assembleDebug -PapiBaseUrl=https://openbracket-mck-d.vercel.app` in `mobile/`. Debug signing keys differ per machine, so a rebuilt APK has the same code but a different signature and checksum.

## Rollback constraints

### Code

- **Normal path:** revert the faulty change through a reviewed PR. CI redeploys the reverted code, and a new patch tag records it.
- **Emergency path:** roll back to the last healthy deployment in Vercel (Deployments → Instant Rollback, or `vercel rollback <deployment-url>`), then repair the source through a reviewed revert. A Vercel rollback disables automatic domain assignment for that project until a deployment is promoted again. The deploy workflow promotes each verified release explicitly, so the next merge restores normal behavior.
- A rollback only changes the running code. It does not change the database, the published tag or installed APKs.

### Database

- **Migrations are forward-only.** Prisma applies them before promotion and never reverses them. Rolling back code leaves the newest schema in place, so every migration must stay compatible with the previous release.
- **Use expand and contract.** Add columns, tables and indexes first, as nullable or with defaults. Ship the code that uses them. Drop or rename the old structure only in a later release, after nothing that may still be rolled back to depends on it.
- **A failed migration blocks promotion.** The previous deployment keeps serving. Repair it with a new reviewed migration; never edit an applied migration.
- **Restore is the last resort.** For data loss or a destructive migration, use Neon's point-in-time restore on the affected project only, within the restore window of its current plan. Writes made after the restore point are lost. Check the window in the Neon console before relying on it, and record the incident.
- The seed only creates missing demonstration records, so redeploying an older release does not overwrite results. Never run `prisma migrate reset` against staging or production.
- Staging and production use separate Neon projects. Never restore one environment's data into the other.

### Android

- Android refuses to install a lower `versionCode` over a higher one. To return a device to an older APK, uninstall first, or use `adb install -r -d` for these debug-signed builds. The client stores no local data, so neither path loses anything.
- An installed APK keeps calling the production API. An API change must stay backward compatible with the previous release's APK, or that APK must be replaced.
