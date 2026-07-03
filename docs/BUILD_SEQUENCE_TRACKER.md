# WOBBLE OS Build Sequence Tracker

Date started: 2026-06-29
Owner: shared (Codex, Claude, Gemini, Antigravity)

Purpose: one place that shows what is built, what is being built next, and the FULL order of every chunk so NOTHING gets forgotten. The early order is intentionally non-numeric (data spine first); this tracker is the authoritative map. Update it whenever a chunk completes.

Full acceptance criteria for every chunk live in `docs/V2_BUILD_ACCEPTANCE_PLAN.md`. This file is the status + order map.

Legend: `[x]` done & CI-green · `[~]` in progress · `[ ]` not started · `<- NEXT` marks the next chunk.

Frontend wiring timing lives in `docs/FRONTEND_WIRING_PLAN.md`. Frontend is not an end-only task and not a pre-backend task. The rule is: backend capability -> tested API/job/approval flow -> frontend wiring checkpoint -> next backend cluster.

Content and visual excellence rules live in `docs/CONTENT_CREATIVE_EXCELLENCE_SYSTEM.md`. Chunk 15 is the pipe; Chunk 17/21/22/34/36/38 make the output elite.

The intelligence/data-store map lives in `docs/INTELLIGENCE_LAYER_MAP.md`. Use it when building researcher AIs, ingestion stores, performance loops, competitor transcript flows, and auto-pickup behavior.

The long Self-Improving Intelligence Layer founder brief is covered in `docs/INTELLIGENCE_REQUIREMENTS_COVERAGE_MATRIX.md`. Treat that matrix as V2 scope, not optional notes.

ENGINEERING STANDARD (binding, all builders incl. Codex): `docs/ENGINEERING_STANDARDS.md` - build every chunk COMPLETE + deploy-ready; no generic stubs that look done but do not complete the real effect (this caused the approvals bug). Verify the EFFECT, not the appearance.

Knowledge + creative architecture (founder vision, locked): `docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md` - the Karpathy 'compile-the-knowledge' engine (Chunk 13 upgraded to a Knowledge Compiler, not a summarizer) + the multi-agent creative workflow (Chunk 15 evolves to an agent graph; visuals 21/22; references 21/51) + the approval-learning loop with a founder taste profile + novelty control (NEW - flag under Chunk 45/47).

## Full master order (all 57 chunks, 00-56)

### Phase 1 - Core spine + data layer (DONE)
1. [x] Chunk 00 - Project Hygiene / docs / handoff (ongoing)
2. [x] Chunk 01 - Database Foundation
3. [x] Chunk 03 - Audit Log
4. [x] Chunk 04 - Approvals System
5. [x] Chunk 05 - Model Runs & Cost Tracking
6. [x] Chunk 06 - Job Queue Foundation
7. [x] Chunk 07 - Worker Runtime Foundation
8. [x] Chunk 09 - Source Library Backend
9. [x] Chunk 10 - Memory & WOBBLE Brain Backend
10. [x] Chunk 08 - Provider Adapter Registry
11. [x] Chunk 11 - Ask WOBBLE V1

### Phase 2 - Content loop
12. [x] Chunk 14 - Content Command Backend
13. [x] Chunk 15 - Content Worker V1  [VISION UPGRADE PENDING: built as a single LLM call; must EVOLVE into the multi-agent creative graph (Strategy/Research/Competitor/Brand-voice/Founder-taste/Ideation/Copy/Art-Director/Image-Prompt/QA/Scoring/Learning agents) using the Agent Registry (52); visuals gated behind content-pack approval. See docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md Part B/E.]
14. [x] Chunk 17 - Content Excellence Gate & Do-Not-Say (pairs with the content worker)
15. [x] Chunk 50 - Self-Improving Intelligence Foundation (data substrate, retrieval plans, Dreamer suggestions, research targets)
16. [x] Chunk 16 - Founder Content Tracks
17. [x] Chunk 18 - n8n Signed Handoff (completes source -> memory -> content -> approval -> handoff)

Frontend checkpoint:

- [x] UI-SHELL (2026-07-01): real React dashboard shell built - `src/lib/os/modules.ts` + `src/components/os/os-ui.tsx` + `src/app/[module]/*`. All 26 modules are real routes in the WOBBLE design; 9 pages WIRED to live APIs (Command Center, Ask WOBBLE, Brain, Memory, Source Library, Content Command + packet detail, Approvals + working approve/reject, Costs, Audit) with real loading/empty/error/503 states; rest show honest planned/backend-ready states. Old static `page.tsx` replaced with redirect to `/command`. Codex verified with `npm run verify` and dev-route smoke checks.
- [x] UI-C1 COMPLETE (2026-07-01): Content Command board + packet-detail drawer + track filter + Generate form (real POST /api/content/generate) wired; Ask/Brain/Memory/Sources wired; Approvals approve/reject working. 9 of 26 pages live. Codex verified with `npm run verify`; dev server returned 200 for `/`, `/command`, `/content`, `/approvals`, `/ask`, `/brain`, `/memory`, `/sources`, and `/seo`.
- After Chunk 18: run UI-C2 and polish the full source -> memory -> content -> approval -> handoff loop.   <- NEXT FULL-LOOP FRONTEND AFTER UI-C1

### Phase 3 - Registries + intelligence inputs
17. [x] Chunk 34 - Prompt/Skill Registry
18. [ ] Chunk 35 - Connections Registry
19. [ ] Chunk 12 - Research Radar
20. [ ] Chunk 13 - Learning Engine  [VISION: build as the KNOWLEDGE COMPILER (Karpathy compile-not-just-retrieve): approved sources -> synthesized, deduped, interlinked knowledge notes with provenance, routed to memory banks (54); hybrid retrieval + auto-pickup. NOT a summarizer. See docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md Part A.]

Frontend checkpoint:

- After Chunks 34, 35, 12, and 13: run UI-I1 from `docs/FRONTEND_WIRING_PLAN.md`.

### Phase 4 - Cadence, media, decisions, clients
21. [ ] Chunk 19 - Automations Registry (scheduling/cadence)
22. [ ] Chunk 20 - Workers Health Page
23. [ ] Chunk 21 - Media Studio Backend + Creative Reference Library  [VISION: static + carousel + video reference BANKS; each approved reference gets a vision-model STYLE DESCRIPTOR (see docs/CONTENT_CREATIVE_EXCELLENCE_SYSTEM.md founder clarifications). Feeds Design Reference Hunter (51).]
24. [ ] Chunk 22 - Media / Video Worker + Reference-Conditioned Generation  [VISION: exactly ONE reference per asset (never blended); format-specific image/carousel models; the ELITE Image-Prompt-Engineering agent (large structured prompts, model-capability profile) + Visual QA loop; visuals only AFTER content-pack approval. See docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md Part F.]
25. [ ] Chunk 23 - Presentation Maker
26. [ ] Chunk 24 - Decision Room
27. [ ] Chunk 25 - Offer Lab
28. [ ] Chunk 26 - Client AIOS Lab

Frontend checkpoint:

- Wire each Phase 4 module shortly after its backend/worker is verified; do not wait until the end. See UI-M1 in `docs/FRONTEND_WIRING_PLAN.md`.

### Phase 5 - Operations + the self-improving brain
29. [ ] Chunk 27 - Backup & Restore
30. [ ] Chunk 28 - Settings, Budgets & Kill Switches
31. [ ] Chunk 29 - Command Center Final Wiring
32. [ ] Chunk 36 - AI OS Auditor / WOBBLE Dreaming Engine (self-improving intelligence)
33. [ ] Chunk 02 - Shared Auth & Founder Attribution (MUST be done before VPS deploy)

Frontend checkpoint:

- After Chunks 27, 28, and 29: run UI-O1 from `docs/FRONTEND_WIRING_PLAN.md`.

### Phase 6 - End-to-end proofs + hardening (last)
34. [ ] Chunk 30 - End-to-End WOBBLE Content Flow
35. [ ] Chunk 31 - End-to-End Research-to-Decision Flow
36. [ ] Chunk 32 - End-to-End Media Flow
37. [ ] Chunk 33 - Health, Recovery & Failure States

Frontend checkpoint:

- Run UI-FINAL from `docs/FRONTEND_WIRING_PLAN.md`. This is final polish, not the first frontend pass.

### Phase 7 - Growth, docs, and business operations expansion
38. [ ] Chunk 37 - SEO & Blog Growth Engine
39. [ ] Chunk 38 - Social Intelligence & Platform Analytics
40. [ ] Chunk 39 - Website Analytics Connector
41. [ ] Chunk 40 - Invoice Builder
42. [ ] Chunk 41 - Presentation Maker Intake & Claude Design Bridge
43. [ ] Chunk 42 - Business Docs Engine (reports, briefs, proposals, exports)
44. [ ] Chunk 43 - Content Knowledge Base (how-to-write frameworks/hooks/angles/post-types/voice/swipe, queryable + auto-picked-up; see docs/CONTENT_INTELLIGENCE_SYSTEM.md)  [VISION: this IS a set of memory banks (54) the creative graph reads; populated by the Knowledge Compiler (13).]
45. [ ] Chunk 44 - Knowledge & Competitor Hunters (propose knowledge/competitor patterns to approval queue; approval-gated; feed learning loop)
46. [ ] Chunk 45 - Content Strategy & Calendar Planner (goal-aware pillars + cadence + repurposing; data-driven)
47. [ ] Chunk 46 - Engagement & Community AI (read comments/DMs, draft on-brand replies, route leads; approval-gated)
48. [ ] Chunk 47 - Performance Feedback & Attribution Loop (post stats -> attribute to hook/angle/format/reference/goal -> update what-works + reference winRate; closes self-improvement)  [VISION: also feeds the taste_profiles (56) + novelty control; pairs with Chunk 56 Taste/Learning.]
49. [ ] Chunk 48 - Voice-of-Customer Mining (real audience language -> hooks/angles)
50. [ ] Chunk 49 - Repurposing Engine (1 idea -> many formats)
51. [ ] Chunk 51 - Design Reference Hunter (scout Pinterest/Dribbble/creators/competitor creatives, vision-describe references, approval-gated filing into static/carousel/video banks, feed reference winRate and demotion)

## Vision upgrades to EXISTING chunks (2026-07-01 alignment - read before building these)

The hive-mind vision is delivered by (a) 6 NEW chunks 51-56, and (b) UPGRADES to chunks that already existed. Do not build the old/basic version of these - build the upgraded version:
- Chunk 15 (BUILT V1) -> evolve into the multi-agent creative graph (uses Agent Registry 52). Visuals gated behind pack approval.
- Chunk 13 (not built) -> the Knowledge Compiler (Karpathy), routes to memory banks 54. NOT a summarizer.
- Chunk 21/22 (not built) -> reference banks + vision descriptors + one-ref-per-asset + elite image-prompt agent + visual QA.
- Chunk 43 (not built) -> content knowledge banks read by the creative graph, populated by 13.
- Chunk 47 (not built) -> attribution feeds taste_profiles (56) + novelty.
FULL DETAILED per-chunk specs (what/why/inputs/agent-team/data-flow/memory-banks/acceptance): docs/FOUNDER_VISION_BRIEF.md (the canonical vision) + docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md + docs/ARCHITECTURE_ALIGNMENT_REVIEW.md. Only Chunk 15 is built; the rest carry their upgrade so Codex builds the right (upgraded) thing the first time.

### Phase A - Hive-mind foundations (NEW - from the 2026-07-01 alignment review; see docs/ARCHITECTURE_ALIGNMENT_REVIEW.md)
52. [x] Chunk 52 - Agent Registry & Orchestration (Codex-verified 2026-07-02: focused migration generated/reviewed/applied, 6 agents seeded, verify green, live agent_run effect tested)
53. [x] Chunk 53 - Source Registry + per-type Intake (Codex-verified 2026-07-02: rich registry schema, 24 source type definitions seeded, per-type intake run foundation/API/dashboard, verify green, live source approval+intake DB effect tested)
54. [x] Chunk 54 - Memory Banks + LLM Router (Codex-verified 2026-07-03: memory_banks + memory_bank_links schema, 25 banks seeded, route-placement API, proposal suggested/approved banks, bank-filter retrieval, verify green, live routed-memory approval effect tested)
55. [ ] Chunk 55 - Intelligence / Research Review Inbox (surface intelligence_* + approve/reject-reason/edit/route/merge)
56. [ ] Chunk 56 - Taste + Feedback Learning (taste_profiles brand+per-founder+client + feedback_events with rejection reasons)

Frontend checkpoint:

- Wire each growth module after its backend is complete. See UI-G1 in `docs/FRONTEND_WIRING_PLAN.md`.

## Why the order looks non-numeric

- Early spine (01 -> 03 -> 04 -> 05 -> 06 -> 07 -> 09 -> 10 -> 08 -> 11) is the recommended sequence: database + audit + approvals + cost + queue + worker, then sources + memory, then the provider adapter slotted in right before Ask WOBBLE needed it.
- 12 & 13 (Research Radar, Learning Engine) come AFTER the content loop - they feed the brain but aren't needed to ship content first.
- 02 (Auth) is intentionally late but GATED to before VPS deploy - cannot go live without it.
- 36 (Dreaming Engine) is near the end because it audits everything else, so everything else must exist first.
- Phase 7 was added after founder direction on 2026-06-30: SEO/blog/AEO, social stats, website analytics, invoices, and presentation/client-doc flows must become first-class OS modules, not loose n8n-only automations or hardcoded Ask WOBBLE behavior.

## Phase 7 module intent

- Chunk 37 SEO & Blog Growth Engine: keyword research (DataForSEO or equivalent), blog briefs/drafts, internal linking, backlink opportunity tracking, AEO/AI-search optimization, blog performance feedback, approval-gated publish/handoff.
- Chunk 38 Social Intelligence & Platform Analytics: platform stats ingestion, post-performance memory, competitor/content pattern analysis, next-post recommendations, and feedback into Content Command without hardcoded posting decisions.
- Chunk 39 Website Analytics Connector: connect website/search analytics for `wobblepk.com`, track traffic sources, top pages, blog performance, conversion signals, and feed insight rollups into Memory/Ask WOBBLE.
- Chunk 40 Invoice Builder: invoice templates, guided field capture, generated invoice files/PDFs, audit trail, approval/final status, and export/download.
- Chunk 41 Presentation Maker Intake & Claude Design Bridge: client brief form/intake, Claude Design-ready brief generation, deck version tracking, asset references, and approval/export flow. This deepens Chunk 23 rather than replacing it.
- Chunk 42 Business Docs Engine: reusable client reports, briefs, proposals, exports, and business docs built from approved Brain/client/context data.
- Chunk 50 Self-Improving Intelligence Foundation: shared tables/domain/service/API for research targets, normalized intelligence items, insights, Dreamer suggestions, experiments, output-intelligence usage, task-specific context plans, freshness scoring, and empty-state-aware retrieval. Built before the individual researcher agents so every later module uses one substrate.
- Chunk 51 Design Reference Hunter: AI design scout that finds visual references from Pinterest/Dribbble/top creators/competitor creatives, writes a vision-model style descriptor, proposes references to approval, and on approval files them into the correct Creative Reference Library bank. It never adds production references silently. It surfaces inside Media Studio / Creative Reference Library and Dreaming Engine, not as a required standalone sidebar page.

## Content and creative excellence rules

- Chunk 15 is the content pipe: it generates, stores, reviews, and approval-gates packets. It must stay stable and not become a giant hardcoded prompt blob.
- Chunk 17 is the writing excellence layer: weak-hook detection, anti-fluff scoring, CTA strength, proof strength, WOBBLE voice fit, and targeted rewrite instructions.
- Chunk 21 stores approved creative references. References must have metadata: platform, format, style, use case, approval status, brand fit, and source.
- Chunk 22 uses `src/lib/domain/reference-selection.ts` (`selectReferencesForBatch`): exactly ONE reference per asset (statics diversified; carousel = one matched carousel_set), brand-kit layered on top, then a Visual Excellence Gate before approval. NEVER blend all references into one image job. Full spec: docs/CONTENT_CREATIVE_EXCELLENCE_SYSTEM.md "Founder Creative Vision - Expanded".
- Chunk 36/38/12/13/51 feed the system over time: content research, competitor patterns, creator patterns, social performance, design-reference scouting, and founder-approved updates. Nothing updates Core Brain or production references without approval.

## Dashboard sidebar <-> chunk coverage (2026-07-01 audit)

Audited the live design (`dashboard-interface-design-brief/project/WOBBLE OS.dc.html`) against all 52 chunks.

Result: EVERY current sidebar module has a backing chunk. Nothing on screen is orphaned.

- WORKSPACE: Command Center (C29), Ask WOBBLE (C11), WOBBLE Brain (C10)
- PIPELINE: Research Radar (C12), Source Library (C9), Learning Engine (C13), Content Command (C14/15/16/17), Media Studio (C21/22), Presentation Maker (C23 + C41)
- STRATEGY: Decision Room (C24), Offer Lab (C25), Client AIOS Lab (C26)
- OPERATIONS: Automations (C19), Approvals (C4), Workers (C20), n8n Handoff (C18)
- SYSTEM: Memory (C10), Costs (C5), Audit Log (C3), Backup & Restore (C27), Settings (C28)

GAP - these chunks exist in the plan but have NO sidebar entry in the current dashboard design (they were added to the plan on 2026-06-30, after the design was made):

- Chunk 40 - Invoice Builder
- Chunk 37 - SEO & Blog Growth Engine
- Chunk 38 - Social Intelligence & Platform Analytics
- Chunk 39 - Website Analytics Connector
- Chunk 42 - Business Docs Engine

ACTION REQUIRED (rule: never remove features, always add):

- DONE 2026-07-01 in the local design file `dashboard-interface-design-brief/project/WOBBLE OS.dc.html`: added a new sidebar group "GROWTH & BUSINESS" containing SEO & Blog Engine (seo), Social Intelligence (social), Website Analytics (webstats), Invoice Builder (invoices), and Business Docs (docs). Each has a nav entry, a `meta` entry, and a fully-styled `buildView` archetype (seo/social = feed+stats, webstats = progress, invoices = ops table, docs = library) matching the existing Claude Design style/tone/palette.
- STILL TO DO: the SAME change must be made in the Claude Design cloud project (editing the local .dc.html does NOT sync back to Claude Design). Either re-create the group there, or treat the local file as the new source of truth on the next export.
- CARRY INTO REACT: when Chunks 37/38/39/40/42 are wired, these five sidebar items must exist in the production React sidebar too.
- Chunks 43-49 are intelligence/feedback loops that surface inside existing modules (mainly Content Command); they do not each need their own sidebar item.

## Dashboard state + dashboard-driven testing (2026-07-01)

Full detail: `docs/DASHBOARD_COMPLETION_PLAN.md`. Short version:

- The production React dashboard is NOT built yet. `src/app/` has one static `page.tsx` and an empty `src/components/os/`. The "dashboard" you click today is the Claude Design PROTOTYPE (`WOBBLE OS.dc.html`) - a mockup with dead buttons and no detail sub-pages. The backend under it (audit, approvals, sources, memory, providers, ask, content, n8n, costs, intelligence, jobs/workers, health) is largely built and CI-green.
- "Complete the dashboard" = build the real React shell + wire the ~10 pages whose backend exists (Command Center, Ask WOBBLE, Brain, Source Library, Content Command, Approvals, n8n Handoff, Memory, Costs, Audit) + honest "Planned - Chunk NN not built" states for the ~16 whose backend does not exist yet + build the missing detail drawers (source/memory approval queues, content packet detail, quality gate, dead-letter, model-runs drilldown). True 100% is reached incrementally as each chunk's UI checkpoint lands (UI-C1 -> ... -> UI-FINAL). Founder rule stands: no fake buttons, no fake data.
- NEW TESTING RULE for ALL builders incl. Codex: after a chunk, also verify it THROUGH the dashboard (`npm run dev`, open the page, confirm real data + working actions + real state changes), and note the dashboard check in the handoff log. This is IN ADDITION to `npm run verify` / API tests, not instead. Becomes meaningful once the real shell exists; wire-now pages first.

## Notes

- When you finish a chunk: flip its box to `[x]` here, append an entry to `docs/AI_HANDOFF_LOG.md`, and push so CI verifies it.
- If you change the order, update this file and say why in the handoff log.
- Deferred-but-required chunks are NOT optional; they are in V2 scope and listed in their Phase above.
