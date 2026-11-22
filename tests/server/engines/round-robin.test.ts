import { describe, expect, it } from "vitest";
import {
  assignGroups,
  computeStandings,
  generateFixtures,
} from "~/server/domain/engines/round-robin";
import type {
  Fixture,
  MatchResult,
  StandingRow,
} from "~/server/domain/engines/round-robin";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

/** Score `a` vs `b` regardless of which side the fixture lists as home. */
function score(
  fixtures: readonly Fixture[],
  a: string,
  b: string,
  aScore: number,
  bScore: number,
  leg = 1,
): MatchResult {
  const fixture = fixtures.find(
    (f) =>
      f.leg === leg &&
      ((f.home === a && f.away === b) || (f.home === b && f.away === a)),
  );
  if (!fixture) throw new Error(`No fixture ${a} vs ${b}`);
  return fixture.home === a
    ? { matchId: fixture.id, homeScore: aScore, awayScore: bScore }
    : { matchId: fixture.id, homeScore: bScore, awayScore: aScore };
}

const order = (rows: StandingRow[]) => rows.map((r) => r.entrant);

describe("assignGroups", () => {
  it("snake-seeds entrants across groups", () => {
    expect(assignGroups(seeds(7), 3)).toEqual([
      { id: "A", entrants: ["s1", "s6", "s7"] },
      { id: "B", entrants: ["s2", "s5"] },
      { id: "C", entrants: ["s3", "s4"] },
    ]);
  });

  it("places every entrant exactly once with balanced group sizes", () => {
    for (const [n, g] of [
      [13, 4],
      [17, 5],
      [8, 8],
      [5, 1],
    ] as const) {
      const groups = assignGroups(seeds(n), g);
      expect(groups.flatMap((x) => x.entrants).sort()).toEqual(seeds(n).sort());
      const sizes = groups.map((x) => x.entrants.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(groups[0]?.entrants[0]).toBe("s1");
    }
  });

  it("continues group ids past Z", () => {
    const ids = assignGroups(seeds(28), 28).map((g) => g.id);
    expect(ids.slice(24)).toEqual(["Y", "Z", "AA", "AB"]);
  });

  it("rejects invalid group counts and entrants", () => {
    expect(() => assignGroups(seeds(4), 0)).toThrow(/positive integer/);
    expect(() => assignGroups(seeds(4), 1.5)).toThrow(/positive integer/);
    expect(() => assignGroups(seeds(4), 5)).toThrow(/exceed/);
    expect(() => assignGroups(["a", "a"], 1)).toThrow(/Duplicate/);
    expect(() => assignGroups(["a", " "], 1)).toThrow(/non-empty/);
    expect(() => assignGroups([], 1)).toThrow(/At least one/);
  });
});

describe("generateFixtures", () => {
  it("pairs every entrant with every other exactly once per leg", () => {
    for (let n = 2; n <= 9; n++) {
      const entrants = seeds(n);
      const { fixtures } = generateFixtures(entrants);
      const pairs = fixtures.map((f) => pairKey(f.home, f.away));
      expect(new Set(pairs).size).toBe(pairs.length);
      expect(pairs.length).toBe((n * (n - 1)) / 2);
      const rounds = n % 2 === 0 ? n - 1 : n;
      expect(Math.max(...fixtures.map((f) => f.round))).toBe(rounds);
      for (let r = 1; r <= rounds; r++) {
        const playing = fixtures
          .filter((f) => f.round === r)
          .flatMap((f) => [f.home, f.away]);
        expect(new Set(playing).size).toBe(playing.length);
        expect(playing.length).toBe(n - (n % 2));
      }
      expect(new Set(fixtures.map((f) => f.id)).size).toBe(fixtures.length);
      for (const f of fixtures) {
        expect(f.id).toMatch(/^L1-R\d+-M\d+$/);
        expect(f.home).not.toBe(f.away);
      }
    }
  });

  it("keeps home and away counts within one per entrant", () => {
    for (let n = 2; n <= 9; n++) {
      const { fixtures } = generateFixtures(seeds(n));
      for (const e of seeds(n)) {
        const home = fixtures.filter((f) => f.home === e).length;
        const away = fixtures.filter((f) => f.away === e).length;
        expect(Math.abs(home - away)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("mirrors the first leg with home and away swapped on the second", () => {
    for (let n = 2; n <= 9; n++) {
      const { fixtures, rests } = generateFixtures(seeds(n), { legs: 2 });
      const leg1 = fixtures.filter((f) => f.leg === 1);
      const leg2 = fixtures.filter((f) => f.leg === 2);
      expect(leg2).toHaveLength(leg1.length);
      const ordered = fixtures.map((f) => `${f.home}>${f.away}`);
      expect(new Set(ordered).size).toBe(n * (n - 1));
      for (const f of leg1) {
        const mirror = leg2.find((g) => g.id === f.id.replace("L1", "L2"));
        expect(mirror).toMatchObject({
          round: f.round,
          home: f.away,
          away: f.home,
        });
      }
      for (const e of seeds(n))
        expect(rests.filter((r) => r.entrant === e)).toHaveLength((n % 2) * 2);
    }
  });

  it("gives odd fields exactly one rest per round and one per entrant", () => {
    for (const n of [1, 3, 5, 7, 9]) {
      const { fixtures, rests } = generateFixtures(seeds(n));
      expect(rests).toHaveLength(n);
      expect(rests.map((r) => r.round)).toEqual(
        Array.from({ length: n }, (_, i) => i + 1),
      );
      expect(rests.map((r) => r.entrant).sort()).toEqual(seeds(n).sort());
      for (const rest of rests) {
        const busy = fixtures.some(
          (f) =>
            f.round === rest.round &&
            (f.home === rest.entrant || f.away === rest.entrant),
        );
        expect(busy).toBe(false);
      }
    }
    for (const n of [2, 4, 8])
      expect(generateFixtures(seeds(n)).rests).toEqual([]);
  });

  it("is deterministic and leaves input untouched", () => {
    const entrants = Object.freeze(seeds(7));
    const first = generateFixtures(entrants, { legs: 3 });
    expect(generateFixtures([...entrants], { legs: 3 })).toEqual(first);
    expect(entrants).toEqual(seeds(7));
    expect(first.fixtures.filter((f) => f.leg === 3)).toEqual(
      first.fixtures
        .filter((f) => f.leg === 1)
        .map((f) => ({ ...f, leg: 3, id: f.id.replace("L1", "L3") })),
    );
  });

  it("rejects invalid legs and entrants", () => {
    expect(() => generateFixtures(seeds(4), { legs: 0 })).toThrow(/Legs/);
    expect(() => generateFixtures(seeds(4), { legs: 1.5 })).toThrow(/Legs/);
    expect(() => generateFixtures(["a", "b", "a"])).toThrow(/Duplicate/);
    expect(() => generateFixtures(["a", ""])).toThrow(/non-empty/);
  });
});

describe("computeStandings", () => {
  const four = ["a", "b", "c", "d"];
  const fourFixtures = generateFixtures(four).fixtures;
  // a and b both finish on 6 points; b won the direct match, a has better GD.
  const twoWay = (bBeatsA: boolean): MatchResult[] => [
    bBeatsA
      ? score(fourFixtures, "a", "b", 0, 1)
      : score(fourFixtures, "a", "b", 1, 0),
    score(fourFixtures, "a", "c", 5, 0),
    score(fourFixtures, "a", "d", 5, 0),
    score(fourFixtures, "b", "c", 0, 1),
    score(fourFixtures, "b", "d", 1, 0),
    score(fourFixtures, "c", "d", 0, 1),
  ];

  it("computes per-entrant records", () => {
    const rows = computeStandings(four, fourFixtures, twoWay(true));
    expect(rows.find((r) => r.entrant === "a")).toEqual({
      rank: 2,
      entrant: "a",
      played: 3,
      wins: 2,
      draws: 0,
      losses: 1,
      gamesWon: 10,
      gamesLost: 1,
      gameDifference: 9,
      points: 6,
      unresolvedTieWith: [],
    });
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("resolves a two-way tie by head-to-head before game difference", () => {
    const results = twoWay(true);
    expect(order(computeStandings(four, fourFixtures, results))).toEqual([
      "b",
      "a",
      "d",
      "c",
    ]);
    expect(
      order(
        computeStandings(four, fourFixtures, results, {
          tieBreaks: ["gameDifference", "headToHead"],
        }),
      ),
    ).toEqual(["a", "b", "d", "c"]);
  });

  it("resolves a three-way tie with a head-to-head mini-league", () => {
    const five = ["a", "b", "c", "d", "e"];
    const { fixtures } = generateFixtures(five);
    const results = [
      score(fixtures, "c", "a", 1, 0),
      score(fixtures, "c", "b", 1, 0),
      score(fixtures, "b", "a", 1, 0),
      score(fixtures, "a", "d", 9, 0),
      score(fixtures, "a", "e", 1, 0),
      score(fixtures, "b", "d", 1, 0),
      score(fixtures, "b", "e", 0, 1),
      score(fixtures, "c", "d", 0, 1),
      score(fixtures, "c", "e", 0, 1),
      score(fixtures, "d", "e", 0, 0),
    ];
    const rows = computeStandings(five, fixtures, results);
    expect(order(rows)).toEqual(["e", "c", "b", "a", "d"]);
    expect(rows.slice(1, 4).map((r) => r.points)).toEqual([6, 6, 6]);
    expect(rows.every((r) => r.unresolvedTieWith.length === 0)).toBe(true);
  });

  it("re-applies head-to-head to the subset a mini-league leaves tied", () => {
    const six = ["a", "b", "c", "d", "e", "f"];
    const { fixtures } = generateFixtures(six);
    const results = [
      // Mini-league among a, b, c, d: a 6, d 6, b 3, c 3.
      score(fixtures, "a", "b", 1, 0),
      score(fixtures, "c", "a", 1, 0),
      score(fixtures, "a", "d", 1, 0),
      score(fixtures, "b", "c", 1, 0),
      score(fixtures, "d", "b", 1, 0),
      score(fixtures, "d", "c", 1, 0),
      // e and f level everyone at 9 points overall; c gets the best GD.
      score(fixtures, "a", "e", 1, 0),
      score(fixtures, "f", "a", 1, 0),
      score(fixtures, "d", "e", 1, 0),
      score(fixtures, "f", "d", 1, 0),
      score(fixtures, "b", "e", 1, 0),
      score(fixtures, "b", "f", 1, 0),
      score(fixtures, "c", "e", 9, 0),
      score(fixtures, "c", "f", 1, 0),
      score(fixtures, "e", "f", 0, 0),
    ];
    const rows = computeStandings(six, fixtures, results);
    expect(rows.slice(0, 4).map((r) => r.points)).toEqual([9, 9, 9, 9]);
    expect(order(rows)).toEqual(["a", "d", "b", "c", "f", "e"]);
    expect(
      order(
        computeStandings(six, fixtures, results, {
          tieBreaks: ["gameDifference", "headToHead"],
        }),
      ),
    ).toEqual(["c", "a", "d", "b", "f", "e"]);
  });

  it("falls back to game difference then games won after a drawn head-to-head", () => {
    const three = ["a", "b", "c"];
    const { fixtures } = generateFixtures(three);
    const byDiff = computeStandings(three, fixtures, [
      score(fixtures, "a", "b", 2, 2),
      score(fixtures, "a", "c", 1, 0),
      score(fixtures, "b", "c", 3, 0),
    ]);
    expect(order(byDiff)).toEqual(["b", "a", "c"]);
    const byGames = computeStandings(three, fixtures, [
      score(fixtures, "a", "b", 0, 0),
      score(fixtures, "a", "c", 1, 0),
      score(fixtures, "b", "c", 2, 1),
    ]);
    expect(order(byGames)).toEqual(["b", "a", "c"]);
    expect(byGames.every((r) => r.unresolvedTieWith.length === 0)).toBe(true);
  });

  it("flags ties no tie-break can separate and orders them by seed", () => {
    const three = ["a", "b", "c"];
    const { fixtures } = generateFixtures(three);
    const draws = [
      score(fixtures, "c", "a", 1, 1),
      score(fixtures, "b", "c", 1, 1),
      score(fixtures, "a", "b", 1, 1),
    ];
    const rows = computeStandings(three, fixtures, draws);
    expect(order(rows)).toEqual(["a", "b", "c"]);
    expect(rows.map((r) => r.unresolvedTieWith)).toEqual([
      ["b", "c"],
      ["a", "c"],
      ["a", "b"],
    ]);
    const noBreaks = computeStandings(four, fourFixtures, twoWay(true), {
      tieBreaks: [],
    });
    expect(order(noBreaks)).toEqual(["a", "b", "c", "d"]);
    expect(noBreaks.map((r) => r.unresolvedTieWith)).toEqual([
      ["b"],
      ["a"],
      ["d"],
      ["c"],
    ]);
  });

  it("treats an unplayed field as a fully unresolved tie", () => {
    const rows = computeStandings(four, fourFixtures, []);
    expect(rows.every((r) => r.played === 0 && r.points === 0)).toBe(true);
    expect(rows[3]?.unresolvedTieWith).toEqual(["a", "b", "c"]);
  });

  it("applies a custom points configuration", () => {
    const five = ["a", "b", "c", "d", "e"];
    const { fixtures } = generateFixtures(five);
    const results = [
      score(fixtures, "a", "b", 1, 1),
      score(fixtures, "a", "c", 1, 0),
      score(fixtures, "a", "d", 0, 1),
      score(fixtures, "a", "e", 0, 1),
      score(fixtures, "b", "c", 0, 0),
      score(fixtures, "b", "d", 0, 0),
      score(fixtures, "b", "e", 0, 0),
      score(fixtures, "c", "d", 0, 0),
      score(fixtures, "c", "e", 0, 0),
      score(fixtures, "d", "e", 0, 0),
    ];
    const pointsOf = (rows: StandingRow[], e: string) =>
      rows.find((r) => r.entrant === e)?.points;
    const twoForWin = computeStandings(five, fixtures, results, {
      points: { win: 2, draw: 1, loss: 0 },
    });
    expect([pointsOf(twoForWin, "a"), pointsOf(twoForWin, "b")]).toEqual([
      3, 4,
    ]);
    expect(order(twoForWin).indexOf("b")).toBeLessThan(
      order(twoForWin).indexOf("a"),
    );
    const generous = computeStandings(five, fixtures, results, {
      points: { win: 4, draw: 1, loss: 1 },
    });
    expect([pointsOf(generous, "a"), pointsOf(generous, "b")]).toEqual([7, 4]);
    expect(order(generous).indexOf("a")).toBeLessThan(
      order(generous).indexOf("b"),
    );
  });

  it("recomputes standings from scratch when a result is corrected", () => {
    const before = computeStandings(four, fourFixtures, twoWay(true));
    const after = computeStandings(four, fourFixtures, twoWay(false));
    expect(order(before).slice(0, 2)).toEqual(["b", "a"]);
    expect(order(after).slice(0, 2)).toEqual(["a", "b"]);
    const a = after.find((r) => r.entrant === "a");
    expect(a).toMatchObject({ played: 3, wins: 3, losses: 0, points: 9 });
  });

  it("counts both legs and is deterministic without mutating inputs", () => {
    const { fixtures } = generateFixtures(["a", "b"], { legs: 2 });
    const results = Object.freeze([
      Object.freeze(score(fixtures, "a", "b", 2, 0, 1)),
      Object.freeze(score(fixtures, "a", "b", 0, 1, 2)),
    ]);
    const first = computeStandings(["a", "b"], fixtures, results);
    expect(computeStandings(["a", "b"], fixtures, [...results])).toEqual(first);
    expect(first[0]).toMatchObject({ entrant: "a", played: 2, points: 3 });
    expect(first[0]?.unresolvedTieWith).toEqual([]);
  });

  it("rejects unknown matches, invalid scores and bad config", () => {
    const valid = score(fourFixtures, "a", "b", 1, 0);
    const run = (results: MatchResult[], config = {}) =>
      computeStandings(four, fourFixtures, results, config);
    expect(() => run([{ ...valid, matchId: "L9-R9-M9" }])).toThrow(
      /Unknown match/,
    );
    expect(() => run([{ ...valid, homeScore: -1 }])).toThrow(/non-negative/);
    expect(() => run([{ ...valid, awayScore: 1.5 }])).toThrow(/non-negative/);
    expect(() => run([{ ...valid, awayScore: Number.NaN }])).toThrow(
      /non-negative/,
    );
    expect(() => run([valid, valid])).toThrow(/Duplicate result/);
    expect(() => run([], { tieBreaks: ["headToHead", "headToHead"] })).toThrow(
      /Duplicate tie-break/,
    );
    expect(() => run([], { tieBreaks: ["coinFlip"] })).toThrow(
      /Unknown tie-break/,
    );
    expect(() => run([], { points: { win: -3, draw: 1, loss: 0 } })).toThrow(
      /non-negative/,
    );
    expect(() => computeStandings(["a", "b"], fourFixtures, [])).toThrow(
      /unknown entrant/,
    );
  });
});
