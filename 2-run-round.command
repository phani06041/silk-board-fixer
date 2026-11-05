#!/bin/bash
# Double-click me (with "1-start-trueforge" running). Each double-click does ONE step of the loop:
#   first time:  install, git, scorer check, create the agent, run 1  (then stops so Claude can check run 1)
#   after that:  the agent rewrites its playbook from the simulator's report → next eval run
# Everything is logged to runs/rounds.log.
cd "$(dirname "$0")"
mkdir -p runs
exec > >(tee -a runs/rounds.log) 2>&1
echo; echo "================ $(date '+%a %d %b %H:%M:%S') ================"
fail() { echo; echo "❌ STOPPED: $1"; echo "   (you can close this window)"; exit 1; }

[ -d node_modules ] || npm install --no-audit --no-fund || fail "npm install"
[ -f .env ] || cp .env.example .env
npx tsx scripts/pick-model.ts || fail "no model in TrueForge yet"

if [ ! -d .git ]; then
  git init -q -b main || fail "git init"
  git config user.name >/dev/null || git config user.name "Phanindra Maddipatla"
  git config user.email >/dev/null || git config user.email "phanindra.maddipatla@gmail.com"
  git add -A && git commit -qm "Silk Board Fixer: starting agent, simulator, scenarios and scorer" || fail "first commit"
fi

runs_done=0
[ -f runs/summary.csv ] && runs_done=$(( $(grep -c . runs/summary.csv) - 1 ))
if [ "$runs_done" -lt 1 ]; then
  git add -A && git commit -qm "Setup before run 1" >/dev/null 2>&1 || true
  npm run -s score -- --selftest || fail "scorer selftest"
  npm run -s setup || fail "setup"
  npm run -s run-evals || fail "run 1"
  echo; echo "✅ RUN 1 DONE. Tell Claude, then double-click again for the next round."
  exit 0
fi

npm run -s improve || fail "the agent's self-rewrite"
git show --stat HEAD | head -20
npm run -s run-evals || fail "next eval run"
echo; echo "✅ ROUND DONE:"; cat runs/summary.csv
