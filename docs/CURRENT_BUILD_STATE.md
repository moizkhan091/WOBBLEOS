# CURRENT BUILD STATE — read this first (living handoff)

Purpose: the single "catch up in 2 minutes" doc for ANY builder (Codex, Claude, Gemini). Keep it current. Detailed code log is in `AI_HANDOFF_LOG.md`; decisions/why in `DECISION_LOG.md`. Last updated: 2026-07-09 (Claude Opus 4.8 session).

## Operating standard (founder Moiz — binding)
- NO corner-cutting, no "future version" deferrals. Build like there is never another version — complete + rich each time.
- After EACH step: test thoroughly, try to break it, fix edge cases, look for un-asked-for upgrades, verify, THEN move on.
- Be aggressively proactive: find gaps the founder can't see; add safeguards/upgrades.
- Verify the real EFFECT (live), not just that code compiles. Every slice: `npm run typecheck` + `npm run test` + `npm run build` green, plus a live DB/effect check, then commit + push.

## Environment / infra
- DB: local Postgres in Docker — container `wobble-os-postgres`, image `pgvector/pgvector:pg16`, db `wobble_os` / user `wobble` / port 5432 (matches `.env` DATABASE_URL). If down: start Docker Desktop then `docker start wobble-os-postgres`. Migrate `npm run db:migrate`, seed `npm run db:seed`.
- Embeddings: work on the existing OPENROUTER_API_KEY (`openai/text-embedding-3-small`, 1536d). Backfill `npm run memory:backfill-embeddings`.
- BUDGET MODE (low OpenRouter credit): all `settings.model_roles` = `openai/gpt-4o-mini`. Restore `content_strategy` to `anthropic/claude-sonnet-4.5` for production content when credits load. Swap models the SAFE way via the Model Registry (`setModelForRole`) — validated + audited; do not hand-edit settings.
- OpenRouter provider_connection: allowedModules=[] (all internal modules), enabled=true.
- Git: remote `github.com/moizkhan091/WOBBLEOS`, branch `main` (project convention: commit chunks to main). Push after each stable slice. `.env` is gitignored.
- MIGRATION DISCIPLINE: after schema changes, `db:generate`, REVIEW the SQL before applying, apply, then re-run `db:generate` and expect "No schema changes". Snapshots had drifted historically — a fresh `generate` that re-emits existing objects means drift; reconcile with an IDEMPOTENT migration (IF NOT EXISTS), don't push raw.

## Key architecture decisions (locked with founder)
- WOBBLE OS = a hive-mind AI OS. Every output module is a TEAM of agents (not one AI), gated by founder approvals, that learns.
- Ask WOBBLE = CONDUCTOR (understands the founder, picks tools, relays feedback, reports). The per-module agent TEAMS = ORCHESTRA (do the deep multi-agent, multi-model work). Ask WOBBLE does NOT do the work itself.
- Power via TOOLS, never raw code: Ask WOBBLE controls the OS through a safe tool registry. A tool exists only when its capability is built → Ask WOBBLE's power grows as modules are built; it never fakes control of unbuilt modules.
- Model-agnostic: all agents route models via a central, validated, swappable Model Registry + catalog. Model Scout / System Auditor agents propose upgrades (approval-gated, never forced).
- Conversational memory is PER-FOUNDER: chats are tagged by founder; a Memory Harvester learns durable facts and routes them (personal → that founder's bank auto; brand/company → founder approval). True identity per chat comes from Auth (Chunk 02) — so AUTH PRIORITY IS RAISED (it powers per-founder memory/taste, not just deploy).
- UI model: each module has a visual page (see/click) + a global Ask WOBBLE chat + a per-module chat (introduced when Content is built). All call the same tools.
- Removed the "Client AIOS Lab" module (delivering client services needs a separate software layer; not an internal OS module).

## Built THIS session (all tested + pushed to main)
1. Semantic memory made real (embeddings + pgvector cosine + HNSW index) + fixed a latent DEPLOY bug (intelligence_items columns weren't in any migration → fresh builds broke).
2. Model Registry (catalog + validated/audited swaps + model_scout/system_auditor agents) + POST swap flow.
3. Ask WOBBLE Orchestrator: system-awareness (getSystemSnapshot) + tool registry + LLM tool-calling loop w/ confirmation gate. Endpoint POST /api/ask/agent.
4. Conversational memory: conversation logging (per founder) + Memory Harvester (auto-learn, per-founder routing) + `remember` tool.
5. Founder-editable memory banks: read/add/edit(re-embed)/remove/restore, permissioned per founder, audited. API under /api/memory/records.
6. MEMORY UPGRADES (founder asked for 10 + 48h revert + full audit labeling; doing in batches, THEN break-agent):
   - ALL 10 DONE: #1 version history/undo, #2 conflict detection, #3 "what WOBBLE knows about me" export, #4 Ask WOBBLE memory tools (search/forget/pin), #5 staleness/review, #6 pinning/importance, #7 bulk ops, #8 dedup-on-write, #9 merge/split, #10 Memory browser UI page (in os-ui.tsx MemoryPage — tabs: all memory / conflicts / stale review / what-WOBBLE-knows-about-me / recently-deleted; browse+edit+pin+delete+restore+resolve-conflicts+version-history, founder selector; matches the glass/lime design). Plus 48h deletion-revert and audit categorization (deletion/edit/... + `surface`).

## FRONT-END NOTE (design system to MAINTAIN)
os-ui.tsx (single client component, ~2200 lines) renders every module via a registry (bottom of file) -> ModuleContent. Design = dark + lime (#B8FF2C) glass. Reuse the existing primitives: `glass`/`card` styles, `C` colors, `muted`/`faint`, `Panel`, `Tag`, `StatusPill`, `StateBlock` (loading/empty/error/offline), `PlannedState`, `useApi<T>(url)` hook (+reload), `offlineIf`, `fmtTime`, `FOUNDERS`, `primaryBtn`/`disabledBtn`/`inputStyle`/`selectStyle`/`labelStyle`, `DetailDrawer`, modal overlay pattern (see AddMemoryModal). Do NOT introduce a new UI framework/look; match this.

## BREAK-AGENT (done 2026-07-09)
Ran 3 adversarial QA sub-agents over the whole session. Found + FIXED (with regression tests, 297 tests green): a CRITICAL model-approval rubber-stamp, cross-founder read leak (search_memory), unconfirmed forget_memory, embedding-wipe on edit, dedup matching archived records, non-idempotent harvest + all-or-nothing candidate parse + personal-facts-to-shared-bank leak, setModelRoleMap non-upsert, tool_call-id crash. See AI_HANDOFF_LOG.md 2026-07-09 break-agent entry.
REMAINING HARDENING (tracked, not corner-cuts; mostly gated on Auth or a tx refactor): DB transactions for compound memory writes (orphan risk); confirmActions bound per-action; actor-is-a-founder verification (= Auth); version-number race; harvest atomic row-claim + re-harvest watermark + transcript cap; embeddings dimension validation.

## Built THIS session — part 2 (Auth → Knowledge → Content, all tested + pushed)
7. AUTH (Chunk 02): shared team login + per-chat founder identity. `src/lib/auth/{edge,index,route}.ts`, `/api/auth/{login,logout,session}`, `src/proxy.ts` (Next 16 proxy convention — renamed from middleware.ts), glass/lime login page, `npm run auth:hash`. Base64 hash var (`SHARED_LOGIN_PASSWORD_HASH_B64`) avoids dotenv `$`-mangling. LOCAL dev password = `wobbletest123` (temp — set the real one before deploy; see FOUNDER_DECISIONS_NEEDED.md).
8. IDENTITY WIRING: `requireFounder(request)` → 17 mutation routes (memory/approvals/proposals/skill+source approval/content/taste) now derive the actor from the SESSION, never a client field. Closes the break-agent actor-trust gap (live-proven: Moiz session blocked from editing Ali's bank). Also enforces DB revocation on mutations (edge proxy is JWT-only).
9. KNOWLEDGE COMPILER (Chunk 13): Karpathy compile-don't-retrieve. `knowledge_notes` + `knowledge_note_links` tables (migration 0012 + HNSW). `src/lib/{domain/knowledge,knowledge}`. compileSource (guard→prompt→LLM→parse→embed→synthesize: reinforce dups / interlink related), retrieveKnowledge (hybrid: notes + source chunks), job `knowledge.compile` (auto-enqueued on source approval). API `/api/knowledge/{compile,notes,notes/[id],retrieve}`. LIVE-verified against real DB (re-compile reinforced, didn't duplicate). UI: Learning Engine page (wired).
10. CONTENT GRAPH (Chunk 15 evolution): multi-agent creative graph. `src/lib/{domain/content-graph,content-graph}`. Strategy→Research(grounded)→Copywriter(draft→self-critique→revise)→Scorer→Assemble pack. 5 agent_runs/pack, provenance on every claim, quality gate → approval. 4 visible agents seeded (strategist/researcher/copywriter/scorer). Job `content.graph`, API POST `/api/content/graph` (session identity). Old single-call `content.generate` kept as fallback (also now session-identity). UI: Content Command "Content Team" panel + "Run the team" trigger. NOT live-run yet (5 model calls/pack; low credits — see FOUNDER_DECISIONS_NEEDED.md).

## NEXT (in order)
1. GREENLIGHT-GATED: a live content-graph run — needs a worker running (`npm run worker`) + credits + cheap model_roles for content_research/copywriting/scoring. Then verify a real pack end-to-end.
2. Knowledge Compiler follow-ups: approval-gated PROMOTION of high-trust notes into Core Brain memory_records; LLM-tagged contradiction links; second auto-trigger on intake-completion (not just approval).
3. Content graph deepening: parallel fan-out (Competitor + Brand-voice + Founder-taste alongside Research); founder-taste weighting + novelty scorer (Chunk 45/47); visuals (Chunk 22) after pack approval.
4. Memory transaction wrapper (atomicity for create/approve/archive/merge/split/deleteRecordCascade) + remaining break-agent hardening (version-number race, harvest atomic row-claim + re-harvest watermark + transcript cap, embeddings dim validation).
5. Schedule background sweeps (harvest, purge-expired, staleness review) via Automations (Chunk 19).
6. Revenue engine: Prospect→Audit→Proposal.

## Test count baseline: 340 tests green (was 287; grows each slice).
