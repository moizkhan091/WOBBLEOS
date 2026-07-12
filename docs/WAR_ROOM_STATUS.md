# WOBBLE OS — WAR ROOM STATUS (authoritative live state)

_The single source of truth for the final-build wave. Resumable in one command. Update continuously._

## 0. Resume in one command
```
cd "C:\Wobble OS" && git pull && git rev-parse --short HEAD && ls src/db/migrations/*.sql | tail -1 && npx tsc --noEmit -p tsconfig.json && npx vitest run 2>&1 | tail -3
```
Then read this file's §6 (open work) and continue the next unchecked item.

## 1. Verified current state (checked against the repo, not summaries)
- **Branch:** `main` · **HEAD:** `<commercial-operating-unit + consumer-loop commit>` · working tree clean.
- **Migrations applied (0037 latest, zero drift):** 0032 departments · 0033 department_members · 0034 budget_reservations · 0035 escalations · 0036 provider_usage · 0037 escalation_links. (The Commercial Operating Unit + consumer loop added NO migration — they consume existing services + the existing handoff runtime.)
- **Gate:** typecheck 0 · **724 tests (96 files)** · build 0 · real-DB proofs pass (incl. `verify-proposal-vertical-db` + `verify-content-vertical-db` + `verify-research-intelligence-vertical-db` + **`verify-department-consumer-db`** + **`verify-commercial-chain-db`**, each run twice cleanly).
- **Phases 1–2:** COMPLETE. **Phase 3 RUNTIME:** correctness-complete (see §3). **Phase-3 verticals:** Paid Audit + **Proposal** + **Content** + **Research & Intelligence** + **Commercial Operating Unit (Sales/CRM → Finance → Delivery)** done. **AUTONOMOUS CHAIN NOW WIRED (see §3a).** **Phases 4–10:** open (see §6). **VPS:** not deployed (blocked — see §7).
- **Active departments (8):** paid_audit, content, proposal, research_intelligence, **sales_crm, finance, delivery**, founder_command_centre.

## 1a. Independent-reviewer findings this wave — HIGH/ MEDIUM addressed (evidence-backed)
An independent read-only reviewer audited the merged Phase-3 runtime. Confirmed + fixed this batch:
- **[HIGH #1] Verticals had no live consumer / trigger — the chain only ran in proof scripts.** FIXED: `src/lib/departments/consumer.ts` (`runDepartmentConsumerTick`) is wired into the scheduler (opt-in, enabled in the worker) and autonomously claims routed inter-department handoffs and runs the destination department. Production **origination** added: the `audit.paid` job dispatches a `business_audit` handoff to Proposal (best-effort, non-regressive). Proven on real Postgres by `verify-department-consumer-db` (autonomous claim → Proposal runs → completed exactly-once, run twice).
- **[HIGH #2] Proposal "solution architect" LLM output was computed then discarded.** FIXED: `createProposalFromAudit` now persists the synthesis onto the artifact (`metadata.solutionDesign` + enriches `scope`). Proven in the consumer DB proof + `proposal-department.test.ts`.
- **[MED #3] RESUME only changed a record (no re-execution).** FIXED transitively: a redriven → `delivered` handoff is now claimed + re-run by the consumer loop.
- **[MED #4] Content client path always rejected** (`client_confidential` vs `internal`-only). FIXED in the seed (Content permits `client_confidential`).
- **[LOW #6] Estimated usage mislabeled `fromActual`.** FIXED: `settleReservationFromUsage` labels `fromActual` by `usage.anyActual`.
- **[MED #5] Non-atomic proposal-accept commercial chain; [LOW #7] dispatch-time classification gate** — tracked as the next remediation items (see §6).

## 3a. AUTONOMOUS inter-department chain (this wave)
- **Consumer loop** (`consumer.ts`): per active department with a registered consumer AND a real upstream producer, claim one delivered handoff (atomic lease) → run the vertical off the claimed envelope → ack + complete (success) or fail → retry/dead-letter → founder escalation. No decorative consumers (content/research have no live producer yet → intentionally unwired).
- **Registered consumers:** `proposal` (← paid_audit `business_audit`), `sales_crm` (← `proposal_artifact`), `finance` + `delivery` (← sales_crm `won_deal`).
- **Origination:** `audit.paid` job → `dispatchBusinessAuditToProposal` (production trigger, best-effort). The proposal-accept → `sales_crm` origination is the next step (see §6) — it requires migrating the inline accept chain to a single dispatch to avoid double invoice/won.
- **Commercial chain** proven end-to-end on real Postgres (`verify-commercial-chain-db`, twice): accepted deal → Sales/CRM (won, deterministic) → Finance (draft invoice, AI never moves money) → Delivery (project + milestones + tasks + owner + truthful health + real risk escalation) → completion → Founder Command Centre. Judgment agents are advisory only, never on a financial/CRM/project write path (asserted).

## 2. Locked shared contracts (LEAD-owned; do NOT edit concurrently in subagents)
- **Schema + migration numbering:** `src/db/schema.ts`, `src/db/migrations/*` — next migration is **0038**. Lead assigns numbers.
- **Handoff envelope + runtime:** `src/lib/domain/handoff.ts`, `src/lib/handoff/*`, `src/lib/handoff-transport/*`.
- **Department contracts:** `src/lib/domain/department.ts`, `department-membership.ts`, `department-budget.ts`, `escalation.ts`; services in `src/lib/departments/*` (registry, orchestrator, enforcement, budget, escalation, health, kpi).
- **Provider usage contract:** `src/lib/domain/provider-usage.ts` + `src/lib/provider-usage/*` (normalized actual usage; budgets settle against this).
- **Approval contracts:** `src/lib/approvals/*`, `src/lib/approval-router/*`, `src/lib/approval-effects/*` (transactional outbox).
- **Principal UI:** `src/components/os/os-ui.tsx`; module registry `src/lib/os/modules.ts`.
- **Authoritative ledger:** `docs/REMEDIATION_LEDGER.md`. **This file:** `docs/WAR_ROOM_STATUS.md`.
- **CI workflow:** `.github/workflows/ci.yml` (concurrency `cancel-in-progress: false` — runs queue).

Subagents may OWN: new `src/lib/departments/verticals/<name>.ts`, their `tests/<name>.test.ts`, their `src/scripts/verify-<name>-db.ts`. The LEAD integrates seed activation (`src/lib/departments/seed.ts`), any migration, and UI wiring.

## 3. Phase-3 RUNTIME — COMPLETE (the foundation every vertical plugs into)
- Department domain model, explicit memberships, registry + versioned upsert, canonical seed (13 depts / 3 active), team→FK.
- Shared orchestrator + permission enforcement; department-to-department routing through the durable handoff runtime.
- **Paid Audit vertical proven end-to-end.** Truthful health from real signals.
- **Operational budget** — reserve→settle, per-department FOR-UPDATE lock (concurrency race proven), founder override, expiry.
- **ACTUAL provider usage + settlement (L1)** — normalized `provider_usage`, OpenRouter `usage.include=true`, idempotent by request+attempt, budget settles to real cost; **real-OpenRouter proof**. Estimated-vs-actual honest.
- **Escalation runtime + REAL Resume/Terminate/Dismiss (L2)** — escalations link to handoff/reservation/approval/job/graphRun; Resume redrives the real handoff, Terminate cancels real handoffs + releases reservation, Dismiss leaves blocked; **real-DB proof**.
- **Real KPIs** computed from runtime. **Command Centre UI** inspects + operates departments/handoffs/escalations/budget/KPIs (browser-verified).

## 4. Dependency graph (remaining wave)
```
[L3 DB-proof harness] ─┐
[Provider usage L1]────┼─> [Content vertical] ─> [Phase 4 QA boards: content/brand]
[Budget L1]────────────┤   [Research foundation] ─> [Phase 5 continuous research]
[Escalation L2]────────┤   [Proposal vertical] ─> [Sales/CRM→Finance→Delivery chain]
[Orchestrator/routing]─┘        │                        │
                                └──> [Phase 4 QA boards] ─┴─> [Phase 6/7 taste + selective revision]
                                                              └─> [Phase 8 self-improvement]
[Free Audit Phase 9] depends on: Research + QA boards + selective revision.
[Media Studio Phase 10] depends on: real provider credentials (BLOCKED) + queue/workers.
[L4 Playwright + CI Postgres] depends on: the completed UI surfaces of each vertical.
[VPS deploy] depends on: FINAL INTEGRATED RELEASE GATE (all phases) + SSH/secrets (BLOCKED).
```

## 5. Merge order (one verified stream at a time; gate after each)
~~1. L3 DB-proof harness.~~ ~~2. Proposal vertical (DONE — commercial chain proven).~~ 3. Sales/CRM→Finance→Delivery visibility layer. 4. Content chain. 5. Research foundation. 6. Phase-4 QA boards. 7. Phase 6/7 taste+revision. 8. Phase 8 self-improvement. 9. Phase 9 Free Audit. 10. Phase 10 Media Studio. 11. L4 Playwright/CI. 12. Reviewer pass. 13. Release gate. 14. VPS.

## 6. Open work (next-session checklist — each plugs into the finished runtime)
- [x] **Proposal & Solution Design vertical** — DONE. `runProposalDepartment`: solution architect synthesizes (real LLM, budget-attributed); deterministic `createProposalFromAudit` writes the artifact; on accept the commercial chain fires. Activated (status active, `proposal_orchestrator` + `proposal_solution_architect` registered). Consumer primitive `claimNextDepartmentHandoff` added. Real-DB proof runs isolated + repeatable.
- [x] **Commercial Operating Unit (Sales/CRM → Finance → Delivery)** — DONE. Three real department verticals (`runSalesCrmDepartment`/`runFinanceDepartment`/`runDeliveryDepartment`) wrap the proven deterministic services with real coordination/authorization/escalation/health + advisory judgment agents (never on a write path). Activated (3 depts → active, orchestrators + advisory agents registered). Autonomous via the consumer loop. Real-DB proof (`verify-commercial-chain-db`) run twice cleanly.
- [x] **Autonomous inter-department chain (consumer loop + origination)** — DONE. `runDepartmentConsumerTick` (scheduler-wired, worker-enabled) claims + runs routed handoffs; `audit.paid` originates to Proposal. Real-DB proof (`verify-department-consumer-db`) run twice. Closes reviewer HIGH #1 + MED #3.
- [x] **Proposal-accept → autonomous commercial chain origination (Priority 2 + reviewer #5)** — DONE. `proposalAction` accept of an opportunity-linked proposal is now an ATOMIC transaction (`defaultAcceptAndEmit`): claim sent→accepted AND persist the `proposal_artifact` outbox handoff to Sales/CRM in ONE db.transaction. The autonomous consumer chain then owns won→invoice→delivery (the inline invoice/won/project writes are removed — reviewer #5's non-atomic 3-write path is gone). Proven on real Postgres (`verify-proposal-accept-origination-db`, run twice): atomicity (accepted always has its handoff — a crash cannot lose downstream work), EXACTLY-ONCE (duplicate accept returns null, no second handoff), client scope preserved, chain drives won+invoice+project, and a re-drive of the COMPLETED chain creates no duplicates. Behaviour change documented: for opp-linked proposals the invoice/project appear when the consumer processes the handoff (running worker) rather than synchronously. Opp-less proposals keep the inline invoice (edge case). **Remaining sub-items (scoped, honest):** (a) consumer-RECLAIM idempotency — if a consumer crashes AFTER a deterministic write but BEFORE completing the handoff, the lease-expiry reclaim would re-run the vertical; `createInvoice`/`addProject` need a per-deal dedup guard (delivery via `listProjects({opportunityId})`; finance via an indexed invoice-by-deal lookup). The origination-level exactly-once (atomic claim + idempotent emit) is closed; this in-consumer window is not. (b) a browser E2E starting from the real acceptance API + driving the consumer (the DB proof covers the chain; the Command Centre effects are already E2E-covered).
- [x] **Reviewer #7 (Priority 4) — dispatch-time data-classification gate** — DONE. `validateHandoff` (called by `dispatchHandoff` BEFORE persistence) + `planDepartmentRoute` now reject a route whose `dataClassification` the destination is not cleared for — enforced at dispatch, not only at accept. The orchestrator passes the destination's `permittedDataClassifications`; the direct origination dispatch (`dispatchBusinessAuditToProposal`) passes it too (direct-call bypasses gated). Memory-scope-widening + tenant-mismatch rejections were already enforced. Unit tests (validateHandoff + planDepartmentRoute: unauthorized blocked, permitted passes, opt-in no-op) + all 5 key DB proofs re-run green (no routing regression). Finance now permits `client_confidential` (real client-deal gap the origination proof surfaced).
- [ ] **Finance/Research completion-feed.** Delivery completion currently routes to the Founder Command Centre only; a dedicated Finance (revenue-recognition) + Research consumer for `delivery_health` is a scoped follow-up.
- [x] **Content chain** — DONE. `runContentDepartment` wraps the content graph as a department policy (Strategy→Research→Copywriting→Scoring via claimed handoffs) → routes QA-gated content_pack to Publishing. L1 usage attribution threaded through the content graph. Real-DB proof run twice cleanly. Design Intelligence → Publishing consumers stay draft (their own build).
- [x] **Research foundation** — DONE. `runResearchIntelligenceDepartment` sequences scout→analyst→dreamer as a department policy; insights/suggestions land approval-gated; validated intelligence routes to the Founder Command Centre. L1 usage attribution threaded through analyst + dreamer. Real-DB proof (real analyst+dreamer, canned LLM) run twice cleanly. Continuous cadence (scheduler-driven) = Phase 5.
- [ ] **L3** — isolated/repeatable DB-proof harness; retrofit KPI proof to scope by unique ids.
- [ ] **L4** — committed Playwright E2E + CI Postgres service.
- [x] **Phase 4 — independent QA board framework** — DONE (framework + real-DB persistence). `src/lib/qa/*` + `src/lib/domain/qa-board.ts`: a QA board is an INDEPENDENT evaluator (distinct agent slug + policy + memory scope); `runQaReview` hard-rejects a self-review (author ∈ contributors) before evaluating; verdict `pass|fail|revise|blocked`, evidence-backed; `revise`/`fail` routes to the EXACT failed stage preserving completed work + surfaces to the Command Centre. 9 boards registered; Paid Audit + Content Quality/Brand fully implemented. `qa_reviews` table (migration 0038) + `createDbQaReviewStore`. Real-DB proof `verify-qa-boards-db` (via the shipped store) run twice. **NEXT (to make it gate live flows):** register the QA reviewer agents + `quality_assurance` department in the seed, and wire a board into a real department-output gate (e.g. paid_audit business_audit → QA before routing to Proposal). Framework is proven; it does not yet gate a live flow — honestly labeled.
- [x] **L4 — Playwright E2E browser gate — REQUIRED + GREEN IN CI.** 10 committed tests asserting REAL DB effects (resume→escalation resolved AND handoff redriven; terminate→cancelled; dismiss; retry→delivered; cancel→cancelled; budget/KPI verified usage), authenticated founder + unauth gate, isolated seed + teardown. The e2e job runs on push/PR (no continue-on-error, no manual gate). **Two real CI-env blockers were found by reproducing the exact CI flow locally (fresh DB + production `next start` — the path A's dev-mode run had masked) and fixed:** (1) migration `0026` re-created `approvals_status_idx` that `0000` already made → from-scratch `db:migrate` failed; fixed with `CREATE INDEX IF NOT EXISTS` (no-op on migrated DBs). (2) production issues a `Secure` session cookie which Playwright's APIRequestContext won't replay over http → all authed API reads 401'd; fixed with a test-only `SESSION_COOKIE_INSECURE` escape hatch (defaults secure; set only by the E2E harness). Full production suite verified green locally (10 passed, 1.2m) before re-enabling.
- [ ] **Phases 5–10** — continuous research, taste+selective-revision, self-improvement, full Free Audit, real Media Studio.
- [ ] **Independent reviewer pass** per phase.

## 7. CONSOLIDATED BLOCKER REPORT (external — cannot be resolved from this environment)
1. **VPS deployment** — requires SSH access to the production host + the isolated `/opt/wobble-os` Docker stack. Not available here. **Deployment is also gated behind the FINAL INTEGRATED RELEASE GATE (all phases), which is not yet met.** Per every prior mandate + this one: deploy ONLY after the gate passes. → BLOCKED (access + gate).
2. **Production secrets** — production DB URL, session/JWT secrets, hostname/TLS. Not available. → BLOCKED.
3. **Media Studio provider credentials (Phase 10)** — real image/video/media provider API keys (e.g. fal.ai). `OPENROUTER_API_KEY` IS present (text). Media provider keys are NOT confirmed present. Media Studio will be built to the adapter boundary but shown truthfully as draft/blocked until a real key is configured. → BLOCKED (media only).
- **Not blocked:** all product implementation, tests, real-DB proofs, and the OpenRouter text path (key present) proceed normally.

## 8. Parallelization plan (for a fresh-context session)
Lead owns §2. Spawn 3–4 implementation subagents on independent verticals (each owns its own `verticals/*.ts` + tests + verify script; NO shared-file edits), plus 1 reviewer subagent (read-only audit). Lead integrates seed/migration/UI + runs the gate after each merge. Read-only recon subagents are always safe to run in parallel.

## 9. Log
- 2026-07-12: L1 (actual provider settlement, `1d4b254`) + L2 (real escalation control, `090c3ee`) landed, real-proven. War room opened. Proposal vertical started; commercial-chain recon dispatched.
- 2026-07-12: **Proposal vertical + commercial chain** landed (702 tests, real-DB proven twice, isolated + repeatable). Added `claimNextDepartmentHandoff` consumer primitive. 4 active departments. L3 isolated-proof methodology demonstrated in `verify-proposal-vertical-db`. CI green `423bc6c`.
- 2026-07-12: **Content vertical** landed (706 tests, real-DB proven twice). content_orchestrator now genuinely driven by the department runtime; content_pack routes to Publishing; L1 usage attribution threaded through the content graph. CI green `d409a7e`.
- 2026-07-12: **Research & Intelligence vertical** landed (710 tests, real-DB proven twice). scout→analyst→dreamer wired as a department policy; approval-gated intelligence routes to the Founder Command Centre; L1 usage attribution threaded through analyst + dreamer. 5 active departments.
- 2026-07-12: **Commercial Operating Unit + autonomous consumer loop + independent-reviewer fixes** landed (724 tests / 96 files, real-DB proven twice for both new proofs). Parallel wave: 3 implementation subagents (Commercial / Playwright-E2E / QA-boards) + 1 independent reviewer, in-tree with exclusive file ownership (worktrees rejected — Node `node_modules` cost; single Postgres → DB proofs run serially by the lead). Merged **Commercial (B)** + the keystone consumer-loop fix + reviewer HIGH/MED fixes. **QA boards (Workstream C)** and **Playwright E2E (Workstream A)** are code-complete and pending their own gated merges (C needs a `qa_reviews` migration; A needs CI Postgres wiring). 8 active departments. NEXT: proposal-accept origination migration (§6), then merge C (QA boards) + A (Playwright/CI), then Phases 4–10.
