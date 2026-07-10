# WOBBLE OS — VPS Deployment Guide

Everything you need to move WOBBLE OS from the dev laptop to a Linux VPS. The app is production-ready: full migrations, honest empty states, founder-gated mutations, HMAC-verified webhooks (fail-closed), and a job queue with a stalled-job reaper.

## 1. Server prerequisites

- **Ubuntu 22.04+ (or any Linux)** with **Node.js 20+** and **npm**.
- **PostgreSQL 16 with the `pgvector` extension** (the OS uses 1536-dim embeddings). Easiest: run the same `pgvector/pgvector:pg16` image via Docker, or install `postgresql-16` + `postgresql-16-pgvector`.
- A domain + **nginx** (or Caddy) in front for TLS. The Next server binds to `127.0.0.1` by design — the reverse proxy is the only thing exposed publicly.
- Optional: `pm2` or a `systemd` unit to keep the web + worker processes alive.

## 2. Get the code + install

```bash
git clone <your repo> /opt/wobble-os && cd /opt/wobble-os
npm ci
```

## 3. Configure the environment

Copy `.env.example` → `.env` and fill it in. **Required for a working deploy:**

| Var | What |
|---|---|
| `DATABASE_URL` | `postgres://user:pass@localhost:5432/wobble_os` |
| `SESSION_SECRET` | random ≥32 chars (`openssl rand -base64 48`) |
| `SHARED_LOGIN_PASSWORD_HASH_B64` | run `npm run auth:hash -- "your-team-password"` and paste the printed `_B64` line |
| `OPENROUTER_API_KEY` | the LLM brain — nothing AI works without it |
| `PUBLIC_BASE_URL` | `https://os.wobble.com` (no trailing slash) — used for media URLs + webhooks |
| `STORAGE_ROOT` | an absolute **Linux** path, e.g. `/var/lib/wobble-os/storage` (the default is a Windows path — change it) |

**Set these to turn features on (fail-closed / inert until set):**
- `ZERNIO_API_KEY` + `ZERNIO_WEBHOOK_SECRET` → auto social posting.
- `APIFY_API_KEY` → website/social scraping + the Competitor Scout.
- `INTELLIGENCE_WEBHOOK_SECRET` → the `/api/webhooks/intelligence` ingestion pipe (503s until set).
- `N8N_WEBHOOK_SECRET` → n8n handoff.
- `PLAUSIBLE_API_KEY` + `PLAUSIBLE_SITE_ID` → live Website Analytics.
- Per-role `*_MODEL` overrides are all optional (sensible defaults in `src/db/seed-runner.ts`).

**Rotate every key that was ever pasted into a chat.**

## 4. Database: migrate + seed

```bash
npm run db:migrate   # applies all migrations (0000 … 0025) — schema is in sync, zero drift
npm run db:seed      # seeds provider connections, model roles, agents, memory banks, trust levels
```

## 5. Build + run (two processes)

```bash
npm run build        # production build (must be clean)
npm run start        # web server on 127.0.0.1:3000
npm run worker       # SEPARATE process — the background job worker (content/knowledge/audit/publishing/intelligence jobs)
```

Run `start` and `worker` as **two** long-lived processes (pm2 `pm2 start npm --name wobble-web -- run start` + `pm2 start npm --name wobble-worker -- run worker`, or two systemd units). The worker self-heals: it reclaims jobs stranded by a crash every ~30 idle cycles.

## 6. nginx (TLS + reverse proxy)

Point your domain at the box, then proxy `443 → 127.0.0.1:3000`. Ensure webhook paths are reachable (`/api/webhooks/*`, `/api/n8n/*`) — they enforce their own HMAC signatures, so they're safe to expose. Get a cert via certbot.

## 7. Post-deploy smoke test

1. Visit `https://os.wobble.com` → log in with the shared password.
2. Ask WOBBLE a question → confirms DB + OpenRouter + retrieval.
3. **Settings** module → every integration you set shows "connected"; model roles + providers list.
4. **Workers** module → the worker heartbeat shows online.
5. Create a lead → convert → win the deal → confirm a Project auto-creates.
6. (If Apify set) run a Competitor Scout on an IG handle → items land pending in the Intelligence Inbox → approve one → confirm generators pick it up.

## 8. Operational notes

- **Backups**: the Backup module exports a full JSON snapshot on demand; also take regular `pg_dump` of the database.
- **Secrets**: never commit `.env`; it's gitignored.
- **Scaling**: run more `worker` processes to increase job throughput (the queue uses `FOR UPDATE SKIP LOCKED`, so workers don't collide).
- **Node**: pin Node 20+ (there's no `engines` gate; use nvm/`.nvmrc` if you want to enforce it).
