#!/usr/bin/env bash
#
# WOBBLE OS - VPS deploy gate.
#
# Run this ON the VPS to deploy. It REFUSES to deploy unless the full check
# suite passes, so a broken build never goes live. This is the last line of
# defense after CI.
#
# Usage (on the VPS, from the project root):
#   bash scripts/deploy.sh
#
# What it does:
#   1. Pull the latest code (if this is a git checkout).
#   2. Clean install dependencies from the lockfile (correct Linux binaries).
#   3. Run verify = typecheck + test + build. ABORTS on any failure.
#   4. Only if green: (re)start the app + workers.
#
# Restart step: edit the RESTART section for your process manager (pm2,
# systemd, docker, etc.). It is intentionally explicit so deploys are
# predictable.

set -euo pipefail

echo "==> WOBBLE OS deploy starting at $(date -u +%FT%TZ)"

# 1. Pull latest (skip gracefully if not a git checkout)
if [ -d .git ]; then
  echo "==> git pull"
  git pull --ff-only
else
  echo "==> not a git checkout, skipping git pull"
fi

# 2. Clean, reproducible install (installs correct platform binaries)
echo "==> npm ci"
npm ci

# 3. The gate: typecheck + test + build. set -e aborts the script on failure.
echo "==> npm run verify (typecheck + test + build)"
if ! npm run verify; then
  echo "XX  VERIFY FAILED - aborting deploy. Nothing was restarted." >&2
  exit 1
fi

# 4. Restart only after a green verify.
echo "==> verify passed, restarting services"
# --- RESTART (edit for your setup) -------------------------------------------
# pm2 example:
#   pm2 restart wobble-os wobble-worker wobble-video-worker
# systemd example:
#   sudo systemctl restart wobble-os wobble-worker wobble-video-worker
# docker compose example:
#   docker compose up -d --build
# -----------------------------------------------------------------------------
echo "!!  No restart command configured yet. Edit the RESTART section of scripts/deploy.sh."

echo "==> WOBBLE OS deploy finished OK at $(date -u +%FT%TZ)"
