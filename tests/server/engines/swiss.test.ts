import { describe, expect, it } from "vitest";
import {
  computeSwissStandings,
  pairNextRound,
  type SwissRound,
} from "~/server/domain/engines/swiss";

const entrantsOf = (count: number) =>
  Array.from({ length: count }, (_, i) => `e${i + 1}`);

const pairs = (round: Pick<SwissRound, "pairings">) =>
  round.pairings.map((p) => [p.id, p.a, p.b]);

type Outcome = (a: string, b: string) => string | null;

const betterSeedWins =
  (entrants: string[]): Outcome =>
  (a, b) =>
    entrants.indexOf(a) < entrants.indexOf(b) ? a : b;

/** Pairs and plays `rounds` rounds; `outcome` returns the winner or null. */
function simulateWith(
  entrants: string[],
  rounds: number,
  outcome: Outcome,
  history: SwissRound[] = [],
): SwissRound[] {
  for (let r = 0; r < rounds; r += 1) {
    const { pairings } = pairNextRound(entrants, history);
    history.push({
      pairings,
      results: pairings.map((p) => ({
        pairingId: p.id,
        winner: p.b === null ? p.a : outcome(p.a, p.b),
      })),
    });
  }
  return history;
}

/** Plays `rounds` rounds where the better seed always wins. */
const simulate = (entrants: string[], rounds: number) =>
  simulateWith(entrants, rounds, betterSeedWins(entrants));

/** Seeded LCG outcome: ~30% draws, otherwise the better seed wins 70%. */
function randomOutcome(entrants: string[], seed: number): Outcome {
  let state = seed >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  return (a, b) => {
    if (next() < 0.3) return null;
    const [better, worse] =
      entrants.indexOf(a) < entrants.indexOf(b) ? [a, b] : [b, a];
    return next() < 0.7 ? better : worse;
  };
}

const metKey = (a: string, b: string) => [a, b].sort().join("|");

function expectNoRematch(history: SwissRound[]) {
  const met = new Set<string>();
  for (const round of history)
    for (const p of round.pairings) {
      if (p.b === null) continue;
      expect(met.has(metKey(p.a, p.b))).toBe(false);
      met.add(metKey(p.a, p.b));
    }
}

describe("swiss round 1", () => {
  it("pairs top half against bottom half by seed for 8 entrants", () => {
    const plan = pairNextRound(entrantsOf(8), []);
    expect(plan.round).toBe(1);
    expect(pairs(plan)).toEqual([
      ["R1-1", "e1", "e5"],
      ["R1-2", "e2", "e6"],
      ["R1-3", "e3", "e7"],
      ["R1-4", "e4", "e8"],
    ]);
  });

  it("gives the bye to the last seed for 9 entrants and is deterministic", () => {
    const plan = pairNextRound(entrantsOf(9), []);
    expect(pairs(plan)).toEqual([
      ["R1-1", "e1", "e5"],
      ["R1-2", "e2", "e6"],
      ["R1-3", "e3", "e7"],
      ["R1-4", "e4", "e8"],
      ["R1-BYE", "e9", null],
    ]);
    expect(pairNextRound(entrantsOf(9), [])).toEqual(plan);
  });

  it("pairs 2 entrants and refuses a single one", () => {
    expect(pairs(pairNextRound(["a", "b"], []))).toEqual([["R1-1", "a", "b"]]);
    expect(() => pairNextRound(["a"], [])).toThrow(/at least 2/);
    expect(pairs(pairNextRound(["a", "b", "c"], []))).toEqual([
      ["R1-1", "a", "b"],
      ["R1-BYE", "c", null],
    ]);
  });
});

describe("swiss simulation invariants", () => {
  it.each([8, 9, 13, 16])(
    "plays 5 rounds with %i entrants without rematches or double byes",
    (count) => {
      const entrants = entrantsOf(count);
      const history = simulate(entrants, 5);
      const met = new Set<string>();
      const byes = new Map<string, number>();
      const ids = new Set<string>();
      history.forEach((round, r) => {
        const seen = round.pairings.flatMap((p) =>
          p.b === null ? [p.a] : [p.a, p.b],
        );
        expect([...seen].sort()).toEqual([...entrants].sort());
        expect(round.pairings.filter((p) => p.b === null)).toHaveLength(
          count % 2,
        );
        for (const p of round.pairings) {
          expect(p.id.startsWith(`R${r + 1}-`)).toBe(true);
          expect(ids.has(p.id)).toBe(false);
          ids.add(p.id);
          if (p.b === null) {
            byes.set(p.a, (byes.get(p.a) ?? 0) + 1);
            continue;
          }
          const key = [p.a, p.b].sort().join("|");
          expect(met.has(key)).toBe(false);
          met.add(key);
        }
      });
      for (const n of byes.values()) expect(n).toBe(1);
      expect(simulate(entrants, 5)).toEqual(history);
      const standings = computeSwissStandings(entrants, history);
      expect(standings[0]!.entrant).toBe("e1");
      expect(standings[0]!.score).toBe(5);
      expect(standings.filter((s) => s.score === 5)).toHaveLength(1);
    },
  );

  it("gives the bye to the lowest-ranked entrant without a bye", () => {
    const history = simulate(entrantsOf(9), 1);
    // e9 (bye, 1 pt) outranks the round-1 losers; e8 is last.
    const plan = pairNextRound(entrantsOf(9), history);
    expect(plan.pairings.find((p) => p.b === null)?.a).toBe("e8");
  });

  it("refuses an odd round when everyone already had a bye", () => {
    const history = simulate(["a", "b", "c"], 3);
    expect(() => pairNextRound(["a", "b", "c"], history)).toThrow(
      /one bye per entrant/,
    );
  });

  it("names the one-bye rule when only a used bye would allow a pairing", () => {
    const entrants = ["a", "b", "c", "d", "e"];
    // e sits out; a meets b, c and d, so only a bye for a could work.
    const history: SwissRound[] = [
      ["d", "a", "b"],
      ["b", "a", "c"],
      ["c", "a", "d"],
      ["a", "b", "c"],
    ].map(([bye, a, b], r) => ({
      pairings: [
        { id: `R${r + 1}-1`, a: a!, b: b! },
        { id: `R${r + 1}-BYE`, a: bye!, b: null },
      ],
      results: [{ pairingId: `R${r + 1}-1`, winner: a! }],
    }));
    expect(() => pairNextRound(entrants, history)).toThrow(
      /one bye per entrant/,
    );
  });
});

describe("swiss score groups", () => {
  it("pairs leaders with leaders and floats down", () => {
    const history = simulate(entrantsOf(8), 1);
    expect(pairs(pairNextRound(entrantsOf(8), history))).toEqual([
      ["R2-1", "e1", "e3"],
      ["R2-2", "e2", "e4"],
      ["R2-3", "e5", "e7"],
      ["R2-4", "e6", "e8"],
    ]);
  });

  it("floats the lowest of an odd score group to the top of the next", () => {
    // After round 1 of 6: winners e1, e2, e3 (score 1); losers e4, e5, e6.
    const history = simulate(entrantsOf(6), 1);
    const plan = pairNextRound(entrantsOf(6), history);
    const crossings = plan.pairings.filter(
      (p) =>
        ["e1", "e2", "e3"].includes(p.a) !== ["e1", "e2", "e3"].includes(p.b!),
    );
    expect(crossings).toHaveLength(1);
    expect(pairs(plan)).toEqual([
      ["R2-1", "e1", "e2"],
      ["R2-2", "e3", "e4"],
      ["R2-3", "e5", "e6"],
    ]);
  });

  it("throws when no rematch-free pairing exists", () => {
    const entrants = entrantsOf(4);
    const history = simulate(entrants, 3);
    expect(() => pairNextRound(entrants, history)).toThrow(/rematch/);
  });

  it("finds the only rematch-free pairing instead of a greedy dead end", () => {
    // Round 3 of 4: the only unplayed pairs are e1-e4 and e2-e3.
    const history = simulate(entrantsOf(4), 2);
    const plan = pairNextRound(entrantsOf(4), history);
    const keys = plan.pairings.map((p) => [p.a, p.b].sort().join("|"));
    expect(keys.sort()).toEqual(["e1|e4", "e2|e3"]);
  });
});

describe("swiss pairing performance and optimality", () => {
  it("pairs round 6 of 32 entrants with blocked ideal pairs in under 1 s", () => {
    const entrants = entrantsOf(32);
    const history = simulateWith(entrants, 5, randomOutcome(entrants, 7));
    const ranked = computeSwissStandings(entrants, history).map(
      (s) => s.entrant,
    );
    const met = new Set(
      history.flatMap((round) =>
        round.pairings.flatMap((p) => (p.b ? [metKey(p.a, p.b)] : [])),
      ),
    );
    const adjacent = ranked.flatMap((id, i) =>
      i % 2 === 0 ? [metKey(id, ranked[i + 1]!)] : [],
    );
    expect(adjacent.some((key) => met.has(key))).toBe(true);
    const started = performance.now();
    const plan = pairNextRound(entrants, history);
    expect(performance.now() - started).toBeLessThan(1000);
    expectNoRematch([...history, { pairings: plan.pairings, results: [] }]);
    expect(plan.pairings).toHaveLength(16);
  });

  it("plays 7 rounds of 128 entrants with draws without rematches", () => {
    const entrants = entrantsOf(128);
    const started = performance.now();
    const history = simulateWith(entrants, 7, randomOutcome(entrants, 42));
    expect(performance.now() - started).toBeLessThan(5000);
    expectNoRematch(history);
    expect(history.every((round) => round.pairings.length === 64)).toBe(true);
  });

  it("plays 32 entrants towards a full round robin until pairing is impossible", () => {
    const entrants = entrantsOf(32);
    const outcome = randomOutcome(entrants, 3);
    const history: SwissRound[] = [];
    const started = performance.now();
    for (let r = 0; r < 31; r += 1) {
      try {
        simulateWith(entrants, 1, outcome, history);
      } catch (error) {
        expect(String(error)).toMatch(/rematch/);
        break;
      }
    }
    expect(performance.now() - started).toBeLessThan(5000);
    expect(history.length).toBeGreaterThanOrEqual(20);
    expectNoRematch(history);
  });

  /** Brute force: lowest eligible bye that works, then min sum of d^2. */
  function bruteForce(entrants: string[], history: SwissRound[]) {
    const standings = computeSwissStandings(entrants, history);
    const met = new Set(
      history.flatMap((round) =>
        round.pairings.flatMap((p) => (p.b ? [metKey(p.a, p.b)] : [])),
      ),
    );
    const score = new Map(standings.map((s) => [s.entrant, s.score]));
    const best = (rest: string[]): number => {
      if (rest.length === 0) return 0;
      const [top, ...others] = rest;
      let min = Infinity;
      others.forEach((other, i) => {
        if (met.has(metKey(top!, other))) return;
        const d = score.get(top!)! - score.get(other)!;
        min = Math.min(min, d * d + best(others.filter((_, j) => j !== i)));
      });
      return min;
    };
    const ids = standings.map((s) => s.entrant);
    if (ids.length % 2 === 0) return { bye: null, cost: best(ids) };
    for (const s of [...standings].reverse()) {
      if (s.byes > 0) continue;
      const cost = best(ids.filter((id) => id !== s.entrant));
      if (cost !== Infinity) return { bye: s.entrant, cost };
    }
    return { bye: null, cost: Infinity };
  }

  it("matches brute-force optimal cost on small random tournaments", () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const entrants = entrantsOf(2 + (seed % 9));
      const outcome = randomOutcome(entrants, seed);
      const history: SwissRound[] = [];
      for (let r = 0; r < entrants.length; r += 1) {
        const expected = bruteForce(entrants, history);
        if (expected.cost === Infinity) {
          expect(() => pairNextRound(entrants, history)).toThrow();
          break;
        }
        const plan = pairNextRound(entrants, history);
        const score = new Map(
          computeSwissStandings(entrants, history).map((s) => [
            s.entrant,
            s.score,
          ]),
        );
        const cost = plan.pairings.reduce(
          (sum, p) =>
            p.b === null ? sum : sum + (score.get(p.a)! - score.get(p.b)!) ** 2,
          0,
        );
        expect(plan.pairings.find((p) => p.b === null)?.a ?? null).toBe(
          expected.bye,
        );
        expect(cost).toBeCloseTo(expected.cost, 9);
        checked += 1;
        simulateWith(entrants, 1, outcome, history);
      }
    }
    expect(checked).toBeGreaterThan(150);
  });
});

describe("swiss standings", () => {
  const round = (
    n: number,
    games: [string, string | null, string | null][],
  ): SwissRound => ({
    pairings: games.map(([a, b], i) => ({ id: `R${n}-${i + 1}`, a, b })),
    results: games.map(([, , winner], i) => ({
      pairingId: `R${n}-${i + 1}`,
      winner,
    })),
  });

  it("computes Buchholz by hand and breaks score ties with it over seed", () => {
    const entrants = ["A", "B", "C", "D"];
    const history = [
      round(1, [
        ["A", "B", "A"],
        ["C", "D", "D"],
      ]),
      round(2, [
        ["A", "D", "A"],
        ["B", "C", "C"],
      ]),
    ];
    // Scores A2 B0 C1 D1. Buchholz A=B+D=1, B=A+C=3, C=D+B=1, D=C+A=3.
    const standings = computeSwissStandings(entrants, history);
    expect(
      standings.map((s) => [s.entrant, s.score, s.buchholz, s.rank]),
    ).toEqual([
      ["A", 2, 1, 1],
      ["D", 1, 3, 2],
      ["C", 1, 1, 3],
      ["B", 0, 3, 4],
    ]);
    expect(standings.every((s) => s.unresolvedTieWith.length === 0)).toBe(true);
  });

  it("breaks a Buchholz tie with Sonneborn-Berger, draws counting half", () => {
    const entrants = ["A", "B", "C", "D"];
    const history = [
      round(1, [
        ["A", "B", "A"],
        ["C", "D", null],
      ]),
      round(2, [
        ["A", "D", null],
        ["B", "C", "B"],
      ]),
    ];
    // Scores A1.5 B1 C0.5 D1; Buchholz is 2 for everyone.
    // SB A = B + D/2 = 1.5, B = C = 0.5, C = D/2 = 0.5, D = C/2 + A/2 = 1.
    const standings = computeSwissStandings(entrants, history);
    expect(
      standings.map((s) => [s.entrant, s.score, s.buchholz, s.sonnebornBerger]),
    ).toEqual([
      ["A", 1.5, 2, 1.5],
      ["D", 1, 2, 1],
      ["B", 1, 2, 0.5],
      ["C", 0.5, 2, 0.5],
    ]);
    expect(standings[1]).toMatchObject({ wins: 0, draws: 2, losses: 0 });
  });

  it("counts a bye as score but 0 Buchholz and exposes unresolved ties", () => {
    const history = [
      round(1, [
        ["A", "B", "A"],
        ["C", null, "C"],
      ]),
    ];
    const standings = computeSwissStandings(["A", "B", "C"], history);
    expect(standings.map((s) => [s.entrant, s.score, s.buchholz])).toEqual([
      ["A", 1, 0],
      ["C", 1, 0],
      ["B", 0, 1],
    ]);
    expect(standings[0]!.unresolvedTieWith).toEqual(["C"]);
    expect(standings[1]!.unresolvedTieWith).toEqual(["A"]);
    expect(standings[1]!.byes).toBe(1);
    expect(standings[2]!.unresolvedTieWith).toEqual([]);
  });

  it("applies configurable points", () => {
    const history = [
      round(1, [
        ["A", "B", null],
        ["C", null, "C"],
      ]),
    ];
    const standings = computeSwissStandings(["A", "B", "C"], history, {
      winPoints: 3,
      drawPoints: 1,
      byePoints: 2,
    });
    expect(standings.map((s) => [s.entrant, s.score])).toEqual([
      ["C", 2],
      ["A", 1],
      ["B", 1],
    ]);
    expect(() =>
      computeSwissStandings(["A"], [], { winPoints: Number.NaN }),
    ).toThrow(/winPoints/);
  });

  it("ignores unreported games in standings but refuses to pair after them", () => {
    const plan = pairNextRound(entrantsOf(4), []);
    const history: SwissRound[] = [
      {
        pairings: plan.pairings,
        results: [{ pairingId: "R1-1", winner: "e1" }],
      },
    ];
    const standings = computeSwissStandings(entrantsOf(4), history);
    expect(standings.find((s) => s.entrant === "e2")!.opponents).toEqual([]);
    expect(() => pairNextRound(entrantsOf(4), history)).toThrow(/R1-2/);
  });
});

describe("swiss corrections", () => {
  it("recomputes standings and the next pairing from a corrected result", () => {
    const entrants = entrantsOf(4);
    const r1 = pairNextRound(entrants, []).pairings; // e1-e3, e2-e4
    const original: SwissRound[] = [
      {
        pairings: r1,
        results: [
          { pairingId: "R1-1", winner: "e1" },
          { pairingId: "R1-2", winner: "e2" },
        ],
      },
    ];
    expect(pairs(pairNextRound(entrants, original))).toEqual([
      ["R2-1", "e1", "e2"],
      ["R2-2", "e3", "e4"],
    ]);
    const corrected: SwissRound[] = [
      {
        pairings: r1,
        results: [
          { pairingId: "R1-1", winner: "e1" },
          { pairingId: "R1-2", winner: "e4" },
        ],
      },
    ];
    expect(
      computeSwissStandings(entrants, corrected).map((s) => s.entrant),
    ).toEqual(["e1", "e4", "e2", "e3"]);
    expect(pairs(pairNextRound(entrants, corrected))).toEqual([
      ["R2-1", "e1", "e4"],
      ["R2-2", "e2", "e3"],
    ]);
  });

  it("never mutates its inputs", () => {
    const entrants = entrantsOf(9);
    const history = simulate(entrants, 2);
    const snapshot = structuredClone(history);
    pairNextRound(entrants, history);
    computeSwissStandings(entrants, history);
    expect(history).toEqual(snapshot);
    expect(entrants).toEqual(entrantsOf(9));
  });
});

describe("swiss input validation", () => {
  const entrants = ["a", "b", "c", "d"];
  const valid = (overrides: Partial<SwissRound> = {}): SwissRound[] => [
    {
      pairings: [
        { id: "R1-1", a: "a", b: "b" },
        { id: "R1-2", a: "c", b: "d" },
      ],
      results: [{ pairingId: "R1-1", winner: "a" }],
      ...overrides,
    },
  ];

  it("rejects duplicate and empty entrant ids", () => {
    expect(() => computeSwissStandings(["a", "a"], [])).toThrow(/Duplicate/);
    expect(() => pairNextRound(["a", " "], [])).toThrow(/empty/);
  });

  it("rejects unknown entrants and malformed pairings", () => {
    expect(() =>
      computeSwissStandings(
        entrants,
        valid({ pairings: [{ id: "R1-1", a: "a", b: "zed" }] }),
      ),
    ).toThrow(/unknown entrant "zed"/);
    expect(() =>
      computeSwissStandings(
        entrants,
        valid({
          pairings: [
            { id: "R1-1", a: "a", b: "b" },
            { id: "R1-2", a: "a", b: "c" },
          ],
        }),
      ),
    ).toThrow(/paired twice/);
    expect(() =>
      computeSwissStandings(
        entrants,
        valid({ pairings: [{ id: "R1-1", a: "a", b: "a" }], results: [] }),
      ),
    ).toThrow(/itself/);
    expect(() =>
      computeSwissStandings(entrants, [...valid(), ...valid()]),
    ).toThrow(/Duplicate pairing id/);
  });

  it("rejects results for unknown pairings or foreign winners", () => {
    expect(() =>
      computeSwissStandings(
        entrants,
        valid({ results: [{ pairingId: "R9-9", winner: "a" }] }),
      ),
    ).toThrow(/unknown pairing "R9-9"/);
    expect(() =>
      computeSwissStandings(
        entrants,
        valid({ results: [{ pairingId: "R1-1", winner: "c" }] }),
      ),
    ).toThrow(/not part of pairing/);
    expect(() =>
      computeSwissStandings(
        entrants,
        valid({
          results: [
            { pairingId: "R1-1", winner: "a" },
            { pairingId: "R1-1", winner: "b" },
          ],
        }),
      ),
    ).toThrow(/more than one result/);
    expect(() =>
      computeSwissStandings(
        ["a", "b", "c"],
        [
          {
            pairings: [
              { id: "R1-1", a: "a", b: "b" },
              { id: "R1-BYE", a: "c", b: null },
            ],
            results: [{ pairingId: "R1-BYE", winner: null }],
          },
        ],
      ),
    ).toThrow(/bye/);
  });
});
