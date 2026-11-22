export type Group = { id: string; entrants: string[] };

export type Fixture = {
  id: string;
  leg: number;
  round: number;
  home: string;
  away: string;
};

export type Rest = { leg: number; round: number; entrant: string };

export type FixtureSchedule = { fixtures: Fixture[]; rests: Rest[] };

export type FixtureOptions = { legs?: number };

export type MatchResult = {
  matchId: string;
  homeScore: number;
  awayScore: number;
};

export type PointsConfig = { win: number; draw: number; loss: number };

export type TieBreak = "headToHead" | "gameDifference" | "gamesWon";

export type StandingsConfig = {
  points?: PointsConfig;
  tieBreaks?: TieBreak[];
};

export type StandingRow = {
  rank: number;
  entrant: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gameDifference: number;
  points: number;
  /** Entrants still level with this one after every tie-break; empty when resolved. */
  unresolvedTieWith: string[];
};

export const DEFAULT_POINTS: PointsConfig = { win: 3, draw: 1, loss: 0 };
export const DEFAULT_TIE_BREAKS: TieBreak[] = [
  "headToHead",
  "gameDifference",
  "gamesWon",
];
const TIE_BREAKS: readonly TieBreak[] = DEFAULT_TIE_BREAKS;

function validateEntrants(entrants: readonly string[]): void {
  if (entrants.length === 0)
    throw new Error("At least one entrant is required.");
  const seen = new Set<string>();
  for (const entrant of entrants) {
    if (typeof entrant !== "string" || entrant.trim() === "")
      throw new Error("Entrant ids must be non-empty strings.");
    if (seen.has(entrant)) throw new Error(`Duplicate entrant id: ${entrant}.`);
    seen.add(entrant);
  }
}

function groupId(index: number): string {
  let id = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    id = String.fromCharCode(65 + rem) + id;
    n = Math.floor((n - 1) / 26);
  }
  return id;
}

/**
 * Snake seeding: seeds fill groups A→Z, then Z→A, alternating
 * (A1, B1, C1, C2, B2, A2, A3, ...). Group ids are A, B, ..., Z, AA, AB, ...
 */
export function assignGroups(
  entrants: readonly string[],
  groupCount: number,
): Group[] {
  validateEntrants(entrants);
  if (!Number.isInteger(groupCount) || groupCount < 1)
    throw new Error("Group count must be a positive integer.");
  if (groupCount > entrants.length)
    throw new Error("Group count cannot exceed the number of entrants.");
  const groups: Group[] = Array.from({ length: groupCount }, (_, i) => ({
    id: groupId(i),
    entrants: [],
  }));
  entrants.forEach((entrant, i) => {
    const pass = Math.floor(i / groupCount);
    const pos = i % groupCount;
    const target = pass % 2 === 0 ? pos : groupCount - 1 - pos;
    groups[target]?.entrants.push(entrant);
  });
  return groups;
}

/**
 * Circle (Berger) method: seed 1 stays fixed while the others rotate.
 * An odd field gets a phantom slot; whoever meets it rests that round.
 * Even-numbered legs mirror the first leg with home/away swapped.
 */
export function generateFixtures(
  entrants: readonly string[],
  options: FixtureOptions = {},
): FixtureSchedule {
  validateEntrants(entrants);
  const legs = options.legs ?? 1;
  if (!Number.isInteger(legs) || legs < 1)
    throw new Error("Legs must be a positive integer.");
  const slots: (string | null)[] = [...entrants];
  if (slots.length % 2 === 1) slots.push(null);
  const size = slots.length;
  const roundCount = size - 1;
  const fixtures: Fixture[] = [];
  const rests: Rest[] = [];
  for (let leg = 1; leg <= legs; leg++) {
    const swap = leg % 2 === 0;
    let order = slots;
    for (let round = 1; round <= roundCount; round++) {
      let matchNo = 0;
      for (let i = 0; i < size / 2; i++) {
        const a = order[i] ?? null;
        const b = order[size - 1 - i] ?? null;
        if (a === null || b === null) {
          const resting = a ?? b;
          if (resting !== null) rests.push({ leg, round, entrant: resting });
          continue;
        }
        const firstHome = i === 0 ? round % 2 === 1 : true;
        const [home, away] = firstHome !== swap ? [a, b] : [b, a];
        matchNo++;
        fixtures.push({
          id: `L${leg}-R${round}-M${matchNo}`,
          leg,
          round,
          home,
          away,
        });
      }
      order = [
        order[0] ?? null,
        order[size - 1] ?? null,
        ...order.slice(1, -1),
      ];
    }
  }
  return { fixtures, rests };
}

type Stats = Omit<StandingRow, "rank" | "unresolvedTieWith">;

function validateConfig(config: StandingsConfig): {
  points: PointsConfig;
  tieBreaks: TieBreak[];
} {
  const points = config.points ?? DEFAULT_POINTS;
  for (const key of ["win", "draw", "loss"] as const) {
    const value = points[key];
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Points for a ${key} must be a non-negative number.`);
  }
  const tieBreaks = config.tieBreaks ?? DEFAULT_TIE_BREAKS;
  const seen = new Set<TieBreak>();
  for (const tieBreak of tieBreaks) {
    if (!TIE_BREAKS.includes(tieBreak))
      throw new Error(`Unknown tie-break: ${String(tieBreak)}.`);
    if (seen.has(tieBreak))
      throw new Error(`Duplicate tie-break: ${tieBreak}.`);
    seen.add(tieBreak);
  }
  return { points, tieBreaks: [...tieBreaks] };
}

type PlayedMatch = Fixture & { homeScore: number; awayScore: number };

function collectPlayed(
  entrants: readonly string[],
  fixtures: readonly Fixture[],
  results: readonly MatchResult[],
): PlayedMatch[] {
  const known = new Set(entrants);
  const byId = new Map<string, Fixture>();
  for (const fixture of fixtures) {
    if (byId.has(fixture.id))
      throw new Error(`Duplicate fixture id: ${fixture.id}.`);
    if (!known.has(fixture.home) || !known.has(fixture.away))
      throw new Error(`Fixture ${fixture.id} references an unknown entrant.`);
    if (fixture.home === fixture.away)
      throw new Error(`Fixture ${fixture.id} pairs an entrant with itself.`);
    byId.set(fixture.id, fixture);
  }
  const reported = new Set<string>();
  return results.map((result) => {
    const fixture = byId.get(result.matchId);
    if (!fixture) throw new Error(`Unknown match id: ${result.matchId}.`);
    if (reported.has(result.matchId))
      throw new Error(`Duplicate result for match ${result.matchId}.`);
    const scores = [result.homeScore, result.awayScore];
    if (!scores.every((score) => Number.isInteger(score) && score >= 0))
      throw new Error(
        `Scores for match ${result.matchId} must be non-negative integers.`,
      );
    reported.add(result.matchId);
    return {
      ...fixture,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
    };
  });
}

function tally(
  entrants: readonly string[],
  matches: readonly PlayedMatch[],
  points: PointsConfig,
): Map<string, Stats> {
  const stats = new Map<string, Stats>(
    entrants.map((entrant) => [
      entrant,
      {
        entrant,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gamesWon: 0,
        gamesLost: 0,
        gameDifference: 0,
        points: 0,
      },
    ]),
  );
  const record = (entrant: string, scored: number, conceded: number) => {
    const row = stats.get(entrant);
    if (!row) return;
    row.played++;
    row.gamesWon += scored;
    row.gamesLost += conceded;
    row.gameDifference += scored - conceded;
    if (scored > conceded) {
      row.wins++;
      row.points += points.win;
    } else if (scored === conceded) {
      row.draws++;
      row.points += points.draw;
    } else {
      row.losses++;
      row.points += points.loss;
    }
  };
  for (const match of matches) {
    record(match.home, match.homeScore, match.awayScore);
    record(match.away, match.awayScore, match.homeScore);
  }
  return stats;
}

type RankContext = {
  stats: Map<string, Stats>;
  matches: readonly PlayedMatch[];
  points: PointsConfig;
  tieBreaks: readonly TieBreak[];
  seed: Map<string, number>;
};

function tieBreakKeys(
  group: readonly string[],
  tieBreak: TieBreak,
  ctx: RankContext,
): Map<string, number> {
  if (tieBreak === "headToHead") {
    const members = new Set(group);
    const mini = tally(
      group,
      ctx.matches.filter((m) => members.has(m.home) && members.has(m.away)),
      ctx.points,
    );
    return new Map(group.map((e) => [e, mini.get(e)?.points ?? 0]));
  }
  return new Map(
    group.map((e) => [
      e,
      tieBreak === "gameDifference"
        ? (ctx.stats.get(e)?.gameDifference ?? 0)
        : (ctx.stats.get(e)?.gamesWon ?? 0),
    ]),
  );
}

function bucketByKey(
  group: readonly string[],
  keys: Map<string, number>,
  ctx: RankContext,
): string[][] {
  const sorted = [...group].sort(
    (a, b) =>
      (keys.get(b) ?? 0) - (keys.get(a) ?? 0) ||
      (ctx.seed.get(a) ?? 0) - (ctx.seed.get(b) ?? 0),
  );
  const buckets: string[][] = [];
  let previous: number | undefined;
  for (const entrant of sorted) {
    const key = keys.get(entrant) ?? 0;
    const last = buckets[buckets.length - 1];
    if (last && key === previous) last.push(entrant);
    else buckets.push([entrant]);
    previous = key;
  }
  return buckets;
}

type Ranked = { entrant: string; unresolvedTieWith: string[] };

function resolveTie(
  group: readonly string[],
  index: number,
  ctx: RankContext,
): Ranked[] {
  if (group.length === 1)
    return group.map((entrant) => ({ entrant, unresolvedTieWith: [] }));
  const tieBreak = ctx.tieBreaks[index];
  if (tieBreak === undefined) {
    const bySeed = [...group].sort(
      (a, b) => (ctx.seed.get(a) ?? 0) - (ctx.seed.get(b) ?? 0),
    );
    return bySeed.map((entrant) => ({
      entrant,
      unresolvedTieWith: bySeed.filter((other) => other !== entrant),
    }));
  }
  const buckets = bucketByKey(group, tieBreakKeys(group, tieBreak, ctx), ctx);
  if (buckets.length === 1) return resolveTie(group, index + 1, ctx);
  return buckets.flatMap((bucket) =>
    resolveTie(bucket, tieBreak === "headToHead" ? index : index + 1, ctx),
  );
}

/**
 * Ranks by points, then by the configured tie-breaks in order (default:
 * head-to-head, game difference, games won). Head-to-head is a mini-league
 * among exactly the tied entrants; when it only partially splits them it is
 * re-applied to each remaining tied subset before moving to the next
 * tie-break. Ties surviving every tie-break are ordered by seed and exposed
 * via `unresolvedTieWith`.
 */
export function computeStandings(
  entrants: readonly string[],
  fixtures: readonly Fixture[],
  results: readonly MatchResult[],
  config: StandingsConfig = {},
): StandingRow[] {
  validateEntrants(entrants);
  const { points, tieBreaks } = validateConfig(config);
  const matches = collectPlayed(entrants, fixtures, results);
  const stats = tally(entrants, matches, points);
  const ctx: RankContext = {
    stats,
    matches,
    points,
    tieBreaks,
    seed: new Map(entrants.map((e, i) => [e, i])),
  };
  const pointKeys = new Map(
    entrants.map((e) => [e, stats.get(e)?.points ?? 0]),
  );
  const ranked = bucketByKey(entrants, pointKeys, ctx).flatMap((bucket) =>
    resolveTie(bucket, 0, ctx),
  );
  return ranked.map(({ entrant, unresolvedTieWith }, i) => {
    const row = stats.get(entrant);
    if (!row) throw new Error(`Missing stats for entrant ${entrant}.`);
    return { rank: i + 1, ...row, unresolvedTieWith };
  });
}
