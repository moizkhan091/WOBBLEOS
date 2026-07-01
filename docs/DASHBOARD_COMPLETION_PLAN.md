# WOBBLE OS Dashboard Completion Plan

Date: 2026-07-01
Owner: shared (Codex, Claude, Gemini, Antigravity)
Companion to: `docs/FRONTEND_WIRING_PLAN.md` (checkpoint rules), `docs/BUILD_SEQUENCE_TRACKER.md` (chunk status), `docs/CLAUDE_BROWSER_AUDIT_ROUND_2.md` (missing detail views).

Purpose: one honest source of truth for the state of the DASHBOARD (the app you click), what "complete" means, what can be finished now vs. what is blocked on backend chunks, and how every builder must test through the dashboard from now on.

---

## 1. The honest state (audited 2026-07-01)

Three different things get called "the dashboard". Keep them separate:

1. **The Claude Design prototype** — `dashboard-interface-design-brief/project/WOBBLE OS.dc.html`.
   - This is a VISUAL MOCKUP. It has 26 module pages in the sidebar (21 original + the 5 GROWTH & BUSINESS modules added 2026-07-01).
   - Buttons are intentionally dead (prototype). Data is placeholder. There are NO record detail drawers/sub-pages except the Add/Capture and Switch-Founder modals.
   - This is correct for a design file. It is the reference, not the product.

2. **The production React app** — `src/app/`.
   - Reality: this barely exists. There is ONE static overview `src/app/page.tsx` (~272 lines) and an EMPTY `src/components/os/`.
   - The real dashboard (sidebar + 26 routed pages + detail drawers + wired buttons) HAS NOT BEEN BUILT YET.

3. **The backend** — `src/lib/*` + `src/app/api/*`.
   - This is rich and real: audit, approvals, sources, memory/Brain, providers, Ask WOBBLE, content + content-worker, n8n handoff, intelligence substrate, jobs/workers, model-runs/costs, health. All have tested APIs.

So: the buttons "don't work" because the production dashboard was never built. The backend under it is largely built. Completing the dashboard = **build the real React dashboard and wire it to the APIs that already exist**, with honest placeholders where the backend chunk is not built yet.

---

## 2. Why "100% complete right now" is not truthfully possible (and what we do instead)

Roughly 10 of 26 module pages have a live backend today. The other ~16 (Research Radar, Learning Engine, Media Studio, Presentation Maker, Decision Room, Offer Lab, Client AIOS Lab, Automations, Workers Health, Backup, Settings, and the 5 growth modules) have NO backend yet — their chunks are unbuilt.

The founder's own rule (`FRONTEND_WIRING_PLAN.md`): **no fake buttons, no fake success states, no fake data as if real.** Forcing every page to look "100% done" now would require faking data for modules that do not exist. That breaks the rule and hides what still needs building.

**The completion definition we use instead:**

- The dashboard is "complete for now" when: the real React shell exists, EVERY page is a real route with the exact WOBBLE design, every page whose backend exists is fully wired (real data + working buttons + loading/empty/error/pending/approved/failed states), and every page whose backend does NOT exist shows an honest "Planned — backend chunk NN not built yet" state (still styled, not a dead mockup, not fake data).
- The dashboard reaches true 100% incrementally: each time a backend chunk lands, its page flips from "planned" to "wired" at that chunk's UI checkpoint. Final polish is UI-FINAL.

This keeps the premium look, makes everything clickable/honest today, and never lies about what works.

---

## 3. Page-by-page status and action

Legend: WIRE NOW = backend exists, build+wire the real page now · PLANNED = show honest planned state until its chunk lands · PARTIAL = some data exists.

| Sidebar page | Backend chunk(s) | Backend built? | Action |
|---|---|---|---|
| Command Center (home) | 29 (+ aggregates) | Partial (approvals/jobs/costs/audit exist) | WIRE NOW (real counts where available; honest for the rest) |
| Ask WOBBLE | 11 | Yes | WIRE NOW → `/api/ask` |
| WOBBLE Brain | 10 | Yes | WIRE NOW → `/api/memory` |
| Research Radar | 12 (+50 substrate) | No (12); substrate partial | PLANNED (can show intelligence items if useful) |
| Source Library | 9 | Yes | WIRE NOW → `/api/sources` (+ approval queue drawer) |
| Learning Engine | 13 | No | PLANNED |
| Content Command | 14/15/16/17 | Yes | WIRE NOW → `/api/content` (+ packet detail = UI-C1) |
| Media Studio | 21/22 | No | PLANNED |
| Presentation Maker | 23/41 | No | PLANNED |
| Decision Room | 24 | No | PLANNED |
| Offer Lab | 25 | No | PLANNED |
| Client AIOS Lab | 26 | No | PLANNED |
| Automations | 19 | No | PLANNED |
| Approvals | 4 | Yes | WIRE NOW → `/api/approvals` (+ approve/reject actions) |
| Workers | 20 (heartbeats exist) | Partial | PARTIAL (heartbeat data; full page at Chunk 20) |
| n8n Handoff | 18 | Yes | WIRE NOW → `/api/n8n` (+ dead-letter detail) |
| Memory | 10 | Yes | WIRE NOW → `/api/memory` |
| Costs | 5 | Yes | WIRE NOW → `/api/costs` (real model_runs) |
| Audit Log | 3 | Yes | WIRE NOW → `/api/audit` |
| Backup & Restore | 27 | No | PLANNED |
| Settings | 28 | No | PLANNED |
| SEO & Blog Engine | 37 | No | PLANNED |
| Social Intelligence | 38 | No | PLANNED |
| Website Analytics | 39 | No | PLANNED |
| Invoice Builder | 40 | No | PLANNED |
| Business Docs | 42 | No | PLANNED |

Wire-now pages (10): Command Center, Ask WOBBLE, WOBBLE Brain, Source Library, Content Command, Approvals, n8n Handoff, Memory, Costs, Audit Log.

---

## 4. Missing detail sub-pages / drawers / modals (must be built for "complete")

The prototype has module list views only. The dashboard is not complete until these record-level views exist (from `CLAUDE_BROWSER_AUDIT_ROUND_2.md` + the wiring plan):

- Source Approval Queue + source detail drawer (approve/reject with trust tier).
- Memory Update Approval Queue + proposal detail (approve creates memory; reject does not).
- Content Packet Detail (platform, format, track, objective, audience, angle, hook, copy, caption, CTA, design direction, sources, memory chunks, evidence, quality scores, approval state, version history).
- Content Excellence / Quality Gate view (scores + rewrite instructions).
- Media Clip Review + final MP4 approval (when Chunk 21/22 land).
- n8n Dead Letter detail + retry state.
- Model Runs drilldown (per-run provider/model/tokens/cost/latency/status).
- Budget caps + kill-switch real states (when Chunk 28 lands).
- Workers health/heartbeat detail (when Chunk 20 lands).
- Every wired list: real loading / empty / error / pending / approved / failed / completed states.

---

## 5. Build sequence to complete the dashboard

Backend for the wire-now pages already passed CI, so this is unblocked.

1. **Shell** — real Next.js dashboard shell in `src/components/os/` + `src/app`: sidebar (the 5 groups incl. GROWTH & BUSINESS), topbar, routing for all 26 pages, and the WOBBLE design tokens (black/electric-lime Liquid Glass) ported from `WOBBLE OS.dc.html`. Every page renders as a real route; unbuilt ones show the honest "Planned — Chunk NN" state.
2. **UI-C1** — Content Command wired (board + packet detail + generate button) → `/api/content`.
3. **UI-C2** — full Source → Memory → Content → Review → Approval → Handoff loop; Approvals, Audit, n8n handoff states, Command Center real counts.
4. **Wire the remaining live pages** — Ask WOBBLE, WOBBLE Brain/Memory, Source Library (+ approval queue), Costs (+ model-runs drilldown).
5. From here, each future backend chunk flips its page from PLANNED → wired at its UI checkpoint (UI-I1, UI-M1, UI-O1, UI-G1), ending at UI-FINAL.

This is the same order as `FRONTEND_WIRING_PLAN.md`; this doc just makes the "build the shell + honest placeholders" step explicit so the whole dashboard is clickable now.

---

## 6. Dashboard-driven testing (NEW rule for ALL builders, including Codex)

From now on, unit tests + API tests are NOT enough to call a chunk done. Add a dashboard verification step:

1. Run the app (`npm run dev`) and open the page for the chunk you built.
2. Confirm the chunk's real data appears and its buttons/actions actually work through the UI — create, approve, reject, generate, retry, etc. — with correct loading/empty/error states.
3. For actions, confirm the effect is real (row appears/moves, audit event written, approval created, job enqueued), not a toast with no backend change.
4. Note the dashboard check in the `AI_HANDOFF_LOG.md` entry for that chunk ("Dashboard-verified: opened /costs, real model_runs rendered, export button hit /api/costs").

Note: this becomes meaningful once the real React shell (step 1 above) exists. Until then, wire-now pages are the first to get this treatment. Codex should adopt dashboard verification IN ADDITION to whatever it is doing now (running the code, npm run verify), not instead of it.

---

## 7. One-line summary

The backend is real; the production dashboard is not built yet. Build the real React shell, wire the ~10 pages whose backend exists, show honest "planned" states for the rest, build the missing detail drawers, and from now on verify every chunk THROUGH the dashboard — not just via tests.
