# WOBBLE OS — Hands-On UX Audit (what works, what doesn't, what to change)

Method: logged into the running OS as a founder, clicked through modules, ran real workflows (added a
lead, moved deals across the pipeline, asked WOBBLE questions, generated an image), **plus** a
line-by-line audit of every module component in `src/components/os/os-ui.tsx`. Every claim below points
at either something observed on screen or a specific line of code.

Legend: **P0** = broken, blocks real use · **P1** = works but the user is misled or stuck ·
**P2** = polish.

---

## 1. FIXED IN THIS PASS (verified in the browser)

| # | Severity | What was wrong | Now |
|---|---|---|---|
| 1 | **P0** | **The New Lead form could not be typed into.** `F`/`Sel` were declared *inside* the modal's render body, so every keystroke created a new component type; React remounted the `<input>` and **focus died after one character**. Verified live: typing "Sarah" left `document.activeElement = BODY`. | `FieldInput`/`FieldSelect` hoisted to module scope. Verified: 11 characters typed, focus retained. |
| 2 | **P0** | **Same bug in Audit Workspace** — the `Stage` wrapper held the stage-3 interview-findings textareas, the module's primary input. | `Stage` hoisted to module scope. |
| 3 | **P0** | **Added leads never appeared in the pipeline.** The board rendered opportunities only, yet its first column is literally named **"New Lead"** — so a founder adds a lead, sees that column stay empty, and concludes the OS is broken. | Unconverted leads now render in the New Lead column as tagged cards with a `Convert to deal →` action. |
| 4 | **P1** | **No feedback after sending in Ask WOBBLE** — your message sat there with no sign the OS heard you. | Animated **"WOBBLE is thinking…"** bubble + auto-scroll to the newest turn. |
| 5 | **P1** | **Ask WOBBLE couldn't see the business.** Asked "which deals are closest to closing?" it replied the detail was "not available in the live system state" — while 7 open deals sat in the CRM. Its evidence was memory + approved sources only. | Added a **live business block** to the system snapshot: open deals by stage + value, largest deals, won totals, leads awaiting conversion, overdue/outstanding invoices, open proposals. |
| 6 | **P1** | **Media Studio contradicted itself** — "provider: blocked (set FAL_KEY)" displayed directly above a `succeeded · openrouter` job. | Per-kind truth: `images: live (OpenRouter)` / `video/audio/3d: optional (set FAL_KEY)`. |
| 7 | **P1** | **Greeting said "Late night grind" at every hour** (`Number(null) === 0` passed a 0–23 check, pinning the hour to 0). | Presence-checked parse + the client sends its own local hour. 7 regression tests. |
| 8 | **P1** | **Unusable on mobile** — a fixed 262px sidebar left 113px of a 375px screen; headings clipped, text wrapping one word per line. | Off-canvas drawer below 860px with a menu button; desktop unchanged. |
| 9 | **P2** | Sidebar permanently claimed "Dashboard build in progress" (hardcoded, and false). | Derived from the module registry: "All modules live · 45 modules · real data, never faked". |
| 10 | **P2** | Pipeline stage changes were a dropdown only. | **Drag-and-drop** between columns with an optimistic move + drop highlight; the `<select>` stays as the keyboard-accessible path. |

---

## 2. WHAT GENUINELY WORKS (verified hands-on)

- **Ask WOBBLE** answers real questions and is honest about its limits — it reported `confidence: low`
  and *"No approved research/sources were found; verify before acting on this answer."*
- **Departments** — 14 departments with truthful self-reporting: Media Production flagged
  `worker-video · missing` and `fal · blocked`; Free Audit showed its backing services `alive`.
- **Agent Registry** — 77 agents, each with a stated judgment purpose and run/failure counts.
- **CRM write path** — form → API → Postgres → re-render, with automatic lead scoring.
- **Pipeline drag-and-drop** — moved a deal Contacted → Qualified; column counts and totals updated and
  the change persisted.
- **Media Studio** — real image generated through the durable queue at 4¢, stored, audited.
- **Empty states** — `StateBlock` is used widely and well; the Daily Brief and CRM empty states explain
  what to do next rather than showing a blank panel.
- **Backup / Restore** — the strongest destructive-action design in the app: Apply stays disabled until
  a dry run produces a preview.
- **Security findings** — resolving requires a written note.
- **The autonomous spine** — in a fresh container, unprompted: `scheduler.tick` → `department.consumed`
  → `model.run.succeeded` → `content_topics.generated`.

---

## 3. STILL BROKEN / MISLEADING — ranked backlog

### P0 — silent failures on money and state

**Invoices (`act()`)** — Approve / Send / Mark paid / Cancel run `await fetch(...)` with **no response
check, no busy state, no error message**. A double-click sends twice; a server rejection is invisible —
the list reloads unchanged and you believe it worked. *This governs real money.* Mark paid and Cancel
also have no confirmation.

**18 mutations across the app share this pattern** (Memory, Library, Tasks, Meetings, Projects,
Proposals, Decisions, Offers, Automations, Radar): fire-and-forget `fetch` with no `r.ok` check. Every
failure is invisible. → One shared `postJson()` helper returning `{ok, error}` + a per-row busy id.

### P1 — the OS reports failure as "all clear"

**Departments** — the loading guard covers only `depts`. If `/api/handoffs` 500s, the page renders the
*empty state* **"No handoffs match"** — a server outage displayed as everything being fine. Same for
escalations, budget, KPIs. It also fires two guaranteed-404 requests (`/departments/__none__/budget`)
on every load.

**Proposals** — the audit dropdowns have no error handling; on failure they render empty and you
conclude there are no audits to build from.

**Library** — if the publisher registry fails, it silently degrades to "manual only".

**Security** — `risks` is fetched and counted in a KPI ("Risks: 4") but **the list is never rendered**.
The data arrives and is dropped.

### P1 — long operations with no progress

**Radar / SEO / Social** — `create()` calls `generate()` **without `await`**, and its own `finally`
immediately clears the busy flag. The 20–40s generation runs with **no indicator at all**: the button
goes idle, then results appear unexplained. Three one-line fixes.

**Paid Audit** — a multi-minute 5-agent run shows a static label, no elapsed time, no cancel.

### P1 — dead ends (your "trigger it via a button" point)

These screens show a result and offer **no way to advance the workflow**:

| Module | Dead end | Should have |
|---|---|---|
| **Free Audit** | Produces opportunities + upside, then stops | **"Build proposal from this →"** |
| **Paid Audit** | Full report renders, no next step | **"Build proposal"** + export on the live report |
| **Content Command** | The packet drawer has no Approve/Reject/Schedule | Approve / Reject / Send to Library |
| **Daily Brief** | Signals are text; nothing links to the record | Each headline links into its module |
| **Command Center / Cockpit** | 9 KPI tiles are dead numbers | Wrap `Kpi` in a link (`href` prop) |
| **Social** | Post ideas terminate | **"→ Draft this in Content"** (SEO already does exactly this) |
| **Topic Bank** | Lead magnet POSTs and vanishes — no list anywhere in the OS | Surface generated magnets |
| **Offer Lab** | Experiments can be created but **no way to record a result or promote a winner** — the module's stated purpose | Result + score entry |
| **Skills** | Tagline promises "edit a skill, approve it" — neither action exists in the UI | Edit / Approve / Archive |
| **Workers** | Stale workers shown with no restart/inspect/log | Actions + job link |
| **Projects** | Shows `done/total deliverables` with no way to add or tick one | Deliverable editor |
| **Org Workspace** | Audits/proposals listed as inert rows | Doc ↗ / Deck ↗ links (both exist elsewhere) |
| **Learning** | 120 notes, no action on any | Drill-down to cited chunks |
| **Handoff** | Failed events with no retry | Retry/redrive (Departments has it) |
| **Costs / Audit log** | No filter, search, pagination or drill-down | Basic filtering |

### P1 — destructive actions with no confirmation

Communications **Send** (external email/DM — one click, recipient not shown, body truncated to 160
chars so you can't read what you're sending), Proposal **Send**, Invoice **Mark paid**/**Cancel**,
Optimizer **Roll back** (reverts a live production change), Department **Terminate escalation**,
Handoff **Cancel**, Memory **Delete**, Connection **Disable**, Meeting **No-show**, several **Archive**s.

### P2 — the most prominent control in the app does nothing

The topbar search — *"Ask WOBBLE or jump to anything…"* — is a `<div>` with **no click handler and no
input**, on every screen. Either wire it to a command palette or make it a link to `/ask`.

### P2 — visual / layout

- `StateBlock kind="loading"` renders a **static** icon — no spin keyframe exists, so every "Loading
  live data…" looks frozen.
- Empty-column `—` and several empty states use `#4a4a52` on `#06070A` ≈ **1.6:1 contrast** (WCAG AA
  needs 4.5:1).
- **Costs** table: fixed 110/90/90px columns, no `overflow-x`; 5-figure values overflow.
- **Connections**: the only KPI grid not using `auto-fit` — stays 4 columns at 375px.
- **Taste**, **Audit Workspace**: fixed 2-column grids with no responsive fallback.
- **Handoff**: `textOverflow: ellipsis` without `whiteSpace: nowrap` — the ellipsis never applies.
- **Recent Activity** shows raw machine names (`content_intelligence.completed`) and repeats the full
  date on every row.
- **Library**: `PostRow`/`Section` declared inside the render body → remount churn on every render.

### P2 — accessibility

Two `aria-label`s in ~6,500 lines. ~25 unlabelled `<select>`s. Nine `<div onClick>` rows that are the
*only* way to open a drawer (not keyboard reachable). No `Escape`/focus-trap on any of 12 modals, and a
stray backdrop click discards a half-filled form.

---

## 4. THE PIPELINE, GHL-STYLE — what's done and what's next

**Done now:** leads visible in the funnel, drag-and-drop between stages, optimistic movement, drop-target
highlight, keyboard-accessible fallback.

**Worth doing next:** per-stage totals in the header (partly there), inline "next action" on each card
(Build proposal / Send proposal / Book call) so the pipeline becomes the place you *work* rather than a
place you look, WIP/aging indicators (days in stage), and filtering by owner/value.

---

## 5. SUGGESTED ORDER OF WORK

1. **The 18 silent mutations** — one `postJson()` helper + per-row busy. Biggest correctness win, small effort.
2. **Confirmations on destructive/irreversible actions** — especially Communications Send and Invoices.
3. **The three non-awaited `generate()` calls** — restores progress feedback on the longest operations.
4. **Departments error handling** — stop reporting outages as "all clear".
5. **Dead-end buttons** — Free/Paid Audit → Proposal first; it's the actual revenue path.
6. **Make KPI tiles and Daily Brief signals links** — one shared change, large perceived improvement.
7. **Wire or remove the topbar search.**
8. **Loading spin keyframe + contrast fixes** — cheap, felt everywhere.
9. **Accessibility pass** — labels, `<button>` instead of clickable `<div>`, modal Escape/focus trap.
