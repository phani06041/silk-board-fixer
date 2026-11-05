#!/bin/bash
# Double-click me to put this project (with its full run history) on GitHub:
#   https://github.com/phani06041/silk-board-fixer
# GitHub created the repo from the template with one starter commit. This keeps that commit:
# it is merged in with our files kept as they are (merge strategy "ours"), so nothing is overwritten.
cd "$(dirname "$0")"
echo "🚦 Putting Silk Board Fixer on GitHub..."
git add README.md docs 3-push-to-github.command 2>/dev/null
git commit -qm "README: run 1 vs run N, and the 3D demo page" 2>/dev/null || true
git remote get-url origin >/dev/null 2>&1 || git remote add origin https://github.com/phani06041/silk-board-fixer.git
if ! git fetch origin; then
  echo; echo "❌ Couldn't reach GitHub. If it asked you to sign in: install GitHub CLI (brew install gh), run 'gh auth login', then double-click this again."; exit 1
fi
if git rev-parse -q --verify origin/main >/dev/null && ! git merge-base --is-ancestor origin/main HEAD; then
  git merge -s ours --allow-unrelated-histories -m "Merge the template's starter commit (keeping this project's files)" origin/main || { echo "❌ Merge failed"; exit 1; }
fi
if git push -u origin main; then
  echo; echo "✅ Done: https://github.com/phani06041/silk-board-fixer"
else
  echo; echo "❌ Push failed. If GitHub asked you to sign in: install GitHub CLI (brew install gh), run 'gh auth login', then double-click this again."
fi
