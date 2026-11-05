#!/bin/bash
# Double-click me (with "1-start-trueforge" running). Switches the agent to real TrueForge skills,
# which run in TrueForge's sandbox (built into macOS), then does run 6 on the same tasks and scorer.
# Logged to runs/rounds.log.
cd "$(dirname "$0")"
exec > >(tee -a runs/rounds.log) 2>&1
echo; echo "================ $(date '+%a %d %b %H:%M:%S') · skills + sandbox ================"
fail() { echo; echo "❌ STOPPED: $1"; exit 1; }
REPO=https://github.com/phani06041/silk-board-fixer
grep -q '^SKILL_REPO_URL=' .env && sed -i '' "s#^SKILL_REPO_URL=.*#SKILL_REPO_URL=$REPO#" .env || echo "SKILL_REPO_URL=$REPO" >> .env
python3 - <<'PY'
import json; p='agent/agent.json'; j=json.load(open(p))
if j.get('skill_mode') != 'git':
    j['skill_mode']='git'; open(p,'w').write(json.dumps(j, indent=2)+'\n'); print('agent.json: skill_mode = git')
PY
git add agent/agent.json docs 4-skills-and-sandbox.command 2>/dev/null
git commit -qm "Use real TrueForge skills (skill_mode git), which run in the TrueForge sandbox; add demo video" 2>/dev/null || true
git push origin main || fail "push to GitHub (the skill is cloned from the public repo, so it must be pushed first)"
npm run -s setup || fail "setup in skills + sandbox mode"
npm run -s run-evals || fail "run 6"
git push origin main || fail "final push"
echo; echo "✅ DONE: run 6 used TrueForge skills in the sandbox."; tail -3 runs/summary.csv
