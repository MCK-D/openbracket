import { describe, expect, it } from "vitest";
import {
  generateBracket,
  resolveBracket,
  seedOrder,
  type Bracket,
  type BracketConfig,
  type BracketState,
  type MatchResult,
  type ResolvedMatch,
} from "~/server/domain/engines/elimination";

const ids = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `e${i + 1}`);
const seedOf = (id: string): number => Number(id.slice(1));
const res = (
  matchId: string,
  winner: string,
  entrants: [string, string],
  score?: [number, number],
): MatchResult =>
  score ? { matchId, winner, entrants, score } : { matchId, winner, entrants };

type Pick = (match: ResolvedMatch) => string;
const favourite: Pick = (m) =>
  seedOf(m.entrants[0] ?? "") < seedOf(m.entrants[1] ?? "")
    ? (m.entrants[0] ?? "")
    : (m.entrants[1] ?? "");
const underdog: Pick = (m) =>
  favourite(m) === m.entrants[0]
    ? (m.entrants[1] ?? "")
    : (m.entrants[0] ?? "");
const mixed: Pick = (m) =>
  (m.id.length + m.round + m.index) % 3 === 0 ? underdog(m) : favourite(m);

function playAll(
  bracket: Bracket,
  pick: Pick,
): { results: MatchResult[]; state: BracketState } {
  const results: MatchResult[] = [];
  let state = resolveBracket(bracket, results);
  for (;;) {
    const ready = state.matches.filter((m) => m.status === "ready");
    if (ready.length === 0) return { results, state };
    for (const m of ready)
      results.push({
        matchId: m.id,
        winner: pick(m),
        entrants: [m.entrants[0] ?? "", m.entrants[1] ?? ""],
      });
    state = resolveBracket(bracket, results);
  }
}

function lossCounts(state: BracketState): Map<string, number> {
  const losses = new Map<string, number>();
  for (const m of state.matches)
    if (m.status === "completed" && m.loser)
      losses.set(m.loser, (losses.get(m.loser) ?? 0) + 1);
  return losses;
}

const match = (state: BracketState, id: string): ResolvedMatch => {
  const found = state.matches.find((m) => m.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

const SIZES = [2, 3, 5, 8, 13, 17];

describe("seeding", () => {
  it("pairs seeds 1v16, 8v9, 5v12, 4v13 ... 2v15", () => {
    const order = seedOrder(16);
    const pairs = [];
    for (let i = 0; i < 16; i += 2)
      pairs.push([order[i], order[i + 1]].sort((a, b) => (a ?? 0) - (b ?? 0)));
    expect(pairs).toEqual([
      [1, 16],
      [8, 9],
      [5, 12],
      [4, 13],
      [3, 14],
      [6, 11],
      [7, 10],
      [2, 15],
    ]);
  });

  it("keeps the top 2^q seeds in distinct 1/2^q sections of the bracket", () => {
    for (const size of [2, 4, 8, 16, 32, 64]) {
      const order = seedOrder(size);
      expect([...order].sort((a, b) => a - b)).toEqual(
        Array.from({ length: size }, (_, i) => i + 1),
      );
      for (let sections = 2; sections <= size; sections *= 2) {
        const width = size / sections;
        const section = (seed: number) =>
          Math.floor(order.indexOf(seed) / width);
        const used = new Set(
          Array.from({ length: sections }, (_, i) => section(i + 1)),
        );
        expect(used.size).toBe(sections);
      }
    }
  });

  it("lets seeds 1 and 2 meet only in the final", () => {
    for (const n of SIZES) {
      const { state } = playAll(
        generateBracket(ids(n), { type: "single" }),
        favourite,
      );
      const meetings = state.matches.filter(
        (m) => m.entrants.includes("e1") && m.entrants.includes("e2"),
      );
      expect(meetings.map((m) => m.id)).toEqual([
        `W${Math.log2(nextPow(n))}-1`,
      ]);
    }
  });

  it("gives byes to the top seeds only, as unplayable auto-advanced matches", () => {
    for (const n of SIZES) {
      for (const type of ["single", "double"] as const) {
        const bracket = generateBracket(ids(n), { type });
        const state = resolveBracket(bracket, []);
        const firstRoundByes = state.matches.filter(
          (m) => m.side === "winners" && m.round === 1 && m.status === "bye",
        );
        const size = nextPow(n);
        expect(firstRoundByes.map((m) => m.winner).sort()).toEqual(
          ids(size - n).sort(),
        );
        for (const m of state.matches.filter((x) => x.status === "bye"))
          expect(() =>
            resolveBracket(bracket, [
              res(m.id, m.winner ?? "e1", [m.winner ?? "e1", "x"]),
            ]),
          ).toThrow(/bye/);
      }
    }
  });
});

function nextPow(n: number): number {
  let s = 1;
  while (s < n) s *= 2;
  return s;
}

describe("single elimination", () => {
  it.each(SIZES)(
    "N=%i: one champion, everyone else eliminated exactly once",
    (n) => {
      for (const pick of [favourite, underdog, mixed]) {
        const bracket = generateBracket(ids(n), { type: "single" });
        const { state, results } = playAll(bracket, pick);
        expect(state.complete).toBe(true);
        expect(results).toHaveLength(n - 1);
        const losses = lossCounts(state);
        expect(state.champion).not.toBeNull();
        expect(losses.has(state.champion ?? "")).toBe(false);
        for (const e of ids(n))
          if (e !== state.champion) expect(losses.get(e)).toBe(1);
        const places = state.placements ?? [];
        expect(places).toHaveLength(n);
        expect(places.filter((p) => p.place === 1)).toEqual([
          { entrant: state.champion, place: 1 },
        ]);
        expect(places.filter((p) => p.place === 2)).toHaveLength(1);
        expect(state.invalidated).toEqual([]);
      }
    },
  );

  it("shares places by elimination round", () => {
    const { state } = playAll(
      generateBracket(ids(8), { type: "single" }),
      favourite,
    );
    expect(state.placements).toEqual([
      { entrant: "e1", place: 1 },
      { entrant: "e2", place: 2 },
      { entrant: "e3", place: 3 },
      { entrant: "e4", place: 3 },
      { entrant: "e5", place: 5 },
      { entrant: "e6", place: 5 },
      { entrant: "e7", place: 5 },
      { entrant: "e8", place: 5 },
    ]);
  });

  it("separates 3rd and 4th with a third place match", () => {
    const bracket = generateBracket(ids(8), {
      type: "single",
      thirdPlaceMatch: true,
    });
    const before = playAll(bracket, favourite);
    expect(match(before.state, "3P").entrants.sort()).toEqual(["e3", "e4"]);
    const results = before.results.map((r) =>
      r.matchId === "3P" ? { ...r, winner: "e4" } : r,
    );
    const state = resolveBracket(bracket, results);
    expect(state.complete).toBe(true);
    expect(state.placements?.slice(0, 4)).toEqual([
      { entrant: "e1", place: 1 },
      { entrant: "e2", place: 2 },
      { entrant: "e4", place: 3 },
      { entrant: "e3", place: 4 },
    ]);
  });

  it("is not complete until the third place match is played", () => {
    const bracket = generateBracket(ids(4), {
      type: "single",
      thirdPlaceMatch: true,
    });
    const results: MatchResult[] = [
      res("W1-1", "e1", ["e1", "e4"]),
      res("W1-2", "e2", ["e2", "e3"]),
      res("W2-1", "e1", ["e1", "e2"]),
    ];
    const state = resolveBracket(bracket, results);
    expect(state.champion).toBe("e1");
    expect(state.complete).toBe(false);
    expect(state.placements).toBeNull();
    expect(match(state, "3P").status).toBe("ready");
  });

  it("awards a bye third place when only one semifinal was played (N=3)", () => {
    const bracket = generateBracket(ids(3), {
      type: "single",
      thirdPlaceMatch: true,
    });
    const { state } = playAll(bracket, favourite);
    expect(match(state, "3P").status).toBe("bye");
    expect(state.placements).toEqual([
      { entrant: "e1", place: 1 },
      { entrant: "e2", place: 2 },
      { entrant: "e3", place: 3 },
    ]);
  });

  it("marks later rounds pending until their entrants are known", () => {
    const state = resolveBracket(
      generateBracket(ids(8), { type: "single" }),
      [],
    );
    expect(state.matches.map((m) => [m.id, m.status])).toEqual([
      ["W1-1", "ready"],
      ["W1-2", "ready"],
      ["W1-3", "ready"],
      ["W1-4", "ready"],
      ["W2-1", "pending"],
      ["W2-2", "pending"],
      ["W3-1", "pending"],
    ]);
    expect(match(state, "W2-1").entrants).toEqual([null, null]);
    expect(state.champion).toBeNull();
  });

  it("handles a single entrant as an immediate champion", () => {
    for (const type of ["single", "double"] as const) {
      const state = resolveBracket(generateBracket(["solo"], { type }), []);
      expect(state.matches).toEqual([]);
      expect(state.champion).toBe("solo");
      expect(state.placements).toEqual([{ entrant: "solo", place: 1 }]);
    }
  });
});

describe("double elimination", () => {
  it.each(SIZES)(
    "N=%i: every non-champion loses exactly twice, the champion at most once",
    (n) => {
      for (const pick of [favourite, underdog, mixed]) {
        const bracket = generateBracket(ids(n), { type: "double" });
        const { state } = playAll(bracket, pick);
        expect(state.complete).toBe(true);
        const losses = lossCounts(state);
        const champion = state.champion ?? "";
        expect(ids(n)).toContain(champion);
        expect(losses.get(champion) ?? 0).toBeLessThanOrEqual(1);
        for (const e of ids(n))
          if (e !== champion) expect(losses.get(e)).toBe(2);
        expect(state.placements?.filter((p) => p.place === 1)).toEqual([
          { entrant: champion, place: 1 },
        ]);
        expect(state.placements?.filter((p) => p.place === 2)).toHaveLength(1);
        expect(state.matches.some((m) => m.status === "pending")).toBe(false);
      }
    },
  );

  it("drops every winners-bracket loser into exactly one slot", () => {
    for (const n of SIZES) {
      const bracket = generateBracket(ids(n), { type: "double" });
      const loserRefs = bracket.matches
        .filter((m) => m.id !== "GF-2")
        .flatMap((m) =>
          m.slots.flatMap((s) => (s.kind === "loser" ? [s.matchId] : [])),
        );
      const wb = bracket.matches
        .filter((m) => m.side === "winners")
        .map((m) => m.id);
      expect([...loserRefs].sort()).toEqual([...wb].sort());
    }
  });

  it.each([8, 16, 32, 64])(
    "N=%i: no rematch in the losers bracket before its final when favourites win",
    (n) => {
      const { state } = playAll(
        generateBracket(ids(n), { type: "double" }),
        favourite,
      );
      const met = new Set<string>();
      const key = (m: ResolvedMatch) => [...m.entrants].sort().join("|");
      for (const m of state.matches.filter((x) => x.side === "winners"))
        met.add(key(m));
      const lbFinalRound = Math.max(
        ...state.matches.filter((m) => m.side === "losers").map((m) => m.round),
      );
      for (const m of state.matches.filter(
        (x) => x.side === "losers" && x.round < lbFinalRound,
      )) {
        expect(met.has(key(m))).toBe(false);
        met.add(key(m));
      }
    },
  );

  it("skips the bracket reset when the winners-bracket champion wins the grand final", () => {
    const bracket = generateBracket(ids(4), { type: "double" });
    const { state } = playAll(bracket, favourite);
    expect(match(state, "GF-1").winner).toBe("e1");
    expect(match(state, "GF-2").status).toBe("skipped");
    expect(match(state, "GF-2").entrants).toEqual([null, null]);
    expect(state.champion).toBe("e1");
    expect(state.complete).toBe(true);
    const reset = resolveBracket(bracket, [
      ...playAll(bracket, favourite).results,
      res("GF-2", "e1", ["e1", "e2"]),
    ]);
    expect(reset.invalidated).toEqual(["GF-2"]);
  });

  it("plays the bracket reset when the losers-bracket champion wins the grand final", () => {
    const bracket = generateBracket(ids(4), { type: "double" });
    const results = playAll(bracket, favourite).results.filter(
      (r) => r.matchId !== "GF-1",
    );
    const pendingFinal = resolveBracket(bracket, results);
    expect(match(pendingFinal, "GF-1").entrants).toEqual(["e1", "e2"]);
    expect(match(pendingFinal, "GF-2").status).toBe("pending");
    expect(match(pendingFinal, "GF-2").entrants).toEqual([null, null]);
    results.push(res("GF-1", "e2", ["e1", "e2"]));
    const afterFirst = resolveBracket(bracket, results);
    expect(match(afterFirst, "GF-2").status).toBe("ready");
    expect(match(afterFirst, "GF-2").entrants).toEqual(["e1", "e2"]);
    expect(afterFirst.champion).toBeNull();
    expect(afterFirst.complete).toBe(false);
    const done = resolveBracket(bracket, [
      ...results,
      res("GF-2", "e1", ["e1", "e2"]),
    ]);
    expect(done.champion).toBe("e1");
    expect(done.placements?.slice(0, 2)).toEqual([
      { entrant: "e1", place: 1 },
      { entrant: "e2", place: 2 },
    ]);
  });

  it("crowns the losers-bracket champion directly with a single grand final", () => {
    const bracket = generateBracket(ids(4), {
      type: "double",
      grandFinal: "single",
    });
    expect(bracket.matches.some((m) => m.id === "GF-2")).toBe(false);
    const results = playAll(bracket, favourite).results.map((r) =>
      r.matchId === "GF-1" ? { ...r, winner: "e2" } : r,
    );
    const state = resolveBracket(bracket, results);
    expect(state.champion).toBe("e2");
    expect(state.complete).toBe(true);
  });

  it("runs a two-entrant double elimination as a grand final with reset", () => {
    const bracket = generateBracket(ids(2), { type: "double" });
    expect(bracket.matches.map((m) => m.id)).toEqual(["W1-1", "GF-1", "GF-2"]);
    const state = resolveBracket(bracket, [
      res("W1-1", "e2", ["e1", "e2"]),
      res("GF-1", "e1", ["e2", "e1"]),
    ]);
    expect(match(state, "GF-1").entrants).toEqual(["e2", "e1"]);
    expect(match(state, "GF-2").status).toBe("ready");
  });
});

describe("result corrections", () => {
  it("recomputes downstream slots and reports stale results (single)", () => {
    const bracket = generateBracket(ids(8), { type: "single" });
    const { results } = playAll(bracket, favourite);
    const corrected = results.map((r) =>
      r.matchId === "W1-1" ? { ...r, winner: "e8" } : r,
    );
    const state = resolveBracket(bracket, corrected);
    expect(match(state, "W2-1").entrants).toEqual(["e8", "e4"]);
    expect(match(state, "W2-1").status).toBe("ready");
    expect(match(state, "W3-1").entrants).toEqual([null, "e2"]);
    expect(state.invalidated).toEqual(["W2-1", "W3-1"]);
    expect(state.champion).toBeNull();
    expect(state.complete).toBe(false);
  });

  it("propagates a correction into the losers bracket (double)", () => {
    const bracket = generateBracket(ids(8), { type: "double" });
    const { results, state: before } = playAll(bracket, favourite);
    expect(match(before, "L1-1").entrants).toEqual(["e8", "e5"]);
    const corrected = results.map((r) =>
      r.matchId === "W1-1" ? { ...r, winner: "e8" } : r,
    );
    const state = resolveBracket(bracket, corrected);
    expect(match(state, "L1-1").entrants).toEqual(["e1", "e5"]);
    expect(state.invalidated).toContain("L1-1");
    expect(state.invalidated).toContain("W2-1");
    expect(state.invalidated).toContain("GF-1");
    expect(state.champion).toBeNull();
  });

  it("invalidates a result whose opponent changed even if its winner is still there", () => {
    const bracket = generateBracket(ids(4), { type: "single", bestOf: 3 });
    const results: MatchResult[] = [
      res("W1-1", "e1", ["e1", "e4"], [2, 0]),
      res("W1-2", "e2", ["e2", "e3"], [2, 1]),
      res("W2-1", "e1", ["e1", "e2"], [2, 1]),
    ];
    expect(resolveBracket(bracket, results).complete).toBe(true);
    const corrected = results.map((r) =>
      r.matchId === "W1-2" ? res("W1-2", "e3", ["e2", "e3"], [1, 2]) : r,
    );
    const state = resolveBracket(bracket, corrected);
    expect(state.invalidated).toEqual(["W2-1"]);
    expect(match(state, "W2-1").entrants).toEqual(["e1", "e3"]);
    expect(match(state, "W2-1").status).toBe("ready");
    expect(match(state, "W2-1").winner).toBeNull();
    expect(state.champion).toBeNull();
    expect(state.complete).toBe(false);
    expect(state.placements).toBeNull();
  });

  it("invalidates a result recorded with the entrants in the wrong slot order", () => {
    const bracket = generateBracket(ids(4), { type: "single" });
    const state = resolveBracket(bracket, [res("W1-1", "e1", ["e4", "e1"])]);
    expect(state.invalidated).toEqual(["W1-1"]);
    expect(match(state, "W1-1").status).toBe("ready");
  });

  it("reports results submitted before their match is playable", () => {
    const bracket = generateBracket(ids(4), { type: "single" });
    const state = resolveBracket(bracket, [res("W2-1", "e1", ["e1", "e2"])]);
    expect(state.invalidated).toEqual(["W2-1"]);
    expect(match(state, "W2-1").status).toBe("pending");
  });
});

describe("best-of formats", () => {
  it("applies per-round bestOf and validates scores against it", () => {
    const bracket = generateBracket(ids(8), {
      type: "single",
      bestOf: { 2: 3, 3: 5 },
    });
    expect(bracket.matches.map((m) => [m.id, m.bestOf])).toEqual([
      ["W1-1", 1],
      ["W1-2", 1],
      ["W1-3", 1],
      ["W1-4", 1],
      ["W2-1", 3],
      ["W2-2", 3],
      ["W3-1", 5],
    ]);
    const round1: MatchResult[] = [
      res("W1-1", "e1", ["e1", "e8"], [1, 0]),
      res("W1-2", "e4", ["e4", "e5"]),
      res("W1-3", "e3", ["e3", "e6"]),
      res("W1-4", "e2", ["e2", "e7"]),
    ];
    const ok = resolveBracket(bracket, [
      ...round1,
      res("W2-1", "e4", ["e1", "e4"], [1, 2]),
    ]);
    expect(match(ok, "W2-1").score).toEqual([1, 2]);
    expect(match(ok, "W2-1").winner).toBe("e4");
    const bad =
      (score: [number, number], winner = "e1") =>
      () =>
        resolveBracket(bracket, [
          ...round1,
          res("W2-1", winner, ["e1", "e4"], score),
        ]);
    expect(bad([1, 0])).toThrow(/best of 3/);
    expect(bad([1, 1])).toThrow(/no draws/);
    expect(bad([3, 0])).toThrow();
    expect(bad([2, -1])).toThrow();
    expect(bad([0, 2])).toThrow(/entrants order/);
    expect(() =>
      resolveBracket(bracket, [res("W1-1", "e1", ["e1", "e8"], [2, 0])]),
    ).toThrow(/best of 1/);
  });

  it("configures double elimination per side", () => {
    const bracket = generateBracket(ids(8), {
      type: "double",
      bestOf: {
        default: 3,
        winners: { 3: 5 },
        losers: { 1: 1 },
        grandFinal: 7,
      },
    });
    const bo = Object.fromEntries(bracket.matches.map((m) => [m.id, m.bestOf]));
    expect(bo["W1-1"]).toBe(3);
    expect(bo["W3-1"]).toBe(5);
    expect(bo["L1-1"]).toBe(1);
    expect(bo["L2-1"]).toBe(3);
    expect(bo["GF-1"]).toBe(7);
    expect(bo["GF-2"]).toBe(7);
  });

  it("rejects invalid bestOf configurations", () => {
    const bad = (config: BracketConfig) => () =>
      generateBracket(ids(8), config);
    expect(bad({ type: "single", bestOf: 2 })).toThrow(/odd/);
    expect(bad({ type: "single", bestOf: 0 })).toThrow(/odd/);
    expect(bad({ type: "single", bestOf: { 4: 3 } })).toThrow(/round 4/);
    expect(bad({ type: "single", bestOf: { 1: 4 } })).toThrow(/odd/);
    expect(bad({ type: "double", bestOf: { 1: 3 } })).toThrow(/winners/);
    expect(bad({ type: "double", bestOf: { losers: { 5: 3 } } })).toThrow(
      /round 5/,
    );
    expect(bad({ type: "single", bestOf: { losers: { 1: 3 } } })).toThrow(
      /double/,
    );
  });
});

describe("input validation and determinism", () => {
  it("rejects invalid entrants and configs", () => {
    expect(() => generateBracket([], { type: "single" })).toThrow(
      /at least one/,
    );
    expect(() => generateBracket(["a", "a"], { type: "single" })).toThrow(
      /Duplicate entrant/,
    );
    expect(() => generateBracket(["a", " "], { type: "single" })).toThrow(
      /non-empty/,
    );
    expect(() =>
      generateBracket(ids(4), { type: "double", thirdPlaceMatch: true }),
    ).toThrow(/single elimination/);
    expect(() =>
      generateBracket(ids(4), { type: "single", grandFinal: "reset" }),
    ).toThrow(/double/);
    expect(() =>
      generateBracket(ids(2), { type: "single", thirdPlaceMatch: true }),
    ).toThrow(/3 entrants/);
  });

  it("rejects malformed results", () => {
    const bracket = generateBracket(ids(4), { type: "single" });
    expect(() =>
      resolveBracket(bracket, [res("W9-1", "e1", ["e1", "e4"])]),
    ).toThrow(/Unknown match/);
    expect(() =>
      resolveBracket(bracket, [res("W1-1", "ghost", ["ghost", "e4"])]),
    ).toThrow(/not an entrant/);
    expect(() =>
      resolveBracket(bracket, [
        res("W1-1", "e1", ["e1", "e4"]),
        res("W1-1", "e4", ["e1", "e4"]),
      ]),
    ).toThrow(/Duplicate result/);
    expect(() =>
      resolveBracket(bracket, [res("W1-1", "e2", ["e1", "e4"])]),
    ).toThrow(/not one of the result entrants/);
    expect(() =>
      resolveBracket(bracket, [res("W1-1", "e1", ["e1", "e1"])]),
    ).toThrow(/two distinct entrants/);
  });

  it("produces identical output for identical input without mutating it", () => {
    for (const type of ["single", "double"] as const) {
      const entrants = Object.freeze(ids(13));
      const a = generateBracket(entrants, { type });
      const b = generateBracket(entrants, { type });
      expect(a).toEqual(b);
      const { results } = playAll(a, mixed);
      const frozen = Object.freeze(results.map((r) => Object.freeze({ ...r })));
      const snapshot = JSON.stringify(a);
      expect(resolveBracket(a, frozen)).toEqual(resolveBracket(b, frozen));
      expect(JSON.stringify(a)).toBe(snapshot);
      expect(resolveBracket(a, [...frozen].reverse())).toEqual(
        resolveBracket(a, frozen),
      );
    }
  });
});
