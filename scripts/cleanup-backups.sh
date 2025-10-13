#!/usr/bin/env bash
set -euo pipefail
dst="backups/_old/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$dst"
shopt -s nullglob
mv backend/services/tmAiEngine.js*.bak* "$dst" 2>/dev/null || true
mv backend/services/tmAiEngine.js.bak* "$dst" 2>/dev/null || true
mv backend/services/*.bak* "$dst" 2>/dev/null || true
mv backend/services/*.*.bak* "$dst" 2>/dev/null || true
mv backend/services/*bak* "$dst" 2>/dev/null || true
if ! grep -q '^backups/_old/' .gitignore 2>/dev/null; then
  printf "backups/_old/\n" >> .gitignore
fi
git add -A
git commit -m "chore: move local backup files to $dst and ignore backups/_old" || true
