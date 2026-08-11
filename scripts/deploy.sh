#!/usr/bin/env bash
#
# WOBBLE OS — isolated VPS deploy.
#
# Preferred usage (production secrets stay outside the checkout):
#   bash scripts/deploy.sh /etc/wobble/wobble.env
#
# The production secrets live at /etc/wobble/wobble.env (root-only, deliberately outside the checkout,
# so a fresh `git archive` extraction can never clobber them). That file also carries WOBBLE_PUBLIC_HOST,
# which the vps overlay interpolates into the Traefik Host rule.
#
# Optional env: COMPOSE_FILE, ENV_FILE (used only when no positional path is supplied), READY_URL,
# READY_TIMEOUT. The legacy default is .env.production for backward compatibility.
set -euo pipefail

# One or more compose files, colon-separated (the same convention Compose's own COMPOSE_FILE uses).
# This box runs prod + the vps overlay: the overlay carries the Traefik labels, so deploying with only
# docker-compose.prod.yml silently drops the router and takes the public host offline.
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml:docker-compose.vps.yml}
COMPOSE_ARGS=()
IFS=':' read -r -a _compose_files <<< "$COMPOSE_FILE"
for _f in "${_compose_files[@]}"; do
  [ -n "$_f" ] || continue
  [ -f "$_f" ] || { echo "XX  compose file not found: $_f" >&2; exit 1; }
  COMPOSE_ARGS+=(-f "$_f")
done
ENV_FILE_INPUT=${1:-${ENV_FILE:-.env.production}}
READY_URL=${READY_URL:-http://127.0.0.1:3000/api/health/ready}
READY_TIMEOUT=${READY_TIMEOUT:-180}

echo "==> WOBBLE OS deploy starting at $(date -u +%FT%TZ)"

[ -f "$ENV_FILE_INPUT" ] || {
  echo "XX  production environment file not found: $ENV_FILE_INPUT" >&2
  echo "    Usage: bash scripts/deploy.sh /absolute/path/to/wobble.env" >&2
  exit 1
}

# Compose resolves service-level env_file entries from the project definition. Always supply an
# absolute path so a file outside the checkout works consistently from any caller working directory.
ENV_FILE=$(cd "$(dirname "$ENV_FILE_INPUT")" && pwd)/$(basename "$ENV_FILE_INPUT")
export WOBBLE_ENV_FILE="$ENV_FILE"
echo "==> using production environment file: $WOBBLE_ENV_FILE"

if [ -d .git ]; then
  echo "==> git pull --ff-only"
  git pull --ff-only
fi

# The image build stamps WOBBLE_BUILD_ID into the app + both workers; /api/health/ready's version-parity
# check treats a missing / "unknown" build id as a CRITICAL mismatch, so WITHOUT this the OS never becomes
# READY and this script aborts at the readiness timeout. Derive it from the checked-out commit so every
# service builds on the same identifiable code (matches scripts/stack-build.sh).
export WOBBLE_BUILD_ID="${WOBBLE_BUILD_ID:-$(git rev-parse HEAD 2>/dev/null || echo nogit)}"
echo "==> build id: $WOBBLE_BUILD_ID"

echo "==> validating compose config"
docker compose "${COMPOSE_ARGS[@]}" --env-file "$ENV_FILE" config >/dev/null

echo "==> docker compose up -d --build (app + db + migrate + worker + worker-video)"
docker compose "${COMPOSE_ARGS[@]}" --env-file "$ENV_FILE" up -d --build

echo "==> waiting for readiness at $READY_URL (timeout ${READY_TIMEOUT}s)"
deadline=$(( $(date +%s) + READY_TIMEOUT ))
until curl -fsS "$READY_URL" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "XX  DEPLOY FAILED — the OS did not become READY within ${READY_TIMEOUT}s." >&2
    echo "    Last readiness response:" >&2
    curl -sS "$READY_URL" >&2 || true
    echo "" >&2
    docker compose "${COMPOSE_ARGS[@]}" --env-file "$ENV_FILE" ps >&2 || true
    exit 1
  fi
  sleep 5
done

echo "==> READY. Current services:"
docker compose "${COMPOSE_ARGS[@]}" --env-file "$ENV_FILE" ps
echo "==> WOBBLE OS deploy finished OK at $(date -u +%FT%TZ)"
