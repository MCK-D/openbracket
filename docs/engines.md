# Tournament engines

The format engines live in `src/server/domain/engines/`. They are pure TypeScript modules: no database, I/O, clock or randomness, and they never mutate their inputs. The same input always gives the same output.

Shared contract:

- **Entrants** are ids ordered by seed (index 0 = seed 1). Empty or duplicate ids are rejected.
- **Match ids are structural**, derived only from the field size and configuration, so persistence can upsert by id.
- **Corrections are new inputs.** Progression and standings are recomputed from the full current result list on every call. Correcting a result means calling the engine again with the corrected list; repeated calls are idempotent.
- **Unresolved ties are exposed.** When every configured tie-break fails, entrants are ordered by seed for determinism and list each other in `unresolvedTieWith`, so qualification (#22) can refuse to auto-qualify them.

Persisting stages, matches and results, and cascading corrections through the result service, belong to #12 and #27.

## Single and double elimination

`src/server/domain/engines/elimination.ts`

- `generateBracket(entrants, config)` sizes the bracket to the next power of two and seeds it with the standard pattern (1v16, 8v9, 5v12, 4v13…): the top 2^q seeds sit in different sections, so seeds 1 and 2 can only meet in the final. Missing seeds become byes for the top seeds. A match with a slot that can never be filled is `bye`; it advances the real entrant and refuses results.
- Match ids: `W<round>-<index>`, `L<round>-<index>`, `3P`, `GF-1`, `GF-2`.
- Double elimination drops winners-bracket losers into the losers bracket in a repeating cycle (reversed, reversed per half, halves swapped, straight). With the favourite always winning, this gives no rematch before the losers final up to 256 entrants. `grandFinal: "reset"` (default) plays `GF-2` only if the losers-bracket champion wins `GF-1`; otherwise `GF-2` is `skipped`. `thirdPlaceMatch` is available in single elimination.
- `bestOf` is a number, a per-round record (single elimination) or a per-side record (`winners`, `losers`, `grandFinal`, `thirdPlace`, `default`). Values must be odd. A reported score must give the winner exactly `ceil(bestOf / 2)` wins.
- `resolveBracket(bracket, results)` returns every match with its entrants, winner, loser and status (`pending`, `ready`, `completed`, `bye`, `skipped`), the champion, and placements once complete. Placements are shared by elimination round (1, 2, 3, 3, 5, 5, 5, 5); a third-place match separates 3rd and 4th. Each result carries its `entrants` in slot order and is applied only while the match still has exactly those entrants, so a corrected upstream result reliably invalidates every downstream result it changes. Results that no longer apply (match not playable, skipped, or entrants changed) are ignored and listed in `invalidated`. `GF-2` shows no entrants until a reset is actually needed.

## Round robin

`src/server/domain/engines/round-robin.ts`

- `assignGroups(entrants, groupCount)` snake-seeds groups `A`, `B`, … (A1, B1, C1, C2, B2, A2…).
- `generateFixtures(entrants, { legs })` uses the circle (Berger) method. Every pair meets exactly once per leg; even legs swap home and away. An odd field gets one rest per round, returned in `rests` (a rest is not a match). Ids: `L<leg>-R<round>-M<n>`.
- `computeStandings(entrants, fixtures, results, config)` ranks by points (win/draw/loss, default 3/1/0), then the configured tie-breaks in order (default `headToHead`, `gameDifference`, `gamesWon`). Head-to-head is a mini-league among exactly the tied entrants, re-applied to any subset it leaves tied. Unknown match ids and negative or non-integer scores are rejected.

## Swiss

`src/server/domain/engines/swiss.ts`

- `computeSwissStandings(entrants, previousRounds, config)` scores win/draw/loss/bye (default 1 / 0.5 / 0 / 1).
- **Tie-break order:** score, then Buchholz (sum of opponents' current scores; a bye counts as a 0-point opponent), then Sonneborn-Berger (scores of beaten opponents plus half of drawn opponents), then seed.
- `pairNextRound(entrants, previousRounds, config)` requires a result for every earlier pairing. It computes a minimum-cost perfect matching (Edmonds' blossom algorithm, O(n³)) over pairs that have not met yet, with integer costs in strict priority: the bye goes to the lowest-ranked entrant without one that still allows a full pairing; then the smallest sum of squared score differences; then top half against bottom half inside a score group, the floater meeting the top of the next group. Round 1 is seed 1 against seed N/2+1. It throws when no rematch-free pairing exists, naming the one-bye rule when only a second bye would allow one. 128 entrants pair in about 16 ms per round. Ids: `R<round>-<table>`, `R<round>-BYE`.

## Free for all

`src/server/domain/engines/ffa.ts`

- A match result lists who played and each entrant's place. `validatePlacements` enforces standard competition ranking: tied entrants share a place and the following places are skipped (1, 2, 2, 4 is valid; 1, 2, 2, 3 is not). Missing, duplicate and unknown entrants are rejected.
- `scoreMatch(result, config)` converts places to points with a non-increasing `placementPoints` table (at most 6 decimal places per value); places beyond the table earn `defaultPoints` (0 if omitted). Tied entrants either split the points of every position the tie spans (`tieRule: "average"`) or all receive the shared place's points (`"best"`). Split points are kept as exact fractions; totals are compared exactly and rounded to 1e-6 only for display.
- `computeFfaStandings(entrants, results, config)` totals points across matches. **Tie-break order:** total points, first places, best single placement, average placement, then seed. A match id may appear only once.
