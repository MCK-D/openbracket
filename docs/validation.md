# Foundation validation

Recorded on 19 November 2026. These checks cover the foundation, not the unimplemented final product.

| Check                        | Evidence                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint and strict TypeScript | `npm run check` passes                                                                                                                                                                              |
| Formatting                   | `npm run format:check` passes, including workflows and documentation                                                                                                                                |
| Offline web/server tests     | 12 tests pass: API visibility/limits/readiness/errors, server deadlines/scoring, authentication/role denial, atomic creation/audit behavior, input validation, semantic links and disabled controls |
| Database                     | Committed migration applies to PostgreSQL; seed runs repeatedly without overwriting a simulated result                                                                                              |
| Production build             | Next.js build passes; server-only DB boundary prevents client imports                                                                                                                               |
| Browser integration          | Two Playwright tests pass: real public API, tournament navigation, semantic match table, first keyboard target and mobile overflow                                                                  |
| Automated accessibility      | axe reports no violations for configured WCAG A/AA tags on the tournament list and match schedule                                                                                                   |
| Responsive inspection        | Actual rendered captures at 1440, 1024, 768, 390 and 320px; no tournament-list horizontal overflow                                                                                                  |
| Container                    | Docker image builds and Compose reaches healthy readiness with its own PostgreSQL database                                                                                                          |
| Dependencies                 | npm audit reports zero known vulnerabilities in the current lockfile                                                                                                                                |
| GitHub planning              | Public board has 13 epics, 46 native child issues, 59 total items, four milestones, zero assigned contributors                                                                                      |
| Branches/environments        | `main` and `develop` require CI and independent review; staging and production have separate branch policies and disabled deploy activation                                                         |

Screenshots are captured from the seeded app under [screenshots/](screenshots/). The [PR checks](https://github.com/MCK-D/openbracket/pull/60/checks) provide the current hosted CI result and Android APK artifact. Do not infer a passing check from the existence of a workflow definition.

Outstanding evidence belongs to the future stories: full tournament-engine invariants, real upstream connector mocks, native prediction/notification flows, manual NVDA/TalkBack audit, complete WCAG conformance, load capacity and latency report, newcomer timed rehearsal, online deployment and rollback. The mechanical design detector reported one advisory about Geist's common usage; the foundation retains the self-hosted T3 font for consistency while the final identity remains a story.
