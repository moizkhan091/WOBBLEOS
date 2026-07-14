#!/usr/bin/env bash
#
# WOBBLE OS — VPS deploy (WOB-AUD-007 remediation of scripts/deploy.sh).
#
# Run this ON the VPS to deploy the isolated Docker Compose stack (web + Postgres/pgvector + general
# worker/scheduler + media worker). Unlike the previous version, this ACTUALLY deploys: it builds the
# images, applies migrations (the `migrate` service), starts every service, and then GATES on aggregate
# READINESS (/api/health/ready) — it fails the deploy if the OS does not come up healthy (DB + storage +
# worker/scheduler), instead of exiting success without deploying.
#
# Usage (on the VPS, from the project root, with a filled .env.production):
#   bash scripts/deploy.sh
#
# Env (optional): COMPOSE_FILE (default docker-compose.prod.yml), ENV_FILE (default .env.production),
#                 READY_URL (default http://127.0.0.1:3000/api/health/ready), READY_TIMEOUT (default 180).
set -euo pipefail

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
ENV_FILE=${ENV_FILE:-.env.production}
READY_URL=${READY_URL:-http://127.0.0.1:3000/api/health/ready}
READY_TIMEOUT=${READY_TIMEOUT:-180}

echo "==> WOBBLE OS deploy starting at $(date -u +%FT%TZ)"

[ -f "$ENV_FILE" ] || { echo "XX  $ENV_FILE not found — copy .env.production.example and fill it." >&2; exit 1; }

# 1. Pull latest (skip gracefully if not a git checkout).
if [ -d .git ]; then
  echo "==> git pull --ff-only"
  git pull --ff-only
fi

# 2. Validate the compose config (fails early on a missing required secret / bad file).
echo "==> validating compose config"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config >/dev/null

# 3. Build images + start the stack. The `migrate` service applies migrations from scratch and the app +
#    workers start only after it succeeds (depends_on: service_completed_successfully).
echo "==> docker compose up -d --build (app + db + migrate + worker + worker-video)"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

# 4. READINESS GATE — poll aggregate readiness (DB + storage + general worker/scheduler heartbeat).
echo "==> waiting for readiness at $READY_URL (timeout ${READY_TIMEOUT}s)"
deadline=$(( $(date +%s) + READY_TIMEOUT ))
until curl -fsS "$READY_URL" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "XX  DEPLOY FAILED — the OS did not become READY within ${READY_TIMEOUT}s." >&2
    echo "    Last readiness response:" >&2
    curl -sS "$READY_URL" >&2 || true
    echo "" >&2
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps >&2 || true
    exit 1
  fi
  sleep 5
done

echo "==> READY. Current services:"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
echo "==> WOBBLE OS deploy finished OK at $(date -u +%FT%TZ)"
