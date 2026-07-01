# WOBBLE OS - Architecture & Vision Alignment Review (brutally honest)

Date: 2026-07-01. Author: Claude (senior-architect audit, grounded in `src/db/schema.ts` - not vibes).

## Verdict in one paragraph

What exists today is a REAL, tested foundation (spine + a real dashboard for that spine) - it is NOT fake UI. But it is roughly 25-30% of the vision. It is a strong SaaS-style foundation, NOT yet the hive-mind AI OS. The hard, differentiating 70% is not built and, more importantly, the SCHEMA for it barely exists: the Source "Library" is a flat list (not a Source Registry), memory is one space (not routed multi-banks), there is NO agent registry or agent-run visibility, there is no research review inbox, content is a single LLM call (not a multi-agent creative team), and there is no taste/learning store. So your worry is PARTIALLY correct: the wired pages are backed by real backend, but the system cannot yet do the real agency workflows, and the dashboard modules for those are honest "planned" placeholders, not working systems.

---

## 1. CURRENT-STATE AUDIT (grounded in the 37 real tables)

REAL + CONNECTED (works, tested, effect-verified):
- Spine: approvals (+ router that completes real entity actions), audit_logs, jobs/job_attempts/worker_heartbeats, model_runs/provider_runs + budget_caps (cost), provider_connections (table), settings.
- sources (FLAT), files, source_chunks (raw chunk + embed layer).
- memory_records/memory_chunks (single space: memory_tier core/working/episodic + `area` string + tags + pgvector) + memory_update_proposals (propose->approve->insert).
- content_tracks/content_packets/content_versions/quality_reviews (SINGLE-agent text content + excellence gate).
- Intelligence SUBSTRATE (Chunk 50): research_targets, intelligence_items, intelligence_insights, intelligence_suggestions, experiments, output_intelligence_usage.
- prompt_skills (versioned SOPs), automations/automation_runs, webhook_endpoints/events/dead_letters (n8n), backup_runs.
- Dashboard: 10 wired pages doing real work; 16 honest "planned" pages.

ONLY UI / PLANNED (honest, NOT faked): research radar, learning engine, media studio, presentation, decision room, offer lab, clients, automations UI, workers health, backup, settings, growth modules.

MISSING for the vision (the hard part - schema does NOT support these yet):
- Rich SOURCE REGISTRY: `sources` has only title, source_type(open string), url, trust_level, approval_status, status, added/discovered/approved_by. It LACKS owner/company/client/project, intended_use, connected_agents, refresh_frequency, last_scraped_at, processing_status, confidence, memory_banks_fed, cost_used, related_outputs. And there is NO per-type intake (YouTube transcript, IG reel/carousel scrape+vision, website scrape). Every source is treated the same.
- MEMORY BANKS + ROUTING: memory is ONE space with a tier + an `area` string. There is no bank registry, no LLM router that decides "this reel feeds competitor + hook + design + taste banks", no suggest-multiple-banks-then-approve, no per-bank retrieval.
- AGENT REGISTRY + ORCHESTRATION: there is NO agents table and no agent_runs. `created_by_agent` is just a string. Workers are invisible as "agents". No visibility into agent teams, cost per agent, quality per agent, run history. This is the single biggest gap for a hive-mind.
- RESEARCH/INTELLIGENCE REVIEW INBOX: the substrate tables exist but there is no flow/UI to see agent findings, their reasoning, suggested memory placement, and approve/reject/route/merge/learn. You literally cannot review what research agents found today.
- MULTI-AGENT CREATIVE + VISUALS: content is ONE LLM call producing text packets. No image/carousel/video generation, no image-prompt agent, no visual QA, no content-pack -> review -> generate-visuals-after-approval flow.
- TASTE / LEARNING: no taste_profiles, no feedback/rejection-reason store. The OS does not learn what you love/hate or per-founder taste.
- SMART COST ROUTING: cost is logged, but there is no per-agent model tiering, caching, scrape-dedup, or cost-per-client/output/workflow.
- ANTI-HALLUCINATION SURFACING: the workers lean on approved sources + "don't invent", but outputs do not SHOW their provenance/confidence in the UI.

RISKY: (a) treating `sources` as done when it is a stub; (b) building more dashboard modules on top of a schema that can't back them; (c) the single-call content worker being mistaken for the creative system; (d) no agent visibility means "hidden agents with no logs" - exactly what you said to avoid.

## 2. ARCHITECTURE CORRECTION PLAN

Backend/schema (extend, do NOT duplicate):
- SOURCE REGISTRY: extend `sources` with: owner_scope (global/company/client/project) + owner_id, intended_use[], connected_agents[], refresh_frequency, last_scraped_at, processing_status (queued/scraping/analyzing/routed/failed), confidence, cost_used, memory_banks_fed[]. Add `source_intake_runs` (source_id, type, tool used e.g. apify, status, raw payload ref, extracted insight ref, cost, logs, error). Per-type intake handlers registered like job handlers (data-driven, not hardcoded): youtube_video, ig_reel, ig_carousel, ig_post, website, reddit, tiktok, rss, competitor_*, design_reference, etc. Reuse jobs/workers for the runtime.
- MEMORY BANKS: add a `memory_banks` registry (slug, scope, purpose) seeded with the 18 banks (global/company/client/project/competitor/brand/design/content/seo/offer/research/founder_taste/founder:<id>/rejected/approved_output/performance/agent_learning). Tag memory_chunks/records with one-or-many bank slugs (extend `area`->`bank` + a chunk<->bank link or a `banks text[]`). A memory ROUTER (LLM skill) proposes bank(s) + edited knowledge -> approval -> store into N banks. Reuse memory_update_proposals; add bank routing + rejection reason.
- AGENT REGISTRY (NEW): `agents` (slug, name, purpose, input_types[], output_types[], tools[], memory_banks[], model_role, cost_profile, cadence manual/schedule/n8n, quality_score, status) + `agent_runs` (agent_id, job_id, model_run_ids[], inputs ref, outputs ref, cost, status, quality, source_ids_used[], memory_ids_used[], created). EVERY model call attributes to an agent_run. Workers + the content graph register as agents. This gives orchestration + visibility + cost/quality per agent.
- RESEARCH/INTELLIGENCE INBOX: a service+view over intelligence_items/insights/suggestions with status pending_review + actions approve/reject(reason)/edit/merge/route-to-memory/send-to-module/re-analyze/mark-value. Reuse approvals + memory router + feedback store.
- TASTE/LEARNING (NEW): `taste_profiles` (scope brand|founder:<id>|client:<id>|project:<id>, structured signals, provenance) + `feedback_events` (target, decision approve/reject/edit, reason, actor, output_type, agent_id, source_ids, memory_banks). Feeds agents as weights.
- Approval queue: already completes real entity actions (fixed). Extend to carry rejection REASON + route memory placements.
- Logging: DECISION_LOG.md + AI_HANDOFF_LOG.md already exist and are mandatory (CLAUDE.md). Keep using both.

Frontend: new views for Source Registry (per-type intake + status), Memory Banks (per bank), Agent Registry + agent runs/teams, Research/Intelligence Inbox, Content Command redesign (below), Visual generation queue, Taste/learning, Cost per agent/client. Everything reads real APIs; no fake data.

## 3. DASHBOARD CORRECTION PLAN

- Source Library -> SOURCE REGISTRY page: add-source picks a TYPE with a type-specific intake form; each source shows processing_status, extracted insights, memory banks fed, cost, related outputs, logs, errors.
- New MEMORY BANKS view: browse each bank; see what fed it and from which source/agent.
- New AGENT REGISTRY + RUNS view: list agents, what each does, last run, cost, quality, failures; per module show the agent TEAM behind it and what they produced.
- New RESEARCH/INTELLIGENCE INBOX: every agent finding with source + insights + reasoning + suggested memory placement + approve/reject/edit/merge/route + rejection reason.
- CONTENT COMMAND redesign (section 4).
- New VISUAL GENERATION QUEUE: image/carousel prompts -> QA -> generate -> review (regenerate/approve/save-as-reference).
- Cost per agent/module/client; self-improvement suggestions surfaced; errors/failed runs visible.
- Keep honest "planned" states for anything whose backend is not built.

## 4. CONTENT COMMAND REDESIGN (unified)

Step 1 GENERATE CONTENT PACK: user picks goal, brand/client, platform, campaign, source material, type prefs. A multi-AGENT team (Strategy, Research, Competitor, Brand-voice, Founder-taste, Ideation, Copywriting, Visual-direction, Image-prompt, Design-QA, Copy-QA, Final-scoring, Learning) produces a PACK: idea, strategy, hook, caption, CTA, static/carousel concept, image direction, visual references, image prompt, format, predicted impact + brand-fit + platform-fit scores, and a REASONING SUMMARY with source/agent provenance.
Step 2 REVIEW PACK: approve/reject(reason)/edit/regenerate/stronger/different-angle/choose-format.
Step 3 VISUALS ONLY AFTER APPROVAL (save credits): image-prompt agent writes -> prompt engineer improves -> visual QA reviews -> generate -> show -> regenerate-with-feedback / approve / save-as-reference / mark-unusable(reason). No plain reject on images; use regenerate/approve/edit-direction/save-ref.
Step 4 LEARNING: log what caption/hook/visual/founder approved, what was rejected + why, which banks to update, which agent did well. Applies to SEO/blog/strategy/design too.
Backend: extend content_packets into a pack object; add media/visual tables (Chunk 21/22); every step is an agent_run; visuals gated behind pack approval.

## 5. SOURCE INTAKE REDESIGN (per-type)

Generic is banned. Each type has its own handler (registered, data-driven):
- YouTube video/channel: store link -> transcript+metadata via scraper/Apify -> LLM analyze -> extract insights -> router suggests banks -> approve -> store -> log full run + cost.
- IG reel: scrape caption/transcript/comments/engagement/metadata + frames -> vision model analyzes hook/pacing/structure/design/product/audience response -> LLM extracts creative insights -> route to banks (competitor/hook/design/taste/ad-inspiration/audience) -> approve.
- IG carousel: scrape caption/comments/engagement/images -> vision per slide -> extract layout/hook/copy style/visual hierarchy/offer/CTA/design system -> route to design/competitor/content/brand/carousel-structure/campaign banks.
- Website/competitor: scrape key pages -> extract positioning/offers/copy/structure/SEO/UI/pricing/messaging -> route to competitor/market/offer/SEO/design banks.
- Reddit/TikTok/RSS/API/n8n/file/note: each its own handler.
Every intake: processing_status, confidence, cost, logs, errors, memory placement suggestion + approval, provenance.

## 6. AGENT ORCHESTRATION DESIGN

- agents + agent_runs tables (section 2). Every agent visible, logged, cost+quality tracked.
- Teams per module (Content team, Research team, SEO team, Design team, Intelligence team). A module run = an orchestrated graph of agent_runs.
- Model tiering per agent (cheap classify / mid extract / strong strategy+creative+prompt+QA / vision only when needed). Attribution: agent_run -> model_runs -> cost per agent/module/client/output.
- Cadence: manual, scheduled (automations), or n8n-triggered - the agent record says which.

## 7. SELF-IMPROVEMENT SYSTEM

- feedback_events + taste_profiles (brand + per-founder + client + project). Every approval/rejection/edit with reason feeds them.
- Novelty memory (topic/angle/hook/format used) prevents repetition; performance winRate favors what works.
- Prompt/skill improvement proposals (Chunk 34 registry + Dreaming Engine 36) come FROM outcomes, approval-gated.
- Conflict rule: brand taste is a HARD filter; founder taste is a WEIGHT within brand bounds; use the approving founder's profile; client/project taste for client work; never overwrite brand quickly.

## 8. RISK REPORT

- UNDERBUILT: sources (stub), memory routing (none), agents (none), research inbox (none), visuals (none), taste (none). Building dashboard modules before these schemas exist = fake UI. FIX ORDER: schema+backend first, then UI.
- OVERCOMPLICATED risk: 100s of agents at once. MITIGATION: build the agent REGISTRY + run model first (so any number of agents plug in with visibility), then add agents incrementally.
- COST risk: multi-agent + vision can get expensive. MITIGATION: model tiering, caching, scrape-dedup, cost caps per workflow/client, visuals only after approval.
- HALLUCINATION risk: ungrounded outputs. MITIGATION: every output carries source/memory provenance + confidence, shown in UI; "if unknown, ask for data, don't invent".
- USER-CONFUSION risk: split caption/image/approval. FIX: unified Content Command (section 4).
- MUST FIX BEFORE PUSH each chunk: schema<->migration aligned, effect-verified, tests, no hardcoded strategy/prompts/models, no fake data.

## 9. IMPLEMENTATION PLAN (phased, chunked, verified)

Guiding rule: schema+backend FIRST, then wire the UI; each phase is a chunk that must pass `npm run verify` + effect tests before push (ENGINEERING_STANDARDS).

Phase A - Agent + Source + Memory FOUNDATIONS (unblocks everything):
- A1 Agent Registry: add `agents` + `agent_runs`; every model call attributes to an agent_run; seed the current worker/ask as agents. Files: `src/db/schema.ts` (+migration), `src/lib/domain/agents.ts`, `src/lib/agents/index.ts`, `src/app/api/agents/*`, tests. UI: Agent Registry + runs.
- A2 Source Registry: extend `sources` + add `source_intake_runs` + per-type intake handler interface. Files: schema(+migration), `src/lib/domain/sources.ts` (extend), `src/lib/sources/intake/*` (per-type handlers), `src/app/api/sources/[id]/intake`, tests. UI: type-specific add + status.
- A3 Memory Banks + Router: add `memory_banks` (seeded) + bank tagging + a memory ROUTER skill that proposes banks. Files: schema(+migration), `src/lib/domain/memory.ts` (extend), `src/lib/memory/router.ts`, extend proposals w/ banks + rejection reason, tests. UI: Memory Banks + routing approval.
Phase B - Intelligence Inbox + Learning:
- B1 Research/Intelligence Inbox (wire existing intelligence_* substrate + approve/reject/route/reason). B2 feedback_events + taste_profiles + wire rejection reasons everywhere.
Phase C - Creative graph + visuals:
- C1 Content Command as multi-agent pack (evolve Chunk 15 into an agent graph using A1). C2 Media/visual gen + image-prompt agent + visual QA (Chunks 21/22) with visuals-after-approval. C3 Design Reference Hunter (Chunk 51).
Phase D - Cost routing, connections (Chunk 35), cadence (19), Dreaming Engine (36), then onboarding/data-seeding + agent prompting, then VPS (auth Chunk 02).

Acceptance before ANY push (every chunk): typecheck+tests+build green; live EFFECT test (the real rows/records change); provenance+cost logged; no hardcoded strategy; dashboard shows the real work; handoff + decision logs updated.

## Bottom line

The foundation is real and good. But to be the hive-mind you described, we must build the Agent Registry, the real Source Registry + per-type intake, multi-bank memory routing, the research inbox, the multi-agent creative graph + visuals, and the taste/learning system - schema first, UI second, each chunk effect-verified. That is the correction. I recommend we start Phase A1 (Agent Registry) next, because without agent visibility everything else stays invisible - and it is the backbone of the hive-mind.
