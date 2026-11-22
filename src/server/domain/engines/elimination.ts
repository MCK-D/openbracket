export type BracketType = "single" | "double";
export type GrandFinalMode = "single" | "reset";
export type BracketSide = "winners" | "losers" | "thirdPlace" | "grandFinal";

/** Best-of formats per bracket side. Round keys are 1-based round numbers. */
export interface SideBestOf {
  default?: number;
  winners?: Record<number, number>;
  losers?: Record<number, number>;
  grandFinal?: number;
  thirdPlace?: number;
}

/**
 * `number`: every match. `Record<round, bestOf>`: winners rounds of a single
 * elimination bracket only. `SideBestOf`: per side, required for double.
 */
export type BestOfConfig = number | Record<number, number> | SideBestOf;

export interface BracketConfig {
  type: BracketType;
  bestOf?: BestOfConfig;
  /** Double only, default `reset`. */
  grandFinal?: GrandFinalMode;
  /** Single only. */
  thirdPlaceMatch?: boolean;
}

export type SlotSource =
  | { kind: "seed"; seed: number }
  | { kind: "winner"; matchId: string }
  | { kind: "loser"; matchId: string };

export interface BracketMatch {
  id: string;
  side: BracketSide;
  round: number;
  index: number;
  bestOf: number;
  slots: [SlotSource, SlotSource];
  /** At least one slot can never be filled: the match is never played. */
  bye: boolean;
}

export interface Bracket {
  type: BracketType;
  entrants: string[];
  size: number;
  grandFinal: GrandFinalMode | null;
  thirdPlaceMatch: boolean;
  matches: BracketMatch[];
}

export interface MatchResult {
  matchId: string;
  winner: string;
  /** Games won, in the order of `entrants`. */
  score?: [number, number];
  /**
   * Participants the result was recorded against, in slot order. A result is
   * applied only while the match still has exactly these entrants.
   */
  entrants: [string, string];
}

export type MatchStatus = "pending" | "ready" | "completed" | "bye" | "skipped";

export interface ResolvedMatch extends BracketMatch {
  entrants: [string | null, string | null];
  winner: string | null;
  loser: string | null;
  score: [number, number] | null;
  status: MatchStatus;
}

export interface Placement {
  entrant: string;
  place: number;
}

export interface BracketState {
  matches: ResolvedMatch[];
  champion: string | null;
  complete: boolean;
  placements: Placement[] | null;
  invalidated: string[];
}

const SIDE_KEYS: Record<string, true> = {
  default: true,
  winners: true,
  losers: true,
  grandFinal: true,
  thirdPlace: true,
};

function validateEntrants(entrants: readonly string[]): void {
  if (entrants.length === 0)
    throw new Error("A bracket needs at least one entrant.");
  const seen = new Set<string>();
  for (const id of entrants) {
    if (typeof id !== "string" || id.trim() === "")
      throw new Error("Entrant ids must be non-empty strings.");
    if (seen.has(id)) throw new Error(`Duplicate entrant id "${id}".`);
    seen.add(id);
  }
}

function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/**
 * Seed placement for `size` slots (a power of two): consecutive pairs are the
 * first-round matches, and seeds s and t can meet no earlier than the top
 * seeds of their halves would (1 and 2 only in the final, 1-4 in semis).
 */
export function seedOrder(size: number): number[] {
  if (!Number.isInteger(size) || size < 1 || (size & (size - 1)) !== 0)
    throw new Error("Bracket size must be a power of two.");
  let order = [1];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((seed, i) =>
      i % 2 === 0 ? [seed, sum - seed] : [sum - seed, seed],
    );
  }
  return order;
}

function checkBestOf(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value % 2 === 0)
    throw new Error(`${label} must be an odd positive integer, got ${value}.`);
  return value;
}

function checkRoundMap(
  map: Record<number, number> | undefined,
  maxRound: number,
  label: string,
): Record<number, number> {
  const out: Record<number, number> = {};
  if (map === undefined) return out;
  for (const [key, value] of Object.entries(map)) {
    const round = Number(key);
    if (!Number.isInteger(round) || round < 1 || round > maxRound)
      throw new Error(
        `${label} round ${key} does not exist (rounds 1-${maxRound}).`,
      );
    out[round] = checkBestOf(value, `${label} round ${key} bestOf`);
  }
  return out;
}

interface BestOfTable {
  winners: (round: number) => number;
  losers: (round: number) => number;
  grandFinal: number;
  thirdPlace: number;
}

function bestOfTable(
  config: BracketConfig,
  rounds: number,
  lbRounds: number,
): BestOfTable {
  const raw = config.bestOf ?? 1;
  if (typeof raw === "number") {
    const value = checkBestOf(raw, "bestOf");
    return {
      winners: () => value,
      losers: () => value,
      grandFinal: value,
      thirdPlace: value,
    };
  }
  const keys = Object.keys(raw);
  const sideForm =
    keys.length > 0 && keys.every((k) => Object.hasOwn(SIDE_KEYS, k));
  if (!sideForm && keys.some((k) => Object.hasOwn(SIDE_KEYS, k)))
    throw new Error("bestOf mixes round numbers and side keys.");
  let side: SideBestOf;
  if (sideForm) side = raw as SideBestOf;
  else {
    if (config.type === "double")
      throw new Error(
        "Double elimination bestOf must use { winners, losers, grandFinal, default }.",
      );
    side = { winners: raw as Record<number, number> };
  }
  if (config.type === "single" && (side.losers || side.grandFinal))
    throw new Error(
      "losers and grandFinal bestOf only apply to double elimination.",
    );
  if (config.type === "double" && side.thirdPlace !== undefined)
    throw new Error("thirdPlace bestOf only applies to single elimination.");
  const fallback =
    side.default === undefined
      ? 1
      : checkBestOf(side.default, "bestOf.default");
  const winners = checkRoundMap(side.winners, rounds, "bestOf.winners");
  const losers = checkRoundMap(side.losers, lbRounds, "bestOf.losers");
  const finalBestOf = winners[rounds] ?? fallback;
  return {
    winners: (round) => winners[round] ?? fallback,
    losers: (round) => losers[round] ?? fallback,
    grandFinal:
      side.grandFinal === undefined
        ? fallback
        : checkBestOf(side.grandFinal, "bestOf.grandFinal"),
    thirdPlace:
      side.thirdPlace === undefined
        ? finalBestOf
        : checkBestOf(side.thirdPlace, "bestOf.thirdPlace"),
  };
}

/**
 * Losers of winners round `wbRound` (m matches) drop into the losers bracket
 * in a cycle over rounds 2, 3, 4, 5, ...: reversed, reversed within each
 * half, halves swapped, straight. This keeps a dropped entrant away from the
 * winners sub-bracket it just left (no favourite-wins rematch before the
 * losers final up to 256 entrants).
 */
function dropIndex(wbRound: number, i: number, m: number): number {
  const half = m / 2;
  switch ((wbRound - 2) % 4) {
    case 0:
      return m - 1 - i;
    case 1:
      if (m < 2) return i;
      return i < half ? half - 1 - i : m - 1 - (i - half);
    case 2:
      return m < 2 ? i : (i + half) % m;
    default:
      return i;
  }
}

const winnerOf = (matchId: string): SlotSource => ({ kind: "winner", matchId });
const loserOf = (matchId: string): SlotSource => ({ kind: "loser", matchId });
const wbId = (round: number, index: number): string => `W${round}-${index}`;
const lbId = (round: number, index: number): string => `L${round}-${index}`;

/**
 * Builds a single or double elimination bracket. Seeds follow `seedOrder`;
 * missing seeds (bracket size is the next power of two) become byes, which
 * therefore go to the top seeds. Match ids: `W<round>-<index>` (winners),
 * `L<round>-<index>` (losers), `3P`, `GF-1`, `GF-2` (bracket reset).
 */
export function generateBracket(
  entrants: readonly string[],
  config: BracketConfig,
): Bracket {
  validateEntrants(entrants);
  if (config.type !== "single" && config.type !== "double")
    throw new Error(`Unknown bracket type "${String(config.type)}".`);
  if (config.type === "single" && config.grandFinal !== undefined)
    throw new Error("grandFinal only applies to double elimination.");
  if (config.type === "double" && config.thirdPlaceMatch)
    throw new Error("A third place match only applies to single elimination.");
  if (
    config.grandFinal !== undefined &&
    config.grandFinal !== "single" &&
    config.grandFinal !== "reset"
  )
    throw new Error(`Unknown grand final mode "${String(config.grandFinal)}".`);
  const thirdPlaceMatch = config.thirdPlaceMatch ?? false;
  if (thirdPlaceMatch && entrants.length < 3)
    throw new Error("A third place match needs at least 3 entrants.");

  const count = entrants.length;
  const size = nextPowerOfTwo(count);
  const rounds = Math.log2(size);
  const double = config.type === "double";
  const lbRounds = double ? Math.max(0, 2 * (rounds - 1)) : 0;
  const bestOf = bestOfTable(config, rounds, lbRounds);
  const grandFinal = double ? (config.grandFinal ?? "reset") : null;

  const matches: BracketMatch[] = [];
  const winnerDead = new Map<string, boolean>();
  const loserDead = new Map<string, boolean>();
  const isDead = (source: SlotSource): boolean => {
    if (source.kind === "seed") return source.seed > count;
    const map = source.kind === "winner" ? winnerDead : loserDead;
    return map.get(source.matchId) ?? false;
  };
  const add = (
    id: string,
    side: BracketSide,
    round: number,
    index: number,
    matchBestOf: number,
    slots: [SlotSource, SlotSource],
  ): void => {
    const dead = slots.map(isDead);
    winnerDead.set(id, dead.every(Boolean));
    loserDead.set(id, dead.some(Boolean));
    matches.push({
      id,
      side,
      round,
      index,
      bestOf: matchBestOf,
      slots,
      bye: dead.some(Boolean),
    });
  };

  const order = seedOrder(size);
  for (let i = 0; 2 * i + 1 < size; i++) {
    const a = order[2 * i] ?? 0;
    const b = order[2 * i + 1] ?? 0;
    add(wbId(1, i + 1), "winners", 1, i + 1, bestOf.winners(1), [
      { kind: "seed", seed: Math.min(a, b) },
      { kind: "seed", seed: Math.max(a, b) },
    ]);
  }
  for (let r = 2; r <= rounds; r++) {
    for (let i = 1; i <= size / 2 ** r; i++) {
      add(wbId(r, i), "winners", r, i, bestOf.winners(r), [
        winnerOf(wbId(r - 1, 2 * i - 1)),
        winnerOf(wbId(r - 1, 2 * i)),
      ]);
    }
  }

  if (thirdPlaceMatch) {
    add("3P", "thirdPlace", rounds, 1, bestOf.thirdPlace, [
      loserOf(wbId(rounds - 1, 1)),
      loserOf(wbId(rounds - 1, 2)),
    ]);
  }

  if (double && rounds >= 1) {
    if (rounds >= 2) {
      for (let i = 1; i <= size / 4; i++) {
        add(lbId(1, i), "losers", 1, i, bestOf.losers(1), [
          loserOf(wbId(1, 2 * i - 1)),
          loserOf(wbId(1, 2 * i)),
        ]);
      }
      for (let j = 1; j <= rounds - 1; j++) {
        const m = size / 2 ** (j + 1);
        for (let i = 0; i < m; i++) {
          add(
            lbId(2 * j, i + 1),
            "losers",
            2 * j,
            i + 1,
            bestOf.losers(2 * j),
            [
              winnerOf(lbId(2 * j - 1, i + 1)),
              loserOf(wbId(j + 1, dropIndex(j + 1, i, m) + 1)),
            ],
          );
        }
        if (j === rounds - 1) continue;
        for (let i = 1; i <= m / 2; i++) {
          const r = 2 * j + 1;
          add(lbId(r, i), "losers", r, i, bestOf.losers(r), [
            winnerOf(lbId(2 * j, 2 * i - 1)),
            winnerOf(lbId(2 * j, 2 * i)),
          ]);
        }
      }
    }
    const slots: [SlotSource, SlotSource] = [
      winnerOf(wbId(rounds, 1)),
      rounds >= 2 ? winnerOf(lbId(lbRounds, 1)) : loserOf(wbId(1, 1)),
    ];
    add("GF-1", "grandFinal", 1, 1, bestOf.grandFinal, slots);
    if (grandFinal === "reset")
      add("GF-2", "grandFinal", 2, 1, bestOf.grandFinal, [...slots]);
  }

  return {
    type: config.type,
    entrants: [...entrants],
    size,
    grandFinal,
    thirdPlaceMatch,
    matches,
  };
}

function validateResults(
  bracket: Bracket,
  results: readonly MatchResult[],
): Map<string, MatchResult> {
  const matchById = new Map(bracket.matches.map((m) => [m.id, m]));
  const known = new Set(bracket.entrants);
  const byMatch = new Map<string, MatchResult>();
  for (const result of results) {
    const match = matchById.get(result.matchId);
    if (!match) throw new Error(`Unknown match "${result.matchId}".`);
    if (byMatch.has(result.matchId))
      throw new Error(`Duplicate result for match "${result.matchId}".`);
    if (match.bye)
      throw new Error(`Match "${match.id}" is a bye and takes no result.`);
    if (!known.has(result.winner))
      throw new Error(
        `Winner "${result.winner}" of match "${match.id}" is not an entrant.`,
      );
    const [first, second] = result.entrants;
    if (first === second || !known.has(first) || !known.has(second))
      throw new Error(
        `Result entrants of match "${match.id}" must be two distinct entrants.`,
      );
    if (first !== result.winner && second !== result.winner)
      throw new Error(
        `Winner of match "${match.id}" is not one of the result entrants.`,
      );
    if (result.score) {
      const [a, b] = result.score;
      const need = Math.ceil(match.bestOf / 2);
      const valid =
        Number.isInteger(a) &&
        Number.isInteger(b) &&
        a >= 0 &&
        b >= 0 &&
        Math.max(a, b) === need &&
        Math.min(a, b) < need &&
        (result.winner === first ? a : b) === need;
      if (!valid)
        throw new Error(
          `Score ${a}-${b} is invalid for best of ${match.bestOf} in match "${match.id}" won by "${result.winner}": the winner needs exactly ${need} wins, listed in entrants order, and there are no draws.`,
        );
    }
    byMatch.set(result.matchId, result);
  }
  return byMatch;
}

/**
 * Recomputes the whole bracket from `results`. A result whose match is not
 * playable yet, was skipped, or no longer has the recorded participants
 * (after an upstream correction) is ignored and listed in `invalidated`.
 * Malformed input (unknown match or entrant, bye result, bad score) throws.
 */
export function resolveBracket(
  bracket: Bracket,
  results: readonly MatchResult[],
): BracketState {
  const byMatch = validateResults(bracket, results);
  const matchById = new Map(bracket.matches.map((m) => [m.id, m]));
  const resolved = new Map<string, ResolvedMatch>();
  const invalidated = new Set<string>();

  const slotValue = (source: SlotSource): string | null => {
    if (source.kind === "seed")
      return bracket.entrants[source.seed - 1] ?? null;
    const match = resolve(source.matchId);
    return source.kind === "winner" ? match.winner : match.loser;
  };

  const resolve = (id: string): ResolvedMatch => {
    const cached = resolved.get(id);
    if (cached) return cached;
    const match = matchById.get(id);
    if (!match) throw new Error(`Bracket references unknown match "${id}".`);
    const entrants: [string | null, string | null] = [
      slotValue(match.slots[0]),
      slotValue(match.slots[1]),
    ];
    const out: ResolvedMatch = {
      ...match,
      slots: [match.slots[0], match.slots[1]],
      entrants,
      winner: null,
      loser: null,
      score: null,
      status: "pending",
    };
    resolved.set(id, out);
    const result = byMatch.get(id);
    if (match.bye) {
      out.status = "bye";
      out.winner = entrants[0] ?? entrants[1];
      return out;
    }
    if (id === "GF-2") {
      const first = resolve("GF-1");
      const needed =
        first.status === "completed" && first.winner !== first.entrants[0];
      if (!needed) {
        out.entrants = [null, null];
        if (first.status === "completed") out.status = "skipped";
        if (result) invalidated.add(id);
        return out;
      }
    }
    const [a, b] = entrants;
    if (a === null || b === null) {
      if (result) invalidated.add(id);
      return out;
    }
    out.status = "ready";
    if (!result) return out;
    if (result.entrants[0] !== a || result.entrants[1] !== b) {
      invalidated.add(id);
      return out;
    }
    if (result.score) out.score = [result.score[0], result.score[1]];
    out.status = "completed";
    out.winner = result.winner;
    out.loser = result.winner === a ? b : a;
    return out;
  };

  const matches = bracket.matches.map((m) => resolve(m.id));
  const champion = findChampion(bracket, resolved);
  const complete =
    champion !== null &&
    matches.every((m) => m.status !== "pending" && m.status !== "ready");
  return {
    matches,
    champion,
    complete,
    placements:
      complete && champion !== null
        ? placements(bracket, resolved, champion)
        : null,
    invalidated: bracket.matches
      .map((m) => m.id)
      .filter((id) => invalidated.has(id)),
  };
}

function findChampion(
  bracket: Bracket,
  resolved: ReadonlyMap<string, ResolvedMatch>,
): string | null {
  if (bracket.size === 1) return bracket.entrants[0] ?? null;
  if (bracket.type === "single")
    return resolved.get(wbId(Math.log2(bracket.size), 1))?.winner ?? null;
  const first = resolved.get("GF-1");
  if (first?.status !== "completed") return null;
  if (bracket.grandFinal === "single" || first.winner === first.entrants[0])
    return first.winner;
  const reset = resolved.get("GF-2");
  return reset?.status === "completed" ? reset.winner : null;
}

/**
 * Places from elimination order: entrants knocked out in the same round share
 * a place, equal to 1 + the number of entrants who lasted longer.
 */
function placements(
  bracket: Bracket,
  resolved: ReadonlyMap<string, ResolvedMatch>,
  champion: string,
): Placement[] {
  const rounds = Math.log2(bracket.size);
  const stage = new Map<string, number>();
  for (const match of resolved.values()) {
    if (match.side === "thirdPlace") {
      if (match.winner) stage.set(match.winner, (rounds - 1) * 10 + 6);
      if (match.loser) stage.set(match.loser, (rounds - 1) * 10 + 3);
      continue;
    }
    if (match.status !== "completed" || match.loser === null) continue;
    if (bracket.type === "single" && match.side === "winners") {
      const playsThird = bracket.thirdPlaceMatch && match.round === rounds - 1;
      if (!playsThird) stage.set(match.loser, match.round * 10);
    }
    if (bracket.type === "double" && match.side === "losers")
      stage.set(match.loser, match.round * 10);
  }
  if (bracket.type === "double") {
    const final = resolved.get("GF-1");
    const runnerUp = final?.entrants.find((e) => e !== null && e !== champion);
    if (runnerUp) stage.set(runnerUp, Number.MAX_SAFE_INTEGER);
  }
  stage.set(champion, Number.POSITIVE_INFINITY);
  const levels = bracket.entrants.map((e) => stage.get(e) ?? 0);
  return bracket.entrants
    .map((entrant, i) => ({
      entrant,
      place: 1 + levels.filter((l) => l > (levels[i] ?? 0)).length,
    }))
    .sort((x, y) => x.place - y.place);
}
