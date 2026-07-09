# WOBBLE OS — The Whole Animal On Paper

Date: 2026-07-09
Purpose: ONE map of the entire system — every module, every AI agent inside it, what data
each agent reads and writes, and how agents share data. This is the "see the whole animal"
document. Built from the REAL seeded system (not guesses). Where a module is not built yet,
its agents are marked `PLANNED` and describe the intended team per `FOUNDER_VISION_BRIEF.md`.

Legend: `LIVE` = agent seeded + module wired · `PARTIAL` = built but basic (needs upgrade) ·
`PLANNED` = designed, not built yet.

---

## PART 0 — HOW TO READ THIS (the 3 things that make 25 modules simple)

### 0.1 The universal pattern (every "factory" module runs this)
```
real sources + memory
  → agent TEAM (strategy · research · competitor · brand · taste · ideation · maker · QA · scoring · learning)
  → grounded draft (provenance + confidence + scores)
  → expert QUALITY GATE
  → FOUNDER review (approve / reject-with-reason / edit / regenerate)
  → LEARNING (taste + what-works + agent quality)
  → memory banks updated
```

### 0.2 Two kinds of module
- **Kind A — FACTORY**: a team of agents that MAKES something (content, SEO, decks, decisions, audits). Runs the pattern above.
- **Kind B — CONTROL PLANE**: runs/watches/governs the factories (Brain, Memory, Approvals, Agents, Costs, Audit, Settings). Mostly built.

### 0.3 Do agents share data? YES — through 3 shared layers
Agents never message each other directly. They share through the database:
1. **Memory banks** (25) — the shared long-term brain. One agent writes a note; any allowed agent reads it.
2. **Sources + Intelligence tables** — raw material + extracted insights, shared across research/content/SEO.
3. **The control tables** — `model_runs` (cost), `audit_logs` (history), `agent_runs` (provenance), `approvals`, `taste_profiles` + `feedback_events` (learning).

So the flow between agents is: **Agent A → writes to a memory bank / intelligence item → Agent B reads it later.** Blackboard model, not chat.

---

## PART 1 — THE SHARED SPINE (what EVERY agent touches)

### 1.1 The 25 memory banks (the shared brain)
| Bank | Holds | Main writers | Main readers |
|---|---|---|---|
| global | cross-company truth | memory_router | all |
| company | WOBBLE company facts | memory_router | all output agents |
| client | per-client knowledge | memory_router | content, decision, offer |
| project | per-project knowledge | memory_router | content, decision |
| competitor | competitor positioning/offers | competitor_scout | content, offer, decision, SEO |
| brand | voice, do-not-say, tone | brand_voice_guardian | all output + QA agents |
| design | design theory, style descriptors | visual_reference_analyst | media/creative agents |
| content | hooks, angles, post patterns | content_worker, social_content_analyst, transcript_analyst | content, SEO, social |
| seo | keywords, intent, link maps | website_seo_scout | SEO/blog agents |
| offer | offers, pricing, objections | market_researcher, competitor_scout | offer_lab, proposal, content |
| research | market/industry knowledge | knowledge_compiler, market_researcher | all research-consuming agents |
| founder_taste | shared founder taste (weights) | taste engine | all output agents |
| founder_moiz / _ali / _ibrahim / _haad | per-founder taste | taste engine (on that founder's approvals) | output agents when that founder approves |
| rejected_ideas | what was rejected + why | approval/learning | ideation agents (novelty/avoid) |
| approved_output | what shipped + why | approval/learning | strategy, ideation |
| performance | post/SEO/site results | performance_learning_agent | strategy, dreamer |
| agent_learning | which agent did well/poorly | dreamer, performance_learning_agent | dreamer, orchestrators |
| hook_library | proven hooks (content sub-bank) | social_content_analyst, transcript_analyst | content agents |
| visual_reference | approved visual refs + descriptors | visual_reference_analyst | media agents |
| carousel_structure | carousel layouts | social_content_analyst, visual_reference_analyst | content, media |
| ad_inspiration | ad creative patterns | competitor_scout, visual_reference_analyst | content, media, offer |
| audience_response | real audience language | social_content_analyst | content, offer, SEO |

### 1.2 The 17 agents that exist today (by team)
| # | Agent (slug) | Role | Module home | Reads (banks) | Writes (output type) | State |
|---|---|---|---|---|---|---|
| 1 | ask_wobble | router | Ask WOBBLE | global, company | answer, route | LIVE |
| 2 | content_worker | copywriter | Content Command | content, brand | content_packet | PARTIAL (single call → needs team) |
| 3 | content_excellence_gate | QA | Content Command | brand | score | LIVE |
| 4 | dreamer | auditor | Intelligence | agent_learning, performance | suggestion | PARTIAL |
| 5 | knowledge_compiler | research | Learning Engine | research, competitor, content | knowledge_note | PLANNED (Chunk 13) |
| 6 | memory_router | memory_router | Memory | — (routes to all) | memory_placement | LIVE |
| 7 | source_intake_orchestrator | orchestrator | Source Registry | research | source_intake_run | LIVE |
| 8 | competitor_scout | research | Source Registry | competitor, offer, content | intelligence_item | PARTIAL |
| 9 | social_content_analyst | analyst | Source Registry | content, audience_response | content_pattern | PARTIAL |
| 10 | transcript_analyst | analyst | Source Registry | research, content | knowledge_note | PARTIAL |
| 11 | visual_reference_analyst | vision | Media Studio | design, founder_taste | style_descriptor | PLANNED (Chunk 21) |
| 12 | website_seo_scout | seo_research | Source Registry | seo, offer, research | seo_insight | PLANNED (Chunk 37) |
| 13 | source_quality_checker | fact_checker | Source Registry | research | source_quality_score | PARTIAL |
| 14 | performance_learning_agent | analyst | Intelligence | performance, agent_learning | performance_insight | PLANNED (Chunk 47) |
| 15 | market_researcher | research | Research Radar | research, market, offer | market_insight | PLANNED (Chunk 12) |
| 16 | trend_radar | research | Research Radar | trend, content, research | trend_insight | PLANNED (Chunk 12) |
| 17 | brand_voice_guardian | QA | WOBBLE Brain | brand | brand_review | PARTIAL |

---

## PART 2 — MODULE BY MODULE (the whole animal)

Each module lists: **agents inside · how it works (flow) · data in → data out · banks touched · state.**

### ══ WORKSPACE ══

#### Command Center  (Kind B · WIRED)
- **Agents:** 0 (it's a read-only rollup — it shows the other agents' work).
- **Flow:** reads approvals + costs + audit + worker heartbeats → one dashboard of "what needs you / spend / who's online."
- **Data in:** approvals, model_runs, audit_logs, worker_heartbeats, jobs. **Out:** none (view only).
- **State:** wired.

#### Ask WOBBLE  (Kind A-lite · WIRED)
- **Agents:** 1 — `ask_wobble` (router).
- **Flow:** question → retrieve from global+company banks + approved sources → answer with citations → may spawn a job → confirm before costly/dangerous actions.
- **Data in:** memory_chunks, sources, question. **Out:** answer + citations, optional job.
- **Banks:** global, company (read). **State:** wired.

#### WOBBLE Brain  (Kind B · WIRED)
- **Agents:** 1 — `brand_voice_guardian` (QA guardian of voice/do-not-say).
- **Flow:** browse/search core knowledge; guardian protects tone + claims across knowledge and outputs.
- **Data in:** memory_records, memory_chunks. **Out:** brand_review.
- **Banks:** brand (read). **State:** wired (guardian needs full wiring).

#### Agent Registry  (Kind B · WIRED)
- **Agents:** 0 (it's the registry that lists all 17+).
- **Flow:** shows every agent, its team, runs, cost, quality, failures — "the hive made visible."
- **Data in:** agents, agent_runs, model_runs. **Out:** none. **State:** wired.

### ══ PIPELINE ══

#### Research Radar  (Kind A · PLANNED — Chunk 12)
- **Agents:** 2 — `market_researcher`, `trend_radar`.
- **Flow:** scheduled scan of approved targets/web → market + trend insights → Intelligence Inbox for approval.
- **Data in:** research_targets, sources, web/search. **Out:** intelligence_items, market_insight, trend_insight.
- **Banks:** research, market, offer, trend, content (read/write). **State:** planned.

#### Source Registry  (Kind A · WIRED — Chunk 53)
- **Agents:** 6 — `source_intake_orchestrator` (routes by type), `competitor_scout`, `social_content_analyst`, `transcript_analyst`, `website_seo_scout`, `source_quality_checker`.
- **Flow:** each of 24 source types has its OWN intake (YouTube→transcript→analyze; IG reel→scrape+vision; website→pages→positioning). Orchestrator dispatches → analyst extracts → quality_checker gates → route to banks → approve.
- **Data in:** sources, raw scrapes/transcripts/frames. **Out:** source_intake_runs, intelligence_items, content_patterns, knowledge_notes.
- **Banks:** research, competitor, content, seo, offer, audience_response (write). **State:** registry + intake foundation wired; per-type analyzers PARTIAL.

#### Intelligence Inbox  (Kind B · WIRED — Chunk 55)
- **Agents:** 2 surfaced here — `dreamer`, `performance_learning_agent` (their outputs land here for review).
- **Flow:** raw agent/source findings → founder reviews → approve / reject-with-reason / edit / merge / route-to-memory. Approvals + rejections feed learning.
- **Data in:** intelligence_items, intelligence_insights, suggestions. **Out:** approvals, memory_update_proposals, feedback_events.
- **State:** wired.

#### Learning Engine  (Kind A · PLANNED — Chunk 13, the Knowledge Compiler)
- **Agents:** 1 — `knowledge_compiler` (Karpathy-style).
- **Flow:** each APPROVED source → extract atomic knowledge notes (claim/framework/hook/objection) with provenance → SYNTHESIZE into knowledge base (dedupe, strengthen, flag contradictions, interlink) → route to banks via memory_router. NOT a summarizer.
- **Data in:** approved sources, source_chunks. **Out:** knowledge_notes (linked, deduped, provenance).
- **Banks:** research, competitor, content (write). **State:** planned.

#### Content Command  (Kind A · PARTIAL — Chunk 15 → needs multi-agent upgrade)
- **Agents today:** 2 — `content_worker`, `content_excellence_gate`.
- **Agents target (the creative graph):** Strategy → (Research + Competitor + Brand-voice + Founder-taste in parallel) → Ideation → Copywriter (draft→self-critique→revise) → Visual-director → Image-prompt engineer → Copy-QA + Design-QA → Scorer. (≥4 distinct agent_runs per pack.)
- **Flow:** goal/track → team builds a content PACK (idea, hook, caption, CTA, carousel concept, image direction, scores, provenance) → excellence gate → founder review → visuals ONLY after pack approval → learning.
- **Data in:** content_tracks, content/brand/competitor/founder_taste banks, approved sources. **Out:** content_packets, content_versions, quality_reviews, feedback_events.
- **State:** works as a single LLM call; upgrade to the real team is the priority build.

#### Media Studio  (Kind A · PLANNED — Chunk 21/22)
- **Agents:** `visual_reference_analyst` + the elite Image-Prompt-Engineer + Visual-QA.
- **Flow:** reference banks (static/carousel/video), each approved ref gets a vision STYLE DESCRIPTOR → exactly ONE reference per asset (never blended) → structured prompt → generate → vision QA → regenerate/approve/save-as-reference. Visuals gated behind content-pack approval.
- **Data in:** approved content packs, visual_reference bank. **Out:** media assets, style_descriptors.
- **Banks:** design, visual_reference, carousel_structure, ad_inspiration, founder_taste. **State:** planned.

#### Presentation Maker  (Kind A · PLANNED — Chunk 23/41)
- **Agents:** ONE deck engine (Outline → Content-writer → Design-director → QA). NOT multiple presentation agents.
- **Templates:** `sales_proposal`, `investor_update`, `client_report`, `audit_roadmap`.
- **Flow:** brief/source (e.g. an approved audit) → outline → write → design direction → QA → founder review → export/handoff.
- **Data in:** brain, offers, case studies, an audit or report. **Out:** deck + versions.
- **State:** planned. (This is what the Prospect→Audit→Proposal engine hands off into.)

#### ➕ Prospect → Audit → Proposal  (Kind A · NEW — the revenue engine, to be added)
- **Agents:** 4-step pipeline — Prospect-researcher → Readiness-auditor → Roadmap-architect → Proposal-writer (feeds Presentation Maker `sales_proposal`/`audit_roadmap`).
- **Flow:** lead/company info → research + enrich → score AI-readiness gaps → sequence roadmap tied to WOBBLE offers → generate proposal deck → founder approve/edit → send.
- **Data in:** prospect data, offer/company/approved_output banks, past winning proposals. **Out:** audit scorecard, roadmap, proposal deck.
- **State:** NOT YET IN REGISTRY — proposed addition. Productizes WOBBLE's readiness-call → audit → implementation service.

### ══ STRATEGY ══

#### Decision Room  (Kind A · PLANNED — Chunk 24)
- **Agents:** Decision-brief team (Evidence-gatherer → Options-builder → Risk/opposing-view → Recommender). Seed skill `decision_brief` exists.
- **Flow:** question → load priorities + prior decisions + evidence → options, recommendation, opposing view, risk, confidence → founder decides → outcome logged (feeds decision learning).
- **Data in:** brain, prior decisions, approved evidence. **Out:** decision record + reasoning trail.
- **Banks:** company, research, approved_output (read); agent_learning (write). **State:** planned.

#### Offer Lab  (Kind A · PLANNED — Chunk 25)
- **Agents:** Offer-designer, Objection-miner, Pricing-analyst (reads market_researcher/competitor_scout output).
- **Flow:** design/test offers, pricing, objections, outbound angles → experiments → founder approve → n8n outbound/CRM.
- **Data in:** offer/competitor/audience_response/market banks. **Out:** offers, experiments.
- **State:** planned.

### ══ GROWTH & BUSINESS ══

#### SEO & Blog Engine  (Kind A · PLANNED — Chunk 37)
- **Agents:** `website_seo_scout` + Keyword-researcher, Brief-writer, Blog-drafter, Internal-link + AEO optimizer, SEO-QA.
- **Flow:** keyword/intent research → briefs → drafts → internal linking + AI-search optimization → QA → founder approve → publish/handoff.
- **Data in:** seo/research/competitor banks, search data. **Out:** keyword targets, blog briefs/drafts.
- **State:** planned.

#### Social Intelligence  (Kind A · PLANNED — Chunk 38)
- **Agents:** `social_content_analyst` + Platform-stats ingester, Pattern-analyst, Next-post recommender.
- **Flow:** platform stats + competitor patterns → post-performance memory → next-post recs feed Content Command.
- **Data in:** social stats, content/audience_response banks. **Out:** content_patterns, recommendations.
- **State:** planned.

#### Website Analytics  (Kind B/A · PLANNED — Chunk 39)
- **Agents:** analytics connector + `performance_learning_agent`.
- **Flow:** connect wobblepk.com analytics → traffic/top-pages/conversion → rollups into Memory + Ask WOBBLE.
- **Data in:** web/search analytics. **Out:** performance_insights. **Banks:** performance. **State:** planned.

#### Invoice Builder  (Kind B · PLANNED — Chunk 40)
- **Agents:** 0-1 (guided builder; optional draft agent).
- **Flow:** templates → guided fields → generate invoice/PDF → audit trail → approve/final → export.
- **Data in:** client data. **Out:** invoice files + status. **State:** planned.

#### Business Docs  (Kind A · PLANNED — Chunk 42)
- **Agents:** Doc-writer team (reuses Presentation/Proposal engine patterns).
- **Flow:** reports/briefs/proposals from approved Brain + client context → approve → export.
- **Data in:** company/client banks, approved sources. **Out:** docs + versions. **State:** planned.

### ══ OPERATIONS ══

#### Automations  (Kind B · PLANNED — Chunk 19)
- **Agents:** 0 (scheduler). Runs agent cadences + n8n workflows on schedule/trigger, with kill switches.
- **Data in:** automations, automation_runs. **Out:** triggered jobs. **State:** planned.

#### Connections  (Kind B · WIRED — Chunk 35, in progress)
- **Agents:** 0. Permission map for every external API/scraper/model/webhook/storage. Guard: exists → enabled → module-allowed → credential-present.
- **Data in:** provider_connections. **Out:** guard decisions. **State:** wired (uncommitted).

#### Skill Registry  (Kind B · WIRED — Chunk 34)
- **Agents:** 0. Versioned, approval-gated SOPs (prompt skills) the agents run. 3 seeded: LinkedIn post, Research Radar, Decision Brief.
- **Data in:** prompt_skills. **Out:** approved skill versions. **State:** wired.

#### Approvals  (Kind B · WIRED — Chunk 4)
- **Agents:** 0. The single gate. 9 actions (approve/reject/revise/regenerate/edit/archive/send-to-n8n/retry/mark-final). Reject requires a reason → feeds learning.
- **Data in:** approvals, entities. **Out:** decisions + feedback_events. **State:** wired.

#### Workers  (Kind B · PLANNED — Chunk 20)
- **Agents:** 0. Shows worker processes (general, content, video, ops): status, queue, current job, heartbeat, errors.
- **Data in:** worker_heartbeats, jobs. **Out:** none. **State:** backend live, page planned.

#### n8n Handoff  (Kind B · BACKEND-READY — Chunk 18)
- **Agents:** 0. HMAC-signed, replay-protected, idempotent webhooks + dead-letter recovery. Only approved payloads.
- **Data in:** webhook_endpoints, webhook_events. **Out:** external calls + dead_letters. **State:** backend ready, UI queued.

### ══ SYSTEM ══

#### Memory  (Kind B + the router · WIRED — Chunk 10/54)  ★ the layer you want rock-solid
- **Agents:** 1 — `memory_router`.
- **Flow:** knowledge_note → router proposes which bank(s) → founder approves placement → stored as memory_records + embedded memory_chunks + bank links. One source can feed MANY banks.
- **Data in:** knowledge_notes, memory_update_proposals. **Out:** memory_records, memory_chunks, memory_bank_links.
- **State:** banks + router + proposals wired. (See Part 3 for the deep-dive.)

#### Taste + Feedback Learning  (Kind B · WIRED — Chunk 56)
- **Agents:** 0 (a learning engine, not an LLM agent). Brand taste = HARD filter; founder taste = weight within brand bounds.
- **Flow:** every approve/reject/edit → feedback_event → updates taste_profiles (brand + the approving founder).
- **Data in:** feedback_events. **Out:** taste_profiles. **Banks:** founder_taste + founder_*. **State:** wired.

#### Costs  (Kind B · WIRED — Chunk 5)  ·  Audit Log (WIRED — Chunk 3)  ·  Backup (PLANNED — 27)  ·  Settings (PLANNED — 28)
- **Agents:** 0. Costs = model_runs vs budget_caps. Audit = immutable event history w/ founder attribution. Backup = snapshots. Settings = model routing, budgets, trust levels, kill switches.

---

## PART 3 — THE MEMORY / SELF-IMPROVING LAYER (deep-dive — make this rock-solid)

This is the heart. Four cooperating pieces:

### 3.1 Storage (what "remembering" physically is)
- `memory_banks` (25) — the shelves.
- `memory_records` — human-readable knowledge (title + content + tier + area + confidence + source).
- `memory_chunks` — the same knowledge embedded as 1536-dim vectors for semantic search (pgvector).
- `memory_bank_links` — which record/chunk belongs to which bank(s) (many-to-many).
- **Tiers:** core (protected WOBBLE truth) · working · episodic. Core changes slowly and only via approval.

### 3.2 Writing to memory (nothing enters silently)
`source approved → knowledge_compiler extracts notes → memory_router proposes bank(s) → founder approves placement → memory_records + memory_chunks + links written → audit logged.`
- `memory_update_proposals` holds the pending change with reason + router confidence.
- One source can land in MANY banks (e.g. a competitor reel → competitor + content + hook_library + ad_inspiration).

### 3.3 Reading from memory (grounding every output)
Any agent retrieves by: semantic search over `memory_chunks` **filtered to the banks it's allowed** + trust level + freshness. This is why outputs are grounded, not hallucinated — and why "does agent A see agent B's data" = yes, if they share a bank.

### 3.4 Remembering each co-founder (the part you liked)
- `founder_taste` bank = shared founder preferences (weights).
- `founder_moiz / _ali / _ibrahim / _haad` = per-person taste.
- When Moiz approves, learning writes to **brand** (hard rules) + **founder_moiz** (his weights). Haad approving writes to **founder_haad**. Founders never overwrite each other; brand is protected and slow.

### 3.5 Self-improvement (the "dreaming")
- `dreamer` (auditor) reads `performance` + `agent_learning` → proposes improvements → Intelligence Inbox → founder approves.
- `performance_learning_agent` attributes wins to hook/angle/format/reference/agent → updates winRates → Strategy agent favors what works, novelty control avoids repeats.
- Result: the OS gets better as you approve/reject, without code changes.

### 3.6 What must be hardened to call this "solid" (definition of done)
1. Embeddings actually generated + stored for every memory_record (real vector search, not text match).
2. Retrieval contract used by ALL output agents (one function: query + banks + trust + freshness → chunks).
3. memory_router live end-to-end (proposal → approve → written → retrievable next run).
4. knowledge_compiler (Chunk 13) built so approved sources compound into linked notes.
5. Every write carries provenance (sourceId + chunkIds) + confidence; conflicts flagged, stale marked.
6. Per-founder taste proven to change outputs when different founders approve.
7. "I don't know" behavior: if retrieval is empty, agents request source data instead of inventing.

---

## PART 4 — TOTALS (the animal, counted)

- **Modules:** 25 (after removing Client AIOS Lab). Kind A factories: ~11. Kind B control plane: ~14.
- **Agents seeded today:** 17. Teams: command, content, intelligence, creative, growth, brand.
- **Agents to add:** the Content creative-graph sub-agents (Chunk 15 upgrade), Media prompt/QA agents (21/22), the Prospect→Audit→Proposal pipeline (new), Decision/Offer/SEO/Docs teams.
- **Memory banks:** 25. **Source types:** 24. **Trust tiers:** 5. **Approval actions:** 9. **Content tracks:** 2 (WOBBLE + Moiz; Ali/Ibrahim/Haad tracks not seeded yet). **Providers:** 4. **Taste profiles:** 5.
- **Shared-data model:** blackboard — agents cooperate by reading/writing shared memory banks + intelligence/control tables, never by direct messaging.
