# WOBBLE OS Build Sequence Tracker

Date started: 2026-06-29
Owner: shared (Codex, Claude, Gemini, Antigravity)

Purpose: one place that shows what is built, what is being built next, and what we deliberately deferred so NOTHING gets forgotten. The build order is intentionally non-numeric (data spine first), so this tracker exists to guarantee skipped chunks (e.g. 02, 08) are circled back to, not lost.

Full acceptance criteria for every chunk live in `docs/V2_BUILD_ACCEPTANCE_PLAN.md`. This file is just the status + order map. Update it whenever a chunk completes.

Legend: [x] done & CI-green · [~] in progress · [ ] not started

## Active build order (the path we are following)

This is the project's "First Recommended Backend Build Sequence", with 08 slotted in after 10 (right before Ask WOBBLE needs it), per founder direction:

1. [x] Chunk 01 - Database Foundation
2. [x] Chunk 03 - Audit Log
3. [x] Chunk 04 - Approvals System
4. [x] Chunk 05 - Model Runs & Cost Tracking
5. [x] Chunk 06 - Job Queue Foundation
6. [x] Chunk 07 - Worker Runtime Foundation
7. [x] Chunk 09 - Source Library Backend
8. [ ] Chunk 10 - Memory & WOBBLE Brain Backend        <- NEXT
9. [ ] Chunk 08 - Provider Adapter Registry      <- deferred to here (before 11)
10. [ ] Chunk 11 - Ask WOBBLE V1
11. [ ] Chunk 14 - Content Command Backend
12. [ ] Chunk 15 - Content Worker V1
13. [ ] Chunk 18 - n8n Signed Handoff

## Deferred but REQUIRED for V2 (do not drop)

These are not in the first sequence above but are in-scope and must be built. Target timing noted.

- [ ] Chunk 02 - Shared Auth & Founder Attribution. Deferred: local-first dev doesn't need a login gate, but this MUST be done before any VPS deploy. (Audit attribution already works via an explicit `actor` string.)
- [ ] Chunk 34 - Prompt/Skill Registry. Build around Chunk 11/15 (workers load approved skills). Schema + seed already exist (`prompt_skills`).
- [ ] Chunk 35 - Connections Registry. Build with/after Chunk 08 (records/permissions/health for providers). Schema + seed already exist (`provider_connections`).
- [ ] Chunk 12 - Research Radar
- [ ] Chunk 13 - Learning Engine
- [ ] Chunk 16 - Founder Content Tracks
- [ ] Chunk 17 - Quality Gate & Do-Not-Say Rules
- [ ] Chunk 19 - Automations Registry (cadence; only after manual flows work)
- [ ] Chunk 20 - Workers Health Page (heartbeat + isHeartbeatStale already built in Chunk 07)
- [ ] Chunk 21 - Media Studio Backend
- [ ] Chunk 22 - Media / Video Worker
- [ ] Chunk 23 - Presentation Maker
- [ ] Chunk 24 - Decision Room
- [ ] Chunk 25 - Offer Lab
- [ ] Chunk 26 - Client AIOS Lab
- [ ] Chunk 27 - Backup & Restore
- [ ] Chunk 28 - Settings, Budgets & Kill Switches (budget guard already built in Chunk 05; this adds editable settings)
- [ ] Chunk 29 - Command Center Final Wiring
- [ ] Chunk 36 - AI OS Auditor / WOBBLE Dreaming Engine (self-improving intelligence)

## End-to-end / hardening (last)

- [ ] Chunk 30 - End-to-End WOBBLE Content Flow
- [ ] Chunk 31 - End-to-End Research-to-Decision Flow
- [ ] Chunk 32 - End-to-End Media Flow
- [ ] Chunk 33 - Health, Recovery & Failure States

## Notes

- Chunk 00 (Project Hygiene / docs / handoff) is ongoing and effectively done.
- When you finish a chunk: flip its box to [x] here, append an entry to `docs/AI_HANDOFF_LOG.md`, and push so CI verifies it.
- If you change the order, update the "Active build order" section and say why in the handoff log.
