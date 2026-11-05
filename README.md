# 🚦 Silk Board Fixer

**An agent that times the signals at Bengaluru's most infamous junction, and gets better every time it runs.** Built on [TrueForge](https://trueforge.dev) for the Stranger Builds challenge *"Build an agent that gets better every time it runs"*.

Silk Board is where Hosur Road meets the Outer Ring Road. The agent gets a scenario (morning rush, monsoon rain, an IPL night…) and writes the green time for each approach in each 15-minute window. A deterministic simulator runs that hour, second by second. After each run, the agent reads the simulator's report and **rewrites its own playbook**. Each rewrite is committed with `Agent-Session: <id>`, and the agent runs again on the same frozen scenarios.

```
run-evals ──► simulator report per window & approach ──► improve (agent rewrites its playbook) ──► run-evals
 6 scenarios       arrivals · served · waits · queues ·         committed with Agent-Session: <id>       lower waits?
 (2 holdout)       gridlock · measured flow per lane
```

## Run 1 vs run N

- **Task and score:** plan the signal greens for 6 one-hour scenarios at Silk Board (2 are holdout: an IPL night and a metro-works lane closure). Score per scenario = best known average wait ÷ the plan's average wait (1 = as good as the optimiser). Run score = 100 × mean. Model: Claude Sonnet 5.5 via the TrueFoundry AI Gateway.
- **Run 1 → run N:** **38.3 → 96.1** at run 4, 93.8 at run 5 (`runs/summary.csv`). Average wait **172 s → 67 s** per vehicle. Holdout scenarios **39 → 94**, though they never appear in the agent's feedback.
- **The change that did it:** [`5c0e548` agent: learn from run 01](../../commit/5c0e548) (`Agent-Session: 01m6n3ah6s8pv79a6jnhvswped`) took it from 38 to 91. [`136d5ca`](../../commit/136d5ca) undid its own bad rule after a dip and reached 96.
- **What the agent learned:** from the simulator's reports alone, it worked out that Hosur Road from Electronic City discharges only ~1,060 vehicles per lane per hour (truth: 1,080), that rain cuts flow to 0.80 (truth: 0.80), and that every green loses ~2–3 s at the start (truth: 2 s). It then wrote itself a Webster-style method around those numbers.
- **What still fails:** the evening rush and the IPL night stay near 0.88–0.90. Both have a heavy flow from the city side that the agent under-serves in the last window. Round 5 tried to fix it and moved scores by ±2 points: the curve has levelled off.

**Demo:** a 3D replay of Silk Board where run 1 jams and the learned run flows, same traffic second by second: [`docs/index.html`](docs/index.html) (GitHub Pages: https://phani06041.github.io/silk-board-fixer/).

**Video (68 s):** https://youtu.be/gsxnndaB_pY

| Run | Score | Holdout | Avg wait | What the agent changed before this run |
|---|---|---|---|---|
| 1 | 38.3 | 39.1 | 172 s | starting playbook (textbook) |
| 2 | 91.4 | 86.2 | 71 s | measured each approach's real flow; longer cycles |
| 3 | 87.6 | 86.0 | 75 s | padded Electronic City extra: backfired |
| 4 | **96.1** | **94.3** | **67 s** | saw the dip in its score history, removed the padding, added a capacity check |
| 5 | 93.8 | 91.0 | 69 s | kept the last window's cycle longer (no real gain) |
| 6 | 92.3 | 83.5 | 70 s | same playbook, now loaded as a real TrueForge skill in the sandbox |

## Why the improvement is real

- **The junction has quirks nobody tells the agent.** Hosur Road from Electronic City moves far slower than its three lanes suggest (BMTC buses, the flyover merge), every green loses a couple of seconds while traffic gets moving, and rain slows everything down. The textbook method (Webster) applied to the stated capacity scores **38**. The only way to learn the quirks is from the simulator's reports, which show the measured flow per lane on every approach.
- **Holdout scenarios** (`05`, `06`) never appear in the agent's feedback. If their score rises too, the agent learned the junction and the method, not the answers.
- **Overfitting guards:** the agent never sees the optimiser's plans; `improve` refuses a playbook that quotes a scenario; scenarios, simulator and scorer are frozen after run 1.
- **The agent writes its own change.** We review it (`git show`) and keep or drop it, never edit it.

| Plan (no learning) | Score |
|---|---|
| Equal 40 s greens | 45 |
| Textbook Webster on stated lane capacity | 38 |
| Webster, if you knew the hidden quirks | ~91 |
| Optimiser (the reference) | 100 |

## What's in here

```
agent/                                the agent
  agent.json                          name, model, skill_mode
  instructions.md                     its system prompt (Output section is fixed: the scorer needs it)
  skills/signal-playbook/SKILL.md     its playbook: the part it rewrites
evals/sim.ts                          the Silk Board simulator (deterministic, no dependencies)
evals/tasks/*.json                    6 scenarios (05, 06 = holdout); hidden quirks + the optimiser's reference
evals/score.ts                        scorer, selftest, the report the agent reads
scripts/run-evals.ts                  one run = one TrueForge session → runs/run-NN/, runs/summary.csv
scripts/improve.ts                    the agent rewrites agent/ from the reports; commits with Agent-Session
scripts/setup.ts, export-session.ts, pick-model.ts, lib.ts
1-start-trueforge.command             double-click (macOS): start TrueForge
2-run-round.command                   double-click (macOS): run 1, then one learning round per click
```

## Quickstart

You need Node.js 22.14+, git, and a model: the TrueFoundry AI Gateway, or your own Anthropic, OpenAI or Gemini key.

1. **Start TrueForge:** `npx @truefoundry/trueforge@latest` (or double-click `1-start-trueforge.command`). Open http://localhost:8790 → **Settings → Models** → add **TrueFoundry** (gateway URL + token) or another provider.
2. **Install:** `npm install && cp .env.example .env`. `TF_MODEL` is filled in automatically by `npx tsx scripts/pick-model.ts`, or set it yourself.
3. **Check and create:** `npm run score -- --selftest && npm run setup`
4. **The loop** (repeat 3–5 times):

```bash
npm run run-evals   # run N on the frozen scenarios
npm run improve     # the agent rewrites its playbook from the reports; committed with Agent-Session
git show            # review. Drop it with: git reset --hard HEAD~1
```

`npm run score -- runs/run-NN` re-scores a saved run. `npm run export-session -- <id>` exports a session as JSON.

## TrueForge features used

- **Skills:** the playbook (`agent/skills/signal-playbook/SKILL.md`) is a real TrueForge skill: `"skill_mode": "git"` in `agent/agent.json`, registered by `npm run setup` from this public repo and pinned to the commit that runs. The agent rewrites it itself.
- **Sandbox:** skills run in TrueForge's sandbox (enabled in `syncAgent`, `scripts/lib.ts`; the macOS local sandbox). Run 6 ([`f14aea2`](../../commit/f14aea2), session `01m6ngkzvtvndzjh2jt7w8d6gd`) used both: 16 tool calls, score 92.31 on the same tasks and scorer.
- **SDK:** every run and every self-rewrite is a TrueForge session, created and exported through `@truefoundry/trueforge-sdk`.
- **TrueFoundry AI Gateway** as the model provider (Claude Sonnet 5.5).

Runs 1–5 used `skill_mode: "inline"` (the same playbook pasted into the instructions); run 6 switched to real skills in the sandbox without changing tasks, scorer or model.

## What the judges check

Automatically: public repo (not a fork, created on/after 31 Oct); `agent/`, `evals/tasks/` (3+), `evals/score.*`, `runs/summary.csv` and this README's **Run 1 vs run N**; 2+ runs with a later run above run 1; a commit changing `agent/` ending with `Agent-Session:` between them. Finalists: judges open the sessions, diffs and scorer, and may ask for a live rerun.

## Credits

Built from the [nerdconf/trueforge-starter](https://github.com/nerdconf/trueforge-starter) template (MIT). Scenario demand figures are illustrative, not official traffic counts.
