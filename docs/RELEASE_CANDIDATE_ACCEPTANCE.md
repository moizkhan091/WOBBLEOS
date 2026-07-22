# WOBBLE OS — Release Candidate Acceptance Record

> The single authoritative record of what this release candidate IS, what was verified, how, and what
> remains external. Nothing in here is aspirational: every PASS below names the mechanism that proved it.

## Identity

| Item | Value |
|---|---|
| Branch | `feat/founder-accounts-local-uat` |
| Release-candidate SHA | `e92e17a89e9c68c38ae6b55b3b9dc6175d4791cf` (drill executed at `bf59315`; this SHA adds the two UI fixes + this record, both verified by CI + the full suite) |
| Base verified SHA (previous green) | `3d3217699194b1315a738647c1155a87e12fb85c` |
| `main` (untouched by this pass) | `c4831d34f18c40017b874485de377675c72f80d3` |
| Migration head | `0063_large_apocalypse` (migrations `0000`…`0063`, applied by the compose `migrate` service) |
| Node requirement | `>=22.0.0 <25.0.0` (package.json engines; containers ship Node 22) |

## CI conclusions

| Gate | Result |
|---|---|
| GitHub CI on `3d32176` (run 29861128204) | **success** — all 4 jobs |
| — typecheck + test + build | success |
| — integrated DB-proof gate (all proofs vs pgvector) | success |
| — e2e browser gate (Playwright) | success |
| — docker image content safety + worker runtime | success |
| GitHub CI on the RC SHA `bf59315` | **success** (typecheck+test+build, DB-proof gate, Playwright e2e, docker safety) |

## Verification results (this acceptance pass)

| Item | Result | Mechanism |
|---|---|---|
| Unit tests | **1358 / 1358 passed** (163 files, 0 failures) at the RC SHA | `npm run test` (vitest) |
| DB proofs | 63 run / 66 total, 0 failures (3 manifest-skipped with reasons) | `scripts/run-all-db-proofs.mjs` vs fresh migrated pgvector (:15499) |
| Production env-template guard (NEW) | PASS (6 tests) | `tests/prod-env-template.test.ts` — every `process.env.*` production read must be documented in `.env.production.example` or exempted with a reason; pins `APIFY_API_TOKEN` canonical; bans the retired shared-login var |
| Cross-system client isolation (NEW) | PASS — ~45 assertions, 0 foreign canaries | `src/scripts/verify-client-isolation-cross-db.ts` (auto-discovered by the CI DB gate) |
| Task-inventory + ledger isolation | PASS | `src/scripts/verify-client-isolation-ledger-db.ts` |
| Media integration (image) | PASS — live 4¢ call through the durable pipeline | `src/scripts/accept-media-image-quality.ts` (deliberately NOT in the CI gate — paid) |
| Media output QUALITY | PASS for V1 image scope (see below) | Human/agent visual evaluation of the produced artifact |
| Clean deployment drill | **PASS** — all 21 steps (full record below) | Fresh clone + fresh volumes, project `wobble-drill` |
| Backup → restore → fingerprint compare | **PASS** — source == restored | pg_dump `-Fc` in-container → `pg_restore` to disposable DB → row-count/table-count compare |
| Build-ID parity in the deployed stack | **PASS** — app + worker + worker-video all on the RC SHA | `/api/health/version` `parity.ok: true` |
| Auth gate in the production container | **PASS** — cookie → 200, no cookie → **401** | live check against the drill stack |

## Client-isolation acceptance (P0 gate)

Canaries: Alpha Dental `ALPHA-ONLY-7QK9` · Beta Construction `BETA-ONLY-4M2P` · Gamma SaaS `GAMMA-ONLY-9X3D`.
`verify-client-isolation-cross-db.ts` proves, against live Postgres, that **no foreign canary crosses a
client boundary** on:

1. **Memory retrieval** — client-private banks are deny-by-default: a caller granted only Alpha retrieves
   only Alpha's private memory; an UNGRANTED caller (the default for Ask WOBBLE and content generation)
   retrieves **no client-private memory at all**.
2. **Company-scoped reads** — meetings and CRM contacts scoped to a company return only that client's canary.
3. **Ownership integrity** — every opportunity/audit/proposal row links to exactly its own company and
   carries only its own canary.
4. **Content** — packets are track-scoped; listing a client's track returns only its canary.
5. **Provider prompts** — the REAL content-generation prompt for Alpha's track (captured via injected
   provider on the real assembly path) contains Alpha's context and **no** Beta/Gamma canary; the Ask
   WOBBLE default prompt contains **no client-private canary at all**.
6. **Media jobs** — client-scoped rows; a foreign-scoped query cannot see another client's job.
7. **Job queue under concurrency + retry** — two workers with execution leases claim two client jobs
   exactly once each; each claimed payload carries only its own client's canary; a requeued (retried)
   job's payload is byte-identical (no cross-contamination).
8. **n8n callback** — a signed callback publishes exactly the named client's post; its audit trail carries
   no foreign canary.

**Recorded findings (truthful scope, not failures):**
- The OS is a single-company internal OS: founder-facing list endpoints (opportunities, proposals, audits,
  jobs) are global by design and session-gated (enforced by `tests/route-auth-coverage.test.ts`); "clients"
  are WOBBLE's clients, not tenants who log in.
- The n8n callback's authorization is the shared HMAC secret; it has **no per-entity tenant check**
  (`markPostPublished` checks state, not ownership). Acceptable under the current single-company trust
  model (only WOBBLE's own n8n holds the secret); MUST be revisited before any multi-tenant exposure.
- `retrieveMemoryContext` has an explicit-`bankSlugs` path that bypasses the client-bank deny filter; its
  only production caller is the founder-facing (session-gated) ask-tools surface. Same revisit note.
- The backup JSON export (`exportSnapshot`) is a founder-only whole-company artifact (session-gated route);
  it is NOT a client deliverable and there is no client-facing export surface.

## Media capability scope (truthful)

| Capability | Status |
|---|---|
| OpenRouter text (all LLM roles) | **Operational** |
| OpenRouter image generation | **Operational, live-proven** (4¢ acceptance below) |
| OpenRouter reference-image / edit path | Implemented (multimodal `params.referenceImages` data-URLs) where the routed model supports it |
| OpenRouter video / audio / 3d | **Not implemented** — the adapter hard-rejects non-image kinds with a truthful error |
| fal.ai video / audio / 3d | Optional; honestly `blocked` without `FAL_KEY`; never auto-selected for images |
| HyperFrames reels | **Deliberately parked** — not part of this release candidate |

**Image-quality acceptance** (`accept-media-image-quality.ts`, one controlled 4¢ call): realistic client
brief (Alpha Dental Instagram ad, exact headline/subline, brand-reference image as multimodal context)
through the full durable pipeline (`createMediaJob` → media worker → stored PNG). Visual evaluation of
`storage/media/454e0421e3053e166de9a40f96ee96e2.png`:
- prompt adherence: strong (exact copy rendered, correct scene, 1:1, no faces/clutter/watermark);
- composition: good hierarchy, thumbnail-legible;
- typography: correctly spelled, clean sans; minor AI letterform softness under zoom — **fit for social
  feed, not for print/large format**;
- brand/reference fidelity: reference's dark editorial lighting carried;
- artifacts: minor (soft background objects), not disqualifying at channel size;
- channel suitability: yes (IG ad).
Evidence: job `mediajob_72a56104-…`, `actualCostCents: 4`, audits `media.job_created` + `media.job_succeeded`,
alpha-scoped with zero foreign canary, beta-scoped query sees nothing.
**Verdict: PASS for Media Studio V1 (image) scope.**

## Production environment inventory

The authoritative inventory is [.env.production.example](../.env.production.example), enforced by
`tests/prod-env-template.test.ts` (a production-read env var missing from the template fails CI).

Required: `POSTGRES_USER` `POSTGRES_PASSWORD` `POSTGRES_DB` `DATABASE_URL` `SESSION_SECRET`
`PUBLIC_BASE_URL` `STORAGE_ROOT` `MEDIA_URL_SECRET` `OPENROUTER_API_KEY`.
Optional (feature-gating): `OPENROUTER_MEDIA_TIMEOUT_MS` `EMBEDDING_API_KEY` `FAL_KEY` `APIFY_API_TOKEN`
(canonical; legacy alias `APIFY_API_KEY` accepted in code) `TAVILY_API_KEY` `ELEVENLABS_API_KEY`
`DATAFORSEO_AUTH` `ZERNIO_API_KEY` `ZERNIO_WEBHOOK_SECRET` `N8N_WEBHOOK_SECRET`
`INTELLIGENCE_WEBHOOK_SECRET` `PLAUSIBLE_API_KEY` `PLAUSIBLE_SITE_ID` `PLAUSIBLE_HOST`.
Tuning/runtime-internal vars (safe defaults, not operator-facing) are enumerated with reasons in the
guard test's `EXEMPT` map.

**Naming fix in this pass:** the Apify credential is canonically `APIFY_API_TOKEN` everywhere
(templates, Settings screen, connections registry, error messages); `APIFY_API_KEY` remains a
code-level backward-compatible alias so an existing deploy keeps working.

## Rollback procedure

See [VPS_DEPLOYMENT.md §10](VPS_DEPLOYMENT.md): `git checkout <previous-known-good SHA>` →
`bash scripts/deploy.sh /etc/wobble/wobble.env` (readiness-gated rebuild at that SHA); if data was
corrupted, additionally `CONFIRM=yes bash scripts/restore-db.sh <last-good-backup>` (destructive;
back up the broken state first). Verify `/api/health/version` afterwards.

## Clean deployment drill record

Executed against a **fresh clone** (`/c/Users/moizk/wobble-rc-drill`) with **fresh Docker volumes**, compose
project `wobble-drill`, an external throwaway env file, and synthetic credentials only. No production
credentials, nothing published. Port 3177 was used because the local dev UAT stack already held 3000
(drill-only override file; the shipped compose is unchanged).

| Step | Result |
|---|---|
| 1. Fresh clone | ✅ clean clone of the repo |
| 2. Checkout exact RC branch + SHA | ✅ `feat/founder-accounts-local-uat` @ `bf59315` verified with `git rev-parse` |
| 3. External temp env file | ✅ created outside the checkout, synthetic secrets |
| 4. Compose validation | ✅ `docker compose config` OK |
| 5. Build all images | ✅ all stages built (app/runner, worker, migrator) |
| 6. Start db + migrate | ✅ **64 migrations applied from scratch** (`0000`…`0063`) on an empty volume |
| 7. Start app + worker + worker-video | ✅ all containers healthy |
| 8. **Build-ID parity** | ✅ `/api/health/version`: app, worker, worker-video ALL report `bf59315…`, `fresh: true`, `parity.ok: true` |
| 9. Bootstrap synthetic founders | ✅ `db:seed` created the 4 founder profiles; `auth:bootstrap` set a credential **inside the `worker` container** — exactly the documented procedure |
| 10. Aggregate readiness | ✅ `/api/health/ready` → `ready`: database, storage, worker (`fresh, online`), video-worker (`fresh, running`), version-parity all OK |
| 11. Browser login | ✅ authenticated session in the browser (`authenticated: true, founder: Moiz, isSuperAdmin: true`); OS shell, Ask, Daily Brief, Command Center all render |
| 12. Ask WOBBLE | ✅ module renders with live greeting + model selector (a **real bug found + fixed here**, see below) |
| 13. Research workflow | ✅ **ran autonomously** in the fresh stack: `scheduler.tick` → `department.consumed` → `content_intelligence.started` → `model.run.succeeded` → `content_topics.generated`, spend `$0.01` real `model_runs` |
| 14. Image-generation workflow | ✅ proven separately at 4¢ through the same durable pipeline (see Media section) |
| 15. Worker heartbeats | ✅ both general + media heartbeating fresh in `/api/health/ready` |
| 16. Restart every service | ✅ `docker compose restart` — all services returned healthy and READY |
| 17. DB + media persistence | ✅ fingerprint IDENTICAL across restart (audit_logs=44, auth_sessions=3, founder_profiles=4, model_runs=1); storage files unchanged; **the DB-backed session stayed valid (200)** |
| 18. Backup | ✅ `pg_dump -Fc` → 306,356 bytes, SHA-256 recorded |
| 19. Restore into a disposable DB | ✅ `pg_restore --clean --if-exists` into `drill_restore_test`, exit 0 |
| 20. Fingerprint compare | ✅ **source == restored**: audit_logs=44, founder_profiles=4, model_runs=1, 113 public tables in BOTH |
| 21. Teardown | ✅ disposable project + volumes removed; the pre-existing local UAT stack untouched |

### Findings from the drill (all fixed in this pass)

1. **P1 — the greeting was pinned to "Late night grind" at every hour.** The route read
   `Number(u.searchParams.get("hour"))`; an absent param is `null` and `Number(null)` is `0`, which
   *passes* a `0..23` range check — so the hour was always 0 (late_night) and the server-clock fallback
   was unreachable. The client also never sent the founder's local hour, so even a correct fallback would
   have used UTC. Fixed both ends (presence-checked parse incl. blank `?hour=`, client sends its local
   hour) + 7 regression tests (`tests/greeting-hour-param.test.ts`).
2. **P1 — the OS was unusable on a phone.** The 262px sidebar never collapsed: on a 375px viewport it
   left **113px** for content (headings clipped, body text wrapping one word per line). Added a viewport
   breakpoint (860px) that turns the sidebar into an off-canvas drawer with a topbar menu button and a
   dimmed scrim; desktop layout is byte-identical (verified both ways in the browser).
3. **Polish — the sidebar permanently told founders "Dashboard build in progress".** Hardcoded and stale
   (all 45 modules are wired). Now derived from the module registry: "All modules live · 45 modules ·
   real data, never faked", so it can never drift from reality again.
4. **Correct-by-design, worth stating:** the production session cookie is `Secure`, so a browser cannot
   hold it over plain `http://`. Browser login therefore REQUIRES the TLS reverse proxy — exactly as the
   deployment guide mandates. (`SESSION_COOKIE_INSECURE` exists for localhost only and must never be set
   in production.)

### Remaining UI/UX observations (recorded, NOT fixed — no scope creep in an RC pass)

- Recent Activity renders raw machine event names (`content_intelligence.completed`,
  `model.run.succeeded`) rather than human phrasing; and repeats the full date on every row when all
  entries are the same day.
- "Live pages wired — 45 of 45 modules" is a build metric on a founder-facing KPI card.
- Ask WOBBLE and Daily Brief leave a large empty region below the fold on tall screens.

## Remaining requirements — EXTERNAL ONLY

1. **VPS access** (SSH to the production host).
2. **Production domain + DNS + TLS** (reverse proxy in front of `127.0.0.1:3000`).
3. **Newly rotated production credentials** — every API key that was ever pasted into a chat, log, or
   ticket during development MUST be rotated before production use. Known-exposed during development:
   the OpenRouter dev key and the Apify dev token (both present in the local `.env` and surfaced in
   working sessions). Rotate BOTH at their providers and fill fresh values only into the external
   `/etc/wobble/wobble.env`.
4. **Provider balances** — OpenRouter credit is the gate for the whole AI layer (text + Media Studio
   images); optional providers per the inventory above.

## Parked / optional capabilities (explicitly out of RC scope)

- HyperFrames reels (authoring-quality pass pending — real-reel exemplars, contrast/overflow, script).
- fal.ai video/audio/3d (needs `FAL_KEY` + budget approval for any live proof).
- ElevenLabs voice, DataForSEO, Zernio auto-posting, Plausible analytics — each inert-until-keyed.
