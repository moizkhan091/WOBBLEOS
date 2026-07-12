# WOBBLE OS — WAR ROOM STATUS (authoritative live state)

_The single source of truth for the final-build wave. Resumable in one command. Update continuously._

## 0. Resume in one command
```
cd "C:\Wobble OS" && git pull && git rev-parse --short HEAD && ls src/db/migrations/*.sql | tail -1 && npx tsc --noEmit -p tsconfig.json && npx vitest run 2>&1 | tail -3
```
Then read this file's §6 (open work) and continue the next unchecked item.

## 1. Verified current state (checked against the repo, not summaries)
- **Branch:** `main` · **HEAD:** `<proposal-vertical commit>` · working tree clean.
- **Migrations applied (0037 latest, zero drift):** 0032 departments · 0033 department_members · 0034 budget_reservations · 0035 escalations · 0036 provider_usage · 0037 escalation_links. (Proposal vertical added NO migration — it consumes existing services.)
- **Gate:** typecheck 0 · **706 tests (93 files)** · build 0 · real-DB proofs pass (incl. `verify-proposal-vertical-db` + `verify-content-vertical-db`, each run twice cleanly).
- **Phases 1–2:** COMPLETE. **Phase 3 RUNTIME:** correctness-complete (see §3). **Phase-3 verticals:** Paid Audit + **Proposal + commercial chain** + **Content** done. **Phases 4–10:** open (see §6). **VPS:** not deployed (blocked — see §7).
- **Active departments (4):** paid_audit, content, **proposal**, founder_command_centre.

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
- [x] **Commercial chain (Paid Audit → Proposal → accept → invoice + won + delivery)** — PROVEN on live Postgres. LLMs never mutate finances; every write is a deterministic service. Remaining: an explicit Sales/CRM & Finance & Delivery department-coordination/visibility layer over these proven services (the writes already exist + are proven).
- [x] **Content chain** — DONE. `runContentDepartment` wraps the content graph as a department policy (Strategy→Research→Copywriting→Scoring via claimed handoffs) → routes QA-gated content_pack to Publishing. L1 usage attribution threaded through the content graph. Real-DB proof run twice cleanly. Design Intelligence → Publishing consumers stay draft (their own build).
- [ ] **Research foundation** — scout→analyst→dreamer via the runtime + founder approval gate + downstream routing.
- [ ] **L3** — isolated/repeatable DB-proof harness; retrofit KPI proof to scope by unique ids.
- [ ] **L4** — committed Playwright E2E + CI Postgres service.
- [ ] **Phases 4–10** — QA boards, continuous research, taste+selective-revision, self-improvement, full Free Audit, real Media Studio.
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
- 2026-07-12: **Content vertical** landed (706 tests, real-DB proven twice). content_orchestrator now genuinely driven by the department runtime; content_pack routes to Publishing; L1 usage attribution threaded through the content graph. NEXT (merge order): Research foundation, Sales/CRM-Finance-Delivery visibility layer, L4 Playwright/CI, then Phases 4–10.
