// The scorer. Deterministic: same reply in, same number out. Higher is better.
// Don't change it, evals/sim.ts or evals/tasks/ after run 1: every run must be scored the same way.
//
//   npm run score -- runs/run-01     re-score a saved run from its results.json
//   npm run score -- --selftest      check the scorer on the reference, textbook, equal-split and broken plans
//   npm run reference                (before run 1 only) recompute each scenario's best plan with the optimiser
//
// Per task: the agent's plan is run through the simulator for the scenario's hour.
//   score = reference delay / the plan's delay, capped at 1   (1 = as good as the optimiser; 0.5 = twice the wait)
//   an invalid or missing plan scores 0.   A task "passes" at 0.95 or more.
// Run score = 100 × the mean task score → 0..100.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DIRS, RULES, optimise, simulate, validatePlan, websterPlan, type Plan, type Scenario, type SimResult } from "./sim.ts";

export const PASS_AT = 0.95;
export type { Scenario };

export interface TaskScore {
  task_id: string;
  holdout: boolean;
  score: number; // 0..1
  passed: boolean;
  parsed: boolean;
  error?: string;
  avg_delay?: number; // s per vehicle
  reference_delay: number;
  blocked?: number;
  plan?: Plan;
}

/** The plan from the agent's reply: the last ```json block, or the whole reply if it is bare JSON. */
export function parsePlan(reply: string): { plan?: Plan; error?: string } {
  const blocks = [...reply.matchAll(/```json\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const candidate = blocks.length ? blocks[blocks.length - 1] : reply;
  try {
    const obj = JSON.parse(candidate.trim());
    if (!obj || !Array.isArray(obj.plan)) return { error: 'no "plan" list in the JSON block' };
    return { plan: obj.plan };
  } catch {
    return { error: "no valid ```json block at the end of the reply" };
  }
}

export function scorePlan(s: Scenario, plan: unknown): TaskScore & { sim?: SimResult } {
  const ref = s.reference?.avg_delay;
  if (!ref) throw new Error(`${s.id} has no reference. Run npm run reference (before run 1 only).`);
  const base = { task_id: s.id, holdout: !!s.holdout, reference_delay: ref };
  const bad = validatePlan(s, plan);
  if (bad) return { ...base, score: 0, passed: false, parsed: true, error: bad };
  const p = (plan as Plan).map((g) => Object.fromEntries(DIRS.map((d) => [d, Math.round(g[d])])) as Plan[number]);
  const sim = simulate(s, p);
  const score = round(Math.min(1, ref / Math.max(sim.avgDelay, 1e-9)), 4);
  return { ...base, score, passed: score >= PASS_AT, parsed: true, avg_delay: round(sim.avgDelay, 2), blocked: sim.blocked, plan: p, sim };
}

export function scoreTask(s: Scenario, reply: string): TaskScore & { sim?: SimResult } {
  const { plan, error } = parsePlan(reply);
  if (!plan) {
    return { task_id: s.id, holdout: !!s.holdout, score: 0, passed: false, parsed: false, error, reference_delay: s.reference?.avg_delay ?? 0 };
  }
  return scorePlan(s, plan);
}

export function scoreRun(tasks: TaskScore[]): { score: number; tasks_passed: number; tasks_total: number; holdout_score: number | null; avg_delay: number | null } {
  const mean = (xs: TaskScore[]) => (xs.length ? xs.reduce((s, t) => s + t.score, 0) / xs.length : 0);
  const hold = tasks.filter((t) => t.holdout);
  const delays = tasks.map((t) => t.avg_delay).filter((x): x is number => typeof x === "number");
  return {
    score: round(100 * mean(tasks), 2),
    tasks_passed: tasks.filter((t) => t.passed).length,
    tasks_total: tasks.length,
    holdout_score: hold.length ? round(100 * mean(hold), 2) : null,
    avg_delay: delays.length === tasks.length ? round(delays.reduce((a, b) => a + b, 0) / delays.length, 1) : null,
  };
}

/** What the agent is told after a run: per window and approach, what happened. No reference plan. */
export function report(s: Scenario, r: TaskScore & { sim?: SimResult }): string {
  if (!r.sim) return `Your plan was not used: ${r.error}`;
  const lanes = Object.fromEntries(s.approaches.map((a) => [a.id, a.lanes]));
  const lines = [
    `Average wait ${r.avg_delay} s per vehicle (best known plan: ${r.reference_delay.toFixed(1)} s). Score ${r.score.toFixed(2)}.` +
      (r.sim.blocked ? ` ${r.sim.blocked} vehicles were turned away by gridlock.` : "") +
      (r.sim.residual ? ` ${r.sim.residual} vehicles were still queued at the end of the hour.` : ""),
    "",
    "| window | approach | your green s | arrived | served | avg wait s | max queue | gridlocked | measured flow per lane per hour of busy green |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  s.windows.forEach((w, i) => {
    for (const d of DIRS) {
      const st = r.sim!.windows[i][d];
      const flow = st.busyGreenSeconds >= 20 ? Math.round((st.servedBusy / st.busyGreenSeconds) * 3600 / lanes[d]) : "–";
      const wait = st.arrivals ? Math.round(st.delay / st.arrivals) : 0;
      lines.push(`| ${w.label} | ${d} | ${r.plan![i][d]} | ${st.arrivals} | ${st.served} | ${wait} | ${st.maxQueue} | ${st.blocked} | ${flow} |`);
    }
  });
  return lines.join("\n");
}

function round(x: number, d: number): number {
  const k = 10 ** d;
  return Math.round(x * k) / k;
}

// ---------- CLI ----------

const here = dirname(fileURLToPath(import.meta.url));
const TASKS = join(here, "tasks");

export function loadScenarios(): Scenario[] {
  return readdirSync(TASKS)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(TASKS, f), "utf8")) as Scenario);
}

function reply(plan: Plan): string {
  return "Here is the plan.\n\n```json\n" + JSON.stringify({ plan }) + "\n```\n";
}

function selftest(): void {
  const ss = loadScenarios();
  const check = (name: string, ok: boolean, got: unknown) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${got}`);
    if (!ok) process.exitCode = 1;
  };
  const run = (f: (s: Scenario) => string) => scoreRun(ss.map((s) => scoreTask(s, f(s))));
  const ref = run((s) => reply(s.reference!.plan));
  check("reference plans score 100", ref.score === 100, ref.score);
  check("same reply, same score", run((s) => reply(websterPlan(s))).score === run((s) => reply(websterPlan(s))).score, "deterministic");
  const textbook = run((s) => reply(websterPlan(s)));
  check("textbook plan (nominal capacity) leaves room to learn", textbook.score < 60, textbook.score);
  const equal = run((s) => reply(s.windows.map(() => ({ N: 40, E: 40, S: 40, W: 40 }))));
  check("equal 40 s greens score low", equal.score < 60, equal.score);
  check("no JSON scores 0", run(() => "I'd give everyone 40 seconds.").score === 0, 0);
  check("out-of-range greens score 0", run((s) => reply(s.windows.map(() => ({ N: 5, E: 40, S: 40, W: 40 })))).score === 0, 0);
  check("wrong number of windows scores 0", run(() => reply([{ N: 40, E: 40, S: 40, W: 40 }])).score === 0, 0);
  console.log(`(${ss.length} scenarios, ${ss.filter((s) => s.holdout).length} holdout; rules: all-red ${RULES.allRed}s, greens ${RULES.minGreen}–${RULES.maxGreen}s)`);
}

function reference(): void {
  for (const f of readdirSync(TASKS).filter((x) => x.endsWith(".json")).sort()) {
    const s = JSON.parse(readFileSync(join(TASKS, f), "utf8")) as Scenario;
    const { plan, avgDelay } = optimise(s);
    s.reference = { avg_delay: round(avgDelay, 3), plan };
    writeFileSync(join(TASKS, f), JSON.stringify(s, null, 2) + "\n");
    console.log(`${s.id.padEnd(30)} best plan: ${avgDelay.toFixed(1)} s average wait`);
  }
}

function rescore(dir: string): void {
  const results = JSON.parse(readFileSync(join(resolve(dir), "results.json"), "utf8")) as { task_id: string; reply: string }[];
  const ss = new Map(loadScenarios().map((s) => [s.id, s]));
  const scored = results.map((r) => scoreTask(ss.get(r.task_id)!, r.reply));
  for (const s of scored) console.log(`${s.passed ? "pass" : "    "} ${s.task_id.padEnd(30)} ${s.score.toFixed(2)}  ${s.avg_delay ?? "-"} s vs ${s.reference_delay.toFixed(1)} s${s.error ? `  (${s.error})` : ""}`);
  console.log(JSON.stringify(scoreRun(scored)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (arg === "--selftest") selftest();
  else if (arg === "--reference") reference();
  else if (arg) rescore(arg);
  else console.log("usage: npm run score -- runs/run-NN | --selftest | --reference");
}
