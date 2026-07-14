#!/usr/bin/env bash
#
# WOBBLE OS — full database restore (WOB-AUD-007). DESTRUCTIVE.
#
# Restores a `pg_dump` artifact produced by backup-db.sh into the target database, replacing existing
# objects (`pg_restore --clean --if-exists`). Verifies the SHA-256 checksum first and decrypts if the
# artifact is encrypted. Requires CONFIRM=yes to proceed (it drops+recreates objects).
#
# Env:
#   DATABASE_URL                 (required) TARGET DB to restore into
#   BACKUP_FILE                  (required) path to a .dump or .dump.enc artifact
#   BACKUP_ENCRYPTION_PASSPHRASE (required if BACKUP_FILE ends in .enc)
#   MEDIA_FILE                   (optional) wobble-media-*.tar.gz to restore into STORAGE_ROOT
#   STORAGE_ROOT                 (required if MEDIA_FILE set)
#   CONFIRM=yes                  (required) explicit confirmation of a destructive restore
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"
if [ "${CONFIRM:-}" != "yes" ]; then
  echo "Refusing to run a DESTRUCTIVE restore without CONFIRM=yes" >&2
  exit 2
fi
[ -f "$BACKUP_FILE" ] || { echo "backup file not found: $BACKUP_FILE" >&2; exit 1; }

if [ -f "$BACKUP_FILE.sha256" ]; then
  echo "==> verifying checksum"
  sha256sum -c "$BACKUP_FILE.sha256"
else
  echo "WARN: no .sha256 alongside $BACKUP_FILE — skipping integrity check" >&2
fi

WORK="$BACKUP_FILE"
CLEANUP=""
case "$BACKUP_FILE" in
  *.enc)
    : "${BACKUP_ENCRYPTION_PASSPHRASE:?passphrase required to decrypt an .enc artifact}"
    WORK="$(mktemp).dump"
    CLEANUP="$WORK"
    echo "==> decrypting"
    openssl enc -d -aes-256-cbc -pbkdf2 -in "$BACKUP_FILE" -out "$WORK" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
    ;;
esac

echo "==> pg_restore --clean --if-exists into target"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$WORK"
[ -n "$CLEANUP" ] && rm -f "$CLEANUP"

if [ -n "${MEDIA_FILE:-}" ]; then
  : "${STORAGE_ROOT:?STORAGE_ROOT required to restore media}"
  if [ -f "$MEDIA_FILE.sha256" ]; then sha256sum -c "$MEDIA_FILE.sha256"; fi
  echo "==> restoring media into $STORAGE_ROOT"
  mkdir -p "$STORAGE_ROOT"
  tar -xzf "$MEDIA_FILE" -C "$STORAGE_ROOT"
fi

echo "==> restore complete"
