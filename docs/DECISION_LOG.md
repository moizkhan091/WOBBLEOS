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

## 2026-07-15 — Claude: per-founder accounts supersede the shared team login

- DECISION (REVERSES the WOB-AUD-009 decision above): the shared-founder login is REMOVED. Each founder now has
  their own account (`founder_profiles.email` + `password_hash`) and the acting founder is derived from the
  authenticated account. WHY: the previous model — one team password plus a caller-supplied `founder` field —
  meant anyone holding the single password could mint a session as any founder, so approvals, proposals, audit
  actor and memory attribution were only as trustworthy as "whoever typed the dropdown". The earlier decision
  deferred per-user identity as "a larger product change"; the founder has now explicitly commissioned it.
  Rate-limiting/lockout is RETAINED on top (it is still the online brute-force defense), not replaced.
- DECISION: EXTEND `founder_profiles` rather than add a `founder_accounts` table. WHY: the table already carries
  displayName/role/status for exactly these four people, and CLAUDE.md forbids duplicating schemas. `status`
  already existed and now gates login + live sessions ("active" | "disabled").
- DECISION: keep `SessionClaims.founder` (the display name) as the claim every route reads, and ADD `fid`
  (account id) + `sa` (super admin). WHY: 135 mutating routes already resolve the actor through
  `requireFounder(request)`. Keeping the claim shape makes the identity authoritative instead of chosen with a
  near-zero blast radius, rather than touching 135 routes.
- DECISION: `verifySession` re-reads the CURRENT account row and returns its displayName/isSuperAdmin rather than
  trusting the token's copy. WHY: sessions live 30 days; a renamed or de-privileged founder must not keep old
  attribution or admin rights for a month.
- DECISION: credentials live ONLY in Postgres, set by `npm run auth:bootstrap`. `SHARED_LOGIN_PASSWORD_HASH(_B64)`
  is deleted from env/config/validate/instrumentation and the deploy templates. WHY: a per-account hash cannot be
  an env var, and it removes the dotenv `$`-mangling footgun that the base64 workaround existed to dodge.
- DECISION: login returns an identical opaque 401 for an unknown email and a wrong password, and always runs a
  bcrypt compare (against a dummy hash when the account is missing). WHY: otherwise the endpoint enumerates which
  founder emails exist, by both response and timing. "Disabled" (403) is only reported AFTER the password verifies.
- DECISION: account administration (disable/enable/revoke another founder's sessions) requires the super-admin
  (`requireSuperAdmin`), not merely a founder. Self-disable is refused (409) so the OS cannot be left with no
  administrator. Moiz is the designated super admin.
- DECISION: MFA remains out of scope and is documented as future hardening rather than half-built — per the task's
  own instruction not to introduce an unreviewed partial implementation.
- DECISION: broaden the `route-auth-coverage` guard to accept `requireFounder` | `requireSession` |
  `requireSuperAdmin` instead of allow-listing the new auth routes as "public". WHY: all three resolve through the
  same DB-backed `verifySession`; allow-listing would have created a real hole in the guard, whereas teaching it
  the stricter gates preserves the invariant. `requireSuperAdmin` is additionally asserted on the account-action route.

---

### 2026-07-15 - Founder(Moiz)+Claude - Founder memory is TRANSPARENT; identity-safe learning; Ask WOBBLE as universal front door
- Decision (BINDING FOUNDER CORRECTION — reverses an in-progress Claude implementation before it was committed):
  1. **Founder company memory is visible to every authenticated founder.** Preferences, communication style,
     design/writing taste, strategic tendencies, expertise, department ownership, responsibilities, recent work,
     decisions, approvals, rejected directions, tasks, project history, meeting/call notes, AI-learned preferences.
     This is the product working: transparency, accountability, coordination, fewer repeated explanations.
  2. **Only the owner may directly edit their own founder memory.** Other founders' profiles are READ-ONLY.
  3. **A super-admin may correct another founder's profile only through a dedicated administrative action**
     requiring explicit target + reason + confirmation + audit event + before/after values + actor attribution +
     notification to the affected founder. A generic query parameter must never silently retarget a write.
  4. **AI learning writes ONLY to the authenticated founder.** Identity comes from the verified session — never a
     dropdown, URL segment, request-body founder name, client-supplied actor field, or display name.
  5. **A statement about another founder becomes a SUGGESTION, not confirmed memory.** ("Moiz says Ali prefers
     aggressive pricing" → a pending suggestion targeting Ali with source/confidence/evidence, which Ali or an
     authorized super-admin approves, edits, or rejects.) Low-risk observed preferences about the AUTHENTICATED
     founder may auto-add with source/date/confidence/origin/audit + correction path; material identity,
     responsibility, policy, financial or strategic conclusions stay proposals until approved.
  6. **Security material is never founder memory:** passwords, hashes, auth/session tokens, API keys, private keys,
     recovery codes, provider credentials, infrastructure secrets, and legally restricted personal information
     unrelated to company work. Those live in secure systems.
  7. **Ask WOBBLE is the universal company command surface** — the front door OVER the specialised modules, never a
     replacement for them. Existing modules remain for detailed work, direct control, department state, revisions,
     monitoring, settings, evidence and approvals.
  8. **Routing must be capability-based, confidence-aware, cost-aware, client-scoped, founder-aware and auditable**
     — an Intent Analyzer / Context Resolver / Capability Router / Mission Planner / Department Orchestrator /
     Execution Supervisor / Quality Evaluator / Founder Approval Gate architecture. NOT one giant generic prompt,
     and NOT a fan-out that calls every department for every request.
- Context / why: Claude's local UAT campaign proved live that an ordinary founder (Ali) could read a private canary
  out of Moiz's `founder_moiz` bank through three endpoints, and began fixing it by making founder memory
  owner-private on read (mirroring `canEditMemoryBanks`). The founder corrected the DIRECTION: the leak framing was
  wrong. WOBBLE is an internal company OS built on founder transparency — founders SHOULD see each other's company
  memory. The genuine defect is on the WRITE side: caller-controlled identity and silent modification of another
  founder's memory. "Visibility is not ownership."
- Alternatives rejected:
  - **Owner-private founder memory reads** (Claude's first direction) — REJECTED. It destroys the transparency the
    company OS exists to provide and would force founders to re-explain themselves to each other.
  - **Blending all founders' preferences into every answer** — REJECTED. Visibility is not ownership: WOBBLE must
    not adopt Ali's writing style as Moiz's default just because Ali's profile is readable. Personalization is
    scoped to the authenticated founder (`personalizationFounder`); explicit collaboration reads are not.
  - **Super-admin read exemption / super-admin silent edit** — REJECTED both ways. Reads need no exemption because
    reads are open; writes need a governed, audited, notified correction flow rather than an implicit privilege.
- Affects: `src/lib/domain/memory.ts` (`identityScopedBanks` replaces the rejected `canReadMemoryBanks`),
  `src/lib/memory/index.ts` (`personalizationFounder`, `getFounderMemory(founder, viewer)` → `editable`),
  `src/lib/ask/index.ts` (brain retrieval personalizes as the authenticated founder), memory API routes,
  `src/components/os/os-ui.tsx` (Founder profiles surface; `useSessionFounder`), `tests/memory-manage.test.ts`,
  `tests/route-auth-coverage.test.ts`.
- Do NOT change: founder-to-founder READ access (transparency is the requirement, not a bug — a test asserts it so
  a future "shouldn't this be private?" change must argue with a failing test); owner-only EDIT via
  `canEditMemoryBanks`; session-derived identity; the read-side session gate (WOB-UAT-029) — transparency is for
  AUTHENTICATED founders only, and an unauthenticated/revoked/disabled reader still gets nothing.
- Risks / open questions: the memory-suggestion flow (5), the governed administrative correction (3), the founder
  profile surface (activity/decisions/approvals/commitments), and the universal router (7, 8) are SPECIFIED here but
  NOT yet implemented. They are open work, not delivered capability, and must not be described as done.

### 2026-07-15 - Claude - Read routes are a security boundary, not a convenience
- Decision: every founder-facing API READ requires a DB-backed session gate, enforced statically by
  `tests/route-auth-coverage.test.ts` with a narrow, justified public allowlist (health probes, `auth/session`,
  `public/media/[id]`).
- Context / why: `src/proxy.ts` verifies the JWT SIGNATURE ONLY — its own comment defers revocation/expiry to
  `verifySession` in the Node handlers. 39 of 105 GET routes never called it. Proven live: after Moiz revoked Ali's
  sessions (`sessionsRevoked: 2`), Ali's revoked cookie got **401 on POST** and **200 with real data on GET**,
  including another founder's memory. Revoking a departed or compromised founder did not stop them reading for the
  30-day JWT lifetime — the control was decorative. WOB-AUD-004's guard only covered mutations, which is why this
  shipped.
- Alternatives rejected: enforcing revocation in the edge proxy — REJECTED, the edge runtime has no DB access
  (jose-only), which is precisely why the gate belongs in the handlers.
- Affects: 29 GET route handlers, `tests/route-auth-coverage.test.ts`.
- Do NOT change: the read half of the coverage guard, or the public read allowlist without justifying each entry.
  A new ungated read route must fail CI.
- Risks / open questions: this closes the read bypass, not the underlying design — a JWT-only edge remains a
  latent trap for any future route that forgets the gate. The guard is what makes forgetting fail loudly.

---

## Decision: the WOBBLE Company Twin is built from existing primitives, not a new "company profile" table

- Context: execution-order step "onboard WOBBLE itself (Company Twin)". The instinct is a dedicated
  company_profile / brand_dna / design_dna table. CLAUDE.md forbids duplicating schemas — extend what exists.
- Decision: the Company Twin = a `crm_companies` self-record (status `internal`, client_type `self`) +
  WOBBLE truth seeded into the ALREADY-EXISTING memory banks (`company`, `brand`, `design`, `offer`) +
  the offers module as the service catalogue. Zero new tables, zero migrations.
- Why: (1) the banks already exist with exactly the right scopes/purposes — `company` = "internal WOBBLE
  truth, positioning, strategy", `brand` = "voice, do-not-say, guardrails", `design` = "visual taste,
  creative direction", `offer` = "offers, pricing, positioning". (2) Memory is embedded + vector-searchable,
  so the twin is queryable by Ask WOBBLE the moment it is seeded — a bespoke table would need its own
  retrieval wiring. (3) `crm_companies` already anchors contacts/opportunities/proposals/projects, so a
  self-record lets WOBBLE's own pipeline hang off the same backbone as clients.
- Source of truth: every fact was condensed from docs/WOBBLE_COMPANY_OS.md (nothing invented) — brand mode,
  the four-step commercial spine, ICP, the anti-agency-dependency enemy, the payment boundary, the internal
  data-moat caveat, the voice/controversy/do-not-say rules, the language system, and Design DNA (#B8FF2C).
- Do NOT: add a parallel "brand"/"company profile" table later — extend the banks or `crm_companies`.
  Do NOT publicly frame the data-moat as "we monetize client data" (seeded as an internal-only caveat).
- Risks / open: the running app container has no OPENROUTER_API_KEY, so query-embedding-backed retrieval
  is proven via a host script that carries the key; wiring the key into the app is a separate step before
  Ask WOBBLE can semantically retrieve twin facts in-browser.

---

## Decision: Static Creative DNA = structural facts (free) + a SMALL live vision sample, not a full 196-image scan

- Context: founder asked for "Static Creative DNA" from the ~196/250-asset WOBBLE social library.
- Decision: seed the `design` bank with (1) structural + angle DNA counted from the manifest/folder taxonomy
  (free, deterministic, exhaustive), and (2) observed visual DNA from a 3-image vision sample only.
- Why sample, not all 196: at ~25.6k tokens/image gpt-4o-mini vision costs ~$0.0039/image, so 196 = ~$0.76 —
  affordable but wasteful when 3 representative frames (pain/outcome/system of the top campaign) already
  reveal the execution pattern. Founder budget posture is STRICT; spend only what the finding needs. If a
  future task wants full per-asset tagging, the path is proven — scale the same script with a hard item cap.
- Payoff beyond confirmation: the sample surfaced a real pattern (pain frame = light/black old-world; outcome
  & system frames = dark + #B8FF2C future-world), i.e. lime is a SOLUTION-frame signal, not a global wash.
- Do NOT: run an unbounded vision loop over the whole library without a budget check + item cap; do NOT treat
  the 3-sample visual note as exhaustive per-asset truth (it is a sampled DNA signal).
- Affects: design memory bank; external_provider_spend (3 tracked calls); src/scripts/prove-static-creative-dna.ts.

---

## Decision: marketing knowledge goes through the real knowledge engine (source→chunks→compile), not memory banks

- Context: step-7 split said the offer sheets are BOTH the service catalogue (→ offers module, done) AND
  marketing knowledge (hook banks, ad angles, psychology, copy banks). This is the marketing-knowledge half.
- Decision: ingest the 34 Phase-4 sheets through the `knowledge` module — createSource(internal_company_document)
  + attachSourceChunks (immutable raw, one chunk per `##` section) + compileSource (LLM → cited notes). NOT a
  flat dump into a memory bank.
- Why the knowledge engine over memory: it is the documented "immutable raw + compiled + citations +
  supersession" contract step 20 asks for. Raw chunks preserve fidelity (the actual 50-hook banks, copy
  banks, ad-angle matrices); compiled notes carry provenance_chunk_ids back to those chunks; findSimilarNotes
  gives dedup/reinforcement over time. A memory-bank dump would lose provenance and the raw/understanding split.
- Budget: compiler role = gpt-4o-mini (cheap); 34 compiles = $0.041, worst-case reservation ($0.44/call) still
  clears $2.70 because actual spend stays tiny. Chose to compile ALL 34, not a sample — the model is cheap
  enough that full coverage costs pennies and there is no reason to leave 29 sheets uncompiled.
- Gotcha logged: SOURCE trust levels are a separate tiered enum (tier_1_core_wobble…tier_4_experimental),
  distinct from the memory TrustLevel enum. Using a memory trust level throws in resolveSourceTrust.
- Do NOT: dump marketing knowledge straight into memory banks; treat the 55 notes without explicit chunk
  provenance as un-sourced (they are sheet-level synthesis, still linked to their source).
- Affects: sources (34), source_chunks (476), knowledge_notes (249), external_provider_spend (34 tracked).

---

## Decision: OpenRouter image gen is a new MediaProvider alongside fal, not a replacement; image-only for now

- Context: founder wants OpenRouter as the unified media provider (text/vision/image/video), fal preserved
  and truthfully disabled without FAL_KEY.
- Decision: add `openrouterMediaProvider` implementing the existing `MediaProvider` interface and register it
  in `defaultProviderRegistry()` next to fal. Scope THIS adapter to `kind: "image"`; refuse video/audio/3d
  with a clear error (fal's domain).
- Why image via chat-completions: OpenRouter's image-output models (verified live: 11 of them, e.g.
  google/gemini-2.5-flash-image ~$0.04/img) return the image INLINE as a base64 data URL on
  `choices[0].message.images[].image_url.url` — no separate images endpoint, no CDN download, no SSRF surface.
  Cost is authoritative from `usage.cost`.
- Why not extend fal-provider: fal uses a submit→poll→download QUEUE flow with CDN URLs; OpenRouter is a
  single synchronous call with inline bytes. Different enough that a separate adapter is cleaner than
  branching fal. Both satisfy the same 3-method interface, so the registry/worker treat them identically.
- Proof scope: proved the adapter directly (generate → real image → storage → cost) + registry membership +
  configured-gating, NOT the full queue chain — the LIVE worker runs an old build without the provider/key and
  races the shared media_jobs table, blocking openrouter jobs. That path needs a worker rebuild.
- Do NOT: claim video via OpenRouter (image models don't do video — #13 needs its own adapter); remove fal
  (it stays for video/audio/3d, truthfully blocked without FAL_KEY).
- Follow-ups: wire OPENROUTER_API_KEY into the worker env + rebuild so queue→worker→artifact lands live;
  unify media spend into the assertProviderAllowance PRE-check (today media has its own per-job cent cap +
  post-hoc external_provider_spend recording).
- Affects: src/lib/domain/media.ts, src/lib/media/openrouter-provider.ts, src/lib/media/index.ts,
  tests/openrouter-media-provider.test.ts, src/scripts/prove-openrouter-image.ts.

---

## Decision: ElevenLabs is a standalone governed provider (characters), not a MediaProvider

- Context: founder's ElevenLabs addendum — controlled voiceover (≤1 audition, ≤1 acceptance, ≤1 retry, NO
  cloning), locked v2 settings, a UAT key + voice id in the secrets store.
- Decision: `src/lib/elevenlabs/index.ts` mirrors the tavily/apify adapters (kill-switch → budget → slot →
  record), NOT the media MediaProvider interface.
- Why not a MediaProvider: the media system meters cost in CENTS; ElevenLabs bills in CHARACTERS against a
  quota (232285). Forcing chars→cents would fabricate a rate and lose the real budget unit. The provider-budget
  ledger already models a `characters` unit + an `elevenlabs` budget, so the standalone adapter tracks the true
  unit. (A thin MediaProvider wrapper for kind:"audio" can be added later if the job queue needs it.)
- TTS-only by construction: one endpoint (/v1/text-to-speech/{voiceId}); the code never references a
  voice-creation/cloning endpoint — the "no cloning" rule is structural, and a unit test asserts the URL.
- v2 lock: default model eleven_multilingual_v2 + VOICE-SETTINGS.md settings; NEVER v3 for the Moiz voice
  (client hard rule — v3 "doesn't sound like me"). voiceId is a required caller param so the personal clone id
  is never committed to the repo.
- Do NOT: switch the Moiz voice to v3; hardcode a voice-clone id in code; call any ElevenLabs cloning endpoint.
- Follow-ups: the ≤1 ACCEPTANCE VO (final, on an approved script) still to run; word-timing/caption sync
  (VOICE-SETTINGS.md references a tag-stripping parser for v3) is a separate reel-assembly concern.
- Affects: src/lib/elevenlabs/index.ts, tests/elevenlabs-adapter.test.ts, src/scripts/prove-elevenlabs-voiceover.ts.

---

## Decision: Offer Validation Lab = 11 dimension agents + ONE shared evidence search, weighted verdict, versioned

- Context: founder spec — "Offer Validation Lab (11 agents), Tavily/Apify evidence, dimension scores, verdicts, versioned."
- Decision: a new module with two tables (0056), 11 registered dimension agents, and runOfferValidation that gathers
  ONE governed Tavily search shared across all 11 dimension LLM calls, then rolls up a weighted go/pivot/kill verdict
  and persists a VERSIONED run (re-validation → v2, never overwrite).
- Why one shared evidence search (not per-agent): 11 separate searches would burn ~11 Tavily credits per validation
  for little marginal signal; one broad demand/competitor/objection search grounds all dimensions and keeps the paid
  footprint tiny (1 credit + 11 cheap gpt-4o-mini calls ≈ $0.002). Evidence is GRACEFUL — a null adapter or a failed
  search still validates on the offer text (evidenceCount 0), so the lab never hard-blocks on the web.
- Why weighted, normalized scoring: dimensions differ in importance (market_demand/pain/icp_fit weigh more than
  message_clarity); normalizing by the weights actually scored means a partial run still yields a sane 0-100.
- Verdict thresholds go≥70 / pivot≥45 / kill: a pivot band exists on purpose so a near-miss offer gets "fix the weak
  dimension", not a binary kill. The summary names the weakest dimension so the pivot is actionable.
- Do NOT: overwrite prior validation runs (version them); do one Tavily search PER dimension; treat a graceful
  no-evidence run as a failure.
- Follow-ups: wire it as a department consumer (accept an offer handoff) + a founder route/UI; Apify as a second
  evidence source for competitor scraping where Tavily is thin.
- Affects: migration 0056, src/db/schema.ts, src/lib/domain/offer-validation.ts, src/lib/offer-validation/index.ts,
  src/lib/domain/agents.ts (+11), tests/offer-validation.test.ts, src/scripts/prove-offer-validation.ts.
