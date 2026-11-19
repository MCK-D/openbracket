# GitHub delivery roadmap

[Open the public Delivery kanban board](https://github.com/users/MCK-D/projects/2). The project is linked to this repository. Each epic is a real issue with native GitHub sub-issues. Every feature story includes its role, desired capability, benefit, acceptance criteria, test/review/documentation checklist, source-manual section, area label and milestone. All issues are intentionally unassigned.

Board states: **Backlog → Ready → In progress → In review → Done**. Move only the story being worked on; complete an epic when its children and integration criteria are complete. The foundation story starts in In review. Hosting activation remains in Backlog because the user deferred it.

| Milestone                          | Planned checkpoint | Scope                                                                                  |
| ---------------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| v0.1.0 - Foundation                | 29 November 2026   | Typed application core, PR/CI rules, native skeleton, docs, environment wiring         |
| v0.2.0 - Tournament core           | 13 December 2026   | Identity, administration, registration, all format engines, match operations           |
| v0.3.0 - Predictions and live data | 3 January 2027     | Imports, source recovery, predictions, Pick'em, rankings, groups, live dashboard       |
| v1.0.0 - Final demonstration       | 24 January 2027    | Complete native flows, simulator, genuine imports, audits, load tests, final rehearsal |

Dates are planning targets, not a claim that the features are delivered. They leave a buffer before the manual's end-of-January presentation. The optional December follow-up can use the tournament-core milestone.

The [generated GitHub index](github-backlog.json) records actual epic/story numbers and links. The source backlog is in `scripts/backlog.json`. Maintainers can reconcile missing items using `python scripts/bootstrap_github.py --apply` with an authenticated GitHub CLI. The script is idempotent for creation, preserves existing issue ownership/status, and does not assign anyone. It is administrative tooling; Python and GitHub CLI are not needed to run the app.

Good first issues include the identity guide and newcomer/documentation rehearsal. Choose a smaller concrete subtask when someone takes one of those stories. The optional league, embeddable widgets, second production connector, assisted predictions and stream-chat features are stretch goals after every mandatory story is complete.
