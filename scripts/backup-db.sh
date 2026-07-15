#!/usr/bin/env bash
#
# WOBBLE OS — full database + media backup (WOB-AUD-007).
#
# Real disaster-recovery backup (NOT the limited JSON export in src/lib/backup): a database-native
# `pg_dump` of the ENTIRE schema + data (all tables, constraints, sequences), SHA-256 checksummed,
# optionally AES-256 encrypted, plus a tar of the durable media/storage tree, with retention.
#
# Run on the VPS (or via cron). Requires the postgres client tools (pg_dump) and openssl/tar.
#
# Env:
#   DATABASE_URL                 (required) target/source DB
#   BACKUP_DIR                   (default ./backups) where artifacts are written — put this on a
#                                DIFFERENT volume/host than the DB for real DR
#   STORAGE_ROOT                 (optional) durable media root to include in the backup
#   BACKUP_RETENTION_DAYS        (default 14) prune artifacts older than this
#   BACKUP_ENCRYPTION_PASSPHRASE (optional) when set, the dump is AES-256 encrypted at rest
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR=${BACKUP_DIR:-./backups}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
TS=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$BACKUP_DIR"

DUMP="$BACKUP_DIR/wobble-db-$TS.dump"
echo "==> pg_dump (custom format) → $DUMP"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$DUMP"

ARTIFACT="$DUMP"
if [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
  echo "==> encrypting dump (AES-256)"
  openssl enc -aes-256-cbc -pbkdf2 -salt -in "$DUMP" -out "$DUMP.enc" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
  rm -f "$DUMP"
  ARTIFACT="$DUMP.enc"
fi
sha256sum "$ARTIFACT" > "$ARTIFACT.sha256"
echo "==> db artifact: $ARTIFACT ($(du -h "$ARTIFACT" | cut -f1)), checksum written"

if [ -n "${STORAGE_ROOT:-}" ] && [ -d "$STORAGE_ROOT" ]; then
  MEDIA="$BACKUP_DIR/wobble-media-$TS.tar.gz"
  echo "==> media tar → $MEDIA"
  tar -czf "$MEDIA" -C "$STORAGE_ROOT" .
  sha256sum "$MEDIA" > "$MEDIA.sha256"
  echo "==> media artifact: $MEDIA ($(du -h "$MEDIA" | cut -f1))"
else
  echo "==> STORAGE_ROOT not set / missing — skipping media backup"
fi

echo "==> pruning backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -type f -name 'wobble-*' -mtime +"$RETENTION_DAYS" -print -delete || true

echo "==> backup complete: $TS"
