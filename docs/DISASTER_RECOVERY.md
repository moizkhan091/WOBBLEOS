# WOBBLE OS — Backup & Disaster Recovery

Closes WOB-AUD-007. Distinguishes the two very different things the old docs conflated.

## Two mechanisms — do not confuse them

| | Limited JSON export (`src/lib/backup`) | Disaster recovery (`scripts/*.sh`) |
|---|---|---|
| Scope | 15 curated business tables, capped per table | The ENTIRE database (all tables, sequences, constraints) |
| Format | JSON | `pg_dump` custom format (compressed) |
| Restore | additive (inserts missing rows by id) | full `pg_restore --clean` |
| Media/files | ✗ | ✓ (tar of `STORAGE_ROOT`) |
| Integrity | ✗ | SHA-256 checksum + optional AES-256 encryption |
| Use it for | "give me my CRM/tasks as JSON" | recovering the system after data loss |

The JSON export is **not** a backup and the API/UI now label it as `limited-json-export`.

## Real DR — commands

```bash
# 1) Full backup (DB + media), checksummed, optionally encrypted, with retention.
DATABASE_URL=postgres://…  STORAGE_ROOT=/app/storage  BACKUP_DIR=/backups \
  BACKUP_ENCRYPTION_PASSPHRASE=…  npm run backup:db

# 2) Destructive restore into a target DB (requires explicit confirmation).
DATABASE_URL=postgres://…(target)  BACKUP_FILE=/backups/wobble-db-<ts>.dump.enc \
  BACKUP_ENCRYPTION_PASSPHRASE=…  MEDIA_FILE=/backups/wobble-media-<ts>.tar.gz \
  STORAGE_ROOT=/app/storage  CONFIRM=yes  npm run restore:db

# 3) DR DRILL — prove the backup actually restores. Dumps the source, restores into a DISPOSABLE DB,
#    and compares the full table + per-table row-count fingerprint. Non-destructive to the source.
DATABASE_URL=postgres://…(source)  DRILL_DATABASE_URL=postgres://…(throwaway)  npm run dr:drill
```

## Operational requirements (for production sign-off)

- **Off-host retention**: `BACKUP_DIR` must live on a different volume/host than the DB (object store or a
  second disk). A backup on the same disk as the database is not disaster recovery.
- **Encryption at rest**: set `BACKUP_ENCRYPTION_PASSPHRASE` so dumps are AES-256 encrypted.
- **Schedule**: run `backup:db` on a cron (e.g. hourly DB + daily media) and `dr:drill` weekly.
- **RPO/RTO**: with hourly dumps, RPO ≈ 1h. For tighter RPO, add Postgres WAL archiving / PITR (managed
  Postgres or `pgBackRest`) — the dump path above is the baseline, PITR is the enhancement.
- **Durable storage**: media lives ONLY on the mounted `wobble_storage` volume (never baked into the
  image — WOB-AUD-002), so it is captured by the media tar and survives container replacement.

## Verification status

- `dr-drill.sh` full dump → restore into a clean DB → row-count fingerprint match: **proven** against an
  isolated pgvector container (see docs/DEPLOYMENT_READINESS_REMEDIATION.md).
- Off-host retention, encryption key management, cron scheduling, and WAL/PITR are **operational
  configuration** to be applied on the VPS (blocked-external: needs the host + a backup target).
