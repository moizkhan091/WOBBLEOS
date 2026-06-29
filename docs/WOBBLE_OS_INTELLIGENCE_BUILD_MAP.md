# WOBBLE OS Intelligence & Transcript-to-Build Map

Date: 2026-06-29
Owner: Claude (for Moiz + all AI builders: Codex, Gemini, Antigravity, future)

Purpose: turn everything learned from the 9 AI OS transcripts into a concrete build map for WOBBLE OS. This says, for each genuine idea: what it is, where it lives in our chunk plan, which tables/workers it uses, and how we make it better than the videos. WOBBLE OS is the internal operating system we will actually run our agency on, so this is "best in the world for us," not a demo.

Read alongside:

- `docs/AI_OS_TRANSCRIPT_LESSONS_FOR_WOBBLE.md` (the lessons + addendum)
- `docs/FINAL_V2_MASTER_BUILD_PLAN.md` (six-layer architecture)
- `docs/V2_BUILD_ACCEPTANCE_PLAN.md` (the 34 chunks, 00-33)
- `docs/WOBBLE_OS_BACKEND_ORCHESTRATION_MAP.md` (worker vs n8n)

Non-negotiable order (do not break it): `Brain -> Data -> Registry -> Workers -> Approvals -> n8n -> Cadence -> Command Center`. Everything below respects "do not automate a weak workflow."

---

## Part 1 - The 9 Transcripts In One Line Each

1. 5 Skills To Build An AI OS - the 5 skills: strong Context, real Data, editable Skills/SOPs, Connections, Cadence.
2. 6 Things People Get Wrong - skip the foundation, dump raw files, hardcode strategy, automate too early, no approvals, let context rot.
3. Build & Sell Claude Code OS (2hr) - the Four C's (Context, Connections, Capabilities, Cadence), prime behavior, skills as living SOPs, prefer direct APIs, save provider reference docs, separate service keys.
4. This INSANE AI OS Runs My $25M Business - decision history as a learning asset; maturity path inform -> recommend -> confirm -> autonomy; agents should push back.
5. Graphify / Knowledge Graph - give the agent a "map" of code and knowledge so it reads summaries not raw files; facts vs guesses; blast radius; one shared brain across agents/devices.
6. Visual Intelligence Dashboard + Dreaming - a 6-pillar dashboard (models, memory, skills, usage, knowledge, connections) plus a nightly self-improving "dreaming" engine that returns ~4 high-leverage recommendations.
7. Selling AIOS As A Service - shift from point-solutions to a bottom-up Context OS; read+write integrations; ROI tracking; offer ladder (train / done-with-you / productized + retainer).
8. AIOS Methodology - it is a methodology wrapping the business model, built in layers not leaps; Daily Brief; operator/bandwidth trap; commands like /explore and /brainstorm.
9. Cape Town Mastermind - non-technical founders can stand up an AIOS in ~8 hours; Context OS is the first "aha"; everything packaged as plug-and-play installs.

---

## Part 2 - Master Mapping: Every Capability -> Where It Lives

Format: Capability -> source transcript(s) -> WOBBLE chunk(s) -> tables/workers -> how we make it better.

### A. Foundation / Brain & Data

- Strong essential Brain docs first (not raw dumps): T1,T2,T8 -> Chunk 03 Seed Brain / Chunk 10 Memory -> `memory_records`, `source_trust_levels` -> Better: every Brain doc is versioned and approval-gated; updates only via `memory_update_proposals`.
- Context OS / "stop pasting context": T7,T8,T9 -> Chunk 10 Memory + Chunk 14 Content + Chunk 11 Ask WOBBLE -> `memory_records`, `memory_chunks` -> Better: tiered (core/working/episodic) + trust-weighted retrieval, not one flat file.
- Data OS (pull business data into one queryable place): T7,T8 -> Chunk 09 Source Library + future connectors -> `sources`, `source_chunks`, `provider_connections` -> Better: every external source is approval-gated and trust-tiered before it can affect strategy.
- Knowledge graph / "give it a map" + facts vs guesses + blast radius: T5 -> Chunk 09/10 (retrieval) + Chunk 36 Auditor -> `source_chunks`, `memory_chunks` (add a relations/index layer later) -> Better: label cited-fact vs inferred on every chunk; show "blast radius" (what a Brain update affects) on the approval screen before commit.

### B. Skills / Prompts / Commands

- Skills are living SOPs, not buried prompts: T1,T3,T8 -> Chunk 34 Prompt/Skill Registry -> `prompt_skills` (already seeded) -> Better: versioned, approval-gated, feedback can propose updates; workers must load approved skills, never hardcode.
- Commands (/prime, /explore, /brainstorm): T8,T9 -> Chunk 34 Registry + Chunk 11 Ask WOBBLE routing -> `prompt_skills` -> Action: seed `prime`, `explore`, `brainstorm` command-skills next to content/research/decision skills.
- Prime behavior (always load core context first): T3 -> Ask WOBBLE + every worker -> context loader -> Better: enforced in code - Tier 1 Brain + do-not-say always loaded before serious output.

### C. Connections / Tools

- Prefer direct APIs, n8n for glue: T3 -> Chunk 08 Provider Adapter Registry + Chunk 35 Connections Registry + Chunk 18 n8n Handoff -> `provider_connections`, `webhook_endpoints` -> Better: each connection has enabled state, allowed modules, cost category, health, reference doc path; secrets only in env.
- Read AND write integrations (operate the business, not just read): T7,T8 -> Chunk 08 + Client AIOS Lab Chunk 26 -> `provider_connections` -> Better: write actions are approval-gated and audited.
- Save provider reference docs locally: T3 -> `docs/provider-references/*` -> Action: keep openrouter/search/fal/n8n reference docs current; update on every failure learned.
- Separate service accounts/keys: T3 -> Chunk 28 Settings -> env + `provider_connections.credential_key_name` -> Better: never display secrets; cost tracking knows which provider/model/module/job spent money.

### D. Workers / Capabilities

- Workers think and produce; n8n moves things: T3,T4 -> Chunks 06/07 Queue+Runtime, 15 Content Worker, 12 Research, 22 Media -> `jobs`, `job_attempts`, `worker_heartbeats` -> Better: workers load Brain+sources+approved skill, call model, validate, save, create approval, log cost+audit.
- Ask WOBBLE (natural-language surface): T1,T8 -> Chunk 11 -> `model_runs`, memory retrieval -> Better: answers cite sources, show confidence, opposing view, and what needs founder judgment.
- Content engine (WOBBLE first, founder tracks): T1 -> Chunks 14/15/16/17 -> `content_packets`, `content_versions`, `quality_reviews` -> Better: quality gate blocks weak drafts before they reach approvals.
- Research Radar + external opportunities: T6,T8 -> Chunk 12 -> `sources`, insights, `model_runs` -> Better: new sources go to approval queue, never silently trusted.
- Decision Room + decision history: T4 -> Chunk 24 -> decisions + `audit_logs` -> Better: store options, evidence, opposing view, founder choice, outcome; this teaches founder judgment over time.
- Offer Lab + offer ladder: T7 -> Chunk 25 -> offers/experiments -> Action: seed the train / done-with-you / productized + retainer ladder as offer material.
- Client AIOS Lab (this is our actual business): T7,T9 -> Chunk 26 -> client-scoped sources/memory -> Better: client data isolated from WOBBLE Core Brain; deliverables approval-gated; ship a simple client chat surface + ROI view.
- Media / Video Studio: (Set A) -> Chunks 21/22/32 -> media assets/jobs -> Better: expensive jobs need budget approval; clips and final MP4 each approval-gated.

### E. Safety / Control / Ops

- Approvals as the founder gate: all transcripts -> Chunk 04 -> `approvals`, `approval_actions` -> already seeded with full action set.
- Audit everything: T4 -> Chunk 03 -> `audit_logs` (DONE this session) -> every important action writes an event.
- Cost / model-run tracking + budget caps + kill switches: T3,T6 -> Chunks 05/19/28 -> `model_runs`, `provider_runs`, `budget_caps`, `automations` -> Better: budget guard can block or require approval; kill switches actually stop job enqueue.
- Context rot / hygiene optimizer: T2,T6 -> Chunk 36 AI OS Auditor (see Part 3) -> proposes, never auto-applies.

### F. Visibility / Cockpit

- 6-pillar visibility (spend, ROI, limits, connections, stale memory, underused skills): T6 -> Chunk 29 Command Center + Chunk 20 Workers Health -> aggregation queries -> Better: real state only, no fake metrics.
- Daily Brief (5-10pg PDF + short morning summary): T8 -> Chunk 29 + Chunk 36 + Cadence (Chunk 19) -> scheduled worker -> high-value early win; build after manual brief works.
- Four C's + 3 KPI scorecard (away-from-desk autonomy, automation %, revenue per employee): T6,T8 -> Chunk 29/30 -> Better: shown next to Brain health, cost risk, approval backlog.

### G. Distribution / Cadence / Reach

- Away-from-desk (run from phone via Telegram/WhatsApp): T8 -> n8n notification rail + future Ask WOBBLE chat -> `webhook_endpoints` -> n8n is the messenger, not the brain.
- Cadence (daily radar, weekly rollups, nightly optimizer, backups): T1,T8 -> Chunk 19 Automations -> `automations`, `automation_runs` -> Rule: only schedule after the manual path works.
- Plug-and-play installs / modules: T8,T9 -> plugin packaging -> Better: V2 chunks packaged for reuse and for client setups.

---

## Part 3 - The WOBBLE Dreaming Engine (Self-Improving Intelligence)

This is the capability Moiz most wants. It is our version of the transcript "dreaming" engine, but grounded in our database and our approval model so it is trustworthy, not a black box. It maps to Chunk 36 (AI OS Auditor / Brain Optimizer) and runs as a scheduled worker job - cadence, so it comes AFTER the manual auditor view works.

### What it is

A nightly (and on-demand) worker run that reviews recent OS activity and produces a small number (target 4-6) of high-leverage, evidence-linked recommendations. It NEVER edits the Brain or settings by itself. Each recommendation becomes an approval item. Founder approves -> change is applied + audited. Founder rejects -> that rejection is stored as judgment signal.

### The 8 analysis dimensions (adapted to WOBBLE tables)

1. Activity analysis - scan Ask WOBBLE sessions, content/research/decision jobs. If a task was done manually 3+ times, propose a new `prompt_skill`.
2. Cost intelligence - read `model_runs`/`provider_runs`. Flag over-spend and propose model right-sizing per module/role vs `budget_caps` ("this module is paying premium model prices for simple work").
3. Skill performance - read `prompt_skills` (last used) + `quality_reviews` (pass/fail). Flag stale or weak skills; propose updates or archival.
4. Memory health - find stale `memory_records`, duplicate `memory_chunks`, conflicting Brain rules, low-trust sources being overused, missing citations.
5. Source health - surface `sources` approval backlog, trust-tier coverage gaps, sources not used in a long time.
6. Content/quality patterns - read `quality_reviews` trends; recurring failure reasons -> propose a do-not-say rule or a skill tweak.
7. Workflow/automation patterns - read `automation_runs`, `dead_letters`, `job_attempts`; flag repeated failures and retry storms.
8. External opportunities - pull recent approved Research Radar insights relevant to `current-priorities`; web-enrich only if allowed and within budget.

### How a run works (the stable coded workflow)

1. Scheduled trigger creates a `jobs` row (queue: ops) - respects the kill switch and budget cap first.
2. Worker loads Brain (current priorities, do-not-say), then runs the 8 dimension analyzers over the tables above.
3. Worker scores candidate findings by expected impact x confidence, dedupes, and keeps the top 4-6.
4. For each kept finding it writes a recommendation that becomes an approval item:
   - Brain/memory change -> `memory_update_proposals` + `approvals`.
   - Skill change -> proposed `prompt_skills` version + `approvals`.
   - Settings/budget/model-role change -> settings-change proposal + `approvals`.
5. Worker logs `model_runs` (cost, latency), writes `audit_logs`, and records an `automation_runs` row (success/failure).
6. Founder reviews in the Approvals queue. Approve applies + audits; reject stores the reason.

### Maturity path (do not skip)

Inform -> Recommend -> Confirm -> (Autonomy later, earned). V2 targets Inform + Recommend + Confirm. The engine never silently mutates Core Brain.

### How we make it BETTER than the videos

- Evidence-linked: every recommendation cites the exact `model_runs`/`memory`/`quality_reviews` rows that triggered it. The video version just asserts; ours proves.
- Confidence + expected-impact scoring + dedupe so the founder gets a few sharp items, not noise.
- Closed feedback loop: approve/reject decisions are stored (Decision Room link) so the engine learns WOBBLE founder judgment over time - this is the real self-improvement, not just nightly suggestions.
- Self-budgeted: the optimizer obeys its own cost cap and kill switch so it can never run up spend.
- Scoped: can run per content track (WOBBLE vs founder) and per client (Client AIOS Lab) without mixing data.
- Tool-agnostic: runs on OpenRouter model routing, so it is not tied to one model vendor.

---

## Part 4 - Improvements Beyond The Transcripts (to make WOBBLE OS best-in-class)

- Citations + confidence + opposing view on every serious AI output, not just answers - turns the OS into a trustworthy advisor.
- "Blast radius" preview on every Brain/skill change so the founder sees downstream impact before approving.
- Decision history as training data feeding the Dreaming Engine (the system literally learns how Moiz/Haad decide).
- ROI engine: a "founder time value" setting (Chunk 28) so time/money saved per skill is computed and shown - internally and to clients.
- Client-ready exports: the same intelligence/ROI views can be generated per client for the agency offer.
- One shared brain across all AI builders (Postgres + Brain), so Codex/Claude/Gemini/Antigravity never start cold.

---

## Part 5 - Suggested Order To Build The Intelligence Layer

The data spine comes first (already underway). The intelligence layer should be built in this order, each only after the manual version works:

1. Finish spine: Audit (DONE) -> Approvals (04) -> Model Runs/Cost (05) -> Queue (06) -> Worker Runtime (07).
2. Provider Adapter (08) -> Source Library (09) -> Memory/Brain (10) -> Ask WOBBLE (11).
3. Content (14/15/17) and Research Radar (12) so there is real activity to analyze.
4. Command Center (29) read-only health + manual AI OS Auditor view (36).
5. Daily Brief as a manual run, then scheduled (19).
6. WOBBLE Dreaming Engine as a manual "Run Optimizer" button (36), then nightly cadence (19).
7. KPI scorecard (Four C's + away-from-desk + automation % + revenue per employee) on Command Center.

Rule restated: prove each manually, then schedule it. That is how WOBBLE OS becomes powerful without becoming chaotic.
