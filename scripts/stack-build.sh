#!/usr/bin/env bash
# WOBBLE OS — safe full-stack build/replace (WOB-UAT-026).
#
# THE HAZARD THIS EXISTS TO PREVENT
# `docker compose up -d --build app` rebuilds ONLY the app. `worker` and `worker-video` keep running the
# previous image while the migrator has already advanced the schema. The failure is silent and
# misleading: a seed executed by the stale worker reports success and simply does not write a column it
# has never heard of. This was observed live during the local UAT campaign.
#
# WHAT THIS DOES
#  - derives ONE build id (the git SHA, marked -dirty when the tree is not clean);
#  - builds EVERY service with that id, so app/migrator/worker/worker-video cannot diverge;
#  - replaces the stack, preserving named volumes (DB + storage are never touched);
#  - waits for readiness, which itself refuses a stack whose services disagree on the build id;
#  - verifies version parity via /api/health/version and names the exact stale service if any.
#
# Usage:  bash scripts/stack-build.sh [-p PROJECT] [-f COMPOSE_FILE] [-e ENV_FILE] [-u BASE_URL]
set -euo pipefail

PROJECT="${WOBBLE_COMPOSE_PROJECT:-wobbleuat}"
COMPOSE_FILE="${WOBBLE_COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${WOBBLE_ENV_FILE:-.env.production}"
BASE_URL="${WOBBLE_BASE_URL:-http://127.0.0.1:3000}"

while getopts "p:f:e:u:" opt; do
  case "$opt" in
    p) PROJECT="$OPTARG" ;;
    f) COMPOSE_FILE="$OPTARG" ;;
    e) ENV_FILE="$OPTARG" ;;
    u) BASE_URL="$OPTARG" ;;
    *) echo "usage: $0 [-p project] [-f compose-file] [-e env-file] [-u base-url]" >&2; exit 2 ;;
  esac
done

if [ ! -f "$ENV_FILE" ]; then
  echo "FATAL: env file not found: $ENV_FILE" >&2
  exit 1
fi

# ---- 1. one build id for every service ------------------------------------------------------------
SHA="$(git rev-parse HEAD 2>/dev/null || echo nogit)"
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  SHA="${SHA}-dirty"   # honesty: a dirty tree is NOT the committed SHA, and must not claim to be
fi
export WOBBLE_BUILD_ID="$SHA"
export WOBBLE_ENV_FILE="$ENV_FILE"

echo "=== WOBBLE stack build ==="
echo "  project    : $PROJECT"
echo "  compose    : $COMPOSE_FILE"
echo "  env file   : $ENV_FILE"
echo "  build id   : $WOBBLE_BUILD_ID"
echo ""

DC=(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

# ---- 2. build EVERY service with that id (never a single service) ---------------------------------
# No service is named here ON PURPOSE. Building a subset is precisely the defect.
echo "--- building all services @ $WOBBLE_BUILD_ID ---"
"${DC[@]}" build

# ---- 3. replace the stack; named volumes (pgdata, storage) are preserved by compose ---------------
echo "--- starting/replacing all services (volumes preserved) ---"
"${DC[@]}" up -d

# ---- 4. migrator must have succeeded before we trust anything -------------------------------------
MIGRATE_EXIT="$(docker inspect "${PROJECT}-migrate-1" --format '{{.State.ExitCode}}' 2>/dev/null || echo missing)"
if [ "$MIGRATE_EXIT" != "0" ]; then
  echo "FATAL: migrate did not succeed (exit=$MIGRATE_EXIT). Refusing to continue." >&2
  "${DC[@]}" logs migrate | tail -30 >&2
  exit 1
fi
echo "  migrate exit=0"

# ---- 5. wait for readiness (which now includes version parity as a critical check) ----------------
echo "--- waiting for readiness ---"
for i in $(seq 1 60); do
  if curl -fsS -m 10 "$BASE_URL/api/health/ready" > /dev/null 2>&1; then
    echo "  ready"
    break
  fi
  sleep 5
  if [ "$i" -eq 60 ]; then
    echo "FATAL: stack did not become ready within 300s" >&2
    curl -s -m 10 "$BASE_URL/api/health/ready" >&2 || true
    exit 1
  fi
done

# ---- 6. explicit version-parity gate --------------------------------------------------------------
# Readiness already blocks on this, but assert it separately so the failure message names the stale
# service rather than being buried in a generic "not ready".
echo "--- verifying service version parity ---"
PARITY="$(curl -s -m 10 "$BASE_URL/api/health/version" || echo '{}')"
if ! echo "$PARITY" | grep -q '"ok":true'; then
  echo "FATAL: service version mismatch after build — the stack is split-brain." >&2
  echo "$PARITY" >&2
  exit 1
fi
echo "$PARITY"
echo ""
echo "=== stack built + verified @ $WOBBLE_BUILD_ID — all services on the same code ==="
