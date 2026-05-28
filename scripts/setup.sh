#!/usr/bin/env bash
# Prepare a fresh environment for development.
#
# Idempotent and safe to call from a Claude Code on-the-web env init script
# (or by a human after cloning):
#
#   bash scripts/setup.sh              # install deps + typecheck smoke
#   WITH_PLAYWRIGHT=1 bash scripts/setup.sh   # also fetch the headless browser
#
# Containers are ephemeral, so this runs every fresh session. The Playwright
# browser (~100MB) is opt-in via WITH_PLAYWRIGHT=1 since it isn't needed for
# normal dev/typecheck — only for `npm run screenshots` and visual checks.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> node $(node --version), npm $(npm --version)"

# Reproducible install from the committed lockfile; fall back if it's missing.
if [ -f package-lock.json ]; then
  echo "==> npm ci"
  npm ci
else
  echo "==> npm install (no lockfile)"
  npm install
fi

# Fast fail-early smoke so a broken tree surfaces during setup, not mid-task.
echo "==> typecheck"
npm run typecheck

if [ "${WITH_PLAYWRIGHT:-0}" = "1" ]; then
  echo "==> installing Playwright chromium (WITH_PLAYWRIGHT=1)"
  # Pinned to match the version used by `npm run screenshots`.
  npx -y -p playwright@1.50.0 playwright install chromium
fi

echo "==> setup complete"
