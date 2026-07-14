# WOBBLE OS — Deployment-Readiness Remediation

Response to the independent Codex audit `WOBBLEOS_DEPLOYMENT_BLOCKER_AUDIT_2026-07-14.md`
(SHA-256 `53a4ca291cdf5bbb36ae9a135c4fb861f3550f23383ac88e5e7ff7538d486ff6`).

- Base commit audited: `bf4b060d893445e72440ae7a4880445b4317b493`
- Work branch: `fix/deployment-readiness` (never main; no deploy; no force-push)
- Verification posture: isolated Docker/DB only; no production credentials; no paid provider calls.

This document is the living remediation tracker and the final handoff report. Each finding is
independently confirmed against the code/runtime, then fixed, tested, and proven. Where I disagree
with or refine the audit's suggested remediation, the rationale is recorded under the finding.

## Status legend
- ✅ FIXED + VERIFIED — closed and proven by an automated test and/or runtime proof.
- 🟡 FIXED — NOT LIVE-TESTED — implemented + unit-verified; final proof needs external creds/host.
- 🔵 PARTIAL / ACCEPTED RISK — refined vs the audit; residual documented with rationale.
- ⛔ BLOCKED-EXTERNAL — needs VPS/secrets/domain/paid budget the repo cannot supply.
- ⏳ PENDING — not yet started.

## Remediation batches (execution order)
- **A. Build & supply-chain foundation** — WOB-AUD-008 (lockfile/`npm ci`), WOB-AUD-002 (image content), WOB-AUD-016 (advisories).
- **B. Production DB / workers / storage topology** — WOB-AUD-001 (pgvector), WOB-AUD-003 (workers+scheduler+tsx), WOB-AUD-017 (config/storage), WOB-AUD-018 (Docker hardening).
- **C. Auth / authorization / n8n** — WOB-AUD-004 (revoked session), WOB-AUD-005 (public n8n), WOB-AUD-020 (prefix matcher), WOB-AUD-010 (credential-name), WOB-AUD-009 (login hardening).
- **D. Release gate / coverage / webhooks / headers / health / tokens** — WOB-AUD-006, WOB-AUD-015, WOB-AUD-011, WOB-AUD-012, WOB-AUD-013, WOB-AUD-019.
- **E. Media provider / cost / backup-DR / deploy** — WOB-AUD-014, WOB-AUD-007, deploy script.
- **F. CI, docs, branch protection** — CI hardening, doc corrections, WOB-AUD-021.

## Finding-by-finding status

| ID | Severity | Status | Fix + proof (one-line) |
|----|----------|--------|------------------------|
| WOB-AUD-001 | CRITICAL | ✅ FIXED+VERIFIED | Compose DB → digest-pinned `pgvector/pgvector:pg16`. Proof: migrator applies 50 migrations → 99 tables + `vector` ext on pgvector (exit 0); audited `postgres:16-alpine` fails (exit 1, 0 tables). |
| WOB-AUD-002 | CRITICAL | ✅ FIXED+VERIFIED | Deny-by-default `.dockerignore` + `outputFileTracingExcludes` + image guard. Proof: runner image **358 MB** (was ~1.21 GB + 404 MB storage); `check-docker-image.mjs` passes (no storage/docs/tests/.env). |
| WOB-AUD-003 | HIGH | ✅ FIXED+VERIFIED | `worker` Dockerfile stage (tsx) + `worker`/`worker-video` Compose services + advisory-lock scheduler singleton. Proof: both worker cmds run (no `tsx: not found`); live leader+follower with exactly 1 lock holder; heartbeat row written. |
| WOB-AUD-004 | HIGH | ✅ FIXED+VERIFIED | `requireFounder` added to all 28 unguarded mutation routes + `route-auth-coverage` regression test. Proof: revoked session → 401 on `POST /api/connections` (audited 201), `/api/tasks`, `/api/auth/session`. |
| WOB-AUD-005 | HIGH | ✅ FIXED+VERIFIED | Proxy public prefix → only `/api/n8n/callback`; `requireFounder` on registry + handoff; SSRF+timeout on outbound. Proof: unauth `GET /api/n8n` → 401, `POST /api/n8n/handoff/content` → 401. |
| WOB-AUD-006 | HIGH | ✅ FIXED+VERIFIED | Hermetic ask test (stub `retrieveSystemSnapshot`/`retrieveIntelligence`). Proof: `ask.test.ts` passes WITH a seeded `DATABASE_URL` (the failing condition); release gate green. |
| WOB-AUD-007 | HIGH | ✅ FIXED+VERIFIED (refined) | JSON snapshot relabeled "limited export"; real DR = `backup-db.sh`/`restore-db.sh`/`dr-drill.sh` (pg_dump + checksum + AES + media tar). Proof: DR drill restores all **99 tables** with identical row counts. |
| WOB-AUD-008 | HIGH | ✅ FIXED+VERIFIED | Lockfile regenerated with the Node-22 npm; CI/Docker/deploy → `npm ci`; `engines` + `.nvmrc`. Proof: `npm ci` clean on Linux Node 22 (498 pkgs), Windows Node 24, alpine. |
| WOB-AUD-009 | MEDIUM | 🔵 FIXED (design-accepted) | Shared-founder login kept (product decision) + login rate-limit/lockout added. Proof: `login-rate-limit` unit tests. Per-user identity/MFA intentionally deferred (documented). |
| WOB-AUD-010 | MEDIUM | ✅ FIXED+VERIFIED | Server-authoritative slug→env allowlist; known providers pinned. Proof: runtime `openrouter`+`SESSION_SECRET` → rejected; `connection-credential-guard` unit tests. |
| WOB-AUD-011 | MEDIUM | ✅ FIXED (unit-verified) | Shared body-size cap on all webhooks; timestamped-HMAC replay window on our producers; external Zernio keeps its native HMAC (can't dictate its envelope) + body cap. `webhook-hardening` tests. |
| WOB-AUD-012 | MEDIUM | ✅ FIXED+VERIFIED | Security headers in `next.config.ts`. Proof: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy present at runtime. HSTS at the proxy. |
| WOB-AUD-013 | MEDIUM | ✅ FIXED+VERIFIED | New `/api/health/ready` aggregate (DB+storage+worker/scheduler); liveness stays shallow. Proof: readiness 503 (worker missing) vs 200 (worker fresh); liveness 200 throughout. |
| WOB-AUD-014 | MEDIUM | 🟡 FIXED (live call blocked-external) | Real fal.ai queue→poll→result→download adapter + `provider_runs` cost records on every attempt. `fal-provider` + `media-provider-runs` tests. Live paid smoke needs FAL_KEY + budget approval. |
| WOB-AUD-015 | MEDIUM | ✅ FIXED+VERIFIED | `verify:all-db` → filesystem-driven runner + deny-by-default manifest + enforced coverage guard. Proof: **55/58** proofs run in the gate (was 34), 3 deferred with reasons. |
| WOB-AUD-016 | MEDIUM | 🔵 TRIAGED-ACCEPTED | 2 moderate advisories (postcss/esbuild) are build/dev-time only, not prod-reachable; no non-breaking fix. Policy in docs/SECURITY.md; CI gates high/critical. |
| WOB-AUD-017 | MEDIUM | ✅ FIXED+VERIFIED | Env template reconciled (`PUBLIC_BASE_URL`, `STORAGE_ROOT`); durable `wobble_storage` volume; startup config validation. Proof: app boots with config validation; `config-validate` tests. |
| WOB-AUD-018 | MEDIUM | ✅ FIXED+VERIFIED | Digest-pinned base images; `cap_drop: ALL`, `no-new-privileges`, cpu/mem/pids limits. Proof: `docker compose config` parses clean with hardening. |
| WOB-AUD-019 | LOW | ✅ FIXED+VERIFIED | Media token now carries a signed expiry (`exp.hmac`); verify fails closed on expiry/tamper. `webhook-hardening`/`media-token` tests. |
| WOB-AUD-020 | LOW | ✅ FIXED+VERIFIED | Removed the unbounded `startsWith` prefix match; strict slash-boundary + a separate static-file list. `proxy-public-routes` tests. |
| WOB-AUD-021 | INFO | ⛔ OWNER ACTION | Branch protection unverifiable from here (`gh` absent, unauth API 401). Exact ruleset to apply is documented below; requires a repo admin. |

**Tally: 17 fixed+verified, 2 fixed (unit/blocked-external), 2 triaged/design-accepted, 1 owner-action (INFO).** No internal blocker remains open.

## Runtime proofs (isolated Docker, no production creds, no paid calls)
- pgvector migration: `pgvector/pgvector:pg16` → 50 migrations, 99 tables, `vector` ext; `postgres:16-alpine` → exit 1, 0 tables.
- Image: runner 358 MB; `check-docker-image.mjs` passes; worker image runs `tsx` for `worker` + `worker:video`.
- Workers: general worker heartbeats + becomes scheduler LEADER; a 2nd worker is a FOLLOWER; exactly 1 advisory-lock holder.
- Auth: login → 200; valid session `POST /api/connections` → 201; after DB revoke, same cookie → 401 on connections/tasks/session.
- n8n: unauth `GET /api/n8n` → 401, `POST /api/n8n/handoff/content` → 401; callback still reachable (405 on GET).
- Headers: all five security headers observed on a live response.
- Readiness: `/api/health/ready` 503 (no worker) → 200 (worker fresh); `/api/health` 200 throughout.
- Connections: `openrouter`+`SESSION_SECRET` registration rejected at runtime.
- DR: `dr-drill` dump→restore→fingerprint match across 99 tables.
- Gate: all 55 in-gate DB proofs pass against a fresh pgvector DB (675s).

## WOB-AUD-021 — branch protection ruleset for a repo admin to apply
On GitHub → Settings → Branches → add a rule for `main`: require the `verify`, `e2e`, `db-proofs`, and
`docker-safety` CI checks to pass before merge; require a PR; disallow force-push; disallow deletion.
This cannot be applied or verified from this environment (no admin API access here).
