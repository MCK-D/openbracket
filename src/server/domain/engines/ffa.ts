export type FfaPlacement = { entrant: string; place: number };

export type FfaMatchResult = {
  matchId: string;
  entrants: string[];
  placements: FfaPlacement[];
};

export type FfaTieRule = "average" | "best";

export type FfaScoringConfig = {
  placementPoints: number[];
  defaultPoints?: number;
  tieRule: FfaTieRule;
};

export type FfaMatchScore = { entrant: string; place: number; points: number };

export type FfaStanding = {
  entrant: string;
  seed: number;
  rank: number;
  totalPoints: number;
  matchesPlayed: number;
  firstPlaces: number;
  bestPlacement: number | null;
  averagePlacement: number | null;
  unresolvedTieWith: string[];
};

/** Points are handled as exact fractions of millionths so tie splits never drift. */
const POINT_UNITS = 1_000_000;

type Fraction = { num: bigint; den: bigint };

function gcd(a: bigint, b: bigint): bigint {
  let [x, y] = [a < 0n ? -a : a, b];
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

function addFractions(a: Fraction, b: Fraction): Fraction {
  const num = a.num * b.den + b.num * a.den;
  const den = a.den * b.den;
  const divisor = gcd(num, den);
  return { num: num / divisor, den: den / divisor };
}

function compareFractions(a: Fraction, b: Fraction): number {
  const diff = a.num * b.den - b.num * a.den;
  return diff === 0n ? 0 : diff > 0n ? 1 : -1;
}

function fractionToPoints(value: Fraction): number {
  return Math.round(Number(value.num) / Number(value.den)) / POINT_UNITS;
}

function assertEntrantIds(ids: string[], context: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || id.trim() === "")
      throw new Error(`${context}: entrant ids must be non-empty strings.`);
    if (seen.has(id)) throw new Error(`${context}: duplicate entrant "${id}".`);
    seen.add(id);
  }
}

/**
 * Checks that every match participant is placed exactly once and that places
 * follow standard competition ranking: an entrant's place is 1 + the number of
 * entrants strictly ahead of it, so ties share a place and skip the next ones
 * (1,2,2,4 and 1,1,3 are valid; 1,2,2,3 is not).
 */
export function validatePlacements(result: FfaMatchResult): void {
  if (typeof result.matchId !== "string" || result.matchId.trim() === "")
    throw new Error("Match id must be a non-empty string.");
  const context = `Match "${result.matchId}"`;
  if (result.entrants.length === 0)
    throw new Error(`${context}: at least one entrant must play.`);
  assertEntrantIds(result.entrants, context);

  const participants = new Set(result.entrants);
  const placed = new Set<string>();
  for (const { entrant, place } of result.placements) {
    if (!participants.has(entrant))
      throw new Error(`${context}: "${entrant}" is placed but did not play.`);
    if (placed.has(entrant))
      throw new Error(`${context}: "${entrant}" is placed more than once.`);
    if (!Number.isInteger(place) || place < 1)
      throw new Error(
        `${context}: place of "${entrant}" must be an integer >= 1 (got ${place}).`,
      );
    placed.add(entrant);
  }
  const missing = result.entrants.filter((entrant) => !placed.has(entrant));
  if (missing.length > 0)
    throw new Error(`${context}: missing placement for ${missing.join(", ")}.`);

  for (const { entrant, place } of result.placements) {
    const ahead = result.placements.filter((p) => p.place < place).length;
    if (place !== ahead + 1)
      throw new Error(
        `${context}: place ${place} of "${entrant}" breaks standard competition ranking; with ${ahead} entrant(s) ahead it must be ${ahead + 1}.`,
      );
  }
}

function validateConfig(config: FfaScoringConfig): void {
  const { placementPoints, tieRule } = config;
  const defaultPoints = config.defaultPoints ?? 0;
  if (tieRule !== "average" && tieRule !== "best")
    throw new Error(`Unknown tie rule "${String(tieRule)}".`);
  if (placementPoints.length === 0)
    throw new Error("placementPoints must contain at least one value.");
  const values = [...placementPoints, defaultPoints];
  values.forEach((value, index) => {
    if (!Number.isFinite(value) || value < 0)
      throw new Error(
        `Placement points must be non-negative finite numbers (got ${value}).`,
      );
    const units = Math.round(value * POINT_UNITS);
    if (!Number.isSafeInteger(units) || units / POINT_UNITS !== value)
      throw new Error(
        `Placement points must have at most 6 decimal places (got ${value}).`,
      );
    const previous = values[index - 1];
    if (previous !== undefined && value > previous)
      throw new Error(
        index === placementPoints.length
          ? `defaultPoints (${value}) must not exceed the points of the last listed place (${previous}).`
          : `placementPoints must be non-increasing: place ${index + 1} (${value}) exceeds place ${index} (${previous}).`,
      );
  });
}

function unitsForPosition(config: FfaScoringConfig, position: number) {
  const value =
    config.placementPoints[position - 1] ?? config.defaultPoints ?? 0;
  return BigInt(Math.round(value * POINT_UNITS));
}

function shareForPlace(
  config: FfaScoringConfig,
  place: number,
  tiedCount: number,
): Fraction {
  if (config.tieRule === "best")
    return { num: unitsForPosition(config, place), den: 1n };
  let sum = 0n;
  for (let position = place; position < place + tiedCount; position++)
    sum += unitsForPosition(config, position);
  return { num: sum, den: BigInt(tiedCount) };
}

function scoreMatchExact(result: FfaMatchResult, config: FfaScoringConfig) {
  validatePlacements(result);
  const order = new Map(result.entrants.map((id, index) => [id, index]));
  const tiedCount = new Map<number, number>();
  for (const { place } of result.placements)
    tiedCount.set(place, (tiedCount.get(place) ?? 0) + 1);
  return result.placements
    .map(({ entrant, place }) => ({
      entrant,
      place,
      share: shareForPlace(config, place, tiedCount.get(place) ?? 1),
    }))
    .sort(
      (a, b) =>
        a.place - b.place ||
        (order.get(a.entrant) ?? 0) - (order.get(b.entrant) ?? 0),
    );
}

/**
 * Scores one match. Tied entrants either split the points of every position
 * their tie spans ("average": a 2-way tie at 2nd gets (p2 + p3) / 2 each) or
 * all receive the points of the shared place ("best"). Places beyond the table
 * earn `defaultPoints` (0 when omitted). Points are rounded to 1e-6 for
 * display; standings aggregate the exact values. Output is ordered by place,
 * then by the match's entrant order.
 */
export function scoreMatch(
  result: FfaMatchResult,
  config: FfaScoringConfig,
): FfaMatchScore[] {
  validateConfig(config);
  return scoreMatchExact(result, config).map(({ entrant, place, share }) => ({
    entrant,
    place,
    points: fractionToPoints(share),
  }));
}

type Tally = {
  entrant: string;
  seed: number;
  points: Fraction;
  matches: number;
  firstPlaces: number;
  bestPlacement: number;
  placementSum: number;
};

function compareTallies(a: Tally, b: Tally): number {
  return (
    compareFractions(b.points, a.points) ||
    b.firstPlaces - a.firstPlaces ||
    a.bestPlacement - b.bestPlacement ||
    compareAveragePlacement(a, b)
  );
}

function compareAveragePlacement(a: Tally, b: Tally): number {
  if (a.matches === 0 || b.matches === 0) return b.matches - a.matches;
  return a.placementSum * b.matches - b.placementSum * a.matches;
}

/**
 * Aggregates FFA results into standings. Tie-break order: total points,
 * number of first places, best single placement, average placement, then
 * seed. Entrants still level before the seed step are listed in each other's
 * `unresolvedTieWith`. Match ids must be unique: a correction is a new full
 * result list, so repeated calls with the same input are idempotent.
 */
export function computeFfaStandings(
  entrants: string[],
  results: FfaMatchResult[],
  config: FfaScoringConfig,
): FfaStanding[] {
  if (entrants.length === 0)
    throw new Error("At least one entrant is required.");
  assertEntrantIds(entrants, "Entrants");
  validateConfig(config);

  const tallies = new Map<string, Tally>(
    entrants.map((entrant, index) => [
      entrant,
      {
        entrant,
        seed: index + 1,
        points: { num: 0n, den: 1n },
        matches: 0,
        firstPlaces: 0,
        bestPlacement: Number.POSITIVE_INFINITY,
        placementSum: 0,
      },
    ]),
  );

  const matchIds = new Set<string>();
  for (const result of results) {
    if (matchIds.has(result.matchId))
      throw new Error(`Duplicate match id "${result.matchId}".`);
    matchIds.add(result.matchId);
    for (const entrant of result.entrants)
      if (!tallies.has(entrant))
        throw new Error(
          `Match "${result.matchId}": "${entrant}" is not a tournament entrant.`,
        );
    for (const score of scoreMatchExact(result, config)) {
      const tally = tallies.get(score.entrant);
      if (!tally) continue;
      tally.points = addFractions(tally.points, score.share);
      tally.matches += 1;
      tally.placementSum += score.place;
      if (score.place === 1) tally.firstPlaces += 1;
      tally.bestPlacement = Math.min(tally.bestPlacement, score.place);
    }
  }

  const ordered = [...tallies.values()].sort(
    (a, b) => compareTallies(a, b) || a.seed - b.seed,
  );

  return ordered.map((tally, index) => ({
    entrant: tally.entrant,
    seed: tally.seed,
    rank: index + 1,
    totalPoints: fractionToPoints(tally.points),
    matchesPlayed: tally.matches,
    firstPlaces: tally.firstPlaces,
    bestPlacement: tally.matches === 0 ? null : tally.bestPlacement,
    averagePlacement:
      tally.matches === 0 ? null : tally.placementSum / tally.matches,
    unresolvedTieWith: ordered
      .filter(
        (other) =>
          other.entrant !== tally.entrant && compareTallies(tally, other) === 0,
      )
      .map((other) => other.entrant),
  }));
}
