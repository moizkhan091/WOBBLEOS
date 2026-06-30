# WOBBLE OS Build Sequence Tracker

Date started: 2026-06-29
Owner: shared (Codex, Claude, Gemini, Antigravity)

Purpose: one place that shows what is built, what is being built next, and the FULL order of every chunk so NOTHING gets forgotten. The early order is intentionally non-numeric (data spine first); this tracker is the authoritative map. Update it whenever a chunk completes.

Full acceptance criteria for every chunk live in `docs/V2_BUILD_ACCEPTANCE_PLAN.md`. This file is the status + order map.

Legend: `[x]` done & CI-green · `[~]` in progress · `[ ]` not started · `<- NEXT` marks the next chunk.

Frontend wiring timing lives in `docs/FRONTEND_WIRING_PLAN.md`. Frontend is not an end-only task and not a pre-backend task. The rule is: backend capability -> tested API/job/approval flow -> frontend wiring checkpoint -> next backend cluster.

## Full master order (all 43 chunks, 00-42)

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
13. [x] Chunk 15 - Content Worker V1
14. [ ] Chunk 17 - Quality Gate & Do-Not-Say (pairs with the content worker)              <- NEXT BACKEND
15. [ ] Chunk 16 - Founder Content Tracks
16. [ ] Chunk 18 - n8n Signed Handoff (completes source -> memory -> content -> approval -> handoff)

Frontend checkpoint:

- [ ] UI-C1 from `docs/FRONTEND_WIRING_PLAN.md` is now due before the next backend chunk. Wire Content Command to real packets/tracks/generation.
- After Chunk 18: run UI-C2 and polish the full source -> memory -> content -> approval -> handoff loop.

### Phase 3 - Registries + intelligence inputs
17. [ ] Chunk 34 - Prompt/Skill Registry
18. [ ] Chunk 35 - Connections Registry
19. [ ] Chunk 12 - Research Radar
20. [ ] Chunk 13 - Learning Engine

Frontend checkpoint:

- After Chunks 34, 35, 12, and 13: run UI-I1 from `docs/FRONTEND_WIRING_PLAN.md`.

### Phase 4 - Cadence, media, decisions, clients
21. [ ] Chunk 19 - Automations Registry (scheduling/cadence)
22. [ ] Chunk 20 - Workers Health Page
23. [ ] Chunk 21 - Media Studio Backend
24. [ ] Chunk 22 - Media / Video Worker
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

## Notes

- When you finish a chunk: flip its box to `[x]` here, append an entry to `docs/AI_HANDOFF_LOG.md`, and push so CI verifies it.
- If you change the order, update this file and say why in the handoff log.
- Deferred-but-required chunks are NOT optional; they are in V2 scope and listed in their Phase above.
