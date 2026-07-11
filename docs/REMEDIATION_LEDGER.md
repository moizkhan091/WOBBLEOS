# WOBBLE OS — Remediation Ledger

Durable state for the deep-audit remediation. A resumed session continues from here.
Source audits: `MODULE_DEEP_AUDIT.md`, `MODULE_DEEP_AUDIT_SUPPLEMENT.md`.
**Rule:** a finding is `fixed-verified` only when the real behaviour was demonstrated (not just edited). Verify every finding against current code before fixing — the audit had ≥1 false positive (vector indexes).

Branch: `main` · Last green HEAD: `0e8a414` · CI = Node 22 `typecheck → test → build` (485 tests).

## CRITICALS — all 6 closed ✅
| # | Finding | Status | Commit | Proof |
|---|---|---|---|---|
| C1 | No scheduler → cadence agents never run | fixed-verified | 9ac93a2 | live tick + event-bus fired a job e2e |
| C2 | Automations event rules never fire | fixed-verified | 9ac93a2 | audit event → rule → job enqueued (live) |
| C3 | Automations schedule never fires | fixed-verified | 9ac93a2 | scheduler tick drives cron rules |
| C4 | Media Studio facade marked "wired" | fixed-verified | 68f6b9c | relabeled roadmap; API/UI honest |
| C5 | Source intake non-functional | fixed-verified | 39c223c | example.com scraped → 1 chunk + embedding (live) |
| C6 | Ask agent brain unreachable from UI | fixed-verified | 0e8a414 | ⚡Agent toggle + pinned confirm panel wired |

## HIGH — fixed
| Finding | Status | Commit |
|---|---|---|
| Hot-path indexes (model_runs, approvals) | fixed-verified | bd0ed8b |
| Revenue counts reversed invoices + undercount cap | fixed-verified | ded6ef8 |
| Intelligence: client-scope leak in analyst | fixed-verified | 7e4f829 |
| Intelligence: prompt-injection fencing (analyst/dreamer) | fixed-verified | 7e4f829 |
| Intelligence: unbounded analyst cost + ingest caps | fixed-verified | 7e4f829 |
| Global intelligence never retrieved | fixed-verified | 7e4f829 |
| Source chunks never embedded (invisible to retrieval) | fixed-verified | 39c223c |
| Agent roster: 11 decoration agents shown "active" | fixed-verified | 68f6b9c |
| Agent orphan slugs (pitch/roadmap/analyst runs dropped) | fixed-verified | 68f6b9c |
| Library: Zernio can't fetch local media | fixed-verified | 7560191/0e8a414 |
| Memory cross-bank retrieval leak (deny-by-default scoping) | fixed-verified | f68ad8b |
| CRM convert/opportunity writes non-atomic (orphan rows) | fixed-verified | 1f0e1ba |
| Knowledge compiler prompt-injection (unfenced scraped text) | fixed-verified | 35e85b3 |
| website-analytics period param injection (Plausible URL) | fixed-verified | 84d0954 |
| Registry integrity test + 2 agent-status honesty bugs | fixed-verified | 07bdb4b |
| Ask WOBBLE input-token budget (bounded LLM cost) | fixed-verified | 95afa58 |
| Real agent telemetry on graph nodes (failure + cost + latency + quality) | fixed-verified | 0469dd0 |
| Library double-post + orphan on scheduled posts (Zernio) | fixed-verified | d351b13 |
| Graph checkpointing + resumability (content + paid-audit) | fixed-verified | 857c0dd |
| Hardening: content-graph idempotency + automation validation + Plausible host | fixed-verified | f050eae |
| markAssetPostedOnPlatform duplicate published rows (partial unique index) | fixed-verified | (this commit) |

## FALSE POSITIVES (verified against code — do NOT act)
- **Vector ANN indexes missing** — WRONG. `memory_chunks`/`source_chunks`/`intelligence_items` already have HNSW indexes (`*_embedding_idx`). Verified via pg_indexes.
- Most "route has no auth" criticals — `proxy.ts` middleware gates all non-public routes; real residual items are narrower (below).

## OPEN — verified/likely, prioritized (next)
1. **Taste learning is a write-only loop** (product) — `recordFeedbackEvent` updates `taste_profiles` but no generation worker reads them back. Wire `getTasteContextForGeneration` into content-worker/graph. (Bigger — a real feature.)
2. **Connections health check is shallow** — a revoked/rotated API key still shows "healthy" (no live provider ping).
4. Remaining mediums/lows across modules — see MODULE_DEEP_AUDIT.md.
5. **VPS deployment** — BLOCKED on external access (no VPS host/SSH/credentials in the local dev environment). See "VPS status" below.

## Notes on FIX #18 (three concrete hardening fixes)
- **Content-graph idempotency** (cost): the graph route accepted an optional idempotencyKey but the UI never sent one, so a double-click ran the full 5-agent graph twice (duplicate LLM spend + duplicate packet). `enqueueContentGraphJob` now derives a debounced default key (`contentGraphIdempotencyKey`: track+objective+focus within a 2-min bucket) — double-clicks dedupe, deliberate re-runs later still go through. Explicit caller key still wins.
- **Automation action validation** (reliability): `addAutomation`/the API now reject a rule whose `actionType` has no registered job handler (dead job) or whose `actionQueue` no worker consumes (stranded job) — `validateAutomationAction` against `knownJobTypes(generalRegistry)` + `RUNNABLE_AUTOMATION_QUEUES` (["general"]). Decoupled: the domain validator is pure; the registry is injected by the route (no import cycle). Returns 422 on a bad rule.
- **Plausible host validation** (security): `PLAUSIBLE_HOST` was used as a raw URL base. `normalizePlausibleHost` now parses it, requires https (http only for localhost self-host), and reduces to origin-only (drops any smuggled path/query), falling back to the default on junk.

## Notes on graph checkpointing (open item closed — full production-grade)
**What**: durable per-node output persistence so the content graph and paid-audit graph RESUME after a late-node failure / retry / restart instead of re-running (and re-charging) completed nodes.

**Schema/migration**: new `graph_checkpoints` table (migration `0027_cute_romulus.sql`). Unique index `(graph_run_id, node_slug)` = the concurrency/dedup boundary; indexes on `graph_run_id` and `created_at` (retention). **Rollback**: `DROP TABLE graph_checkpoints;` (additive migration, no data dependency — safe to drop).

**Architecture** (all injectable/DI, fully unit-testable):
- `src/lib/domain/graph-checkpoint.ts` — pure: row builder, `isCheckpointReusable` (completed + schema-version match), `graphRunIdFrom` (job id wins; deterministic fallback; never random).
- `src/lib/graph-checkpoint/index.ts` — `GraphCheckpointStore` interface + DB `defaultCheckpointStore` (upsert = ON CONFLICT DO UPDATE), `loadCheckpointContext` (graceful-degrade on read failure), `bindNodeCheckpoint` (keys by NODE KEY not agent slug — content graph's draft+revise share the copywriter slug and would otherwise collide), `clearGraphCheckpoints`, `purgeExpiredGraphCheckpoints` (3-day retention, wired into the scheduler's daily maintenance).
- `src/lib/agents/node-telemetry.ts` — `runGraphNode` gains an optional per-node checkpoint binding: on a cache hit it reuses the parsed output (no model call, cost 0, telemetry marked `[resumed]`); on success it persists; a save failure is best-effort (node just re-runs). Both graphs thread `graphRunId = job.id`.

**Verification evidence**:
- Migration applied to the live dev DB; `drizzle-kit generate` reports **zero drift**; table + 4 indexes confirmed via `pg_indexes`.
- Raw-SQL proof: unique index rejects a raw duplicate; `ON CONFLICT` upserts in place (dupe workers/delivery → one row).
- Real-DB integration through the ACTUAL store code (`src/scripts/verify-checkpoint-db.ts`, run against Postgres): persist, upsert-no-dupe, update-in-place, **survival across a fresh store instance (process/worker restart)**, jsonb durability, **concurrent same-node upserts → exactly one row**, clear, retention purge — all ✓.
- 13 new tests (12 in `tests/graph-checkpoint.test.ts` + 1 paid-audit resume): late-node failure preserves completed nodes; **retry re-runs ONLY the failed node (paid nodes not re-charged)**; corrupted checkpoint → re-run; schema-version mismatch → re-run; success clears; no-graphRunId → checkpointing off; read/write failures degrade gracefully.
- Full gate: `typecheck 0`, **523 vitest pass (74 files)**, `build 0`.

**Mandate scenario coverage**: late-node failure ✓, interruption/termination ✓ (durable DB + fresh-store read), retry/resume ✓, app restart ✓, worker restart ✓, duplicate workers ✓, duplicate job delivery ✓, concurrent execution ✓, malformed/corrupted checkpoints ✓, partial DB writes ✓ (best-effort save), schema-version mismatch ✓, idempotency ✓, retention/cleanup ✓, cancellation ✓ (clear), recovery after temporary DB failure ✓ (graceful degrade).

## Notes on FIX #19 (mark-posted duplicate rows)
- Verified: `markAssetPostedOnPlatform` did read-check-write (`findPostByAssetAndPlatform` → update-or-insert) with no DB guard, so two concurrent mark-posted calls (double-click / two founders) could each insert a published row for the same asset+platform.
- Fix: partial unique index `scheduled_posts_published_asset_platform_uidx` on `(asset_id, platform) WHERE status='published'` (migration `0028`) — at most one published row per asset+platform; non-published history (scheduled/canceled/reschedule) is unaffected. The service catches the rejected duplicate insert and re-reads the winner's row (idempotent, no throw, no dupe). **Rollback**: `DROP INDEX scheduled_posts_published_asset_platform_uidx;`.
- Verified on the live dev DB: migration applied, zero drift, DB-level proof (2nd published row rejected, non-published allowed) + a service test for the race-catch.

## VPS status — BLOCKED on external access (recorded, not faked)
Actual controlled VPS deployment is **not possible from this environment** and has NOT been performed (no fake completion). Concrete blockers, each requiring founder-provided access:
- **No VPS reachable**: this is a local Windows dev box (`C:\Wobble OS`). No SSH host/IP, no SSH key or login, no configured deploy target. `scripts/deploy.sh` is explicitly designed to run *on* the VPS and still has no restart command wired.
- **Missing to proceed**: (1) VPS hostname/IP + SSH access; (2) domain + DNS for TLS; (3) production secrets (`DATABASE_URL`, `SESSION_SECRET`, `SHARED_LOGIN_PASSWORD_HASH_B64`, `OPENROUTER_API_KEY`, `ZERNIO_*`, `APIFY_*`, `PUBLIC_BASE_URL`, webhook secrets). Secret *values* must be entered by the founder in the password manager / server, never by me.
- **What IS ready for the VPS step**: verified green `main` (CI-equivalent gate passes locally), the additive `0027` migration + rollback (`DROP TABLE graph_checkpoints`), `docs/VPS_DEPLOYMENT.md`, and `scripts/deploy.sh` (needs its RESTART section filled for the chosen process manager).
Everything independent of VPS access continues; the deployment itself resumes once the above is provided.

## Notes on the library scheduling fix (open item closed)
- Verified THREE things: (a) scheduler→dispatch IS wired (FIX #1 calls `dispatchDuePosts` on the tick) ✓ — that sub-item was already resolved; (b) a real **double-post** bug; (c) an **orphan** risk.
- Double-post: with Zernio configured, `schedulePost` → `zernioSchedule` creates a Zernio post with `scheduledFor` (Zernio publishes at time T), and then at time T `dispatchDuePosts` → `zernioPublish` creates ANOTHER Zernio post with `publishNow:true`. Every scheduled post would have gone out TWICE on the live instance.
- Orphan: `scheduleRemote` ran BEFORE the local insert, so an insert failure left a live Zernio post with no local record (uncancelable, webhook can't reconcile).
- Fix: (1) `schedulePost` is now local-first — insert the row, then best-effort push to the provider and persist the ref; a failed remote push keeps the local row (dispatched locally at due time) so nothing is orphaned or lost. (2) `dispatchDuePosts` SKIPS any post that already has a `publisherRef` (provider owns it; the webhook reconciles status) — this is the double-post guard. Tests cover local-first ordering, remote-failure fallback, and the no-double-post guarantee.

## Notes on agent telemetry (open item closed)
- Verified: both graph runners (content-graph, paid-audit-graph) called `recordAgentRun` only with `status: "succeeded"` and never forwarded cost/latency/quality. A node throwing (e.g. unparseable output) aborted the graph with NO failed agent_run — so `failureCount` never moved and failures were invisible in telemetry.
- Fix: extracted one shared `runGraphNode` helper (`src/lib/agents/node-telemetry.ts`) — records cost + latency (+ a 0..10 quality score from the content scorer's own verdict) on success, and a FAILED agent_run (slug + error + latency) on any node error/required-parse-failure, then rethrows. Both graphs delegate via a thin deps+module-binding adapter (no duplication). paid-audit's node result now also carries cost. Tests prove the failing node is recorded as `failed` and successful nodes carry cost/latency/quality.

## Notes on the Ask input-token budget (open item closed)
- Verified: output was capped (maxTokens 500) but INPUT was not. `buildAskContext` mapped the ENTIRE Brain (`brain.map`, up to the 50-record default with untruncated content) plus per-chunk-truncated evidence (no total cap) plus the full system snapshot. Input tokens grew unbounded as the Brain/evidence/snapshot grew → unbounded per-call cost.
- Fix: `AskContextBudget` + `DEFAULT_ASK_CONTEXT_BUDGET` (brain 24 items × 700 chars, evidence 16k chars, snapshot 4k chars; ~10k-token ceiling). Applied in `buildAskContext`; brain retrieval also bounded at the source (`limit: maxBrainItems`). Added `clampChars` (newline-preserving) so evidence/snapshot truncation doesn't flatten citation structure the way `truncate` would.

## Notes on the registry integrity test (mandate item closed)
- Added `tests/registry-integrity.test.ts`, derived entirely from the real sources of truth (imported graph/agent/job-type constants + the worker `generalRegistry` + Ask `DEFAULT_CAPABILITIES`). It fails if: an ACTIVE agent has no declared execution path (job/graph/route/subroutine); a provably-running agent is left paused/absent; a job type the code enqueues (constants + intelligence/library/source literals + every `available` Ask route) has no handler.
- It immediately caught TWO real honesty bugs, both now fixed in `DEFAULT_AGENTS`:
  1. `source_intake_orchestrator` was `paused` but provably runs (FIX #6 wired source.intake + recordAgentRun) → set to **active**.
  2. `performance_learning_agent` was `active` but has NO independent run path — its slug is only used as an LLM model-role alias inside the Intelligence Analyst → set to **paused** with an explanatory comment.
- Net active agents unchanged at 20 (one in, one out); the roster now honestly reflects what executes.

## Notes on the website-analytics injection fix (open item closed)
- Verified: `GET /api/webstats?period=` reads the raw query param and `getWebstats` interpolated it unencoded into the Plausible URL (`period=${period}&…`), while siteId was already `encodeURIComponent`'d. An authenticated user could inject `&`-delimited params (e.g. `30d&site_id=victim.com&metrics=…`) to override/append query params on the Plausible call.
- Fix: `normalizePlausiblePeriod` allowlists Plausible's fixed tokens (day/7d/30d/month/6mo/12mo; "custom" excluded — needs a date we don't send) and falls back to `30d`; the value is also `encodeURIComponent`'d before it reaches the URL. Response echoes the normalized period. Tests prove an injected value is neutralized and never reaches the URL.
- Note: not classic SSRF (host is pinned to Plausible), but param-injection — closed regardless.

## Notes on the knowledge-compiler injection fix (open item closed)
- Verified: `buildCompilerPrompt` (domain/knowledge.ts) concatenated raw scraped `c.content` straight into the user message (`[i] <content>`) with no fencing. Source-intake feeds it text scraped from external websites/socials, so a page containing "ignore previous instructions / output {…}" could hijack the compiler. Same class the analyst/dreamer already fenced.
- Fix: append a `COMPILER_INJECTION_DEFENSE` clause to the system prompt (even when a skill supplies the body) and wrap the chunk body in `<<<UNTRUSTED_SOURCE_CONTENT … UNTRUSTED_SOURCE_CONTENT` fences. Chunk indexes stay citable. Tests assert the fence contains the adversarial text and the clause survives a skill-provided system prompt.

## Notes on the CRM atomicity fix (open item closed)
- Verified: `convertLead` ran 5 sequential writes (company→contact→opportunity→stage history→lead flip) with no transaction; a failure after `insertCompany` orphaned a company and left the lead open, and a retry created a DUPLICATE company. `addOpportunity` and `moveOpportunityStage` had the same 2-write gap.
- Fix: added an optional `transaction<T>(fn)` to `CrmStore`; the default store maps it to a real Postgres `db.transaction` (store re-bound to the tx handle). A `withTransaction(store, fn)` helper wraps all three multi-write flows so they commit atomically or roll back together; audit fires only after commit. Test/in-memory stores may omit `transaction` (falls back to sequential). First real DB transaction in the codebase — this is the pattern other multi-write flows should adopt.
- NOT fixed here (separate concern): concurrent double-submit of the same lead can still race (two readers both see "open" before either commits). Needs `SELECT … FOR UPDATE` on the lead inside the tx — logged as a follow-up, not a partial-write/orphan issue.

## Notes on the memory-scoping fix (open item #1 closed)
- Verified the leak was real: `retrieveMemoryCandidates` only filters banks when `bankSlugs` is passed; every unscoped caller (Ask WOBBLE, ai-chat, content-worker, ask-tools, /api/memory/retrieve) passed none → semantic search ranked across ALL banks, incl. the 4 owner-scoped `founder_*` private banks (and any future per-client bank via `client_source`).
- Fix: deny-by-default in `retrieveMemoryContext`. Pure helpers `resolveDeniedBankSlugs`/`isChunkVisibleForAccess` in `domain/memory.ts`; a chunk is hidden only when it lives *exclusively* in owner-scoped banks the caller isn't authorized for (shared membership wins; unlinked chunks stay visible). New optional `access: {clientIds,projectIds,founderIds,allowOwnerScoped}` on the query is the authorization hook; explicit `bankSlugs` bypasses (it IS the opt-in). No caller has client/founder retrieval context today, so all default to shared-only — the safe posture. Founder taste is consumed via the taste-profile system, not semantic retrieval, so zero functional regression.
- Follow-up (not blocking): let Ask WOBBLE pass the asking founder's id so their own taste can inform answers; wire clientId through content-worker when generating for a specific client.

## Process notes
- ALWAYS run full `vitest run` + `npm run typecheck` + `npm run build` before committing (Fix #7 went red from skipping the full suite).
- Migrations: 0026 is the last (index migration). Recovered from a bad 0026/0027 (duplicate HNSW) — clean now, zero drift.
