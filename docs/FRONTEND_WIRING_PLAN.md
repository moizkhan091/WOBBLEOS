# WOBBLE OS Frontend Wiring Plan

Purpose: make it clear when Claude/Codex/Gemini/Antigravity should wire the Claude Design frontend into the real WOBBLE OS backend.

Decision: frontend wiring is **not** saved until the very end, and it is **not** done before the backend exists. WOBBLE OS uses backend-first clusters, then frontend wiring checkpoints.

Short rule:

```text
backend capability -> tested API/job/approval flow -> frontend wiring -> next backend cluster
```

This prevents fake buttons, static dashboards, and pages that look finished but do not operate.

## Canonical Frontend Design Files

Use these as the design source/reference:

- `dashboard-interface-design-brief/project/WOBBLE OS.dc.html`
- `dashboard-interface-design-brief/project/WOBBLE OS-print-qbwnpk.dc.html`
- `dashboard-interface-design-brief/project/support.js`
- `dashboard-interface-design-brief/project/uploads/`
- Original handoff zip kept for reference: `Dashboard Interface Design Brief-handoff (1).zip`

Rules:

- Do not rebuild the visual direction from scratch.
- Preserve the premium black/electric-lime WOBBLE Liquid Glass command-center feel.
- Convert the design into real Next.js UI/components only when the backend route/job exists.
- Buttons must call real APIs/jobs or be visibly disabled/planned. No fake success states.
- Pages should show real loading, empty, error, approval, failed, pending, and completed states.
- Frontend must not hardcode strategy, captions, model choices, or fake data as if real.

## Mandatory Wiring Checkpoints

### UI-C1: Content Command Wiring

When: immediately after **Chunk 15: Content Worker V1** is complete.

Wire:

- Content Command board reads `GET /api/content/packets`.
- Packet detail reads `GET /api/content/packets/[id]`.
- Track filter reads `GET /api/content/tracks`.
- Generate WOBBLE Content button triggers the real Chunk 15 content job/API.
- Packet detail shows platform, format, track, objective, audience, angle, hook, copy, caption, CTA, design direction, sources, memory chunks, evidence summary, quality scores, approval state, and version history.

Do not wait for every future module before this. After Chunk 15, the first real content workflow exists and deserves a usable UI.

### UI-C2: Full Content Loop Polish

When: after **Chunk 18: n8n Signed Handoff** is complete.

Wire/polish:

- Source -> Memory -> Content -> Review -> Approval -> Handoff states.
- Approval queue links back to content packet detail.
- n8n handoff state appears on content packets.
- Retry/failure states are visible.
- The Command Center golden workflow should reflect real counts for content/approval/handoff.

### UI-I1: Intelligence Inputs Wiring

When: after **Chunks 34, 35, 12, and 13** are complete.

Wire:

- Prompt/Skill Registry UI.
- Connections Registry UI.
- Research Radar UI.
- Learning Engine UI.
- Source/Brain/Ask WOBBLE pages should show the new intelligence data paths instead of static placeholders.

### UI-M1: Module UI Wiring During Phase 4

When: after each Phase 4 backend/worker module becomes real.

Wire each module after its backend is ready:

- Workers page after Chunk 20.
- Media Studio after Chunks 21 and 22.
- Presentation Maker after Chunk 23, then deepen again after Chunk 41.
- Decision Room after Chunk 24.
- Offer Lab after Chunk 25.
- Client AIOS Lab after Chunk 26.

Do not wait until Phase 7 to wire these. Each module should become usable shortly after its backend is verified.

### UI-O1: Operations UI Wiring

When: after **Chunks 27, 28, and 29**.

Wire:

- Backup & Restore UI.
- Settings, budgets, model roles, provider settings, and kill switches.
- Costs dashboard from real `model_runs` / `provider_runs`.
- Command Center final real metrics.

### UI-G1: Growth Module UI Wiring

When: during **Phase 7**, after each growth backend is complete.

Wire:

- SEO & Blog Growth Engine after Chunk 37.
- Social Intelligence after Chunk 38.
- Website Analytics after Chunk 39.
- Invoice Builder after Chunk 40.
- Presentation Maker Claude Design bridge after Chunk 41.
- Business Docs Engine after Chunk 42.

### UI-FINAL: End-To-End Production Polish

When: after **Chunks 30-33**.

This is not the first frontend pass. This is final hardening:

- E2E walkthroughs.
- Responsive checks.
- Loading/empty/error state polish.
- Accessibility/readability pass.
- Command Center cross-module links.
- Health/recovery/failure-state visibility.

## Current Next Frontend Action

Do **not** wire Content Command before Chunk 15.

Build **Chunk 15: Content Worker V1** first. Then run UI-C1.
