export type SwissPairing = { id: string; a: string; b: string | null };
export type SwissResult = { pairingId: string; winner: string | null };
export type SwissRound = { pairings: SwissPairing[]; results: SwissResult[] };

export type SwissConfig = {
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  byePoints: number;
};

export const DEFAULT_SWISS_CONFIG: Readonly<SwissConfig> = Object.freeze({
  winPoints: 1,
  drawPoints: 0.5,
  lossPoints: 0,
  byePoints: 1,
});

export type SwissStanding = {
  entrant: string;
  /** 1-based seed (index in the entrants list + 1). */
  seed: number;
  /** 1-based position in the standings; unique, ties ordered by seed. */
  rank: number;
  score: number;
  buchholz: number;
  sonnebornBerger: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  /** Opponents of reported games, in round order. */
  opponents: string[];
  /** Entrants tied on score, Buchholz and Sonneborn-Berger (seed decided). */
  unresolvedTieWith: string[];
};

export type SwissRoundPlan = { round: number; pairings: SwissPairing[] };

type Outcome = "win" | "draw" | "loss";
type EntrantRecord = {
  score: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  games: { opponent: string; outcome: Outcome }[];
};
type PlannedGame = { a: string; b: string | null; winner?: string | null };
const round9 = (value: number): number => Math.round(value * 1e9) / 1e9;

function validateEntrants(entrants: readonly string[]): Map<string, number> {
  const seeds = new Map<string, number>();
  entrants.forEach((id, index) => {
    if (typeof id !== "string" || id.trim() === "")
      throw new Error(`Entrant at seed ${index + 1} has an empty id.`);
    if (seeds.has(id)) throw new Error(`Duplicate entrant id "${id}".`);
    seeds.set(id, index);
  });
  return seeds;
}

function resolveConfig(config: Partial<SwissConfig> = {}): SwissConfig {
  const resolved = { ...DEFAULT_SWISS_CONFIG, ...config };
  for (const [key, value] of Object.entries(resolved))
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Swiss config "${key}" must be a non-negative number.`);
  return resolved;
}

function validateRounds(
  seeds: ReadonlyMap<string, number>,
  rounds: readonly SwissRound[],
): PlannedGame[][] {
  const pairingIds = new Set<string>();
  return rounds.map((round, roundIndex) => {
    const label = `Round ${roundIndex + 1}`;
    const seen = new Set<string>();
    const games = new Map<string, PlannedGame>();
    const claim = (entrant: string, pairingId: string) => {
      if (!seeds.has(entrant))
        throw new Error(
          `${label}: pairing "${pairingId}" references unknown entrant "${entrant}".`,
        );
      if (seen.has(entrant))
        throw new Error(`${label}: entrant "${entrant}" is paired twice.`);
      seen.add(entrant);
    };
    for (const pairing of round.pairings) {
      if (pairing.id.trim() === "")
        throw new Error(`${label}: a pairing has an empty id.`);
      if (pairingIds.has(pairing.id))
        throw new Error(`Duplicate pairing id "${pairing.id}".`);
      pairingIds.add(pairing.id);
      if (pairing.a === pairing.b)
        throw new Error(
          `${label}: pairing "${pairing.id}" pairs "${pairing.a}" with itself.`,
        );
      claim(pairing.a, pairing.id);
      if (pairing.b !== null) claim(pairing.b, pairing.id);
      games.set(pairing.id, { a: pairing.a, b: pairing.b });
    }
    for (const result of round.results) {
      const game = games.get(result.pairingId);
      if (!game)
        throw new Error(
          `${label}: result for unknown pairing "${result.pairingId}".`,
        );
      if (game.winner !== undefined)
        throw new Error(
          `${label}: pairing "${result.pairingId}" has more than one result.`,
        );
      if (game.b === null && result.winner !== game.a)
        throw new Error(
          `${label}: bye pairing "${result.pairingId}" can only be won by "${game.a}".`,
        );
      if (
        result.winner !== null &&
        result.winner !== game.a &&
        result.winner !== game.b
      )
        throw new Error(
          `${label}: winner "${result.winner}" is not part of pairing "${result.pairingId}".`,
        );
      game.winner = result.winner;
    }
    return [...games.values()];
  });
}

function buildRecords(
  entrants: readonly string[],
  rounds: readonly PlannedGame[][],
  config: SwissConfig,
): Map<string, EntrantRecord> {
  const records = new Map<string, EntrantRecord>(
    entrants.map((id) => [
      id,
      { score: 0, wins: 0, draws: 0, losses: 0, byes: 0, games: [] },
    ]),
  );
  const record = (id: string) => records.get(id)!;
  const apply = (id: string, opponent: string, outcome: Outcome) => {
    const entry = record(id);
    entry.games.push({ opponent, outcome });
    if (outcome === "win") {
      entry.wins += 1;
      entry.score += config.winPoints;
    } else if (outcome === "draw") {
      entry.draws += 1;
      entry.score += config.drawPoints;
    } else {
      entry.losses += 1;
      entry.score += config.lossPoints;
    }
  };
  for (const round of rounds)
    for (const game of round) {
      if (game.b === null) {
        record(game.a).byes += 1;
        record(game.a).score += config.byePoints;
      } else if (game.winner === null) {
        apply(game.a, game.b, "draw");
        apply(game.b, game.a, "draw");
      } else if (game.winner !== undefined) {
        const loser = game.winner === game.a ? game.b : game.a;
        apply(game.winner, loser, "win");
        apply(loser, game.winner, "loss");
      }
    }
  return records;
}

/**
 * Standings recomputed from every reported result.
 *
 * Order: score → Buchholz → Sonneborn-Berger → seed.
 * - Buchholz: sum of the current scores of every opponent met in a reported
 *   game. A bye is a virtual opponent worth 0.
 * - Sonneborn-Berger: sum of the scores of beaten opponents plus half the
 *   scores of drawn opponents. A bye contributes 0.
 * Entrants still equal after Sonneborn-Berger are ordered by seed and listed
 * in each other's `unresolvedTieWith`. Unreported games score nothing.
 */
export function computeSwissStandings(
  entrants: readonly string[],
  previousRounds: readonly SwissRound[],
  config?: Partial<SwissConfig>,
): SwissStanding[] {
  const seeds = validateEntrants(entrants);
  const resolved = resolveConfig(config);
  const records = buildRecords(
    entrants,
    validateRounds(seeds, previousRounds),
    resolved,
  );
  const standings = entrants.map((entrant, index): SwissStanding => {
    const entry = records.get(entrant)!;
    let buchholz = 0;
    let sonnebornBerger = 0;
    for (const game of entry.games) {
      const opponentScore = records.get(game.opponent)!.score;
      buchholz += opponentScore;
      if (game.outcome === "win") sonnebornBerger += opponentScore;
      if (game.outcome === "draw") sonnebornBerger += opponentScore / 2;
    }
    return {
      entrant,
      seed: index + 1,
      rank: 0,
      score: round9(entry.score),
      buchholz: round9(buchholz),
      sonnebornBerger: round9(sonnebornBerger),
      wins: entry.wins,
      draws: entry.draws,
      losses: entry.losses,
      byes: entry.byes,
      opponents: entry.games.map((game) => game.opponent),
      unresolvedTieWith: [],
    };
  });
  standings.sort(
    (x, y) =>
      y.score - x.score ||
      y.buchholz - x.buchholz ||
      y.sonnebornBerger - x.sonnebornBerger ||
      x.seed - y.seed,
  );
  return standings.map((standing, index) => ({
    ...standing,
    rank: index + 1,
    unresolvedTieWith: standings
      .filter(
        (other) =>
          other !== standing &&
          other.score === standing.score &&
          other.buchholz === standing.buchholz &&
          other.sonnebornBerger === standing.sonnebornBerger,
      )
      .map((other) => other.entrant),
  }));
}

const pairKey = (a: string, b: string): string =>
  JSON.stringify(a < b ? [a, b] : [b, a]);

type WeightedEdge = readonly [number, number, number];

/**
 * Maximum-weight matching among maximum-cardinality matchings on a general
 * graph (Edmonds' blossom algorithm with dual variables, O(V^3)), after
 * J. van Rantwijk's reference implementation. Weights must be non-negative
 * even integers so every dual update stays an exact integer. Returns each
 * vertex's mate, or -1.
 */
function maxCardinalityMatching(
  vertexCount: number,
  edges: readonly WeightedEdge[],
): number[] {
  const n = vertexCount;
  const mate = new Int32Array(n).fill(-1);
  const endpoint = new Int32Array(2 * edges.length);
  const neighbend: number[][] = Array.from({ length: n }, () => []);
  let maxWeight = 0;
  edges.forEach(([i, j, weight], k) => {
    endpoint[2 * k] = i;
    endpoint[2 * k + 1] = j;
    neighbend[i]!.push(2 * k + 1);
    neighbend[j]!.push(2 * k);
    maxWeight = Math.max(maxWeight, weight);
  });
  const label = new Int32Array(2 * n);
  const labelend = new Int32Array(2 * n).fill(-1);
  const inblossom = Int32Array.from({ length: n }, (_, i) => i);
  const blossomparent = new Int32Array(2 * n).fill(-1);
  const blossomchilds: (number[] | null)[] = Array(2 * n).fill(null);
  const blossombase = Int32Array.from({ length: 2 * n }, (_, i) =>
    i < n ? i : -1,
  );
  const blossomendps: (number[] | null)[] = Array(2 * n).fill(null);
  const bestedge = new Int32Array(2 * n).fill(-1);
  const blossombestedges: (number[] | null)[] = Array(2 * n).fill(null);
  const unusedblossoms = Array.from({ length: n }, (_, i) => n + i);
  const dualvar = Float64Array.from({ length: 2 * n }, (_, i) =>
    i < n ? maxWeight : 0,
  );
  const allowedge = new Uint8Array(edges.length);
  let queue: number[] = [];

  const slack = (k: number) => {
    const [i, j, weight] = edges[k]!;
    return dualvar[i]! + dualvar[j]! - 2 * weight;
  };
  const cyclic = (list: readonly number[], index: number) =>
    list[((index % list.length) + list.length) % list.length]!;
  const blossomLeaves = (b: number, out: number[] = []): number[] => {
    if (b < n) out.push(b);
    else for (const child of blossomchilds[b]!) blossomLeaves(child, out);
    return out;
  };

  const assignLabel = (w: number, t: number, p: number): void => {
    const b = inblossom[w]!;
    label[w] = label[b] = t;
    labelend[w] = labelend[b] = p;
    bestedge[w] = bestedge[b] = -1;
    if (t === 1) {
      queue.push(...blossomLeaves(b));
      return;
    }
    const baseMate = mate[blossombase[b]!]!;
    assignLabel(endpoint[baseMate]!, 1, baseMate ^ 1);
  };

  const scanBlossom = (start: number, other: number): number => {
    const path: number[] = [];
    let base = -1;
    let v = start;
    let w = other;
    while (v !== -1 || w !== -1) {
      let b = inblossom[v]!;
      if (label[b]! & 4) {
        base = blossombase[b]!;
        break;
      }
      path.push(b);
      label[b] = 5;
      if (labelend[b] === -1) v = -1;
      else {
        v = endpoint[labelend[b]!]!;
        b = inblossom[v]!;
        v = endpoint[labelend[b]!]!;
      }
      if (w !== -1) [v, w] = [w, v];
    }
    for (const b of path) label[b] = 1;
    return base;
  };

  const addBlossom = (base: number, k: number): void => {
    let [v, w] = edges[k]!;
    const bb = inblossom[base]!;
    let bv = inblossom[v]!;
    let bw = inblossom[w]!;
    const b = unusedblossoms.pop()!;
    blossombase[b] = base;
    blossomparent[b] = -1;
    blossomparent[bb] = b;
    const path: number[] = [];
    const endps: number[] = [];
    while (bv !== bb) {
      blossomparent[bv] = b;
      path.push(bv);
      endps.push(labelend[bv]!);
      v = endpoint[labelend[bv]!]!;
      bv = inblossom[v]!;
    }
    path.push(bb);
    path.reverse();
    endps.reverse();
    endps.push(2 * k);
    while (bw !== bb) {
      blossomparent[bw] = b;
      path.push(bw);
      endps.push(labelend[bw]! ^ 1);
      w = endpoint[labelend[bw]!]!;
      bw = inblossom[w]!;
    }
    blossomchilds[b] = path;
    blossomendps[b] = endps;
    label[b] = 1;
    labelend[b] = labelend[bb]!;
    dualvar[b] = 0;
    for (const leaf of blossomLeaves(b)) {
      if (label[inblossom[leaf]!] === 2) queue.push(leaf);
      inblossom[leaf] = b;
    }
    const bestedgeto = new Int32Array(2 * n).fill(-1);
    for (const child of path) {
      const lists = blossombestedges[child]
        ? [blossombestedges[child]]
        : blossomLeaves(child).map((leaf) =>
            neighbend[leaf]!.map((p) => p >> 1),
          );
      for (const list of lists)
        for (const edge of list) {
          const [i, j] = edges[edge]!;
          const bj = inblossom[inblossom[j] === b ? i : j]!;
          if (
            bj !== b &&
            label[bj] === 1 &&
            (bestedgeto[bj] === -1 || slack(edge) < slack(bestedgeto[bj]!))
          )
            bestedgeto[bj] = edge;
        }
      blossombestedges[child] = null;
      bestedge[child] = -1;
    }
    const best = Array.from(bestedgeto).filter((edge) => edge !== -1);
    blossombestedges[b] = best;
    bestedge[b] = -1;
    for (const edge of best)
      if (bestedge[b] === -1 || slack(edge) < slack(bestedge[b]!))
        bestedge[b] = edge;
  };

  const expandBlossom = (b: number, endstage: boolean): void => {
    const childs = blossomchilds[b]!;
    const endps = blossomendps[b]!;
    for (const s of childs) {
      blossomparent[s] = -1;
      if (s < n) inblossom[s] = s;
      else if (endstage && dualvar[s] === 0) expandBlossom(s, endstage);
      else for (const leaf of blossomLeaves(s)) inblossom[leaf] = s;
    }
    if (!endstage && label[b] === 2) {
      const entrychild = inblossom[endpoint[labelend[b]! ^ 1]!]!;
      let j = childs.indexOf(entrychild);
      let jstep = -1;
      let endptrick = 1;
      if (j & 1) {
        j -= childs.length;
        jstep = 1;
        endptrick = 0;
      }
      let p = labelend[b]!;
      while (j !== 0) {
        label[endpoint[p ^ 1]!] = 0;
        label[endpoint[cyclic(endps, j - endptrick) ^ endptrick ^ 1]!] = 0;
        assignLabel(endpoint[p ^ 1]!, 2, p);
        allowedge[cyclic(endps, j - endptrick) >> 1] = 1;
        j += jstep;
        p = cyclic(endps, j - endptrick) ^ endptrick;
        allowedge[p >> 1] = 1;
        j += jstep;
      }
      let bv = cyclic(childs, j);
      label[endpoint[p ^ 1]!] = label[bv] = 2;
      labelend[endpoint[p ^ 1]!] = labelend[bv] = p;
      bestedge[bv] = -1;
      j += jstep;
      while (cyclic(childs, j) !== entrychild) {
        bv = cyclic(childs, j);
        j += jstep;
        if (label[bv] === 1) continue;
        const labelled = blossomLeaves(bv).find((leaf) => label[leaf] !== 0);
        if (labelled === undefined) continue;
        label[labelled] = 0;
        label[endpoint[mate[blossombase[bv]!]!]!] = 0;
        assignLabel(labelled, 2, labelend[labelled]!);
      }
    }
    label[b] = labelend[b] = -1;
    blossomchilds[b] = blossomendps[b] = blossombestedges[b] = null;
    blossombase[b] = -1;
    bestedge[b] = -1;
    unusedblossoms.push(b);
  };

  const augmentBlossom = (b: number, v: number): void => {
    let t = v;
    while (blossomparent[t] !== b) t = blossomparent[t]!;
    if (t >= n) augmentBlossom(t, v);
    const childs = blossomchilds[b]!;
    const endps = blossomendps[b]!;
    const i = childs.indexOf(t);
    let j = i;
    let jstep = -1;
    let endptrick = 1;
    if (i & 1) {
      j -= childs.length;
      jstep = 1;
      endptrick = 0;
    }
    while (j !== 0) {
      j += jstep;
      t = cyclic(childs, j);
      const p = cyclic(endps, j - endptrick) ^ endptrick;
      if (t >= n) augmentBlossom(t, endpoint[p]!);
      j += jstep;
      t = cyclic(childs, j);
      if (t >= n) augmentBlossom(t, endpoint[p ^ 1]!);
      mate[endpoint[p]!] = p ^ 1;
      mate[endpoint[p ^ 1]!] = p;
    }
    blossomchilds[b] = [...childs.slice(i), ...childs.slice(0, i)];
    blossomendps[b] = [...endps.slice(i), ...endps.slice(0, i)];
    blossombase[b] = blossombase[childs[i]!]!;
  };

  const augmentMatching = (k: number): void => {
    const [v, w] = edges[k]!;
    for (let [s, p] of [
      [v, 2 * k + 1],
      [w, 2 * k],
    ] as [number, number][]) {
      for (;;) {
        const bs = inblossom[s]!;
        if (bs >= n) augmentBlossom(bs, s);
        mate[s] = p;
        if (labelend[bs] === -1) break;
        const bt = inblossom[endpoint[labelend[bs]!]!]!;
        s = endpoint[labelend[bt]!]!;
        const j = endpoint[labelend[bt]! ^ 1]!;
        if (bt >= n) augmentBlossom(bt, j);
        mate[j] = labelend[bt]!;
        p = labelend[bt]! ^ 1;
      }
    }
  };

  for (let stage = 0; stage < n; stage += 1) {
    label.fill(0);
    bestedge.fill(-1);
    blossombestedges.fill(null, n);
    allowedge.fill(0);
    queue = [];
    for (let v = 0; v < n; v += 1)
      if (mate[v] === -1 && label[inblossom[v]!] === 0) assignLabel(v, 1, -1);
    let augmented = false;
    for (;;) {
      while (queue.length > 0 && !augmented) {
        const v = queue.pop()!;
        for (const p of neighbend[v]!) {
          const k = p >> 1;
          const w = endpoint[p]!;
          if (inblossom[v] === inblossom[w]) continue;
          let kslack = 0;
          if (!allowedge[k]) {
            kslack = slack(k);
            if (kslack <= 0) allowedge[k] = 1;
          }
          if (allowedge[k]) {
            if (label[inblossom[w]!] === 0) assignLabel(w, 2, p ^ 1);
            else if (label[inblossom[w]!] === 1) {
              const base = scanBlossom(v, w);
              if (base >= 0) addBlossom(base, k);
              else {
                augmentMatching(k);
                augmented = true;
                break;
              }
            } else if (label[w] === 0) {
              label[w] = 2;
              labelend[w] = p ^ 1;
            }
          } else if (label[inblossom[w]!] === 1) {
            const b = inblossom[v]!;
            if (bestedge[b] === -1 || kslack < slack(bestedge[b]!))
              bestedge[b] = k;
          } else if (label[w] === 0) {
            if (bestedge[w] === -1 || kslack < slack(bestedge[w]!))
              bestedge[w] = k;
          }
        }
      }
      if (augmented) break;
      let deltatype = -1;
      let delta = 0;
      let deltaedge = -1;
      let deltablossom = -1;
      for (let v = 0; v < n; v += 1)
        if (label[inblossom[v]!] === 0 && bestedge[v] !== -1) {
          const d = slack(bestedge[v]!);
          if (deltatype === -1 || d < delta) {
            delta = d;
            deltatype = 2;
            deltaedge = bestedge[v]!;
          }
        }
      for (let b = 0; b < 2 * n; b += 1)
        if (blossomparent[b] === -1 && label[b] === 1 && bestedge[b] !== -1) {
          const d = slack(bestedge[b]!) / 2;
          if (deltatype === -1 || d < delta) {
            delta = d;
            deltatype = 3;
            deltaedge = bestedge[b]!;
          }
        }
      for (let b = n; b < 2 * n; b += 1)
        if (
          blossombase[b]! >= 0 &&
          blossomparent[b] === -1 &&
          label[b] === 2 &&
          (deltatype === -1 || dualvar[b]! < delta)
        ) {
          delta = dualvar[b]!;
          deltatype = 4;
          deltablossom = b;
        }
      if (deltatype === -1) {
        deltatype = 1;
        delta = Math.max(0, Math.min(...dualvar.subarray(0, n)));
      }
      for (let v = 0; v < n; v += 1) {
        const vertexLabel = label[inblossom[v]!];
        if (vertexLabel === 1) dualvar[v] = dualvar[v]! - delta;
        else if (vertexLabel === 2) dualvar[v] = dualvar[v]! + delta;
      }
      for (let b = n; b < 2 * n; b += 1)
        if (blossombase[b]! >= 0 && blossomparent[b] === -1) {
          if (label[b] === 1) dualvar[b] = dualvar[b]! + delta;
          else if (label[b] === 2) dualvar[b] = dualvar[b]! - delta;
        }
      if (deltatype === 1) break;
      if (deltatype === 4) expandBlossom(deltablossom, false);
      else {
        allowedge[deltaedge] = 1;
        const [i, j] = edges[deltaedge]!;
        queue.push(deltatype === 2 && label[inblossom[i]!] === 0 ? j : i);
      }
    }
    if (!augmented) break;
    for (let b = n; b < 2 * n; b += 1)
      if (
        blossomparent[b] === -1 &&
        blossombase[b]! >= 0 &&
        label[b] === 1 &&
        dualvar[b] === 0
      )
        expandBlossom(b, true);
  }
  return Array.from(mate, (p) => (p >= 0 ? endpoint[p]! : -1));
}

type RankedEntrant = { id: string; score: number; canTakeBye: boolean };
type RoundSolution = { pairs: [number, number][]; bye: number | null };

/** Smallest usual multiplier turning every score into an integer. */
function scoreScale(scores: readonly number[]): number {
  for (const scale of [1, 2, 4, 5, 10, 20, 100, 1000])
    if (scores.every((s) => Math.abs(s * scale - Math.round(s * scale)) < 1e-6))
      return scale;
  return 10000;
}

/**
 * Minimum-cost perfect matching over pairs that have not met, as
 * lexicographic tiers folded into one integer cost:
 * 1. bye: rank of the bye taker among bye-eligible entrants, lowest first;
 * 2. sum of squared score differences;
 * 3. preference: inside a score group, the mirror of top half against bottom
 *    half (|distance - floor(size / 2)|); across groups, the lowest entrant
 *    of the upper group floats and meets the top of the lower group.
 * Returns null when no rematch-free perfect matching exists.
 */
function solveRound(
  ranked: readonly RankedEntrant[],
  played: ReadonlySet<string>,
): RoundSolution | null {
  const count = ranked.length;
  const scale = scoreScale(ranked.map((entrant) => entrant.score));
  const level = ranked.map((entrant) => Math.round(entrant.score * scale));
  const groupStart = new Map<number, number>();
  const groupSize = new Map<number, number>();
  level.forEach((value, index) => {
    if (!groupStart.has(value)) groupStart.set(value, index);
    groupSize.set(value, (groupSize.get(value) ?? 0) + 1);
  });
  const position = (index: number) => index - groupStart.get(level[index]!)!;
  const preference = (upper: number, lower: number) => {
    const size = groupSize.get(level[upper]!)!;
    if (level[upper] === level[lower])
      return Math.abs(lower - upper - Math.floor(size / 2));
    return (size - 1 - position(upper)) * count + position(lower);
  };
  const preferenceSpan = Math.ceil(count / 2) * (count * count + count) + 1;
  const costs: WeightedEdge[] = [];
  for (let upper = 0; upper < count; upper += 1)
    for (let lower = upper + 1; lower < count; lower += 1)
      if (!played.has(pairKey(ranked[upper]!.id, ranked[lower]!.id)))
        costs.push([
          upper,
          lower,
          (level[upper]! - level[lower]!) ** 2 * preferenceSpan +
            preference(upper, lower),
        ]);
  const highestCost = () => costs.reduce((max, [, , c]) => Math.max(max, c), 0);
  const virtual = count % 2 === 1 ? count : -1;
  if (virtual !== -1) {
    const gameSpan = Math.ceil(count / 2) * highestCost() + 1;
    let tier = 0;
    for (let index = count - 1; index >= 0; index -= 1)
      if (ranked[index]!.canTakeBye) {
        costs.push([index, virtual, tier * gameSpan]);
        tier += 1;
      }
  }
  const ceiling = highestCost() + 1;
  if (2 * ceiling > 2 ** 51)
    throw new Error("Too many entrants or score levels to pair exactly.");
  const mate = maxCardinalityMatching(
    count + (virtual === -1 ? 0 : 1),
    costs.map(([u, v, c]) => [u, v, 2 * (ceiling - c)] as const),
  );
  if (mate.some((partner) => partner === -1)) return null;
  const pairs: [number, number][] = [];
  for (let index = 0; index < count; index += 1) {
    const partner = mate[index]!;
    if (partner > index && partner !== virtual) pairs.push([index, partner]);
  }
  return { pairs, bye: virtual === -1 ? null : mate[virtual]! };
}

/**
 * Pairs the next round from the full history; every earlier pairing must be
 * reported. Entrants are ranked by `computeSwissStandings` (round 1: by
 * seed), then a minimum-cost perfect matching (blossom algorithm, O(n^3))
 * over pairs that have not met picks, in strict priority:
 * 1. with an odd count, the bye for the lowest-ranked entrant without a
 *    previous bye that still leaves a rematch-free pairing;
 * 2. the smallest sum of squared score differences;
 * 3. top half against bottom half inside each score group (round 1 of 8:
 *    1v5, 2v6, 3v7, 4v8); a group's odd entrant (its lowest) floats down and
 *    meets the top of the next group.
 * Throws when no rematch-free pairing exists, naming the one-bye rule when it
 * is the blocker. Ids: `R<round>-<table>`, `R<round>-BYE`.
 */
export function pairNextRound(
  entrants: readonly string[],
  previousRounds: readonly SwissRound[],
  config?: Partial<SwissConfig>,
): SwissRoundPlan {
  const standings = computeSwissStandings(entrants, previousRounds, config);
  const round = previousRounds.length + 1;
  if (entrants.length < 2)
    throw new Error("Swiss pairing needs at least 2 entrants.");
  const played = new Set<string>();
  previousRounds.forEach((previous, roundIndex) => {
    const reported = new Set(previous.results.map((r) => r.pairingId));
    for (const pairing of previous.pairings) {
      if (pairing.b === null) continue;
      if (!reported.has(pairing.id))
        throw new Error(
          `Round ${roundIndex + 1}: pairing "${pairing.id}" has no result yet.`,
        );
      played.add(pairKey(pairing.a, pairing.b));
    }
  });
  const ranked: RankedEntrant[] = standings.map((standing) => ({
    id: standing.entrant,
    score: standing.score,
    canTakeBye: standing.byes === 0,
  }));
  const oneByeRule = new Error(
    `Round ${round} needs a bye, but every entrant whose bye would leave a rematch-free pairing has already received one (one bye per entrant).`,
  );
  const odd = ranked.length % 2 === 1;
  if (odd && !ranked.some((entrant) => entrant.canTakeBye)) throw oneByeRule;
  const solution = solveRound(ranked, played);
  if (!solution) {
    const anyBye = ranked.map((entrant) => ({ ...entrant, canTakeBye: true }));
    if (odd && solveRound(anyBye, played)) throw oneByeRule;
    throw new Error(
      `Round ${round} cannot be paired without a rematch: every remaining pairing repeats an earlier game.`,
    );
  }
  return {
    round,
    pairings: [
      ...solution.pairs.map(([a, b], table) => ({
        id: `R${round}-${table + 1}`,
        a: ranked[a]!.id,
        b: ranked[b]!.id,
      })),
      ...(solution.bye === null
        ? []
        : [{ id: `R${round}-BYE`, a: ranked[solution.bye]!.id, b: null }]),
    ],
  };
}
