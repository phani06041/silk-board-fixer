# 🚦 Silk Board Fixer

**An agent that times the signals at Bengaluru's most infamous junction, and gets better every time it runs.** Built on [TrueForge](https://trueforge.dev) for the Stranger Builds challenge *"Build an agent that gets better every time it runs"*.

Silk Board is where Hosur Road meets the Outer Ring Road. The agent gets a scenario (morning rush, monsoon rain, an IPL night…) and writes the green time for each approach in each 15-minute window. A deterministic simulator runs that hour, second by second. After each run, the agent reads the simulator's report and **rewrites its own playbook**. Each rewrite is committed with `Agent-Session: <id>`, and the agent runs again on the same frozen scenarios.

```
run-evals ──► simulator report per window & approach ──► improve (agent rewrites its playbook) ──► run-evals
 6 scenarios       arrivals · served · waits · queues ·         committed with Agent-Session: <id>       lower waits?
 (2 holdout)       gridlock · measured flow per lane
```

## Run 1 vs run N

> Fill this in at the end. Five lines max. Keep the heading: the challenge checks for it.

- **Task and score:** _plan the signal greens for 6 one-hour scenarios at Silk Board (2 are holdout: an IPL night and a metro-works lane closure). Score per scenario = best known average wait ÷ the plan's average wait (1 = as good as the optimiser). Run score = 100 × mean._
- **Run 1 → run N:** _e.g. 40 → 92 (`runs/summary.csv`); average wait 150 s → 64 s; holdout 40 → 90._
- **The change that did it:** _link to the commit with `Agent-Session:`._
- **What the agent learned:** _one sentence from the commit._
- **What still fails:** _…_

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

- **SDK:** every run and every self-rewrite is a TrueForge session, created and exported through `@truefoundry/trueforge-sdk`.
- **TrueFoundry AI Gateway** as the model provider.
- **Skills (`skill_mode: "git"`):** the playbook can run as a real versioned TrueForge skill pinned to the commit that runs (macOS has a built-in sandbox; set `SKILL_REPO_URL` in `.env` and push before each run).

## What the judges check

Automatically: public repo (not a fork, created on/after 31 Oct); `agent/`, `evals/tasks/` (3+), `evals/score.*`, `runs/summary.csv` and this README's **Run 1 vs run N**; 2+ runs with a later run above run 1; a commit changing `agent/` ending with `Agent-Session:` between them. Finalists: judges open the sessions, diffs and scorer, and may ask for a live rerun.

## Credits

Built from the [nerdconf/trueforge-starter](https://github.com/nerdconf/trueforge-starter) template (MIT). Scenario demand figures are illustrative, not official traffic counts.
