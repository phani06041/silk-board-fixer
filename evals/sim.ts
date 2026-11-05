// Silk Board junction simulator. Deterministic: same scenario + same plan → same numbers, every time.
// No dependencies, so the same file runs in the scorer (Node) and in the replay web page (browser).
//
// The junction: 4 approaches, served one at a time in a fixed order N → E → S → W (split phasing,
// which is how Silk Board's signals actually run). Left turns are free (they don't need the signal).
// Every second: vehicles arrive (seeded random, identical for every plan), the approach with green
// discharges its queue at its saturation flow, and every queued vehicle waits one more second.

export type Dir = "N" | "E" | "S" | "W";
export const DIRS: Dir[] = ["N", "E", "S", "W"]; // phase order

export const RULES = {
  satPerLane: 1800, // veh per hour of green per lane, ideal conditions (told to the agent)
  allRed: 4, // s between greens (told)
  minGreen: 7, // s (told)
  maxGreen: 150, // s (told)
  storagePerLane: 40, // queued vehicles per lane before the approach gridlocks (told)
  blockedPenalty: 300, // s of delay charged per vehicle turned away by gridlock (told)
  residualPenalty: 120, // s extra charged per vehicle still queued when the hour ends (told)
  startupLost: 2, // s of each green lost while the first vehicles get moving (NOT told: learnable from reports)
} as const;

export interface Approach {
  id: Dir;
  name: string;
  lanes: number;
}
export interface Window {
  label: string;
  minutes: number;
  demand: Record<Dir, number>; // arrivals, vehicles per hour
}
export interface Scenario {
  id: string;
  title: string;
  holdout?: boolean;
  description: string;
  approaches: Approach[];
  windows: Window[];
  /** Never shown to the agent: how fast each approach really discharges (buses, merges, rain), and the arrival seed. */
  hidden: { seed: number; sat_factor: Record<Dir, number> };
  /** Best plan found by the optimiser (npm run reference). The score compares against its delay. */
  reference?: { avg_delay: number; plan: Plan };
}
export type Greens = Record<Dir, number>;
export type Plan = Greens[]; // one entry per window

export interface ApproachStats {
  arrivals: number;
  served: number;
  blocked: number;
  delay: number; // vehicle-seconds
  maxQueue: number;
  greenSeconds: number;
  busyGreenSeconds: number; // green seconds (after start-up) with a queue to serve
  servedBusy: number; // vehicles served in those seconds
}
export interface SimResult {
  avgDelay: number; // s per vehicle, including penalties
  totalVehicles: number;
  blocked: number;
  residual: number;
  windows: Record<Dir, ApproachStats>[];
  /** Queue length per approach, sampled every 10 s (for the replay page). */
  trace?: { t: number; q: Record<Dir, number>; green: Dir | null }[];
}

/** Checks a plan's shape and limits. Returns an error message, or null if it's valid. */
export function validatePlan(s: Scenario, plan: unknown): string | null {
  if (!Array.isArray(plan)) return "plan must be a list with one entry per window";
  if (plan.length !== s.windows.length) return `plan has ${plan.length} windows, the scenario has ${s.windows.length}`;
  for (let i = 0; i < plan.length; i++) {
    for (const d of DIRS) {
      const g = (plan[i] as Record<string, unknown>)?.[d];
      if (typeof g !== "number" || !Number.isFinite(g)) return `window ${i + 1}: green for ${d} is missing or not a number`;
      if (g < RULES.minGreen || g > RULES.maxGreen) return `window ${i + 1}: green for ${d} is ${g} s (allowed ${RULES.minGreen}–${RULES.maxGreen})`;
    }
  }
  return null;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Arrival times are fixed per scenario (they don't depend on the plan), so plans are compared fairly. */
const arrivalCache = new Map<string, Record<Dir, Uint8Array>>();
function arrivals(s: Scenario): Record<Dir, Uint8Array> {
  const key = `${s.id}:${s.hidden.seed}`;
  const hit = arrivalCache.get(key);
  if (hit) return hit;
  const T = s.windows.reduce((a, w) => a + w.minutes * 60, 0);
  const out = {} as Record<Dir, Uint8Array>;
  DIRS.forEach((d, k) => {
    const r = rng(s.hidden.seed * 7 + k + 1);
    const arr = new Uint8Array(T);
    let t = 0;
    for (const w of s.windows) {
      const p = w.demand[d] / 3600;
      for (let i = 0; i < w.minutes * 60; i++, t++) arr[t] = r() < p ? 1 : 0;
    }
    out[d] = arr;
  });
  arrivalCache.set(key, out);
  return out;
}

export function simulate(s: Scenario, plan: Plan, opts: { trace?: boolean } = {}): SimResult {
  const arr = arrivals(s);
  const lanes = Object.fromEntries(s.approaches.map((a) => [a.id, a.lanes])) as Record<Dir, number>;
  const rate = Object.fromEntries(DIRS.map((d) => [d, (lanes[d] * RULES.satPerLane * s.hidden.sat_factor[d]) / 3600])) as Record<Dir, number>;
  const storage = Object.fromEntries(DIRS.map((d) => [d, lanes[d] * RULES.storagePerLane])) as Record<Dir, number>;
  const windowStart: number[] = [];
  let T = 0;
  for (const w of s.windows) {
    windowStart.push(T);
    T += w.minutes * 60;
  }
  const windowAt = (t: number) => {
    let i = 0;
    while (i + 1 < windowStart.length && t >= windowStart[i + 1]) i++;
    return i;
  };
  const blank = (): ApproachStats => ({ arrivals: 0, served: 0, blocked: 0, delay: 0, maxQueue: 0, greenSeconds: 0, busyGreenSeconds: 0, servedBusy: 0 });
  const stats = s.windows.map(() => Object.fromEntries(DIRS.map((d) => [d, blank()])) as Record<Dir, ApproachStats>);
  const queue: Record<Dir, number> = { N: 0, E: 0, S: 0, W: 0 };
  const credit: Record<Dir, number> = { N: 0, E: 0, S: 0, W: 0 };
  const trace: SimResult["trace"] = [];

  // Signal state: the phase index, and how long its current stage lasts.
  let phase = 0;
  let inRed = false;
  let left = plan[0][DIRS[0]];
  let greenElapsed = 0;
  let totalDelay = 0;
  let totalVehicles = 0;
  let blocked = 0;

  for (let t = 0; t < T; t++) {
    const w = windowAt(t);
    const st = stats[w];
    for (const d of DIRS) {
      if (arr[d][t]) {
        totalVehicles++;
        st[d].arrivals++;
        if (queue[d] >= storage[d]) {
          st[d].blocked++;
          blocked++;
        } else queue[d]++;
      }
    }
    const green = inRed ? null : DIRS[phase];
    if (green) {
      st[green].greenSeconds++;
      if (greenElapsed >= RULES.startupLost) {
        const busy = queue[green] > 0;
        credit[green] += rate[green];
        let n = 0;
        while (credit[green] >= 1 && queue[green] > 0) {
          queue[green]--;
          credit[green] -= 1;
          n++;
        }
        if (queue[green] === 0) credit[green] = Math.min(credit[green], 1);
        st[green].served += n;
        if (busy) {
          st[green].busyGreenSeconds++;
          st[green].servedBusy += n;
        }
      }
      greenElapsed++;
    }
    for (const d of DIRS) {
      totalDelay += queue[d];
      st[d].delay += queue[d];
      if (queue[d] > st[d].maxQueue) st[d].maxQueue = queue[d];
    }
    if (opts.trace && t % 10 === 0) trace.push({ t, q: { ...queue }, green });
    // Advance the signal.
    if (--left <= 0) {
      if (inRed) {
        inRed = false;
        phase = (phase + 1) % DIRS.length;
        left = plan[windowAt(t + 1 < T ? t + 1 : t)][DIRS[phase]];
        greenElapsed = 0;
        credit[DIRS[phase]] = 0;
      } else {
        inRed = true;
        left = RULES.allRed;
      }
    }
  }
  const residual = DIRS.reduce((a, d) => a + queue[d], 0);
  totalDelay += residual * RULES.residualPenalty + blocked * RULES.blockedPenalty;
  return {
    avgDelay: totalVehicles ? totalDelay / totalVehicles : 0,
    totalVehicles,
    blocked,
    residual,
    windows: stats,
    ...(opts.trace ? { trace } : {}),
  };
}

/** The textbook plan (Webster's method) from the demand and the NOMINAL lane capacity: what a traffic engineer would start with. */
export function websterPlan(s: Scenario, satFactor?: Record<Dir, number>): Plan {
  const lanes = Object.fromEntries(s.approaches.map((a) => [a.id, a.lanes])) as Record<Dir, number>;
  const lost = DIRS.length * (RULES.allRed + RULES.startupLost);
  return s.windows.map((w) => {
    const y = Object.fromEntries(DIRS.map((d) => [d, w.demand[d] / (lanes[d] * RULES.satPerLane * (satFactor?.[d] ?? 1))])) as Record<Dir, number>;
    const Y = Math.min(0.95, DIRS.reduce((a, d) => a + y[d], 0));
    const C = Math.min(DIRS.length * RULES.maxGreen, Math.max(60, (1.5 * lost + 5) / (1 - Y)));
    const g = C - lost;
    return Object.fromEntries(DIRS.map((d) => [d, clampGreen(Math.round((g * y[d]) / Y))])) as Greens;
  });
}

export function clampGreen(g: number): number {
  return Math.max(RULES.minGreen, Math.min(RULES.maxGreen, Math.round(g)));
}

/** Coordinate descent over every green in every window, starting from the best textbook plans. Slow-ish (a few seconds); offline only. */
export function optimise(s: Scenario): { plan: Plan; avgDelay: number } {
  const starts = [websterPlan(s, s.hidden.sat_factor), websterPlan(s)];
  let best = starts[0];
  let bestD = simulate(s, best).avgDelay;
  for (const p of starts.slice(1)) {
    const d = simulate(s, p).avgDelay;
    if (d < bestD) [best, bestD] = [p, d];
  }
  for (const step of [24, 12, 6, 3, 1]) {
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < best.length; i++) {
        for (const d of DIRS) {
          for (const sign of [1, -1]) {
            const cand = best.map((g) => ({ ...g }));
            cand[i][d] = clampGreen(cand[i][d] + sign * step);
            if (cand[i][d] === best[i][d]) continue;
            const cd = simulate(s, cand).avgDelay;
            if (cd < bestD - 1e-9) {
              best = cand;
              bestD = cd;
              improved = true;
            }
          }
        }
      }
    }
  }
  return { plan: best, avgDelay: bestD };
}
