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
| Memory cross-bank retrieval leak (deny-by-default scoping) | fixed-verified | (this commit) |

## FALSE POSITIVES (verified against code — do NOT act)
- **Vector ANN indexes missing** — WRONG. `memory_chunks`/`source_chunks`/`intelligence_items` already have HNSW indexes (`*_embedding_idx`). Verified via pg_indexes.
- Most "route has no auth" criticals — `proxy.ts` middleware gates all non-public routes; real residual items are narrower (below).

## OPEN — verified/likely, prioritized (next)
1. **CRM convertLead not transactional** (data-integrity) — multi-row insert chain with no tx; partial failure orphans rows. Wrap in a transaction.
2. **Knowledge compiler prompt-injection** — untrusted chunk text concatenated unfenced into the compiler prompt. Fence like analyst/dreamer.
3. **website-analytics** — `period` query param interpolated raw into Plausible URL (encode + allowlist).
4. **Ask WOBBLE unbounded input tokens** (cost) — injects full brain + memory + sources + snapshot + 12 intel items, no total cap. Add an evidence-token budget.
5. **Content-graph no checkpointing** (reliability/cost) — a node returning bad JSON discards all prior (paid) node work. Persist node outputs; resume from failed node.
6. **Agent telemetry** — failure/quality/cost not recorded on graph nodes (content/paid-audit only log success; qualityScore/cost null). Wire failed-run + cost/latency + quality.
7. **Registry integrity test** — add a test that fails if an active agent has no handler/trigger, a job type has no handler, etc. (mandate requirement).
8. **Library scheduling** — schedulePost pushes to Zernio before local insert (orphan on failure); scheduleRemote chosen by config not publisher; publishing.dispatch handler dead without scheduler (now scheduler exists — verify it dispatches).
9. Mediums/lows across modules — see MODULE_DEEP_AUDIT.md.

## Notes on the memory-scoping fix (open item #1 closed)
- Verified the leak was real: `retrieveMemoryCandidates` only filters banks when `bankSlugs` is passed; every unscoped caller (Ask WOBBLE, ai-chat, content-worker, ask-tools, /api/memory/retrieve) passed none → semantic search ranked across ALL banks, incl. the 4 owner-scoped `founder_*` private banks (and any future per-client bank via `client_source`).
- Fix: deny-by-default in `retrieveMemoryContext`. Pure helpers `resolveDeniedBankSlugs`/`isChunkVisibleForAccess` in `domain/memory.ts`; a chunk is hidden only when it lives *exclusively* in owner-scoped banks the caller isn't authorized for (shared membership wins; unlinked chunks stay visible). New optional `access: {clientIds,projectIds,founderIds,allowOwnerScoped}` on the query is the authorization hook; explicit `bankSlugs` bypasses (it IS the opt-in). No caller has client/founder retrieval context today, so all default to shared-only — the safe posture. Founder taste is consumed via the taste-profile system, not semantic retrieval, so zero functional regression.
- Follow-up (not blocking): let Ask WOBBLE pass the asking founder's id so their own taste can inform answers; wire clientId through content-worker when generating for a specific client.

## Process notes
- ALWAYS run full `vitest run` + `npm run typecheck` + `npm run build` before committing (Fix #7 went red from skipping the full suite).
- Migrations: 0026 is the last (index migration). Recovered from a bad 0026/0027 (duplicate HNSW) — clean now, zero drift.
