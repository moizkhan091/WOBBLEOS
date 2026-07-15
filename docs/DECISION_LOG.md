# WOBBLE OS - Decision & Context Log

Shared context memory for ALL AI builders (Claude, Codex, Gemini, OpenAI, Antigravity) and the founders.

This is DIFFERENT from `docs/AI_HANDOFF_LOG.md` (which logs code changes / what-was-built). This log captures the WHY: product decisions, architecture decisions, feature ideas, REJECTED ideas, known risks, and important context from founder conversations - so no builder works blind. Do not duplicate; code-work goes in the handoff log, decisions/context go here.

## How to use (MANDATORY for every builder)

After any meaningful conversation or decision, append an entry with this shape:

```
### [DATE] - [who] - [short title]
- Decision: what was decided
- Context / why: the reasoning + founder intent
- Alternatives rejected: what we chose NOT to do and why
- Affects: chunks / modules / files
- Do NOT change: anything that must stay stable
- Risks / open questions:
```

Log founder conversations too (not just code). If a founder states intent in chat, capture it here so other AIs see it.

---

## Seeded decisions (from founder conversations through 2026-07-01)

### 2026-07-01 - Founder(Moiz)+Claude - Production-grade from day one, no generic stubs
- Decision: WOBBLE OS is built as a final production-grade internal OS from the start - not MVP-then-improve. No generic placeholders, no weak temporary flows. See `docs/ENGINEERING_STANDARDS.md` (binding Definition of Done).
- Context: a dashboard Approve button was wired to a GENERIC endpoint that flipped the approval row but did not complete the real entity action (source not actually approved, memory not inserted, etc.). Looked done, wasn't. Founder called this a failure and wants it impossible to repeat.
- Do NOT change: the rule that every action must complete the real effect and be verified by the effect (not a 200 / disappeared row). Prefer entity-complete endpoints over generic transitions.
- Risks: builders marking chunks done on parse/compile alone.

### 2026-07-01 - Founder+Claude - Knowledge = Karpathy "compile, don't just retrieve"
- Decision: approved sources are COMPILED by an LLM into synthesized, interlinked, deduped knowledge notes (memory = synthesis, not just retrieval), stored with provenance + embeddings, hybrid-retrieved (synthesis + raw RAG) via ONE shared contract with auto-pickup. Upgrades Chunk 13 (Learning Engine) to a Knowledge Compiler. Full spec: `docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md`.
- Alternatives rejected: pure RAG ("glorified search"); manual code-pointing at data.
- Affects: Chunks 13, 43, 10, 50.

### 2026-07-01 - Founder+Claude - Content = multi-agent creative team (agency-level)
- Decision: content is produced by a multi-agent workflow (Strategy, Research, Competitor, Brand-voice, Founder-taste, Ideation, Copywriting, Visual-direction, Image-prompt-engineering, QC, Final-scoring, Learning/audit agents), NOT one model. Copywriter does NOT make images. Output target: million-dollar-agency quality, replacing a design agency + strategist + blog writer. Spec: `docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md`.
- Affects: Chunk 15 evolves to an agent graph; visuals 21/22; references 21/51.

### 2026-07-01 - Founder+Claude - Image prompt agent must be elite + model-aware
- Decision: the image-prompt-engineering agent is a first-class agent that understands the target model's full capabilities (primary target: "Image Gen 2") and sends large, structured, production-grade prompts (brand context, campaign goal, visual hierarchy, lighting, composition, product accuracy, design theory, typography, realism, platform format, reference style, negative constraints, intended outcome). Bad output usually = bad prompting.
- Open question: confirm the EXACT image model + its real documented capabilities before hardcoding a capability profile (no assumptions - production rule). Store the model capability profile as config, not code.

### 2026-07-01 - Founder+Claude - Dual taste learning (brand + per-founder), no conflict
- Decision: the OS learns TWO taste layers - the overall WOBBLE brand taste AND individual founder taste profiles (Moiz, Ali, Ibrahim, Haad tracked separately). Brand consistency is the HARD constraint; founder taste tunes preferences WITHIN brand bounds. Design so they never conflict. Spec: `docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md` (Taste section).
- Do NOT change: real founders are Moiz, Ali, Ibrahim, Haad (dashboard founder list corrected 2026-07-01 - was placeholder names).

### 2026-07-01 - Founder+Claude - Design Reference Hunter (Chunk 51) + one-ref-per-asset
- Decision: a Design Reference Hunter scouts new designs (Pinterest/Dribbble/creators/competitors), vision-describes them, and files them into the static/carousel/video reference banks on approval. Generation uses exactly ONE reference per asset (never blended); winRate demotes weak refs. Tracked as Chunk 51.

### 2026-07-01 - Founder+Claude - Two-log system for AI builders
- Decision: `AI_HANDOFF_LOG.md` = code-work log; `DECISION_LOG.md` (this file) = decisions/context/rejected-ideas/risks. Both mandatory. All builders read both before working and append after.
- Context: founder does not want Claude/Codex/Gemini/OpenAI working blind or duplicating systems.

### 2026-07-01 - Founder+Claude - No duplication rule
- Decision: never duplicate fields, schemas, tables, API routes, agent logic, or workflows. Extend/update what exists. Parallel versions only with a strong architectural reason logged here.

### 2026-07-01 - Founder(Moiz)+Claude - Real company data + agent prompting is a dedicated ONBOARDING phase (do not forget)
- Decision: no real WOBBLE data has been loaded yet (competitors, our own accounts/analytics, brand assets, offers, clients) and the built + future AI agents have not been prompted/configured for OUR company. This is a DEDICATED onboarding/data-seeding + agent-configuration phase, done once the system + connectors exist - NOT skipped, NOT hardcoded.
- What it covers: seed approved sources/knowledge (Karpathy compiler runs on them), connect real data connectors (social/competitor/website/SEO/CRM), configure the ~1000 content-creation agents and the ~100 self-improvement agents to run on OUR real approved data, and set each agent's skill/prompt in the registry (never hardcoded).
- Sequencing: happens AFTER the engines are built (knowledge compiler 13/43, creative graph 15/21/22, connectors 35/37-39, taste 45/47) and BEFORE go-live. The self-healing/1000-agent behavior only becomes real once real data + prompts are in.
- Do NOT: hardcode competitor/company data or agent prompts in code. All of it is data (registries/settings/Brain), approval-gated.
- FLAG: add an explicit "Onboarding & Data Seeding" checklist chunk near VPS launch so this is a tracked step, not an afterthought.

### 2026-07-01 - Founder(Moiz)+Claude - ARCHITECTURE ALIGNMENT: current build is a real foundation, NOT the hive-mind yet
- Decision: full honest audit done in `docs/ARCHITECTURE_ALIGNMENT_REVIEW.md`. Verdict: what exists is real+tested (~25-30% of vision), NOT fake UI, but the SCHEMA for the hive-mind does not exist yet: sources is a flat stub (not a Source Registry), memory is one space (no routed banks), there is NO agent registry/agent_runs, no research review inbox, content is a single LLM call (not a multi-agent creative team), no taste/learning store, no per-type source intake, no visuals.
- Correction (binding): build SCHEMA + BACKEND FIRST, then UI - never a dashboard module before its schema exists (that is the "fake UI" trap). Order: Phase A (Agent Registry -> Source Registry -> Memory Banks+Router), Phase B (Intelligence Inbox + taste/feedback learning), Phase C (multi-agent creative graph + visuals + Design Reference Hunter), Phase D (cost routing, connections 35, cadence 19, Dreaming 36, onboarding/data-seeding, VPS/auth).
- Start next: Phase A1 Agent Registry (`agents` + `agent_runs`) - without agent visibility the whole hive-mind stays invisible; it is the backbone.
- Do NOT: build more dashboard modules on the current thin schema; treat sources/content as done; create hidden agents with no run logs.

### 2026-07-01 - Founder(Moiz)+Claude - Canonical vision brief saved; existing chunks carry detailed upgrade specs
- Decision: `docs/FOUNDER_VISION_BRIEF.md` is now the CANONICAL vision (the full founder brief: hive-mind, every module = a TEAM of agents, source registry + per-type intake, memory-bank routing, agent registry, research inbox, unified Content Command, agency-level quality, cost tiering, n8n, anti-hallucination grounding, dashboard visibility, approval/rejection learning, dual taste, shared logs). Mandatory reading for all builders (added to CLAUDE.md).
- The 6 NEW chunks are 51-56. The rest of the vision = UPGRADES to existing chunks 13/15/21/22/43/47, now with DETAILED specs (inputs/agent-team/data-flow/banks/acceptance) in FOUNDER_VISION_BRIEF.md so Codex builds the upgraded version, not the basic one. Only Chunk 15 is built (V1) - it must evolve into the multi-agent creative graph AFTER the Agent Registry (52) + Source Registry (53) + Memory Banks (54) land.
- Do NOT: build the basic version of 13/21/22/43/47; treat Chunk 15 V1 as final.

### 2026-07-02 - Codex - Source Registry is typed intake infrastructure, not a flat library
- Decision: Chunk 53 upgrades Source Library into a typed Source Registry foundation. Sources must carry source type, owner, intended use, connected agents, refresh cadence, processing status, extracted data, memory-bank targets, costs, errors, approval state, and intake run history. Every source processing attempt is logged as a `source_intake_runs` row.
- Context / why: founder explicitly warned that WOBBLE OS cannot be a normal SaaS dashboard with a flat source list. YouTube videos, Instagram reels, carousels, websites, Reddit feeds, design references, brand references, internal docs, API sources, and n8n sources each need different intake workflows and must feed different agent teams/memory banks.
- Alternatives rejected: one generic source process for all sources; hidden scrapers with no run log; dashboard-only source cards without schema/API support.
- Affects: Chunk 53, Chunk 54 Memory Banks + Router, Chunk 55 Intelligence Inbox, Chunk 13/43 Knowledge Compiler, Chunk 15/21/22 creative graph, Connections/n8n chunks.
- Do NOT change: new sources still start pending and untrusted; unknown/random sources must not auto-update WOBBLE Brain. Real scrapers/connectors plug into the typed intake contract instead of bypassing it.
- Risks / open questions: real Apify/social/vision/SEO connectors are not implemented in Chunk 53; they must write into this registry and intake-run contract when built.

### 2026-07-03 - Codex - Memory is routed into approved banks, not one generic Brain
- Decision: Chunk 54 adds `memory_banks` and `memory_bank_links` as the routing contract for company knowledge. Memory updates can suggest multiple banks, but approved memory is only written after founder approval. Approved memory records/chunks store `bank_slugs` and durable membership links.
- Context / why: founder explicitly wants one source or research output to feed multiple places: competitor, content, hook library, design, founder taste, audience response, SEO, offer, and more. Ask WOBBLE and future agents should auto-pick up new approved data by querying banks, not by adding hardcoded prompt branches.
- Alternatives rejected: keeping only `memory_records.area`; forcing one source into one bank; silently updating Core Brain; bypassing approval because a router suggested placement.
- Affects: Chunk 54, Chunk 55 Intelligence Inbox, Chunk 13 Knowledge Compiler, Chunk 43 Content Knowledge Base, Chunk 15 creative graph, Ask WOBBLE retrieval.
- Do NOT change: routing suggestions are not trusted truth. The flow is source/intelligence -> suggested banks -> approval/edit/reject -> memory records/chunks + bank links -> retrieval.
- Risks / open questions: current router is deterministic and data-driven with a seeded `memory_router` model role. Future provider-backed LLM routing should write into the same proposal/bank-link contract, not replace it.

### 2026-07-04 - Codex - Intelligence findings are reviewed in-place, not copied into a parallel queue
- Decision: Chunk 55 uses the existing `intelligence_items`, `intelligence_insights`, and `intelligence_suggestions` tables as the source of truth for the Research Review Inbox. The inbox is a review/orchestration layer over those rows, not a duplicate research-output table.
- Context / why: the hive-mind needs every agent/source finding to stay connected to provenance, source ids, agent ids, freshness, confidence, metadata, and later memory proposals. Copying findings into a separate queue would split truth and break traceability.
- Actions supported: approve, reject with reason, mark needs_review, archive, edit, route to memory proposal, and merge/supersede duplicate records.
- Alternatives rejected: generic approval-only row flipping; dashboard-only inbox cards; silently writing research output to Brain; a separate `research_inbox` table that mirrors intelligence rows.
- Affects: Chunk 55, Chunk 56 Taste + Feedback Learning, Chunk 13 Knowledge Compiler, Chunk 12 Research Radar, Chunk 15 creative graph, Ask WOBBLE retrieval.
- Do NOT change: approved intelligence still does not auto-update Core Brain. The route-to-memory action creates an approval-gated memory proposal; trusted retrieval happens after approval and bank routing.
- Implementation note: a live test found and fixed a Drizzle schema mapping bug where `metrics`, `extracted`, and `relations` mapped to `metadata`. Keep the regression test in `tests/db-foundation.test.ts`.

### 2026-07-09 - Claude (Opus 4.8) - Trending audio is API-impossible -> hybrid publishing; Content Library becomes a "Content Director" agent team
- Decision: The Content Library & Scheduler grows into a full agency-boss replacement (the "Content Director") = a team of agents. Publishing is HYBRID by content type: carousels/statics/stories/baked-audio reels auto-post via Zernio; trending-audio Reels use a manual "download original + caption -> post from phone -> mark posted" path. Every card offers Post now / Schedule / Download, per-post founder choice (nothing auto-scheduled without approval).
- Context / why: Founder wants trending audio (important for IG growth). Verified in Zernio's docs ("What You Can't Do: Add music to Reels") that NO third-party API can attach trending/licensed audio to Reels — it's an Instagram Graph API limitation (music licensing = in-app only), not a Zernio one. The `audioName` field only renames "Original Audio". Founder's rule was "if we can't do trending audio, don't implement" — resolved by NOT routing trending-audio Reels through auto-post, while still auto-posting the ~87% of the library (196 statics) that has no audio component.
- Also verified: Zernio "drafts" live in Zernio, NOT Instagram's native app drafts (Instagram has no create-native-draft API endpoint). So the hoped-for "save draft in OS -> see it in the IG phone app -> add sound -> post" bridge does not exist. Manual path = download + post in-app.
- Zernio: LinkedIn is a first-class platform (no audio issue -> Post now + Schedule). Base https://zernio.com/api/v1, Bearer key, one POST /posts endpoint (publishNow | scheduledFor | draft), mediaItems need a PUBLIC url. Founder connected Wobble IG (and is connecting LinkedIn). API key was shared in chat -> will be wired as env ZERNIO_API_KEY (never hardcoded); founder to rotate it after.
- Build order: Phase 1 (importer [DONE] -> Zernio adapter -> card actions -> status sync), Phase 2 (Content Director: Eye vision/color analyzer, Grid Designer for feed sequencing by color+angle+product+format, Timing engine, Auto-Scheduler + "Plan my feed" approve-first preview, Caption alignment), Phase 3 (analytics learning loop -> timing/order self-improve; recommendations). It MUST self-improve from real data (founder's bar: drive leads/awareness/followers, not "cool AI").
- Content folder reality: 196 single static images + 30 reels (no carousels). Folder names encode id/product/angle -> parsed into asset metadata for the Grid Designer.
- Alternatives rejected: auto-posting Reels with fake/renamed audio; browser-automation bots (ban risk); scheduling everything up front (founder wants per-post choice); silent auto-post (must propose + approve).
- Do NOT change: no real post fires to a live Wobble account without explicit founder approval (outward-facing, irreversible). Trending-audio Reels stay manual until Instagram exposes an API for it (it won't soon).
- Open questions: hosting media at a public URL for Zernio to fetch (local STORAGE_ROOT paths aren't reachable — needs a public media route/bucket when deployed); how to detect content already posted MANUALLY on the phone in the past (Zernio never saw it) — either pull the account's existing media if the API allows, or bulk "mark posted". Founder sending a PDF that may inform the already-posted question.

### 2026-07-09 - Claude (Opus 4.8) - Zernio holds the schedule (native + webhooks); "Plan my feed" is the Content Director v1
- Decision: For auto-posting, Zernio is the source of truth for scheduled posts, not our cron. When a post is scheduled with publisher=zernio (and Zernio is configured), we push it to Zernio's native scheduler (scheduledFor) and store the returned Zernio id as publisher_ref; Zernio posts at the time and calls our webhook. Our local scheduled_posts row mirrors it.
- Context / why (founder's logical errors): (1) "cancel here must also cancel in Zernio" — if Zernio holds the schedule, cancel/remove MUST call Zernio DELETE /posts/:id or the post still fires. (2) "how do we know it posted + auto-move to Posted" — Zernio webhooks (post.published/failed/partial/cancelled) carry per-platform status + platformPostId + live URL; applyZernioPostEvent flips the local post automatically. No polling. (3) "posted vs queued both in one list" — the queue now separates Scheduled / Posted / Failed.
- Hard constraint: Zernio needs a PUBLIC url (PUBLIC_BASE_URL) — it cannot fetch media from, or deliver webhooks to, localhost. So the whole Zernio path is built + unit-tested but INERT locally (no key, no public url); it activates on deploy. Manual + mark-posted keeps the OS fully usable now. "Post now (auto)" stays a stub until then.
- "Plan my feed" (Content Director v1): a Library button that proposes an ordered posting sequence — spreads angle+product so the grid never repeats, interleaves reels, assigns time slots — using the metadata parsed at import (kind/angle/product). Founder approves before anything schedules. Color/vision-based sequencing (the founder's "what color looks good on the grid") is the NEXT layer (needs a vision pass over the images); v1 is deterministic + free + instant.
- Content Command audit (to fully replace an agency): it's a strong grounded multi-agent TEXT engine (strategist→researcher→copywriter→self-critique→scorer, provenance-cited, quality-gated) but outputs TEXT-ONLY packets — media_refs is left empty ("comes later from the studio"); NO image/video generation is wired anywhere. Three biggest gaps: (1) real image/carousel generation, (2) a founder feedback→regenerate loop (versioning is manual-edit only; drawer is read-only), (3) outward awareness (competitor/trend) + performance learning + auto posting-order/timing.
- Alternatives rejected: our-cron-holds-the-schedule (fragile if OS is down; and cancel-in-provider becomes moot but posting reliability suffers) — chose Zernio-native for robustness + webhooks. Firing a real post or spending on image gen during the autonomous run — declined (irreversible / costs money; needs explicit founder go + engine choice).
- Do NOT change: no real post to a live Wobble account without deploy + explicit founder go; webhook handler must stay idempotent (at-least-once delivery); asset status is derived from posts (published>scheduled>ready) via recomputeAssetStatus.
- Open: rename Content Command (deferred); pick the image engine for Phase 4a; deploy target + public URL for Zernio; the 3 already-manually-posted IG items to backfill.

### 2026-07-09 - Claude (Opus 4.8) - Revenue engine is built on a connected CRM/ERP spine, not floating screens
- Decision: Build the Wobble ERP Control Layer bottom-up. The CRM spine (companies→contacts→leads→opportunities→pipeline+history) lands FIRST, then invoices/finance, then the Free/Paid audit AI teams on top — because the partner's ERP brief mandates "everything connected, no orphan records": an audit/proposal/invoice must attach to a real company + opportunity, not be a standalone screen.
- Context / why: Founder wants the money-making audit flow + invoice; partner's 36-page brief wants the full CRM/ERP backbone (GHL/Salesforce/HubSpot + SAP/NetSuite structure). The audit outputs (proposal, roadmap, invoice) live in this spine and the Wobble sales pipeline literally has audit stages (Paid Audit Offered/Sold/In Progress/Delivered). So the spine is the foundation everything hangs off.
- Guardrail (locked): finance AI may DRAFT invoices/reminders but a FOUNDER approves/sends/marks-paid — the OS never moves money on its own (ERP brief G, WOBBLE_COMPANY_OS line 893). Enforced via requireFounder on invoiceAction. Soft-delete only (archived_at), no hard delete; every stage move audited + history-logged.
- Two-audit architecture (next): FREE audit and PAID audit are SEPARATE modules with SEPARATE agent teams (founder was explicit: not one AI doing both). Both replicate the proven content-graph two-file pattern. Free = lighter, converts leads, "what we can do" WITHOUT a deep audit (don't gatekeep — protects conversion). Paid = McKinsey-style deep audit, "exact things" WITH audit, spans many meetings, produces client roadmap + our build roadmap; a 3rd "proposal builder" AI runs on the returned audit findings. Both ground in Brain (offers/ICP) + WOBBLE_COMPANY_OS — they must know ALL ~35 Wobble services, retrieved not hardcoded. Apply the paid-audit YouTube method but to Wobble's BIGGER service menu (audit more surface).
- Constraints surfaced: PDF/slide/deck export does NOT exist in the repo (no deps) — build premium HTML deliverables first, binary PDF (puppeteer) later; founder's design PDF (brand system) pending (poppler wasn't installed to render it — extracted the ERP brief via pypdf instead). LLM calls throw without OPENROUTER_API_KEY (no stub), so audit graphs get built + unit-tested + gated, not live-run, during hands-off work. Apify social scraping = new provider-connection, gated like Zernio (needs key + spend).
- Alternatives rejected: building the audit UI as a "fake CRM screen" floating with no company record (the partner explicitly warned against this); one shared AI for both audits; running paid LLM/scrape jobs autonomously without the founder present.
- Do NOT change: the connected-object model (no orphans), founder-gated money actions, separate free/paid teams, retrieve-don't-hardcode the Wobble service catalog.
- Open: image/PDF engine choice; deploy + public URL (shared with Zernio) for any external posting/scraping; the partner's remaining ERP modules (tasks/meetings/projects/RBAC/versioning/integrations) staged later.

## 2026-07-10 - Universal AI chat + file intelligence (Claude, Opus 4.8)
- DECISION: One universal chat service (chatWithWobble / /api/ai/chat) powers every "talk to AI" spot, rather than bespoke chat per module. Ask WOBBLE is the first mount.
- DECISION: File intelligence routes by type — images→vision model, PDFs→OpenRouter file-parser plugin (works with any model), text/code→inlined. Kept in pure domain/attachments.ts so it's testable + reusable by agents/audits later.
- DECISION: Attachments go to /api/ai/chat; plain questions stay on /api/ask to preserve grounded Brain/source citations + intent routing. Best of both.
- DECISION: Greeting is a pure deterministic function (hour + founder + pick); server supplies randomness. Founder name comes from the verified session, never client input.
- WHY: Founder wants the OS to feel alive and to "just handle" any file dropped anywhere. Building it as shared primitives means the next 10 modules get chat+files for free.
- OMITTED (honesty): model-picker dropdown — no real per-call model override exists yet; a dead control would violate ENGINEERING_STANDARDS (no stubs).

## 2026-07-13 - Source deactivation = reversible archive, NOT a new lifecycle state (Claude, Opus 4.8)
- DECISION: Deactivating a source REUSES the existing `archived` record status rather than introducing a new `deactivated`/`disabled` status or a boolean flag. Deactivation sets `status=archived` + `processingStatus=archived` and KEEPS `approvalStatus=approved`; reactivation restores `status=active`/`processingStatus=ready`.
- WHY: The two real invariants the founder asked to prove — "no new collection" and "no propagation" — are ALREADY enforced by `status="active"` filters (`listApprovedSourcesForJobs` for the collection feed; `attachSourceChunks` gate for propagation). Archiving therefore stops both for free, with zero new branching in the hot paths and zero schema/migration. A separate status would have meant auditing every `status==="active"` check in the codebase to also exclude the new state — more surface, more risk, same effect.
- DECISION: Deactivation is REVERSIBLE and preserves evidence — existing `source_chunks` are never deleted, so historical evidence stays queryable and downstream context is intact; the impact check reports the preserved-chunk count to the founder before/at deactivation. This is why source.activation is treated as a RELEASE-able (not confirm-capped) autonomy action: it can always be rolled back.
- WHY NOT reuse rejectSource: `rejectSource` only transitions from `pending` (an approval decision) and sets `approvalStatus=rejected` — it cannot turn OFF an already-approved live source, and rejection is a different semantic (this was never trustworthy) from deactivation (was trusted, no longer collecting). Keeping them separate keeps the audit trail honest (`source.deactivated` vs `source.rejected`).
- GUARDRAIL (locked): deactivate/reactivate are founder-gated (`requireFounder` on `/api/sources/[id]/action`); deactivate refuses a non-active source, reactivate refuses a non-deactivated-approved source. Proven no-new-collection + no-propagation + evidence-preserved + reversible in verify:source-deactivation (x2).
- ALSO: closed the Context-OS telemetry LOW — `correlationId` is now threaded from the live generator paths (intelligence analyst/dreamer + paid_audit + content via `job.id`; proposal via `env.workflowId`) so a real retrieval fault links to its originating workflow. daily_brief left null (no per-run id exists at retrieval time).

## 2026-07-13 - Earned Autonomy releases PREPARATION; the SEND stays confirm-capped (Claude, Opus 4.8)
- DECISION: The remaining three Earned-Autonomy action points are modelled as a PREPARE/SEND split on one durable primitive (a `communications` outbox), NOT as three bespoke send handlers. `notification.internal`, `comms.external.prepare`, and `proposal.send.prepare` are the RELEASE-able points (all reversible → an earned grant can auto-run them); `comms.external.send` and `proposal.send` are the CONFIRM-CAPPED points (irreversible → `reversible:false` triggers the hard sensitivity cap → confirm ceiling, so no grant can auto-send).
- WHY: The founder mandate is explicit that "proposal sending + sensitive external comms remain confirm-capped." Preparation (a draft / staged package / an internal notification) is reversible and low-risk, so it is exactly where autonomy can safely be earned; the externally-visible SEND is where a founder must stay in the loop. Splitting the two lets autonomy grow on the safe half while the irreversible half is provably capped by the SAME pure engine (no special-casing).
- DECISION: `prepareCommunication` ALWAYS persists a `prepared` draft first, THEN resolves autonomy. Nothing is ever fabricated or hidden — even an auto-delivered notification leaves an inspectable, audited row; a held draft shows its resolved level (baseline `recommend`) so the founder sees WHY it is waiting.
- DECISION: internal notification "send" == delivery is treated as reversible/low-risk (retractable), so a grant releases it to `sent`; an external/proposal "send" is irreversible, so even under an `autonomous` grant the SEND action resolves to `confirm`. This is asserted directly (resolveActionAutonomy with the send-action shape) in the proof + a unit test, because the cap only *lowers* a level ABOVE confirm — the meaningful proof needs a grant that WOULD exceed confirm.
- DECISION: proposal-send preparation is wired into the REAL proposals flow (`prepareProposalSend` builds a `proposal_send` communication from an approved proposal, idempotent per proposal via `dedupeKey`), exposed as `prepare_send` on the proposals action route — not a standalone toy. The actual proposal `send` transition is unchanged + still founder-gated.
- GUARDRAIL (locked): every comms action is founder-gated; idempotent prepares (dedupeKey) never double-send; a sent comm cannot be cancelled; tenant-scoped grants only release matching-tenant comms (wrong-tenant proven). Autonomy is never a global switch — each action resolves from its own category + scope + conditions with hard caps.

## 2026-07-14 - The Optimizer ACTIVATES a governed record; it never rewrites production in place (Claude, Opus 4.8)
- DECISION: Making the Dream/Optimizer operational means giving the existing pure decision core (`domain/optimizer.ts`) durable stores + real evidence + a governed lifecycle — NOT letting it mutate prompts/skills/workflows/models/agents/tools/policies/QA-rubrics. "Activation" writes ONLY an `optimizer_activations` record (versioned, pinned to the baseline it must beat). A consumer READS that approved record; the optimizer itself changes nothing in place. This is how "no silent changes to [those subsystems]" is honoured: the optimizer's blast radius is its own 6 tables.
- WHY: The founder mandate is emphatic that the OS may PROPOSE self-improvements but must never silently rewrite itself. Confining all writes to the optimizer's own tables makes that invariant structural (not a promise): the ONLY path to an `active` improvement is proposed → approved (needs a passing historical test) → active (founder-driven), and a degrading active improvement is auto-rolled-back. Every step is audited.
- DECISION: Observations are normalized so HIGHER = better (pass rate, delivery health, 1/(1+cost), 1/(1+revisions)) so the pure `historicalTestPasses` (candidate > baseline) is consistent across signal types. An opportunity is formed ONLY when a signal is below a health threshold AND has enough samples — the optimizer never fabricates an opportunity from thin or healthy evidence (proven: a healthy + an under-sampled signal produce NO proposal).
- DECISION: The historical "candidate" metric is an explicit PROJECTION (close half the gap to 1.0), stored as such — never presented as a realized actual. estimatedValue is derived from the projected gap closed. This matches the domain's contract ("an estimate — never presented as a realized actual").
- DECISION: The scheduler runs the cycle in the daily-maintenance branch, cadence-gated by `optimizerCycleDue` (~1/day) so repeated ticks never re-run it. Evidence collectors read REAL tables (qa_reviews, revision_cycles, handoffs, provider_usage); a collector failure is audited and never fails the cycle. Founders can also trigger a cycle on demand from the Self-Optimizer module.
- GUARDRAIL (locked): no auto-approve, no auto-activate; approval requires a passing historical test; activation only from approved; degrade → rollback; the optimizer writes only to its own tables; every transition founder-gated + audited.

## 2026-07-14 — Deployment-readiness remediation (Codex audit WOB-AUD-001..021)

- DECISION: Regenerate `package-lock.json` using the npm that ships in `node:22-alpine` (the deploy target's npm),
  not the local npm 11. WHY: npm majors resolve floating optional deps (esbuild/@emnapi) to different exact versions;
  a lock made by npm 11 was rejected by CI/Docker's npm 10 `npm ci`. An older-npm-generated lock is forward-compatible,
  so it installs cleanly on Linux Node 22 AND local Node 24 AND alpine. Proven on all three.
- DECISION: Close WOB-AUD-004 with a per-route `requireFounder` gate on every mutation handler PLUS a static
  route-coverage TEST, rather than DB checks in the edge proxy. WHY: the edge/proxy runtime is jose-only (no pg), so
  it cannot do DB-backed revocation; the codebase's established pattern is `requireFounder` (DB-backed verifySession)
  in the handler. The coverage test makes it regression-proof (a new unguarded mutation route fails CI).
- DECISION (refine audit): WOB-AUD-011 — harden our OWN webhooks (intelligence, n8n callback) with a timestamped-HMAC
  replay window, but leave the Zernio webhook on its native raw-body HMAC (add only a body cap). WHY: Zernio is an
  EXTERNAL provider; we cannot dictate the signing envelope it sends. Replay for Zernio is bounded by idempotent apply.
- DECISION (refine audit): WOB-AUD-015 — make `verify:all-db` a filesystem-driven runner that discovers every
  `verify-*-db.ts` and runs all but a manifest-listed few (each with a reason), instead of a hand-curated chain that
  silently dropped 24 proofs. 3 proofs are deferred: one needs a live provider credential; two assert on GLOBAL
  department state and are not sequence-safe in a shared gate DB (they pass standalone). Result: 34 → 55 in the gate.
- DECISION: WOB-AUD-009 — keep the shared-founder login (an explicit product decision: one team password, caller
  selects the acting founder) and add rate-limiting/lockout as defense-in-depth. Per-user identity + MFA is a larger
  product change, intentionally deferred and documented — not silently dropped.
- DECISION: WOB-AUD-016 — do NOT force `npm audit fix` (it downgrades Next to 9.x). The 2 moderate advisories
  (postcss stringify, esbuild dev-server) are build/dev-time only and unreachable in the `node server.js` production
  runtime. Documented as triaged-accepted in docs/SECURITY.md; CI gates high/critical.
- DECISION: WOB-AUD-007 — the existing 15-table JSON snapshot is relabeled a "limited export/import" (it is not DR);
  real disaster recovery is a `pg_dump`-based backup + restore + a proven restore DRILL (dump → restore into a
  disposable DB → compare full table+row fingerprint). Off-host retention / encryption keys / WAL-PITR are
  operational config for the VPS.
