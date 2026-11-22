import { describe, expect, it } from "vitest";
import {
  computeFfaStandings,
  scoreMatch,
  validatePlacements,
  type FfaMatchResult,
  type FfaScoringConfig,
} from "~/server/domain/engines/ffa";

const POINTS = [10, 7, 5, 3, 2, 1];

function match(
  matchId: string,
  placements: Record<string, number>,
): FfaMatchResult {
  return {
    matchId,
    entrants: Object.keys(placements),
    placements: Object.entries(placements).map(([entrant, place]) => ({
      entrant,
      place,
    })),
  };
}

function pointsOf(result: FfaMatchResult, config: FfaScoringConfig) {
  return Object.fromEntries(
    scoreMatch(result, config).map((s) => [s.entrant, s.points]),
  );
}

describe("validatePlacements", () => {
  it("accepts standard competition rankings including shared places", () => {
    expect(() =>
      validatePlacements(match("m", { a: 1, b: 2, c: 2, d: 4 })),
    ).not.toThrow();
    expect(() =>
      validatePlacements(match("m", { a: 1, b: 1, c: 3 })),
    ).not.toThrow();
    expect(() =>
      validatePlacements(match("m", { a: 1, b: 1, c: 1 })),
    ).not.toThrow();
    expect(() => validatePlacements(match("m", { solo: 1 }))).not.toThrow();
  });

  it("rejects rankings that do not skip after a tie or do not start at 1", () => {
    expect(() =>
      validatePlacements(match("m", { a: 1, b: 2, c: 2, d: 3 })),
    ).toThrow(/place 3 of "d".*must be 4/);
    expect(() => validatePlacements(match("m", { a: 2, b: 3 }))).toThrow(
      /must be 1/,
    );
    expect(() => validatePlacements(match("m", { a: 1, b: 3 }))).toThrow(
      /must be 2/,
    );
    expect(() => validatePlacements(match("m", { a: 1, b: 1.5 }))).toThrow(
      /integer >= 1/,
    );
    expect(() => validatePlacements(match("m", { a: 0, b: 1 }))).toThrow(
      /integer >= 1/,
    );
  });

  it("rejects missing, duplicate and unknown entrants", () => {
    const missing: FfaMatchResult = {
      matchId: "m",
      entrants: ["a", "b", "c"],
      placements: [
        { entrant: "a", place: 1 },
        { entrant: "b", place: 2 },
      ],
    };
    expect(() => validatePlacements(missing)).toThrow(/missing.*c/);

    const duplicate: FfaMatchResult = {
      matchId: "m",
      entrants: ["a", "b"],
      placements: [
        { entrant: "a", place: 1 },
        { entrant: "a", place: 2 },
        { entrant: "b", place: 2 },
      ],
    };
    expect(() => validatePlacements(duplicate)).toThrow(/"a".*more than once/);

    const unknown: FfaMatchResult = {
      matchId: "m",
      entrants: ["a", "b"],
      placements: [
        { entrant: "a", place: 1 },
        { entrant: "b", place: 2 },
        { entrant: "z", place: 3 },
      ],
    };
    expect(() => validatePlacements(unknown)).toThrow(/"z".*did not play/);

    expect(() =>
      validatePlacements({
        matchId: "m",
        entrants: ["a", "a"],
        placements: [],
      }),
    ).toThrow(/duplicate entrant "a"/);
    expect(() =>
      validatePlacements({ matchId: "", entrants: ["a"], placements: [] }),
    ).toThrow(/Match id/);
    expect(() =>
      validatePlacements({ matchId: "m", entrants: [], placements: [] }),
    ).toThrow(/at least one entrant/);
  });
});

describe("scoreMatch", () => {
  const average: FfaScoringConfig = {
    placementPoints: POINTS,
    tieRule: "average",
  };
  const best: FfaScoringConfig = { placementPoints: POINTS, tieRule: "best" };

  it("scores an 8-entrant battle royale from the points table", () => {
    const result = match("BR-1", {
      e1: 3,
      e2: 1,
      e3: 8,
      e4: 2,
      e5: 5,
      e6: 4,
      e7: 7,
      e8: 6,
    });
    const scores = scoreMatch(result, average);
    expect(scores.map((s) => s.entrant)).toEqual([
      "e2",
      "e4",
      "e1",
      "e6",
      "e5",
      "e8",
      "e7",
      "e3",
    ]);
    expect(scores.map((s) => s.points)).toEqual([10, 7, 5, 3, 2, 1, 0, 0]);
    expect(pointsOf(result, { ...average, defaultPoints: 0.5 })).toMatchObject({
      e7: 0.5,
      e3: 0.5,
    });
  });

  it("applies both tie rules to a 2-way tie at 2nd and a 3-way tie", () => {
    const result = match("BR-2", {
      a: 1,
      b: 2,
      c: 2,
      d: 4,
      e: 4,
      f: 4,
      g: 7,
    });
    expect(pointsOf(result, average)).toEqual({
      a: 10,
      b: 6,
      c: 6,
      d: 2,
      e: 2,
      f: 2,
      g: 0,
    });
    expect(pointsOf(result, best)).toEqual({
      a: 10,
      b: 7,
      c: 7,
      d: 3,
      e: 3,
      f: 3,
      g: 0,
    });
  });

  it("averages ties that run past the points table with the default", () => {
    const result = match("m", { a: 1, b: 2, c: 2 });
    expect(
      pointsOf(result, {
        placementPoints: [9, 4],
        defaultPoints: 1,
        tieRule: "average",
      }),
    ).toEqual({ a: 9, b: 2.5, c: 2.5 });
    const threeWay = match("m", { a: 1, b: 1, c: 1 });
    expect(
      pointsOf(threeWay, { placementPoints: [10, 0, 0], tieRule: "average" }),
    ).toEqual({ a: 3.333333, b: 3.333333, c: 3.333333 });
  });

  it("rejects invalid scoring configs", () => {
    const result = match("m", { a: 1, b: 2 });
    expect(() =>
      scoreMatch(result, { placementPoints: [5, 7], tieRule: "best" }),
    ).toThrow(/non-increasing/);
    expect(() =>
      scoreMatch(result, { placementPoints: [5, -1], tieRule: "best" }),
    ).toThrow(/non-negative/);
    expect(() =>
      scoreMatch(result, { placementPoints: [5, Number.NaN], tieRule: "best" }),
    ).toThrow(/non-negative/);
    expect(() =>
      scoreMatch(result, {
        placementPoints: [5, 3],
        defaultPoints: 4,
        tieRule: "best",
      }),
    ).toThrow(/defaultPoints/);
    expect(() =>
      scoreMatch(result, { placementPoints: [], tieRule: "best" }),
    ).toThrow(/at least one value/);
    expect(() =>
      scoreMatch(result, {
        placementPoints: [5],
        tieRule: "split" as unknown as "best",
      }),
    ).toThrow(/tie rule/);
    expect(() =>
      scoreMatch(result, { placementPoints: [5, 0.0000001], tieRule: "best" }),
    ).toThrow(/6 decimal places/);
  });

  it("does not mutate its input", () => {
    const result = match("m", { b: 2, a: 1, c: 2 });
    const snapshot = structuredClone(result);
    scoreMatch(result, average);
    expect(result).toEqual(snapshot);
  });
});

describe("computeFfaStandings", () => {
  const config: FfaScoringConfig = {
    placementPoints: POINTS,
    tieRule: "average",
  };
  const entrants = ["s1", "s2", "s3", "s4", "s5"];

  it("aggregates three matches and applies each tie-break in order", () => {
    const results = [
      match("M1", { s1: 1, s2: 2, s3: 3, s4: 4, s5: 5 }),
      match("M2", { s3: 1, s4: 2, s2: 4, s5: 3 }),
      match("M3", { s4: 1, s3: 2, s5: 3, s1: 4, s2: 5 }),
    ];
    // s1: 10 + 3 = 13 (1 first). s3: 5 + 10 + 7 = 22. s4: 3 + 7 + 10 = 20.
    // s2: 7 + 3 + 2 = 12. s5: 2 + 5 + 5 = 12, no first, best 3 vs s2 best 2.
    const standings = computeFfaStandings(entrants, results, config);
    expect(standings.map((s) => [s.entrant, s.totalPoints])).toEqual([
      ["s3", 22],
      ["s4", 20],
      ["s1", 13],
      ["s2", 12],
      ["s5", 12],
    ]);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(standings[0]).toMatchObject({
      matchesPlayed: 3,
      firstPlaces: 1,
      bestPlacement: 1,
      averagePlacement: 2,
      seed: 3,
    });
    expect(standings.every((s) => s.unresolvedTieWith.length === 0)).toBe(true);
  });

  it("breaks ties on first places, then best, then average placement", () => {
    const four = ["a", "b", "c", "d"];
    const cfg: FfaScoringConfig = {
      placementPoints: [4, 3, 2, 1],
      tieRule: "best",
    };
    // a: 4+1 = 5 with a win; b: 3+2 = 5 without -> a ahead on first places.
    const firsts = computeFfaStandings(
      four,
      [
        match("M1", { a: 1, b: 2, c: 3, d: 4 }),
        match("M2", { c: 1, d: 2, b: 3, a: 4 }),
      ],
      cfg,
    );
    expect(firsts.slice(0, 2).map((s) => s.entrant)).toEqual(["c", "a"]);
    expect(firsts.find((s) => s.entrant === "b")?.rank).toBe(3);

    // d (seed 4): 2nd + 4th + 3rd = 3+1+2 = 6, best 2.
    // c (seed 3): 3rd x3 = 6, best 3 -> d ahead on best placement.
    const bestCfg: FfaScoringConfig = {
      placementPoints: [6, 3, 2, 1],
      tieRule: "best",
    };
    const best = computeFfaStandings(
      four,
      [
        match("M1", { a: 1, d: 2, c: 3, b: 4 }),
        match("M2", { a: 1, b: 2, c: 3, d: 4 }),
        match("M3", { a: 1, b: 2, c: 3, d: 3 }),
      ],
      bestCfg,
    );
    const order = best.map((s) => s.entrant);
    expect(best.find((s) => s.entrant === "c")?.totalPoints).toBe(6);
    expect(best.find((s) => s.entrant === "d")?.totalPoints).toBe(6);
    expect(order.indexOf("d")).toBeLessThan(order.indexOf("c"));

    // Same points, no wins, same best (2); x played fewer worse places.
    const avgCfg: FfaScoringConfig = {
      placementPoints: [5, 4, 1, 1, 0],
      tieRule: "best",
    };
    const avg = computeFfaStandings(
      ["w", "x", "y", "z", "v"],
      [
        match("M1", { v: 1, y: 2, x: 3, w: 4, z: 5 }),
        match("M2", { v: 1, x: 2, y: 4, w: 3, z: 5 }),
      ],
      avgCfg,
    );
    const x = avg.find((s) => s.entrant === "x");
    const y = avg.find((s) => s.entrant === "y");
    expect(x?.totalPoints).toBe(y?.totalPoints);
    expect(x?.averagePlacement).toBe(2.5);
    expect(y?.averagePlacement).toBe(3);
    expect(x!.rank).toBeLessThan(y!.rank);
    expect(x?.unresolvedTieWith).toEqual([]);
  });

  it("orders fully level entrants by seed and flags the unresolved tie", () => {
    const standings = computeFfaStandings(
      ["a", "b", "c", "d"],
      [
        match("M1", { b: 1, a: 2, c: 3, d: 4 }),
        match("M2", { a: 1, b: 2, d: 3, c: 4 }),
      ],
      config,
    );
    expect(standings.map((s) => s.entrant)).toEqual(["a", "b", "c", "d"]);
    expect(standings[0]?.unresolvedTieWith).toEqual(["b"]);
    expect(standings[1]?.unresolvedTieWith).toEqual(["a"]);
    expect(standings[2]?.unresolvedTieWith).toEqual(["d"]);
    expect(standings[3]?.unresolvedTieWith).toEqual(["c"]);
  });

  it("flags entrants without any match as tied and ranks them last", () => {
    const standings = computeFfaStandings(
      ["idle1", "player", "idle2"],
      [match("M1", { player: 1 })],
      config,
    );
    expect(standings.map((s) => s.entrant)).toEqual([
      "player",
      "idle1",
      "idle2",
    ]);
    expect(standings[1]).toMatchObject({
      matchesPlayed: 0,
      bestPlacement: null,
      averagePlacement: null,
      unresolvedTieWith: ["idle2"],
    });
  });

  it("recomputes standings when one match is corrected", () => {
    const original = [
      match("M1", { s1: 1, s2: 2, s3: 3 }),
      match("M2", { s1: 1, s2: 2, s3: 3 }),
    ];
    const before = computeFfaStandings(["s1", "s2", "s3"], original, config);
    expect(before[0]).toMatchObject({ entrant: "s1", totalPoints: 20 });

    const corrected = [original[0]!, match("M2", { s3: 1, s2: 2, s1: 3 })];
    const after = computeFfaStandings(["s1", "s2", "s3"], corrected, config);
    expect(after.map((s) => [s.entrant, s.totalPoints])).toEqual([
      ["s1", 15],
      ["s3", 15],
      ["s2", 14],
    ]);
    expect(after[0]?.unresolvedTieWith).toEqual(["s3"]);
    expect(before[0]?.unresolvedTieWith).toEqual([]);
  });

  it("is deterministic and leaves inputs untouched", () => {
    const list = [
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
      "l",
      "m",
    ];
    const results = [
      match("M1", Object.fromEntries(list.map((id, i) => [id, i + 1]))),
      match(
        "M2",
        Object.fromEntries(list.map((id, i) => [id, i < 3 ? 1 : i + 1])),
      ),
    ];
    const snapshot = structuredClone({ list, results });
    const first = computeFfaStandings(list, results, config);
    const second = computeFfaStandings(list, results, config);
    expect(second).toEqual(first);
    expect({ list, results }).toEqual(snapshot);
    expect(new Set(first.map((s) => s.entrant)).size).toBe(list.length);
  });

  it("sums averaged tie points exactly before comparing totals", () => {
    const tieCfg: FfaScoringConfig = {
      placementPoints: [10, 8, 7],
      tieRule: "average",
    };
    const standings = computeFfaStandings(
      ["D", "E", "F", "A", "B", "C"],
      [
        match("M1", { A: 1, B: 1, C: 1 }),
        match("M2", { A: 1, B: 1, C: 1 }),
        match("M3", { A: 1, B: 1, C: 1 }),
        match("M4", { D: 1, E: 2, F: 3 }),
        match("M5", { E: 1, D: 2, F: 3 }),
        match("M6", { E: 1, F: 2, D: 3 }),
      ],
      tieCfg,
    );
    expect(
      scoreMatch(match("M1", { A: 1, B: 1, C: 1 }), tieCfg)[0]?.points,
    ).toBe(8.333333);
    expect(standings.map((s) => [s.entrant, s.totalPoints])).toEqual([
      ["E", 28],
      ["A", 25],
      ["B", 25],
      ["C", 25],
      ["D", 25],
      ["F", 22],
    ]);
    expect(standings.find((s) => s.entrant === "A")?.unresolvedTieWith).toEqual(
      ["B", "C"],
    );
    expect(standings.find((s) => s.entrant === "D")?.unresolvedTieWith).toEqual(
      [],
    );
  });

  it("rejects invalid entrants and results", () => {
    expect(() => computeFfaStandings([], [], config)).toThrow(/At least one/);
    expect(() => computeFfaStandings(["a", "a"], [], config)).toThrow(
      /duplicate entrant "a"/,
    );
    expect(() => computeFfaStandings(["a", ""], [], config)).toThrow(
      /non-empty/,
    );
    expect(() =>
      computeFfaStandings(
        ["a", "b"],
        [match("M1", { a: 1, b: 2 }), match("M1", { b: 1, a: 2 })],
        config,
      ),
    ).toThrow(/Duplicate match id "M1"/);
    expect(() =>
      computeFfaStandings(["a", "b"], [match("M1", { a: 1, z: 2 })], config),
    ).toThrow(/"z" is not a tournament entrant/);
    expect(() =>
      computeFfaStandings(["a", "b"], [match("M1", { a: 1, b: 3 })], config),
    ).toThrow(/standard competition ranking/);
    expect(() =>
      computeFfaStandings(["a"], [], {
        placementPoints: [1, 2],
        tieRule: "best",
      }),
    ).toThrow(/non-increasing/);
  });
});
