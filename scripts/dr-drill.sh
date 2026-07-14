#!/usr/bin/env bash
#
# WOBBLE OS — disaster-recovery DRILL (WOB-AUD-007).
#
# Proves the backup/restore path actually recovers the database: dump the SOURCE, restore into a
# DISPOSABLE throwaway DB, then compare the full public-schema table + per-table row-count fingerprint.
# Non-destructive to the source. Run periodically (and in the release drill) so "we have backups" is
# backed by a proven restore, not hope.
#
# Env:
#   DATABASE_URL        (required) SOURCE database to back up
#   DRILL_DATABASE_URL  (required) DISPOSABLE target to restore into — its objects are dropped/replaced
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL (source) is required}"
: "${DRILL_DATABASE_URL:?DRILL_DATABASE_URL (disposable target) is required}"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
DUMP="$TMP/drill.dump"

# Fingerprint: every base table in public with its exact row count, sorted — a deterministic snapshot.
FINGERPRINT_SQL="SELECT string_agg(t.relname || '=' || t.cnt, E'\n' ORDER BY t.relname) FROM (
  SELECT c.relname,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint AS cnt
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r' AND n.nspname = 'public'
) t;"

echo "==> pg_dump source"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$DUMP"

echo "==> pg_restore into disposable target (--clean --if-exists)"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DRILL_DATABASE_URL" "$DUMP" 2>/dev/null || \
  pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DRILL_DATABASE_URL" "$DUMP"

echo "==> comparing table + row-count fingerprint"
SRC=$(psql "$DATABASE_URL" -tAc "$FINGERPRINT_SQL")
DST=$(psql "$DRILL_DATABASE_URL" -tAc "$FINGERPRINT_SQL")

SRC_TABLES=$(printf '%s\n' "$SRC" | grep -c '=' || true)
if [ "$SRC" = "$DST" ]; then
  echo "✅ DR DRILL PASSED — restored DB matches source across $SRC_TABLES tables (table set + every row count identical)."
else
  echo "❌ DR DRILL FAILED — restored DB does not match source." >&2
  echo "--- diff (source vs restored) ---" >&2
  diff <(printf '%s\n' "$SRC") <(printf '%s\n' "$DST") >&2 || true
  exit 1
fi
