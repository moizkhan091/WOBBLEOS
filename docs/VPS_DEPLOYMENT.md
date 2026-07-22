# WOBBLE OS — VPS Deployment Guide (Docker Compose — the ONE supported path)

This is the single authoritative production deployment path. It deploys the isolated Docker Compose
stack: **db (pgvector) + migrate + app + worker + worker-video**. There is no supported bare-metal
path — earlier revisions of this guide described one; it is retired (it predated per-founder
authentication and the worker lease).

> **Release candidate:** branch `feat/founder-accounts-local-uat`. Deployment MUST check out the
> intended branch/SHA explicitly (step 2) — a fresh `git clone` leaves you on `main`, which is NOT
> the release candidate. Never deploy whatever branch you happen to be on without verifying it.

## 1. Server prerequisites

- **Linux VPS** (Ubuntu 22.04+ recommended) with **Docker Engine + Docker Compose v2** and `git`.
- **Node.js 22+ and npm 10+** (`package.json` engines: `node >=22 <25`) — the containers ship their
  own Node 22; install it on the host only if you want to run repo scripts directly there (the
  founder bootstrap in step 6 runs inside the `worker` container, so host Node is optional).
- A **domain + DNS** pointed at the VPS and a TLS-terminating reverse proxy (Caddy or nginx). The app
  binds to `127.0.0.1:3000` by design; only the proxy is public. The DB publishes **no** port.
- `curl`, `openssl`, and the Postgres client tools (`pg_dump`/`pg_restore`) for backups.

## 2. Get the RIGHT code (explicit branch + SHA — never silently `main`)

```bash
git clone <your repo url> /opt/wobble-os && cd /opt/wobble-os

# CHECK OUT THE RELEASE CANDIDATE — clone defaults to main, which is not it:
git checkout feat/founder-accounts-local-uat

# VERIFY you are deploying exactly the accepted SHA (see docs/RELEASE_CANDIDATE_ACCEPTANCE.md):
git rev-parse --abbrev-ref HEAD   # → feat/founder-accounts-local-uat
git rev-parse HEAD                # → must equal the accepted release SHA
```

Record the SHA you deployed. `scripts/deploy.sh` stamps it into every image as `WOBBLE_BUILD_ID`, and
the readiness gate refuses to go READY if any service reports a different build than the app — so a
half-updated stack cannot silently pass.

**`deploy.sh` pulls the currently checked-out branch** (`git pull --ff-only`) on every run. It never
switches branches for you. If HEAD is on `main`, it deploys `main` — which is why step 2's checkout
and verification are mandatory, not optional.

## 3. Production environment file (outside the checkout)

```bash
sudo install -m 600 .env.production.example /etc/wobble/wobble.env
sudoedit /etc/wobble/wobble.env
```

Fill it per the comments in [.env.production.example](../.env.production.example) — that template is
the authoritative variable inventory (CI enforces that every variable production code reads is
documented there; `tests/prod-env-template.test.ts`). The short version:

**Required:** `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`, `DATABASE_URL` (host `db`),
`SESSION_SECRET` (`openssl rand -hex 32`), `PUBLIC_BASE_URL` (your https origin, no trailing slash),
`STORAGE_ROOT` (`/app/storage` — matches the compose volume), `MEDIA_URL_SECRET`
(`openssl rand -hex 32`), and `OPENROUTER_API_KEY` — the LLM brain; it powers **all text roles and
Media Studio image generation**.

**Optional (feature-gating; absent → that feature reports blocked, never faked):** `FAL_KEY`
(video/audio/3d media only — images do NOT need it), `APIFY_API_TOKEN` (canonical name; the legacy
alias `APIFY_API_KEY` still works), `TAVILY_API_KEY`, `ELEVENLABS_API_KEY`, `DATAFORSEO_AUTH`,
`ZERNIO_API_KEY` + `ZERNIO_WEBHOOK_SECRET`, `N8N_WEBHOOK_SECRET`, `INTELLIGENCE_WEBHOOK_SECRET`,
`PLAUSIBLE_API_KEY` + `PLAUSIBLE_SITE_ID` (+ `PLAUSIBLE_HOST` if self-hosted),
`OPENROUTER_MEDIA_TIMEOUT_MS`, `EMBEDDING_API_KEY`.

**There is no shared password.** Authentication is per-founder Postgres accounts (step 6). If you see
`SHARED_LOGIN_PASSWORD_HASH_B64` in any older notes, ignore it — it is retired and unused.

**Rotate every credential that was ever pasted into a chat, log, or ticket before production.**

## 4. Deploy

```bash
bash scripts/deploy.sh /etc/wobble/wobble.env
```

What it does, in order:
1. validates the env file and exports it as `WOBBLE_ENV_FILE` (compose `env_file` for app + workers);
2. `git pull --ff-only` on the **currently checked-out branch** (see step 2);
3. derives `WOBBLE_BUILD_ID` from `git rev-parse HEAD` — every image is stamped with the deployed SHA;
4. `docker compose config` validation, then `docker compose up -d --build`:
   - `db` — `pgvector/pgvector:pg16`, durable `wobble_pgdata` volume, private network only;
   - `migrate` — applies ALL drizzle migrations (currently `0000` … `0063`) and exits; `app` waits for it;
   - `app` — Next.js standalone on `127.0.0.1:3000`;
   - `worker` — general job queue + the singleton scheduler (Postgres advisory-lock leader election);
   - `worker-video` — the media queue;
5. polls `GET /api/health/ready` (180 s timeout) and **fails the deploy** if the stack never becomes
   READY — readiness includes DB, storage, workers heartbeating, and **build-id parity across services**.

## 5. Verify

```bash
curl -fsS http://127.0.0.1:3000/api/health          # {"status":"healthy","db":"up"}
curl -fsS http://127.0.0.1:3000/api/health/ready     # aggregate readiness, all components
curl -fsS http://127.0.0.1:3000/api/health/version   # every service reports the deployed SHA
```

## 6. Founder accounts (per-founder credentials — no shared password)

After the first successful deploy (migrations + seed applied), create each founder's credential. The
password is read from stdin (not echoed) or `WOBBLE_BOOTSTRAP_PASSWORD`; it is never logged and never
lives in an env file. Run it inside the `worker` container — that image carries the TypeScript runtime
and already has the private-network `DATABASE_URL` (the DB publishes no host port; the standalone
`app` image deliberately has no tooling):

```bash
C="docker compose -f docker-compose.prod.yml --env-file /etc/wobble/wobble.env"
$C exec -it worker npm run auth:bootstrap -- --founder founder_moiz    --email moiz@yourdomain.com --super-admin
$C exec -it worker npm run auth:bootstrap -- --founder founder_ali     --email ali@yourdomain.com
$C exec -it worker npm run auth:bootstrap -- --founder founder_ibrahim --email ibrahim@yourdomain.com
$C exec -it worker npm run auth:bootstrap -- --founder founder_haad    --email haad@yourdomain.com
```

## 7. TLS reverse proxy

Point your domain at the box and proxy `443 → 127.0.0.1:3000` (Caddy does TLS automatically; certbot
for nginx). Webhook paths (`/api/webhooks/*`, `/api/n8n/*`) enforce their own HMAC signatures and are
safe to expose. See "Intelligence webhook signing" below for producer requirements.

## 8. Post-deploy smoke test

1. `https://<your-domain>` → log in as a founder (per-founder credentials from step 6).
2. Ask WOBBLE a question → proves DB + OpenRouter + retrieval.
3. **Daily Brief** → renders ranked live signals.
4. **Settings** → each configured integration shows connected.
5. **Workers** → general + media heartbeats online, build id = deployed SHA.
6. **Media Studio** → generate one image (runs on OpenRouter; no FAL needed).

## 9. Backups (real DR, not the JSON export)

Use the database-native scripts (the in-app Backup module's JSON export is a convenience, not DR):

```bash
# Nightly cron on the VPS — pg_dump of the ENTIRE DB (checksummed, optional AES-256) + tar of media:
DATABASE_URL=... STORAGE_ROOT=... bash scripts/backup-db.sh

# Restore (DESTRUCTIVE — requires CONFIRM=yes; verifies the checksum first, decrypts if needed):
CONFIRM=yes DATABASE_URL=<target> bash scripts/restore-db.sh <backup artifact>

# Periodic restore drill into a scratch DB (proves backups actually restore):
bash scripts/dr-drill.sh
```

## 10. Rollback (code and/or data)

Roll back to the previous **known-good Git SHA** (record one per deploy):

```bash
cd /opt/wobble-os
git fetch origin
git checkout <previous-known-good-sha>
bash scripts/deploy.sh /etc/wobble/wobble.env   # rebuilds + redeploys THAT sha; readiness-gated
```

- Migrations are additive; rolling back the code past a migration boundary is safe for reads/writes
  the old code performs. If a bad deploy corrupted data, additionally restore the last pre-deploy
  backup: `CONFIRM=yes bash scripts/restore-db.sh <last-good-backup>` (destructive — take a fresh
  backup of the broken state first for forensics).
- After any rollback, re-run the smoke test (step 8) and verify `/api/health/version` reports the
  SHA you intended.

## 11. Updating a running deployment

```bash
cd /opt/wobble-os
git rev-parse --abbrev-ref HEAD    # CONFIRM the branch is the one you mean to deploy
bash scripts/deploy.sh /etc/wobble/wobble.env
```

`deploy.sh` fast-forwards the checked-out branch, rebuilds with the new SHA as the build id, and the
readiness gate blocks the update if anything regresses. Scaling: additional `worker` replicas are safe
— job claims use `FOR UPDATE SKIP LOCKED` plus a per-job execution lease (owner + expiry +
compare-and-set), and the scheduler elects exactly one leader via a Postgres advisory lock.

---

### Intelligence webhook signing and replay protection

Every `POST /api/webhooks/intelligence` producer must send:

- `X-Wobble-Timestamp`: current Unix seconds;
- `X-Wobble-Producer`: a stable producer slug such as `apify_scout`;
- `X-Wobble-Idempotency-Key`: a unique delivery/event identifier from that producer;
- `X-Wobble-Signature`: hex HMAC-SHA256 using `INTELLIGENCE_WEBHOOK_SECRET`.

The signed bytes are `timestamp + "." + JSON.stringify({producer,deliveryId}) + "." + rawBody`, with
the context JSON keys in exactly that order. The server validates the signature and timestamp before
atomically reserving a durable producer-scoped delivery claim. Exact replays and identifier/payload
conflicts return HTTP 409 without another intelligence insert. Claims are retained for 30 days and
purged by scheduled maintenance; signatures, secrets, and raw delivery identifiers are not stored.

### Media capability scope (release candidate — truthful)

- OpenRouter **text**: operational (all LLM roles).
- OpenRouter **image** generation (+ reference-image/edit where the routed model supports it): operational, live-proven.
- OpenRouter video/audio/3d: **not implemented** — do not expect them from the OpenRouter adapter.
- fal.ai video/audio/3d: optional; honestly `blocked` without `FAL_KEY`; never auto-selected for images.
- HyperFrames reels: deliberately **parked** (not part of this release candidate).
