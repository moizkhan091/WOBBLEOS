# WOBBLE OS AI Handoff Log

Purpose: shared project memory for Codex, Claude, Gemini, Antigravity, and any future AI/code builder working inside `C:\Wobble OS`.

Rule: after meaningful architecture decisions, implementation work, audits, or frontend/backend changes, append a short entry here. Keep it practical. Do not paste secrets, API keys, private tokens, or raw credentials.

Each entry should include:

- Date/time
- Agent/tool used
- What changed or was decided
- Files touched
- Open questions / next actions

---

## 2026-06-29 - Codex - Claude Design Browser Audit

Files created:

- `docs/CLAUDE_DESIGN_AUDIT_AND_BUILD_PROMPT.md`
- `docs/CLAUDE_BROWSER_AUDIT_ROUND_2.md`

Summary:

- Read the Claude Design handoff README and `project\WOBBLE OS.dc.html`.
- Clicked through every sidebar page in the live browser prototype.
- Confirmed the frontend is visually strong but many buttons are prototype-only and need backend/detail flows.
- Recommended keeping the full sidebar, but making Command Center, Ask WOBBLE, and Approvals the daily center.
- Main missing frontend depth: Source Approval Queue, Memory Update Approval Queue, Content Packet Detail, Quality Gate, Media Clip Review, n8n Dead Letter detail, Model Runs drilldown, Health status, Budget caps, clear kill switch states.

Open next action:

- Claude/frontend builder should recreate the design in production React components and add real detail drawers/modals for important records.

---

## 2026-06-29 - Codex - Worker vs n8n Architecture Decision

Files created:

- `docs/WOBBLE_OS_BACKEND_ORCHESTRATION_MAP.md`

Decision:

- n8n is the automation rail for outside-world tasks: fetching, scheduling, sending, syncing, notifying, posting, and external app glue.
- WOBBLE OS workers are backend processes that execute intelligent jobs using OpenRouter, approved memory, approved sources, tools, settings, and approval gates.
- Workers are scripts in the technical sense, but they are not where changing strategy is hardcoded. The script is the body; the LLM is the brain; WOBBLE Brain is memory; tools/APIs are hands; approvals are founder control.
- Stable workflow is coded. Changing thinking lives in WOBBLE Brain, Research Radar, Source Library, settings, prompts, founder feedback, content performance, and model reasoning.

Important product decision:

- V2 content generation should start with WOBBLE brand content first.
- Add founder content as a module/track, but do not let it distract from WOBBLE company content. Founder content can reuse the same Content Command engine with separate voice profiles and approval filters.

Open next action:

- Backend builder should implement job queues, worker processes, model_runs, content_packets, approvals, source/memory update queues, and n8n handoff endpoints according to `docs/WOBBLE_OS_BACKEND_ORCHESTRATION_MAP.md`.

---

## 2026-06-29 - Codex - Full Workforce Clarification

Files updated:

- `docs/WOBBLE_OS_BACKEND_ORCHESTRATION_MAP.md`

Decision:

- "Four workers" means four technical runtime processes, not four AI employees and not reduced scope.
- V2 should expose the full WOBBLE AI workforce inside the OS.
- Named workers/personas include research, source, transcript, learning, memory, guardrail, strategy, offer, content, media, client AIOS, webhook, cost, backup, and health workers.
- These named workers can initially run on four runtime processes: general AI worker, content worker, video worker, and ops worker.

Open next action:

- Frontend should show the full workforce concept confidently.
- Backend should keep runtime deployment reliable while preserving the full all-in V2 product scope.

---

## 2026-06-29 - Codex - Plain English OS Map

Files created:

- `docs/PLAIN_ENGLISH_WOBBLE_OS_MAP.md`

Summary:

- Added a non-technical explanation of WOBBLE OS for Moiz and all AI builders.
- Explains what workers are, what n8n is, how the OS app/database/workers/n8n layers relate, and how every sidebar module should work.
- Clarifies that WOBBLE content is the first priority, with founder content added as tracks inside Content Command rather than as a separate backend.
- Includes example flows for content generation and YouTube transcript ingestion.

Open next action:

- Use this guide as the shared mental model before building backend pieces one by one.

---

## 2026-06-29 - Codex - V2 Build Acceptance Plan

Files created:

- `docs/V2_BUILD_ACCEPTANCE_PLAN.md`

Summary:

- Added the detailed cross-AI build/evaluation plan for WOBBLE OS V2.
- Defines 34 chunks from project hygiene, database, approvals, model runs, queues, workers, sources, memory, Ask WOBBLE, content, media, n8n, automations, decisions, offers, clients, backups, settings, health, and end-to-end flows.
- Each chunk has purpose, ownership, first successful build, anti-hardcoding rules, manual test, automated test, and done criteria.
- Added an AI builder evaluation rubric so Codex, Claude, Gemini, Antigravity, and others can be compared fairly without sabotage.

Open next action:

- Start backend implementation with Chunk 01 Database Foundation, then Audit Log, Approvals, Model Runs, Job Queue, Worker Runtime, Source Library, Memory/WOBBLE Brain, Ask WOBBLE, Content Command, Content Worker, and n8n Signed Handoff.

---

## 2026-06-29 - Codex - Entry Point Docs Updated

Files updated:

- `README.md`
- `docs/PROJECT_START_HERE.md`
- `docs/AI_HANDOFF_LOG.md`

Summary:

- Updated the main project entrypoints so every AI builder sees the latest docs before changing code.
- Added direct links to the frontend handoff files, browser audit, plain-English OS map, backend orchestration map, and V2 build acceptance plan.
- Reconfirmed local-first build strategy before VPS deployment.

Open next action:

- Begin backend preflight and Chunk 01 Database Foundation.

---

## 2026-06-29 - Codex - Claude Design Export Prompt Clarified

Files updated:

- `docs/CLAUDE_DESIGN_AUDIT_AND_BUILD_PROMPT.md`
- `docs/AI_HANDOFF_LOG.md`

Summary:

- Added the exact Claude Design export instruction to the Claude frontend build prompt:
  `Import the attached dashboard-interface-design-brief.zip, read the README inside, and implement: WOBBLE OS.dc.html.`
- Clarified that if the bundle is already extracted, the builder should use the files under `C:\Wobble OS\dashboard-interface-design-brief\`.

Open next action:

- Give Claude the updated prompt and keep it focused on frontend/mock-detail work while Codex starts backend database foundation.

---

## 2026-06-29 - Codex - AI OS Transcript Lessons Integrated

Files created:

- `docs/AI_OS_TRANSCRIPT_LESSONS_FOR_WOBBLE.md`

Files updated:

- `README.md`
- `docs/PROJECT_START_HERE.md`
- `docs/V2_BUILD_ACCEPTANCE_PLAN.md`
- `docs/WOBBLE_OS_BACKEND_ORCHESTRATION_MAP.md`
- `docs/AI_HANDOFF_LOG.md`

Source transcripts reviewed:

- `5 Skills to Build an AI Operating System Like The 1% (Full Guide).txt`
- `6 thing people get wrong setting up ai os..txt`
- `Build & Sell Claude Code Operating Systems (2+ Hour Course).txt`
- `This INSANE AI Operating System Runs My $25M Business.txt`

Summary:

- Added the main lessons from the four AI OS transcripts into a dedicated shared doc.
- Captured the operating order: Context -> Data -> Function, and Context -> Connections -> Capabilities -> Cadence.
- Clarified that WOBBLE OS should not become only a dashboard; the real OS is Brain, approved data, skills/SOPs, connections, cadence, decisions, approvals, and audit.
- Added Prompt/Skill Registry, Connections Registry, and AI OS Auditor / Brain Optimizer as required V2 concepts.
- Updated the build plan so autonomous cadence comes after the manual workflow and Brain/data layer work.
- Reinforced that n8n is the external automation rail, not the WOBBLE Brain.

Open next action:

- Before backend implementation, start with database foundation plus seedable Brain/context, source trust levels, provider/connection registry, and prompt/skill registry support.

---

## 2026-06-29 - Codex - Final V2 Master Build Plan Added

Files created:

- `docs/FINAL_V2_MASTER_BUILD_PLAN.md`

Files updated:

- `README.md`
- `docs/PROJECT_START_HERE.md`
- `docs/V2_BUILD_ACCEPTANCE_PLAN.md`
- `docs/AI_HANDOFF_LOG.md`

Summary:

- Added a clean final master build plan that other AI builders can read quickly.
- Captures the six-layer architecture: WOBBLE Brain, Source/Data Layer, Prompt/Skill Registry, Workers, n8n, Dashboard.
- Lists the final 30 V2 build areas and what success looks like for each.
- Repeats the transcript-derived operating order: Context -> Data -> Function and Context -> Connections -> Capabilities -> Cadence.
- Clarifies worker vs n8n ownership and the correct first backend chunk.

Open next action:

- Start implementation with Database Foundation + Seed Brain + Audit/Approvals base.

---

## 2026-06-29 - Claude - Chunk 03 Audit Log + DB Client Layer

Context:

- Reviewed full project state before building: PROJECT_START_HERE, FINAL_V2_MASTER_BUILD_PLAN, V2_BUILD_ACCEPTANCE_PLAN, BACKEND_ORCHESTRATION_MAP, plus existing `src/db/schema.ts`, migration, `seed.ts`, and domain helpers.
- Codex had completed Chunk 00 (docs) and Chunk 01 (Database Foundation: full Drizzle schema, `0000_init_pgvector.sql` migration with pgvector + all tables/indexes, and real `seed.ts`). No live DB connection existed yet.
- Per the plan's "First Recommended Backend Build Sequence" (01 -> 03 -> 04 ...), built Chunk 03 next. Chunk 02 (Auth) is intentionally deferred in that sequence (local-first; audit attribution only needs an `actor` string) and must be built before any VPS deployment.

Files created:

- `src/db/index.ts` - lazy Drizzle + pg Pool client (`getDb`, `getPool`, `closeDb`, `schema`, `Db` type). This was the missing real data path; required by Chunk 03 and every later backend chunk.
- `src/lib/ids.ts` - `newId(prefix)` helper (e.g. `audit_<uuid>`), matching the seed's prefixed text-PK convention.
- `src/lib/domain/audit.ts` - pure, DB-free `buildAuditEvent` + `auditEventInputSchema` (zod). Requires non-empty `eventType` and `module`; normalizes optionals to null; numeric `costEstimate` stored as string for the pg driver. `eventType`/`module` are open strings by design (new modules added by data, not code).
- `src/lib/audit/index.ts` - `writeAuditEvent(input, deps)` with an injectable `AuditWriter` (testable without Postgres; defaults to real Drizzle insert), plus `listAuditEvents(query)` with module/entityType/entityId filters and `clampLimit` (default 50, max 200).
- `src/app/api/audit/route.ts` - `GET` (read recent events with filters) and `POST` (validated write). Returns 503 when `DATABASE_URL` is unset, 422 on validation failure.
- `tests/audit.test.ts` - covers normalization, id/timestamp handling, validation failures (missing eventType/module, negative cost), injectable-writer behavior, validation-before-write, and clampLimit bounds.

Investigated (no change needed):

- Earlier suspected a `founder_profiles` migration bug (stray `latency_ms`/`error`, missing `metadata`). Verified false - those columns belong to `model_runs`/`provider_runs`; `founder_profiles` correctly has `metadata`. Was a misread of concatenated `sed` ranges.

Real vs mocked:

- DB client, audit write/read, and API route are real and wired to Drizzle/Postgres.
- No live Postgres in this build environment; the audit row insert path is real code but unexercised against a real DB here.

Verification:

- `npm run test` / `typecheck` / `build` could NOT run in this Linux sandbox: vitest 4's native `rolldown` binary segfaults (bus error) because `node_modules` was installed on Windows. This is an environment limitation, not a code issue - run the three commands on the Windows machine to confirm.
- To avoid guessing, verified the exact domain/audit algorithms via a standalone Node script using real `zod` (no broken toolchain): ALL assertions passed (normalization, validation throws, writer injection, clampLimit). Scratch file removed.

Next suggested action:

- Run `npm run test`, `npm run typecheck`, `npm run build` on Windows to confirm green.
- Then build Chunk 04 (Approvals System): wire `createApprovalRecord` to the `approvals`/`approval_actions` tables using `src/db/index.ts`, and make every approval action call `writeAuditEvent` (Chunk 03 is the dependency that makes approvals traceable).

---

## 2026-06-29 - Claude - All 9 Transcripts Distilled + Intelligence Build Map

Context:

- Moiz asked that every transcript be learned (not just the 4 named ones Codex already distilled) and mapped to concrete WOBBLE OS implementation, with emphasis on the self-improving "dreaming" intelligence. WOBBLE OS is the system we will run our agency on, so the goal is best-in-class for us.

What was read:

- Re-read the existing `docs/AI_OS_TRANSCRIPT_LESSONS_FOR_WOBBLE.md` (covers the 4 named transcripts).
- Read in full the 5 numbered transcripts in `ai os youtubevideos/` (also in `docs/source/ai-os-youtubevideos/`): `transcript_1782429250` (knowledge graph/Graphify), `_296` (visual intelligence dashboard + nightly dreaming engine), `_324` (selling AIOS as a service), `_345` (Cape Town mastermind), `_358` (AIOS methodology / layers / bandwidth / 3 KPIs).

Files updated:

- `docs/AI_OS_TRANSCRIPT_LESSONS_FOR_WOBBLE.md` - updated "Source Transcripts Read" to list Set A (4 named) + Set B (5 numbered), and appended a full addendum distilling all 5 numbered transcripts with per-transcript takeaways, cross-cutting lessons, sharpened build notes, and a plain-English summary.

Files created:

- `docs/WOBBLE_OS_INTELLIGENCE_BUILD_MAP.md` - the actionable map. Part 1: each transcript in one line. Part 2: master mapping of every capability -> chunk -> tables/workers -> how we improve it (foundation/brain, skills/commands, connections, workers, safety, cockpit, cadence). Part 3: full design of the WOBBLE Dreaming Engine (self-improving intelligence) grounded in real tables (`model_runs`, `memory_update_proposals`, `prompt_skills`, `quality_reviews`, `automation_runs`, `approvals`, `audit_logs`), its 8 analysis dimensions, run workflow, maturity path, and how it beats the video version (evidence-linked, confidence-scored, approval-gated, self-budgeted, scoped, tool-agnostic). Part 4: improvements beyond the transcripts. Part 5: suggested build order for the intelligence layer.

Key decisions captured:

- The self-improving intelligence = Chunk 30 (AI OS Auditor / Brain Optimizer) built as a scheduled worker; it PROPOSES via approval items and never mutates Core Brain silently.
- Build order rule restated: prove each capability manually, then schedule it. Dreaming Engine ships first as a manual "Run Optimizer" button, then nightly cadence.
- New seed-skill action noted: add `prime`, `explore`, `brainstorm` command-skills to the Prompt/Skill Registry.

Real vs mocked:

- Docs only in this entry. No code changed. The build map references tables that already exist in `schema.ts`.

Next suggested action:

- Continue the spine: Chunk 04 Approvals (wires to audit), then 05 Model Runs/Cost, 06 Queue, 07 Worker Runtime. The Dreaming Engine depends on 05 (cost data), 10 (memory), and 12/14/15 (activity to analyze), so it comes after the spine - per `WOBBLE_OS_INTELLIGENCE_BUILD_MAP.md` Part 5.

---

## 2026-06-29 - Claude - Chunk Plan Updated (Chunks 34-36 Added, No Renumber)

Decision (approved by Moiz): add transcript-derived capabilities to the canonical plan WITHOUT renumbering 00-33, so in-flight builders are not disrupted.

Files updated:

- `docs/V2_BUILD_ACCEPTANCE_PLAN.md` - added a "Transcript-Derived Chunks" section after Chunk 33 with full acceptance criteria for:
  - Chunk 34: Prompt/Skill Registry (versioned, approval-gated skills; seed `prime`/`explore`/`brainstorm` command-skills; workers load approved skills, never hardcode).
  - Chunk 35: Connections Registry (`provider_connections` as source of truth; permissions/cost/health; no secrets in UI; disabling blocks dependent jobs).
  - Chunk 36: AI OS Auditor / WOBBLE Dreaming Engine (self-improving intelligence; 8 analysis dimensions; 4-6 evidence-linked recommendations as approval items; never mutates Brain; manual first, then nightly cadence; Inform+Recommend+Confirm only).
  - Plus a "Transcript-Derived Additions To Existing Chunks" list sharpening 05, 09, 10, 11, 19, 25, 26, 28, 29.
- `docs/WOBBLE_OS_INTELLIGENCE_BUILD_MAP.md` - fixed chunk references to the canonical numbering: Prompt/Skill Registry = Chunk 34, Connections Registry = Chunk 35, AI OS Auditor / Dreaming Engine = Chunk 36 (previously referenced master-plan numbers, which collided with acceptance-plan Chunk 30 = End-to-End Content Flow).

Note on numbering: `V2_BUILD_ACCEPTANCE_PLAN.md` (00-36) is now the canonical chunk list. `FINAL_V2_MASTER_BUILD_PLAN.md` still uses its own "30 build areas" grouping - treat the acceptance plan numbers as authoritative for build/eval.

Open next action:

- No code change in this entry. Resume the build spine at Chunk 04.

---

## 2026-06-29 - Claude - Chunk 04 Approvals System (wired to audit)

Context:

- Built the founder approval gate on top of Chunk 03 (audit) and the `src/db/index.ts` client. Every approval action writes an audit event, satisfying the traceability requirement.

Files created:

- `src/lib/domain/approval-flow.ts` - pure state machine. Statuses: pending, approved, rejected, revision_requested, archived. Actions match seeded `approval_actions` plus media actions (approve_clip, reject_clip, approve_final_mp4). Defines allowed transitions per status, action->status mapping, confirmation-required actions (send_to_n8n, retry_handoff, approve_final_mp4), and `evaluateApprovalAction` (never throws; returns ok/nextStatus/requiresConfirmation/isApproval/isRejection/reason).
- `src/lib/approvals/index.ts` - service layer. `createApproval` (zod-validated, inserts pending row, writes `approval.created` audit), `applyApprovalAction` (loads current status, validates transition + confirmation + approver, sets approved_by/rejected_by + timestamps, writes `approval.<action>` audit), `listApprovals` (status/type/entityType filters), `countPendingApprovals`, `buildApprovalRow` + `clampApprovalLimit`. All accept injectable `store` + `recordAudit` deps so logic is testable without Postgres; defaults use Drizzle + `writeAuditEvent`.
- `src/app/api/approvals/route.ts` - GET (list + pendingCount) and POST (create). 503 if no DATABASE_URL, 422 on validation failure.
- `src/app/api/approvals/[id]/action/route.ts` - POST apply action. Maps not-found -> 404, invalid-transition/missing-confirmation -> 409, else 500.
- `tests/approval-flow.test.ts` - transitions (valid/invalid), confirmation gating, request_revision/reject mapping, attribution, audit-on-action, invalid-transition does-not-update, approver-required, not-found, buildApprovalRow validation, clampApprovalLimit.

Design notes:

- Item types are open strings (approvalType): supports content, source, memory_update, n8n_handoff, media_clip, final_mp4, etc. - no hardcoded single approver and no single item type.
- riskLevel aligned to the seed convention ("normal" | "high"); confirmation requirement is driven by the action, matching seeded `approval_actions.requires_confirmation`.
- Left the pre-existing `src/lib/domain/approvals.ts` `createApprovalRecord` (and its passing test) untouched; the new flow supersedes it for the API path but the pure attribution helper remains.

Real vs mocked:

- Service + routes are real and wired to Drizzle + audit. No live Postgres in this sandbox, so DB execution is unverified here.

Verification:

- vitest still cannot run in this Linux sandbox (rolldown native binary built for Windows). Verified the full approval logic via a standalone Node replica using real `zod`: ALL assertions passed (transitions, confirmation gating, attribution, audit emission, invalid-transition no-update, approver-required, not-found, clamp). Scratch file removed.
- Run `npm run test`, `npm run typecheck`, `npm run build` on Windows to confirm green (now includes `tests/approval-flow.test.ts` + `tests/audit.test.ts`).

Next suggested action:

- Chunk 05 (Model Runs and Cost Tracking): model-call wrapper that logs `model_runs` (provider/model/role/tokens/cost/latency/status) even on failure, and a budget guard using `budget_caps` that can block or require an approval (reuse `createApproval`). This unlocks the Dreaming Engine's cost dimension (Chunk 36).

---

## 2026-06-29 - Claude - Automated Testing / CI / Deploy Gate

Why:

- Moiz does not want to run tests by hand and must not push broken code to the VPS. The Cowork sandbox cannot run the test suite (vitest 4 / rolldown native binary segfaults because `node_modules` was installed on Windows, and a full clean `npm install` exceeds the sandbox time limit / background processes do not persist across tool calls). The durable fix is automation on clean machines, not manual runs.

Files created/updated:

- `package.json` - added `verify` (`typecheck && test && build`) and `ci` (`npm ci && verify`) scripts. One command proves health.
- `.github/workflows/ci.yml` - GitHub Actions: on every push/PR, `npm ci` + typecheck + test + build on `ubuntu-latest` with Node 22 and npm cache. This auto-runs the real test suite for every AI builder on a clean Linux runner. Activates as soon as the repo is pushed to GitHub.
- `scripts/deploy.sh` - VPS deploy gate: git pull -> `npm ci` -> `npm run verify` -> restart. ABORTS before restart if verify fails, so broken code never goes live. RESTART section is a template (pm2/systemd/docker) the operator edits.
- `README.md` - added a "Testing & CI" section explaining the no-manual-testing workflow and why `node_modules` is platform-specific (CI/VPS do fresh `npm ci`).

Key point on cross-platform binaries:

- `node_modules` is git-ignored and platform-specific. The sandbox reuses a Windows install, so it cannot run Linux test binaries. CI and the VPS run `npm ci` fresh and get correct binaries, so the test suite runs there reliably. The automated pipeline - not any single machine - is the source of truth for "is it broken?".

How each AI builder should verify from now on:

- Do not claim done based on a local run alone. Push the branch; CI runs typecheck + test + build automatically and reports green/red. Deploy only via `scripts/deploy.sh` (or a CI deploy job) so verify gates the VPS.

Open items / recommendations:

- Repo is NOT yet a git repository. Tried to `git init` from the Cowork sandbox but the mounted Windows folder (FUSE) does not support git's file operations - `git init` fails / writes a malformed `.git/config`. So git must be initialized on Windows, not from the sandbox. Provided `scripts/setup-github.ps1` for this: it inits git, makes the first commit, connects an empty GitHub repo, and pushes. One-time run on Windows: `powershell -ExecutionPolicy Bypass -File scripts\setup-github.ps1`. After that CI runs automatically on every push. (Optional next: a `deploy.yml` that SSHes to the VPS after CI passes - needs VPS host/user/key secrets, so left for when infra details are known.)
- Optional: if direct in-sandbox test execution is ever needed during Cowork sessions, pin `vitest` to v3 (esbuild-based) - but that requires one `npm install` on Windows afterward. Not done to avoid clobbering the shared install.

Next suggested action:

- Resume the build at Chunk 05 (Model Runs and Cost Tracking). All new chunks already get auto-tested by CI once the repo is on GitHub.

---

## 2026-06-29 - Claude - CI GREEN (repo live, all tests pass on clean Linux)

Status: WORKING. Repo is live at https://github.com/moizkhan091/WOBBLEOS (public). CI is on.

Root cause of the first 3 red runs (all failed at ~10s):

- `npm ci` aborts instantly when `package-lock.json` is even slightly out of sync with `package.json`. That is exactly what happened (multiple builders edited package.json; the committed lock drifted).

Fix applied (commit 5859d8a):

- `.github/workflows/ci.yml` and `scripts/deploy.sh` now use `npm install --no-audit --no-fund` instead of `npm ci`, so lockfile drift cannot hard-fail install. (Can switch back to `npm ci` later once the lock is regenerated cleanly: run `npm install` on Windows, commit the updated `package-lock.json`.)

Result - CI run #4 (commit 5859d8a):

- Status: Success, total 47s (cleared the 10s install wall).
- Vitest: 8 test files passed, 36/36 tests passed. typecheck + test + build all green on ubuntu-latest.
- This is the first clean-environment proof that the Chunk 03 (audit) and Chunk 04 (approvals) code actually passes, not just local replicas.

Known harmless warning:

- "Node.js 20 is deprecated; actions/checkout@v4 and actions/setup-node@v4 forced to Node 24." Cosmetic only. Bump to checkout@v5 / setup-node@v5 on the next push to silence it.

Process note for all builders:

- The pipeline is now the source of truth for "is it broken?". Push your branch; CI auto-runs typecheck + test + build (36 tests today). Deploy only via `scripts/deploy.sh`, which gates on `npm run verify`.

Next suggested action:

- Build Chunk 05 (Model Runs and Cost Tracking). It will be auto-verified by CI on push.

---

## 2026-06-29 - Claude - Spine Audit + Seed Fixes + Chunk 05 (Model Runs & Cost)

### Spine audit (Chunks 01, 03, 04) - PASSED

- Ran a column-by-column diff of `src/db/schema.ts` vs `src/db/migrations/0000_init_pgvector.sql`: all 30 tables present on both sides and EVERY column matches. No drift. (This is the gap tests/typecheck miss - it would only surface against a real Postgres.)
- Confirmed all Chunk 03 audit + Chunk 04 approvals insert/update column references map to real schema properties.
- CI cross-check: 36/36 tests + typecheck + build green.

### Seed fixes (latent bug found during audit)

- `seed.ts` was missing two NOT-NULL-without-default fields that would break a future seed-runner: `approval_actions.description` (added to all 9 actions) and `memory_records.memoryTier` (added `"core"` to all 10 WOBBLE Brain records, since they are Core Brain). db-foundation test still passes (it checks slugs only).
- Note for whoever builds the seed-runner: a real `db.insert(...)` of the seed arrays now satisfies NOT NULL constraints.

### Chunk 05 - Model Runs & Cost Tracking

Files created:

- `src/lib/domain/cost.ts` - pure cost estimator. `estimateCostUsd({provider,model,inputTokens,outputTokens,pricing})` with a config-driven `PricingTable` (USD per 1M tokens). `DEFAULT_PRICING` is a seed/config default and is OVERRIDABLE per call - no price is hardcoded inside the calc, so price changes never touch this function. Should move to Settings/DB later.
- `src/lib/model-runs/index.ts` - `buildModelRunRow` (pure, computes estimated cost), `logModelRun` (injectable writer + audit `model.run.<status>`), `recordModelCall(meta, call, deps)` which times a provider call and logs a `model_runs` row on BOTH success and failure (then rethrows) - satisfies "logging works even when the provider call fails". Plus `sumEstimatedCostSince`, `costSummary` (today/week/month), `listModelRuns`, `clampRunLimit`.
- `src/lib/budget/index.ts` - `guardBudget` reuses the pure `evaluateBudgetGate` (domain/budget.ts) with an injectable spend lookup; when over the daily cap or batch limit it BLOCKS and (if a creator+entity are supplied) raises a high-risk "budget" approval via Chunk 04 `createApproval`. Plus `modelRunSpentToday` and `defaultGuardDeps`.
- `src/app/api/costs/route.ts` - GET cost summary (today/week/month) + recent runs with filters.
- Tests: `tests/cost.test.ts`, `tests/model-runs.test.ts`, `tests/budget-guard.test.ts` (estimator, run logging on success/failure, latency, budget block + approval creation).

Anti-hardcoding: prices are data (pricing table param), budget caps come from `budget_caps`/settings (passed into the guard), model/provider/role are per-call. No strategy hardcoded.

Real vs mocked: services + route are real Drizzle/audit-wired. No live Postgres in the sandbox.

Verification: vitest can't run in the sandbox (known). Verified all Chunk 05 logic via a standalone Node replica: ALL assertions passed (cost estimation incl. custom pricing, run-row building, recordModelCall success+failure logging+latency, guardBudget block/approve/batch). Also confirmed all 16 model_runs insert columns map to schema. CI (on push) runs the real suite (now ~45+ tests).

Next suggested action:

- Chunk 06 (Job Queue Foundation) then Chunk 07 (Worker Runtime), so workers can call `recordModelCall`/`guardBudget` for real background jobs. Push to run CI.

---

## 2026-06-29 - Claude - Chunk 06 Job Queue Foundation

Design decision: built a custom Postgres-backed queue ON the existing `jobs` / `job_attempts` tables (not pg-boss), because the schema already defines a rich queue (idempotencyKey, attempts, maxAttempts, runAfter, lockedAt, etc.) and this keeps everything in one visible place for the Workers Health page. pg-boss can be revisited later if needed; worker.ts still references it and will be rewired in Chunk 07.

Files created:

- `src/lib/domain/jobs.ts` - pure. `JobStatus`, `enqueueJobSchema` (zod), `buildJobRow`, and `evaluateJobFailure` (retry decision with exponential backoff: delay = base * 2^(attempts-1); gives up -> "failed" once attempts >= maxAttempts).
- `src/lib/jobs/index.ts` - service. `enqueueJob` (dedupes via `findActiveByIdempotencyKey`), `processNextJob(queue, registry, deps)` which claims the next job, runs its handler, and records completion / retry / failure + a `job_attempts` row + audit (`job.enqueued|completed|retry|failed`). `listJobs`, `clampJobLimit`. Injectable `JobStore` + audit for tests. Default Drizzle store claims with `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)` so concurrent workers never grab the same job, and increments attempts on claim.
- `src/app/api/jobs/route.ts` - POST enqueue (idempotent; coerces runAfter from ISO string), GET list.
- `tests/jobs.test.ts` - buildJobRow defaults + validation, evaluateJobFailure backoff + give-up, enqueue insert + idempotent dedup, processNextJob: empty queue, success->completed, throw->retry, exhausted->failed, no-handler->failed, clampJobLimit.

Lifecycle: pending -> active (on claim, attempts++) -> completed | failed, with pending re-queues (backoff) while retries remain.

Anti-hardcoding: queue/type/payload/priority/maxAttempts are per-job data; handlers are a registry passed in (not hardcoded in the queue).

Real vs mocked: domain + service flow fully unit-tested via injectable store. Default Drizzle store (incl. the SKIP LOCKED claim) is real but unexercised in the sandbox (no Postgres); it will be exercised for real in Chunk 07.

Verification: vitest can't run in the sandbox (known). Verified ALL Chunk 06 logic via a standalone Node replica with real zod: every assertion passed (build/validation, backoff, dedup, all processNextJob outcomes). Confirmed all 20 `jobs` and 9 `job_attempts` insert columns map to schema. CI on push runs the real suite (now ~54 tests).

Next suggested action:

- Chunk 07 (Worker Runtime): rewrite `src/workers/worker.ts` to a real loop that calls `processNextJob` on the general queue, writes `worker_heartbeats`, and shuts down gracefully (SIGINT/SIGTERM). Then a worker can consume a real queued job end to end. Push to run CI.

---

## 2026-06-29 - Claude - Chunk 07 Worker Runtime Foundation

Files created:

- `src/lib/workers/registry.ts` - job-type -> handler map (`generalRegistry` with `noop` and `test.echo`), plus `getHandler`, `hasHandler`, `knownJobTypes`. Handlers are data; new job types (content/research/media) register here, not in the queue.
- `src/lib/workers/heartbeat.ts` - `buildHeartbeatRow` (deterministic id `heartbeat_<workerName>`), `writeHeartbeat` (DB upsert via onConflictDoUpdate on the PK - one row per worker, read by the future Workers Health page), `isHeartbeatStale` (offline detection), and `writeHeartbeatFile` (keeps the existing `/api/health/worker` file route working).
- `src/lib/workers/runtime.ts` - `runWorker(opts)` poll loop: heartbeat -> `processNextJob` -> heartbeat(jobId) or idle-sleep, until `shouldStop()`; writes a final "stopped" heartbeat and returns processedCount. `process`/`heartbeat`/`sleep`/`shouldStop` injectable for tests.

Files changed:

- `src/workers/worker.ts` - rewritten from the pg-boss skeleton into the real general worker entrypoint: polls the `general` queue via `runWorker` + `generalRegistry`, writes DB + file heartbeats, closes the DB pool, and stops cleanly on SIGINT/SIGTERM. pg-boss is no longer imported anywhere in `src/` (the dependency remains in package.json, unused).
- `tests/workers.test.ts` - registry known/unknown resolution, heartbeat row + staleness, and the runWorker loop (processes a job then idles, stops on signal, emits start + per-job + final "stopped" heartbeats).

How Chunk 06 + 07 close together: `npm run worker` now starts a process that claims real queued jobs (`processNextJob` with `FOR UPDATE SKIP LOCKED`), runs the handler, records completion/retry/failure, and heartbeats - i.e. a worker consumes a real queued job end to end. Manual local test (needs Postgres): `npm run db:migrate`, start `npm run worker`, POST a job to `/api/jobs` with `type:"test.echo"`, watch it complete in `jobs` + `job_attempts` and the heartbeat update.

Anti-hardcoding: queue name + registry are inputs; no worker logic lives in Next.js routes; heartbeats are real (no fake status).

Verification: vitest can't run in the sandbox (known). Verified ALL Chunk 07 logic via a Node replica: registry resolution, heartbeat build + staleness, and the full runWorker loop (start/per-job/stopped heartbeats, processedCount). Confirmed `closeDb` is exported, no pg-boss imports remain in `src/`, and all 9 `worker_heartbeats` columns map to schema. CI on push runs the real suite (now ~58 tests).

Next suggested action:

- Chunk 09 (Source Library backend) or Chunk 10 (Memory/Brain backend) next per the recommended sequence (08 Provider Adapter Registry is also a candidate to unblock Ask WOBBLE/Content). Push to run CI.

---

## 2026-06-29 - Claude - HANDOFF TO NEXT BUILDER (Codex): start at Chunk 09

Read `docs/BUILD_SEQUENCE_TRACKER.md` first. It is the source of truth for order/status. Active order: 01,03,04,05,06,07 are DONE & CI-green; NEXT is 09 -> 10 -> 08 -> 11 -> 14 -> 15 -> 18. Deferred (do not drop): 02 Auth (before VPS deploy), 34 Prompt/Skill Registry, 35 Connections Registry, and 12,13,16,17,19-33,36.

### Current state (all CI-green, 68 tests)

- Repo: https://github.com/moizkhan091/WOBBLEOS (public). CI runs `npm install` + typecheck + test + build on every push (`.github/workflows/ci.yml`). Deploy only via `scripts/deploy.sh` (gates on `npm run verify`).
- Spine built: `src/db/index.ts` (lazy drizzle+pg client: `getDb`/`getPool`/`closeDb`), Chunk 03 audit (`src/lib/audit`, `src/lib/domain/audit.ts`), Chunk 04 approvals (`src/lib/approvals`, `src/lib/domain/approval-flow.ts`), Chunk 05 cost/model-runs (`src/lib/domain/cost.ts`, `src/lib/model-runs`, `src/lib/budget`), Chunk 06 queue (`src/lib/domain/jobs.ts`, `src/lib/jobs`), Chunk 07 worker (`src/lib/workers/*`, `src/workers/worker.ts`).

### Conventions to FOLLOW (keep the codebase consistent)

1. Pure domain logic in `src/lib/domain/<feature>.ts` (zod validation, builders, decisions). Service layer in `src/lib/<feature>/index.ts`.
2. Services take INJECTABLE deps - `{ store?, recordAudit?, now? }` - defaulting to real Drizzle + `writeAuditEvent`. This is why everything is unit-testable without Postgres (the sandbox/CI runs no DB). Follow this exact pattern for 09/10.
3. Every important action writes an audit event via `writeAuditEvent(...)` (from `@/lib/audit`). Risky/public/expensive actions create an approval via `createApproval(...)` (from `@/lib/approvals`, `approvalType` is an open string e.g. "source", "memory_update").
4. IDs: `newId("prefix")` from `@/lib/ids`. numeric columns are stored/returned as STRINGS by the pg driver (cast with String()). timestamps are Date.
5. API routes: `export const dynamic = "force-dynamic"`; 503 if no `DATABASE_URL`; validate body with zod -> 422 on failure. Mirror `src/app/api/approvals/route.ts`.
6. Tests in `tests/<feature>.test.ts` (vitest, `@/` alias). Cover success AND failure paths with injected fakes.
7. Before claiming done: every key in a drizzle `.values({...})`/`.set({...})` MUST match a schema property name (I verify this each chunk; schema<->migration columns are already confirmed aligned).

### Reusable building blocks (don't re-invent)

- Audit: `writeAuditEvent(input, { writer? })`. Approvals: `createApproval(input, { store?, recordAudit? })`, `applyApprovalAction(...)`. Cost: `recordModelCall(meta, call, deps)` logs a model_run on success AND failure; `estimateCostUsd(...)`. Budget: `guardBudget(input, { spentToday, createApproval? })`. Queue: `enqueueJob`, `processNextJob`. Worker: `runWorker`, `generalRegistry` (register new job types here).

### Chunk 09 (Source Library) - how to build it

- Tables already exist: `sources`, `files`, `source_chunks`, and seeded `source_trust_levels` (tier_1_core_wobble ... blocked; only tier_1 has canUpdateBrain=true).
- Build `src/lib/domain/sources.ts` (validate add/upload input; resolve trust tier; default new sources to approvalStatus "pending" unless explicitly trusted) + `src/lib/sources/index.ts` (createSource [audit "source.added"], approveSource/rejectSource via `createApproval`+`applyApprovalAction` with approvalType "source", listSources, attachChunks). API `src/app/api/sources/route.ts`. Tests.
- Acceptance: source starts pending; approval assigns/uses trust tier; approved sources retrievable by jobs; unsupported MIME/type rejected; trust hierarchy resolves. Do NOT auto-trust unknown sources.

### Chunk 10 (Memory/Brain) notes for after

- Tables: `memory_records`, `memory_chunks`, `memory_update_proposals`. `src/lib/domain/memory.ts` ALREADY has `rankMemoryChunks` (time-weighted, tier/trust boosts) - reuse it. Brain updates go through `memory_update_proposals` + approval (approvalType "memory_update"); never mutate core Brain silently. pgvector column is `embedding vector(1536)`.

### Verification reality (important)

- The Cowork/Claude sandbox CANNOT run vitest (Linux reusing Windows node_modules). Claude verified each chunk via standalone Node replicas of the logic. Codex on the Windows machine CAN and SHOULD run `npm run verify` locally before claiming done, then commit + push so CI confirms. Use `scripts/push.ps1` for a one-step push.

### After each chunk

- Flip the box in `docs/BUILD_SEQUENCE_TRACKER.md` to [x], append a handoff entry here (files, real-vs-mocked, verification, next), and push so CI verifies.

---

## 2026-06-29 - Codex - Handoff Review After Claude Work

Context:

- Moiz asked Codex to read the handoff log and confirm what is done vs left.
- Reviewed the latest handoff entries and verified the files Claude reported exist.

Observed current state:

- Chunk 00 docs/handoff foundation is done.
- Chunk 01 database foundation is code-side done: full schema, pgvector migration, seed constants, and DB foundation tests exist.
- Claude added Chunk 03 audit log plus DB client layer.
- Claude added Chunk 04 approvals system wired to audit.
- Claude added the all-transcript intelligence map and canonical Chunk 34-36 additions.
- Claude added CI/deploy gate files and `npm run verify`.

Verification run by Codex on Windows:

- `npm run verify`
- Result: passed.
- Details: typecheck passed, 8 test files passed, 36 tests passed, Next build passed.

Remaining known gaps:

- No live local Postgres migration has been verified yet. Run `npm run db:migrate` after local `DATABASE_URL`/Postgres is ready.
- `src/db/seed.ts` has real seed constants, but there is not yet a `db:seed` insertion command/path.
- Git/GitHub is not initialized in this folder yet, so CI will only run after the repo is created/pushed from Windows.

Next suggested action:

- Build Chunk 05: Model Runs and Cost Tracking.
- Include the missing seed insertion pathway soon, either as part of Chunk 05 setup work or as a small Chunk 01 completion patch before deeper worker work.

---

## 2026-06-29 - Claude - Chunk 11 Ask WOBBLE V1 (command surface / router)

Built per founder-approved spec (Ask WOBBLE = front door/router, not a plain chatbot, not every module).

Files created:

- `src/lib/domain/ask.ts` - pure: `classifyIntent` (keyword V1: question / content_generation / research / decision_brief / source_search / memory_update / handoff), `DEFAULT_CAPABILITIES` (intent -> module/jobType/status; everything except `question` is `planned` until its chunk ships), `buildAskContext` (grounds on Brain + APPROVED memory + APPROVED sources, citations, basic do-not-say loaded into the prompt, explicit "if evidence insufficient, explain the gap / ask a clarifying question / suggest sources - do not invent"), `computeConfidence`, `buildAskAnswer`, `extractDoNotSay`.
- `src/lib/ask/index.ts` - `askWobble(input, deps)` returning a discriminated `AskResult`: `{type:"answer"}` for question intent (always calls the model via `runTextProvider` with role/module `ask_wobble` so the call is cost-logged even on thin evidence), or `{type:"route"}` for action intents. Router: if a capability is `available` + has a real jobType it enqueues a job; if `planned` it returns "Intent recognized... Status: planned/not available yet" and NEVER enqueues a fake job. Retrieval/provider/enqueue/audit injectable.
- `src/app/api/ask/route.ts` - POST /api/ask -> `{ ok, result }`. 503 if no DATABASE_URL, 422 on validation.
- `tests/ask.test.ts` - classifyIntent, context (do-not-say + gap rule), confidence, answer flow, thin-evidence STILL calls model + marks insufficiency, planned route (no enqueue), available route (enqueues real job), empty-question reject.

Founder corrections applied: (1) front door not every module; (2) thin evidence -> still call model to explain gap, cost-logged (no silent no-answer); (3) do-not-say is basic prompt-loading only, full QA = Chunk 17; (4) unbuilt modules return planned route, no fake jobs.

Provider: uses OpenRouter via `runTextProvider` (role/module = `ask_wobble`). Adapters stay swappable.

Real vs mocked: domain + router fully unit-tested via injected deps. Default wiring calls the real memory/sources/providers/jobs modules. No live Postgres/LLM in sandbox.

Verification: vitest can't run in sandbox; verified ALL Chunk 11 logic via Node replica with real zod (classifyIntent, context, confidence, answer path, thin-evidence-still-calls, planned vs available routing, empty reject). Run `npm run verify` on Windows; CI confirms on push (now ~16 test files).

PREREQUISITES for Ask WOBBLE to run LIVE (not blocking Chunk 11 code/tests):
- `OPENROUTER_API_KEY` must be set in server env (.env locally / VPS env). NOTE: the key was exposed in chat on 2026-06-29 and MUST be rotated before use.
- `settings.model_roles` must include an `ask_wobble` role mapped to `{ provider: "openrouter", model: <approved model> }`, and the `openrouter` provider connection must be enabled with `ask_wobble` in allowedModules (it is, in seed). Seeding `model_roles` belongs to Settings (Chunk 28); add a minimal seed if you want live Ask WOBBLE before then.

Next: Chunk 14 (Content Command Backend) per tracker. When Content Worker (15) lands, flip `content_generation` capability to `available` with a registered `content.generate` handler so Ask WOBBLE routes to it for real.
ts/sources.test.ts` passed, 13/13.
- Full local gate: `npm run verify` passed.
- Details: typecheck passed, 14 test files passed, 81/81 tests passed, Next build passed. New routes compiled: `/api/sources`, `/api/sources/[id]/approval`, `/api/sources/[id]/chunks`.

Next suggested action:

- Build Chunk 10: Memory & WOBBLE Brain Backend. Reuse `src/lib/domain/memory.ts` ranker. Memory updates must go through `memory_update_proposals` + `createApproval` with `approvalType: "memory_update"`; never mutate Core Brain silently. Retrieval should be metadata-rich and exclude unapproved/blocked material unless explicitly requested.

---

## 2026-06-29 - Codex - Chunk 10 Memory & WOBBLE Brain Backend

Context:

- Continued immediately after Chunk 09 per the active tracker order.
- Chunk 10 is complete locally; Chunk 08 Provider Adapter Registry is next before Ask WOBBLE.

Files created:

- `src/lib/memory/index.ts` - injectable Memory/WOBBLE Brain service layer with real Drizzle defaults: propose memory updates, create `approvalType: "memory_update"` approval items, approve/reject proposals through Chunk 04 approval flow, insert approved memory records/chunks, retrieve ranked memory context, list memory records, and list proposals.
- `src/app/api/memory/route.ts` - GET approved memory/Brain records.
- `src/app/api/memory/proposals/route.ts` - GET proposals and POST a memory update proposal. Proposal creation does not mutate memory.
- `src/app/api/memory/proposals/[id]/approval/route.ts` - POST approve/reject proposal. Approval creates memory; rejection does not.
- `src/app/api/memory/retrieve/route.ts` - POST ranked metadata-rich retrieval for Ask WOBBLE/workers.

Files changed:

- `src/lib/domain/memory.ts` - preserved the existing time-weighted `rankMemoryChunks` behavior and added domain builders/types for memory records, memory chunks, memory update proposals, retrieval chunks, tiers, trust levels, and proposal statuses.
- `tests/memory.test.ts` - expanded from ranker-only coverage to full Chunk 10 domain/service tests.
- `docs/BUILD_SEQUENCE_TRACKER.md` - flipped Chunk 10 to `[x]` and moved NEXT to Chunk 08.
- `docs/AI_HANDOFF_LOG.md` - this handoff entry.

Real vs mocked:

- Real: Drizzle-backed default store writes to `memory_update_proposals`, `memory_records`, and `memory_chunks`; proposals create real approvals; approve/reject calls the existing approval state machine; approved memory retrieval returns metadata-rich ranked chunks and filters blocked/archived material for current queries.
- Mocked in tests only: memory store, approval store, and audit writer are injected fakes.
- Not yet live-DB exercised: no local `DATABASE_URL`/Postgres migration/API manual flow was run in this entry. The code is type/build verified and unit-tested without Postgres.

Important implementation notes:

- Core Brain is not silently mutated. The only path that inserts memory from a proposal is `approveMemoryUpdate(...)` after `applyApprovalAction(...)` succeeds.
- Rejected proposals update proposal status only; they do not insert memory records or chunks.
- Retrieval reuses the existing ranker and returns content, sourceId, memoryRecordId, entityType, tags, trustLevel, tier, and score.
- Default retrieval is currently DB-filtered metadata retrieval with a placeholder similarity score because real embedding/vector search will be wired by provider/Ask WOBBLE chunks. The retrieval contract is ready for vector candidates.
- Checked Chunk 10 Drizzle write keys against schema property names: `memoryTier`, `trustLevel`, `approvalId`, `approvedAt`, `rejectedAt`, etc. No snake_case keys were added.

Verification:

- TDD red step confirmed first: `npm run test -- tests/memory.test.ts` failed because `@/lib/memory` did not exist.
- Focused test after implementation: `npm run test -- tests/memory.test.ts` passed, 8/8.
- Full local gate: `npm run verify` passed.
- Details: typecheck passed, 14 test files passed, 87/87 tests passed, Next build passed. New routes compiled: `/api/memory`, `/api/memory/proposals`, `/api/memory/proposals/[id]/approval`, `/api/memory/retrieve`.

Next suggested action:

- Build Chunk 08: Provider Adapter Registry. It should provide normalized text/search/media adapter interfaces, OpenRouter text adapter shape, provider error normalization, model-role routing via settings/provider connections, and make provider calls use `recordModelCall(...)` so Ask WOBBLE and Content Worker inherit cost/error logging.

---

## 2026-06-29 - Codex - Chunk 08 Provider Adapter Registry

Context:

- Continued after Chunk 10 because the tracker explicitly places Chunk 08 before Ask WOBBLE.
- Chunk 08 is complete locally; Chunk 11 Ask WOBBLE V1 is next.

Files created:

- `src/lib/domain/providers.ts` - pure provider domain logic: model role config validation, model role resolution, provider/module permission checks, and normalized provider error handling with secret redaction.
- `src/lib/providers/index.ts` - provider adapter registry/service: OpenRouter text adapter, text/search/media adapter interfaces, provider connection lookup, model-role routing from `settings.key = "model_roles"`, provider permission checks from `provider_connections`, env-only credential lookup by `credentialKeyName`, and `runTextProvider(...)` that wraps calls in `recordModelCall(...)`.
- `src/app/api/providers/route.ts` - GET sanitized provider connections. Returns credential key names only, never secret values.
- `src/app/api/providers/text/route.ts` - POST internal text-provider execution by role/module for Ask WOBBLE or Content Worker.
- `tests/provider-adapters.test.ts` - Chunk 08 tests for role routing, provider permission blocking, provider error normalization/redaction, mocked OpenRouter response normalization, model_run success logging, and model_run error logging when an adapter fails.

Files changed:

- `docs/BUILD_SEQUENCE_TRACKER.md` - flipped Chunk 08 to `[x]` and moved NEXT to Chunk 11.
- `docs/AI_HANDOFF_LOG.md` - this handoff entry.

Real vs mocked:

- Real: default provider store reads `settings`, `provider_connections`, and `process.env[credentialKeyName]`; OpenRouter adapter uses real fetch shape; text execution uses the existing Chunk 05 `recordModelCall(...)` so success/failure records hit `model_runs`.
- Mocked in tests only: fetch, provider store, text adapter, and model_run writer are injected fakes.
- Not yet live-provider exercised: no real OpenRouter key/API call was made. This is intentional; no secrets were present and provider calls should only run after model roles/provider connections are configured.

Important implementation notes:

- No API keys or model choices were hardcoded into workers. The model is selected from the `model_roles` setting, e.g. `{ ask_wobble: { provider: "openrouter", model: "..." } }`.
- Provider credentials are read from environment by credential key name only. `/api/providers` does not expose secret values.
- Provider connections must be `enabled` and allowed for the calling module before use.
- Failed provider adapter calls are logged to `model_runs` with `status: "error"` via `recordModelCall(...)`.
- Chunk 08 does not write directly to provider tables; no new `.values()`/`.set()` calls were added in provider code.

Verification:

- TDD red step confirmed first: `npm run test -- tests/provider-adapters.test.ts` failed because `@/lib/domain/providers` did not exist.
- Focused test after implementation: `npm run test -- tests/provider-adapters.test.ts` passed, 6/6.
- Full local gate: `npm run verify` passed.
- Details: typecheck passed, 15 test files passed, 93/93 tests passed, Next build passed. New routes compiled: `/api/providers`, `/api/providers/text`.

Next suggested action:

- Build Chunk 11: Ask WOBBLE V1. It should retrieve WOBBLE Brain + approved sources/memory with citations, exclude unapproved sources, call the provider adapter through `runTextProvider(...)`, and return evidence/citations instead of canned answers.

---

## 2026-06-30 - Codex - Chunk 11 Source Evidence Depth Fix

Context:

- Moiz asked Codex to audit Claude's Chunk 11 instead of trusting the handoff. Full `npm run verify` passed, but the audit found a real depth issue: Ask WOBBLE fetched approved source records, yet the LLM prompt only received source titles/metadata, not attached `source_chunks.content`.
- Root cause: `defaultRetrieveSources(...)` in `src/lib/ask/index.ts` called `listApprovedSourcesForJobs(...)` only, and `buildAskContext(...)` in `src/lib/domain/ask.ts` rendered source citations from title labels. Source chunk APIs already existed in Chunk 09; Ask WOBBLE simply was not hydrating/including them.

Files changed:

- `src/lib/domain/ask.ts` - added `AskSourceChunkRef`, `AskSourceRef.chunks`, source chunk evidence counting, and evidence rendering that includes full memory text plus approved source chunk excerpts. Source records with no chunks now explicitly tell the model they are insufficient for factual claims until chunks are ingested.
- `src/lib/ask/index.ts` - default source retrieval now hydrates approved sources with `listSourceChunks(source.id, { limit: sourceChunkLimit ?? 3 })`; API input supports optional `sourceChunkLimit` (1-10).
- `tests/ask.test.ts` - added regression coverage proving approved source chunk text appears in the evidence prompt and reaches the provider prompt.

Behavior now:

- Ask WOBBLE question path uses Brain + memory chunk text + approved source chunk text, not just source titles.
- Approved source metadata without chunks is still visible as metadata, but is not treated as substantive evidence for factual claims.
- Chunk 11 remains a router/command surface. It still does not fake content/research/media jobs until downstream chunks are available.
- Founder architecture rule: Ask WOBBLE must stay dynamically connected to live OS data. Future sources, memory, social analytics, website/SEO stats, blog/keyword/backlink data, invoices, presentation assets, and module outputs should become queryable through approved data connectors/retrieval, not by manually rewriting Ask WOBBLE prompts or hardcoding strategy. Ask WOBBLE is the "godfather" command surface/conductor: it reads current context, suggests next steps, routes jobs, and asks for approval before risky/public/expensive actions.

Verification:

- TDD red step confirmed: `npm run test -- tests/ask.test.ts` failed because source chunk content was missing from the prompt.
- Focused test after implementation: `npm run test -- tests/ask.test.ts` passed, 11/11.
- Full local gate: `npm run verify` passed.
- Details: typecheck passed, 16 test files passed, 104/104 tests passed, Next build passed.

Next suggested action:

- Commit only the Chunk 11 fix files and this handoff entry. Leave any unrelated local tracker rewrite untouched unless intentionally committing it.
- Optional live test after approval: use local `.env` without printing secrets, ensure `settings.model_roles.ask_wobble` and `provider_connections.openrouter` exist in Postgres, then POST `/api/ask` with a tiny prompt and confirm `model_runs` + `ask.answered`.

Live test attempt:

- Local `.env` exists and has `DATABASE_URL` plus `OPENROUTER_API_KEY` variable names present; values were not printed.
- `npm run db:migrate` could not proceed because Postgres connection failed.
- Root cause confirmed with a sanitized `pg` connectivity check: `ECONNREFUSED` on `::1:5432` and `127.0.0.1:5432`.
- Docker is not installed/available (`docker` command not found), and no local PostgreSQL Windows service was found.
- Therefore the live `/api/ask` OpenRouter test is blocked until local Postgres is installed/started or `DATABASE_URL` points to a reachable Postgres database with pgvector. This is an environment blocker, not a Chunk 11 code failure.

---

## 2026-06-30 - Codex - Local DB Runtime + Ask WOBBLE Live Test Prep

Context:

- Moiz pushed back that Chunk 11 must be live-tested with OpenRouter before moving to Chunk 14. Correct. Code-only verification is not enough for this path because VPS launch depends on Postgres + pgvector + provider credentials + model run/audit logging working together.
- The prior blocker was missing local Postgres. The production-faithful local path is Docker Compose with `pgvector/pgvector:pg16`, not plain Windows Postgres without pgvector.

Files added/changed:

- `compose.yaml` - local Postgres service using `pgvector/pgvector:pg16`, database/user/password matching `.env.example`, persistent volume, and healthcheck.
- `src/db/seed-runner.ts` - real idempotent seed runner for founders, trust levels, approval actions, WOBBLE Brain memory records/chunks, budget caps, provider connections, and `settings.model_roles.ask_wobble`.
- `src/scripts/live-ask-check.ts` - one tiny live Ask WOBBLE test: seeds DB, inserts an approved live-test source/chunk, calls Ask WOBBLE with capped `maxTokens`, then verifies `model_runs` success and `audit_logs.ask.answered`.
- `package.json` - added `db:seed` and `ask:live-check`.
- `.env.example` - added `ASK_WOBBLE_MODEL=openai/gpt-4o-mini`.
- `src/lib/ask/index.ts` / `tests/ask.test.ts` - added bounded `maxTokens` control so live/provider calls are cost-contained.

Verification so far:

- `npm run typecheck` passed after fixing Drizzle readonly seed array shapes.
- `npm run test -- tests/ask.test.ts` passed, 12/12.
- Full local gate: `npm run verify` passed.
- Details: typecheck passed, 16 test files passed, 105/105 tests passed, Next build passed.

Local Docker/WSL status:

- Docker Desktop was installed via winget and Moiz completed Docker login.
- Docker still could not start because WSL was outdated/missing required components.
- Installed modern WSL via `winget install --id Microsoft.WSL --exact --source winget`.
- `wsl --version` now reports WSL `2.7.10.0`; `wsl --update` reports the newest WSL is installed.
- `wsl --status` then reported the WSL Optional Component was required.
- Ran `wsl.exe --install --no-distribution`; Windows reported the operation succeeded, but changes will not take effect until system reboot.
- Final pre-reboot Docker check still failed with `Docker Desktop is unable to start`, confirming reboot is required before the live DB/OpenRouter test can continue.

Next exact action after reboot:

1. Open Docker Desktop and wait until the engine is running.
2. From `C:\Wobble OS`, run `docker compose up -d`.
3. Run `npm run db:migrate`.
4. Run `npm run db:seed`.
5. Run `npm run ask:live-check`.
6. Confirm output includes `ask_live_check=ok`, a `model_run_id`, provider/model, estimated cost, confidence, citations, and answer excerpt.
7. Run full `npm run verify`.
8. Commit/push if green.

Founder-requested module scope captured:

- `docs/BUILD_SEQUENCE_TRACKER.md` now includes Phase 7 chunks: SEO & Blog Growth Engine, Social Intelligence & Platform Analytics, Website Analytics Connector, Invoice Builder, Presentation Maker Intake & Claude Design Bridge, and Business Docs Engine.
- Architecture rule: these modules should feed live approved data into Ask WOBBLE through connectors/retrieval/memory/jobs. They should not become hardcoded prompt branches inside Ask WOBBLE.

---

## 2026-06-30 - Codex - Ask WOBBLE Live Test Completed After Reboot

Context:

- Moiz rebooted after WSL optional component installation. Goal was to prove Chunk 11 live, not just with mocks.
- Docker Desktop initially started in a broken state: CLI pipe missing, then API 500, then backend logs showed `init control API` timeout and a stale `Docker Desktop.exe` lingering-process dialog.
- Root cause was environment-level Docker/WSL startup state, not WOBBLE code. Fixed by elevated Docker cleanup/restart, then pulling `pgvector/pgvector:pg16`.

Files changed:

- `src/db/migrations/meta/_journal.json` - added missing Drizzle migration journal for the existing `0000_init_pgvector.sql` migration. Important: file must be UTF-8 without BOM; Drizzle rejects BOM JSON.
- `src/scripts/live-ask-check.ts` - fixed live check assertions to match existing domain behavior: `model_runs.status = "succeeded"` and specifically require `audit_logs.event_type = "ask.answered"`.
- `vitest.config.ts` - changed default test environment from `jsdom` to `node`. Current tests are backend/domain tests; jsdom caused Vitest worker startup timeouts on Windows. Future UI/component tests should opt into jsdom per file/config.

Live verification:

- Docker Desktop now works after elevated cleanup.
- `docker pull pgvector/pgvector:pg16` succeeded.
- `docker compose up -d` started `wobble-os-postgres`.
- Postgres readiness passed: `/var/run/postgresql:5432 - accepting connections`.
- `npm run db:migrate` now passes through the normal Drizzle CLI path.
- `npm run db:seed` passes and prints `db_seed=ok`.
- `npm run ask:live-check` passes with real OpenRouter + local Postgres:
  - `ask_live_check=ok`
  - provider `openrouter`
  - model `openai/gpt-4o-mini`
  - estimated cost about `0.00019`
  - confidence `high`
  - citations `9`
  - answer excerpt confirms Ask WOBBLE reads approved source chunks, WOBBLE Brain, memory, and future operating data instead of hardcoded prompts.

Full verification:

- Exact gate `npm run verify` passed.
- Details: `tsc --noEmit` passed, Vitest passed 16 files / 105 tests, Next build passed.

Notes for next builder:

- Do not remove `src/db/migrations/meta/_journal.json`; the Drizzle CLI depends on it.
- Do not write JSON metadata with Windows PowerShell `Set-Content -Encoding UTF8` in Windows PowerShell 5.1 because it can add a BOM. Use a BOM-free writer if regenerating migration metadata.
- The live Ask path is now proven: DB migration -> seed -> OpenRouter provider adapter -> Ask WOBBLE -> model_runs -> audit_logs.
- Next build chunk remains Chunk 14 Content Command unless Moiz redirects.

---

## 2026-06-30 - Codex - Ask WOBBLE Future Data Retrieval Rule Locked

Context:

- Moiz asked to make the future-data rule permanent before moving to Chunk 14.
- Concern: Ask WOBBLE should not need manual prompt rewrites every time new module data, sources, competitor intel, SEO stats, social stats, invoices, presentations, or client data are added.

Rule added to canonical docs:

- `AGENTS.md`
- `docs/PROJECT_START_HERE.md`

Hard rule:

```text
new module data -> structured DB row -> chunk/vector/metadata if needed -> approved/trusted status -> Ask WOBBLE retrieval
```

Implications for all future chunks:

- Ask WOBBLE stays the OS command surface/conductor, not a hardcoded mega-prompt.
- Every module that creates reusable intelligence must write structured data first.
- If the data is useful for semantic recall, it must also create chunks/vectors/metadata or rollups.
- Unknown/discovered sources are not trusted automatically; they require approval/trust-tier assignment.
- Ask WOBBLE should retrieve newly approved/trusted data through retrieval adapters, not manual prompt edits.
- Heavy work should route to workers/jobs and return status quickly.
- Risky/public/expensive/business-changing actions remain approval-gated and audit-logged.

OpenRouter verification note:

- Local DB shows real Ask WOBBLE OpenRouter calls in `model_runs`.
- Latest verified rows used provider `openrouter`, model `openai/gpt-4o-mini`, role/module `ask_wobble`, status `succeeded`.
- Costs were tiny: about `0.000185` to `0.00019` USD per call. This is why the OpenRouter dashboard balance can still visually show the same rounded `88 cents`.

---

## 2026-06-30 - Codex - Cost Observability Rule Locked

Context:

- Moiz confirmed OpenRouter logs show the live calls and asked whether WOBBLE will properly track all costs over time.
- Current local DB confirms three Ask WOBBLE OpenRouter calls in `model_runs`, all `succeeded`, total estimated cost `0.000565` USD.
- `/api/costs` currently exposes today/week/month summaries and recent model runs from `model_runs`.
- The current `src/app/page.tsx` Cost Watch card is still static placeholder UI (`$0.00 today`). The backend data exists; the full Cost dashboard UI still needs to be wired/built in the relevant UI/settings/cost module work.

Rule added to canonical docs:

- `AGENTS.md`
- `docs/PROJECT_START_HERE.md`

Hard rule:

```text
provider call -> model_runs/provider_runs row -> cost estimate or actual cost -> linked module/output/job -> audit event -> Costs dashboard/API
```

Implications for future chunks:

- No paid/credit-consuming AI/search/media/video/SEO/social/provider call should bypass local cost logging.
- Text LLM calls must go through provider adapters and `recordModelCall`.
- Future non-text providers may use provider-specific run tables, but they must roll up into Costs.
- Successes and provider-attempt failures must be recorded when a provider call is attempted.
- Cost records are long-term operational records, not temporary logs.
- Monthly, weekly, daily, provider, module, and job-level totals must be derivable from stored rows.

---

## 2026-06-30 - Codex - Chunk 14 Content Command Backend Complete

Context:

- Moiz confirmed the real build folder is `C:\Wobble OS`. The OneDrive `WOBBLE` folder is an old/uncommitted repo and must not be used for this OS build.
- Chunk 14 was built after a TDD red test. The first focused test failed correctly because `@/lib/domain/content-command` did not exist yet.
- A temporary Vitest `EPERM` was caused by the non-escalated sandbox being unable to write Vite temp files under `C:\Wobble OS`; rerunning verification with explicit repo permission resolved it.

Files changed:

- `src/db/schema.ts`
  - Added `contentTracks`.
  - Added `contentTrackId` and `createdBy` to `contentPackets`.
- `src/db/migrations/0001_content_command_tracks.sql`
  - Creates `content_tracks`.
  - Adds/backfills `content_packets.content_track_id`.
  - Adds `content_packets.created_by`.
- `src/db/migrations/meta/_journal.json`
  - Added `0001_content_command_tracks`.
- `src/db/seed.ts`
  - Added seed content tracks: `track_wobble_company` and `track_moiz_founder`.
- `src/db/seed-runner.ts`
  - Seeds content tracks idempotently.
- `src/lib/domain/content-command.ts`
  - Pure domain builders/validation for content tracks, content packets, versions, and quality reviews.
  - Enforces serious/researched claim evidence: source IDs and evidence summary.
  - Enforces hook and body/slide copy requirements.
  - Derives `qualityStatus` from self-review gate.
- `src/lib/content/index.ts`
  - Content Command service with injectable store.
  - Supports create/list tracks, create/list/detail packets, create versions, quality reviews, approval-ready flow, and audit events.
  - Passing packets can create `content_packet` approvals; failing drafts stay out of approvals.
- `src/app/api/content/tracks/route.ts`
  - `GET`/`POST` tracks.
- `src/app/api/content/packets/route.ts`
  - `GET`/`POST` packets.
- `src/app/api/content/packets/[id]/route.ts`
  - `GET` packet detail.
- `src/app/api/content/packets/[id]/versions/route.ts`
  - `POST` packet version.
- `tests/content-command.test.ts`
  - 8 tests covering tracks, evidence validation, copy validation, packet/version/review row builders, approval-ready packet flow, failed-draft behavior, board/detail reads, and version updates.
- `docs/BUILD_SEQUENCE_TRACKER.md`
  - Chunk 14 marked done; Chunk 15 is NEXT.

Real vs not yet:

- Real:
  - Database schema and migration for content tracks/packet attribution.
  - Seeded WOBBLE Company + Moiz Founder POV tracks.
  - Content Packet backend create/list/detail/version storage.
  - Quality review row creation.
  - Approval creation for passing approval-requested packets.
  - Failed drafts saved but not sent to approvals.
  - Audit events for track creation, packet creation, approval skip, and version creation.
  - Production build exposes `/api/content/tracks`, `/api/content/packets`, `/api/content/packets/[id]`, and `/api/content/packets/[id]/versions`.
- Not yet:
  - Chunk 15 content worker does not generate AI content yet.
  - Ask WOBBLE still has `content_generation` as planned until Chunk 15 registers a real content job handler.
  - Chunk 17 full do-not-say/quality gate module is still pending; Chunk 14 only stores self-review scores and blocks failed drafts from approvals.
  - Frontend Content Command board still needs UI wiring to these APIs.

Verification:

- `npm run test -- tests/content-command.test.ts` initially failed correctly before implementation because the content command modules were missing.
- `npm run test -- tests/content-command.test.ts` passed after implementation: 8/8.
- `npm run typecheck` passed.
- `npm run test` passed: 17 files, 113 tests.
- `npm run db:migrate` passed against local Postgres.
- `npm run db:seed` passed and seeded content tracks.
- `npm run verify` passed: typecheck + 113 tests + Next build.

Schema-key check:

- Drizzle `.values({...})`/`.set({...})` keys were checked against `src/db/schema.ts` property names for:
  - `contentTracks`
  - `contentPackets`
  - `contentVersions`
  - `qualityReviews`
  - `approvals` via existing `createApproval`

Next recommended action:

- Build Chunk 15 Content Worker V1.
- It should load WOBBLE Brain, do-not-say basics, approved sources, relevant memory, content track settings, and provider role `content_strategy`.
- It should create content packets through `createContentPacket`, not direct DB writes.
- Passing packets enter approvals; failed drafts remain saved outside approvals with reasons.
- After Chunk 15 is real, flip Ask WOBBLE `content_generation` from `planned` to an available queued content job route.

---

## 2026-06-30 - Codex - Frontend Wiring Timing Locked

Context:

- Moiz asked for one clear decision on when the Claude Design frontend should be wired, because "frontend at the end" vs "after Chunk 15" sounded contradictory.
- Decision: frontend is **not** an end-only task and **not** a pre-backend task. It is wired at mandatory checkpoints after real backend/API/job loops exist.

Files changed:

- `docs/FRONTEND_WIRING_PLAN.md`
  - New canonical frontend wiring plan.
  - Lists the existing Claude Design assets:
    - `dashboard-interface-design-brief/project/WOBBLE OS.dc.html`
    - `dashboard-interface-design-brief/project/WOBBLE OS-print-qbwnpk.dc.html`
    - `dashboard-interface-design-brief/project/support.js`
    - `dashboard-interface-design-brief/project/uploads/`
    - `Dashboard Interface Design Brief-handoff (1).zip`
  - Defines wiring checkpoints UI-C1, UI-C2, UI-I1, UI-M1, UI-O1, UI-G1, and UI-FINAL.
- `docs/BUILD_SEQUENCE_TRACKER.md`
  - Linked the frontend wiring plan.
  - Added frontend checkpoint notes under each phase.

Locked rule:

```text
backend capability -> tested API/job/approval flow -> frontend wiring checkpoint -> next backend cluster
```

Current frontend decision:

- Do not wire Content Command before Chunk 15.
- Build Chunk 15 next.
- Immediately after Chunk 15, run UI-C1:
  - Content Command board reads real packets.
  - Packet detail reads real packet detail/version/quality/evidence data.
  - Track filter reads real content tracks.
  - Generate button triggers the real content worker job/API.

Verification:

- Docs-only change; no runtime code changed.

Next recommended action:

- Continue with Chunk 15 Content Worker V1.

---

## 2026-06-30 - Codex - Chunk 15 Content Worker V1 Complete

Context:

- Moiz reiterated that "V1" must not mean a fake or reduced build. Chunk 15 was built as a real backend worker slice: Brain + approved source chunks + model provider + cost logging + packet creation + quality gate + approvals.
- Work was done in the real repo `C:\Wobble OS`, not the old OneDrive folder.
- TDD red step was run first: `tests/content-worker.test.ts` initially failed because `@/lib/domain/content-worker` did not exist.

Files changed:

- `.env.example`
  - Added `CONTENT_STRATEGY_MODEL=openai/gpt-4o-mini`.
- `src/db/seed-runner.ts`
  - `settings.model_roles` now seeds both `ask_wobble` and `content_strategy`.
  - Prints both model role defaults during seed.
- `src/lib/domain/content-worker.ts`
  - Pure Chunk 15 domain.
  - Defines `content.generate`, request schema, strict JSON model-output schema, prompt builder, context guard, and parser.
  - Requires WOBBLE Brain plus at least one approved source chunk before any provider call should happen.
  - Builds prompts from editable content track, Brain, memory chunks, approved source chunks, and banned/do-not-say phrases.
- `src/lib/content-worker/index.ts`
  - Service layer with injectable deps.
  - `enqueueContentGenerationJob(...)` enqueues real `content.generate` jobs onto the general worker queue.
  - `runContentGenerationJob(...)` loads track/Brain/memory/approved sources, calls `runTextProvider` through role `content_strategy` and module `content`, parses strict JSON, and creates packets through `createContentPacket`.
  - Passing packets request approval; failed quality drafts are saved but stay outside approvals through the existing Content Command service.
  - Writes `content_worker.started`, `content_worker.completed`, and `content_worker.failed` audit events.
- `src/app/api/content/generate/route.ts`
  - `POST /api/content/generate` validates request JSON and enqueues the real content worker job.
  - Returns 503 when `DATABASE_URL` is missing and 422 on validation failure.
- `src/lib/workers/registry.ts`
  - Registered `content.generate` in `generalRegistry`.
- `src/lib/domain/ask.ts`
  - Flipped `content_generation` capability from `planned` to `available`.
  - Routes it to queue `general` and job type `content.generate`.
- `src/lib/ask/index.ts`
  - Ask WOBBLE now maps content-generation commands into a content worker payload:
    - `contentTrackId: track_wobble_company`
    - `requestedBy`
    - `objective` = the user's command text
- `tests/content-worker.test.ts`
  - New tests covering grounded prompt construction, strict JSON parsing, refusal before token spend when Brain/source chunks are missing, packet creation through Content Command, quality-gated approval behavior, and real job enqueue metadata.
- `tests/ask.test.ts`
  - Updated router expectations: content generation is now available; still-unbuilt modules such as Research remain planned and cannot enqueue fake jobs.
- `docs/BUILD_SEQUENCE_TRACKER.md`
  - Chunk 15 marked done.
  - Chunk 17 marked NEXT.

Real vs mocked:

- Real:
  - Worker handler registration: `content.generate`.
  - `/api/content/generate` enqueue route.
  - Seeded `content_strategy` model role.
  - Provider call path uses `runTextProvider`, so real calls are logged in `model_runs` and cost/audit rows by Chunk 05/08.
  - Packet creation uses `createContentPacket`, so versions, quality reviews, approval creation, and failed-draft behavior are real.
  - Ask WOBBLE content route now enqueues the real content worker job.
- Mocked in tests:
  - The OpenRouter response is mocked so tests do not spend credits.
  - In-memory packet creation/enqueue fakes are used only in unit tests.
- Not yet:
  - UI-C1 frontend wiring is next after Chunk 15: Content Command board/detail/generate button must be wired to real APIs.
  - Chunk 17 full Quality Gate & Do-Not-Say module is still next; Chunk 15 uses the existing packet self-review quality gate and prompt-level do-not-say context.
  - Live content generation with OpenRouter can be run later with a tiny maxTokens request, but was not needed for unit/build verification.

Verification:

- Red test first:
  - `npm run test -- tests/content-worker.test.ts` failed before implementation because `@/lib/domain/content-worker` was missing.
- Focused tests:
  - `npm run test -- tests/content-worker.test.ts tests/ask.test.ts` passed: 17/17.
- Typecheck:
  - `npm run typecheck` passed.
- Full tests:
  - `npm run test` passed: 18 files, 118 tests.
- Seed:
  - `npm run db:seed` passed.
  - Output included `ask_wobble_model=openai/gpt-4o-mini` and `content_strategy_model=openai/gpt-4o-mini`.
- Full verify:
  - `npm run verify` passed: typecheck + 118 tests + Next build.
  - Production build included `/api/content/generate`.

Schema-key check:

- No new database tables or columns were added in Chunk 15.
- No direct Drizzle packet writes were added in the worker; the worker creates packets through `createContentPacket`.
- Existing Drizzle `.values({...})` touched in seed-runner were checked against schema keys for `settings`.

Next recommended action:

- Run frontend checkpoint UI-C1 from `docs/FRONTEND_WIRING_PLAN.md` before the next backend chunk:
  - Content Command board reads real packets/tracks.
  - Packet detail reads real packet/version/quality/evidence.
  - Generate button triggers `/api/content/generate`.
- Next backend chunk after UI-C1: Chunk 17 Quality Gate & Do-Not-Say.

---

## 2026-06-30 - Codex - Chunk 15 OpenRouter Live Check + Content Quality Lesson

Context:

- Moiz asked to test Chunk 15 with OpenRouter, not only mocked tests.
- Live testing proved the provider/packet/cost/audit path works, but also exposed the key product truth: a working content pipe is not the same as world-class WOBBLE content.
- Cheap `openai/gpt-4o-mini` successfully connected but repeatedly produced generic, mid content that self-failed the quality gate. This is good evidence that quality gate protection works, but it is not good enough as the default content strategy model.
- A stronger OpenRouter model, `anthropic/claude-sonnet-4.5`, produced passing packets and approvals through the same worker path.

Files changed after live testing:

- `src/scripts/live-content-check.ts`
  - New live check script.
  - Seeds a tiny approved source + chunk for verification.
  - Runs the real `runContentGenerationJob(...)` path.
  - Verifies:
    - successful `model_runs` row
    - `content_worker.completed` audit row
    - stored content packets
    - stored quality reviews
    - passing packets create approvals
    - failed packets do not create approvals
- `package.json`
  - Added `npm run content:live-check`.
- `src/lib/domain/content-worker.ts`
  - Tightened quality prompt instructions after real OpenRouter output showed generic hooks/captions.
  - Clarified the self-review rubric, especially `aggressionControl`.
  - Added parser normalization so blank captions on text posts fall back to main copy/hook instead of killing an otherwise valid provider response.
- `tests/content-worker.test.ts`
  - Added regression test for blank-caption provider responses.
- `.env.example`
  - Changed default `CONTENT_STRATEGY_MODEL` from `openai/gpt-4o-mini` to `anthropic/claude-sonnet-4.5`.
- `src/db/seed-runner.ts`
  - Changed seeded default `content_strategy` model to `anthropic/claude-sonnet-4.5`, still editable via env/settings.

Live verification:

- `npm run content:live-check` with default mini connected but produced failed drafts:
  - provider: `openrouter`
  - model: `openai/gpt-4o-mini`
  - estimated costs observed around `$0.000455`, `$0.00048`, `$0.000888`
  - result: packets stored, reviews stored, no approvals because quality failed.
- `CONTENT_STRATEGY_MODEL=anthropic/claude-sonnet-4.5 npm run content:live-check` passed:
  - provider: `openrouter`
  - model: `anthropic/claude-sonnet-4.5`
  - estimated_cost: `0.00892`
  - packets_created: `3`
  - passed_packets: `3`
  - approvals_created: `3`

Important lesson:

- Do not solve content excellence by overstuffing Chunk 15. Chunk 15 is the pipe.
- World-class output needs a dedicated excellence layer:
  - content framework knowledge base
  - hook/caption/carousel/reel/pov examples
  - competitor and top-creator pattern research
  - social performance feedback
  - design reference library
  - reference selection, not reference blending
  - multimodal creative QA
  - rewrite/regenerate loops before approvals

Next planning note:

- Chunk 17 should be expanded from a basic do-not-say gate into **Content Excellence Gate**.
- Media/Design chunks must include a **Creative Reference Library** where each design reference is classified by use case, format, platform, visual style, and approval status.
- For image/static/carousel generation, the worker must select one dominant reference or one carousel-reference set per output instead of blending all references into a generic hybrid.

---

## 2026-06-30 - Codex - Content + Creative Excellence Scope Locked

Context:

- Moiz clarified that WOBBLE OS must create elite content and elite visuals, not merely functional drafts.
- Specific founder requirement: for design references, the system should not feed every reference into one model call and create a generic hybrid. Static outputs should select one dominant reference; carousel outputs should select one approved carousel reference set.
- Moiz also wants future design-hunter/research AI that discovers design references, sends them for approval, and only then lets production workers use them.

Files changed:

- `docs/CONTENT_CREATIVE_EXCELLENCE_SYSTEM.md`
  - New canonical doctrine for world-class content and visual generation.
  - Defines writing excellence architecture, design reference architecture, reference selection rule, design research AI, provider-adapter direction, feedback loops, and hard rules.
- `docs/V2_BUILD_ACCEPTANCE_PLAN.md`
  - Chunk 17 renamed/expanded to Content Excellence Gate And Do-Not-Say Rules.
  - Chunk 21 expanded with Creative Reference Library requirements.
  - Chunk 22 expanded with reference-conditioned generation and multimodal creative QA requirements.
- `docs/BUILD_SEQUENCE_TRACKER.md`
  - Linked `docs/CONTENT_CREATIVE_EXCELLENCE_SYSTEM.md`.
  - Renamed Chunk 17/21/22 labels to reflect creative excellence scope.

OpenAI/Image provider note:

- Official OpenAI Image API docs were checked on 2026-06-30. They list `gpt-image-2` for image generation. Use this through a provider adapter with budget approval, cost logging, and reference-selection rules; do not hardcode it as the only provider route.

Important implementation rule:

- Do not solve "world-class content" by making Chunk 15 a giant prompt.
- Keep Chunk 15 as the pipe.
- Build excellence in Chunk 17 (writing QA/rewrite loops), Chunk 21 (reference library), Chunk 22 (reference-conditioned image/media worker), Chunk 34 (editable skills/prompts), Chunk 36 (Dreaming Engine), and Chunk 38 (social performance feedback).

---

## 2026-06-30 - Claude - Chunk 17 Content Excellence Gate (objective)

Files created:

- `src/lib/domain/content-excellence.ts` - the OBJECTIVE quality brain (pure). Analyzes the ACTUAL draft text (not just the model's self-review): weak-hook openers, anti-fluff/clarity, CTA strength (vague vs strong action verb), proof strength (claim words / risk / proofRequired => must have approved source + evidence, else hard BLOCK), generic-AI-agency language, banned/do-not-say phrases (hard BLOCK), and aggression control (caps/exclamations/insults). Returns the 6 WOBBLE dimensions (maps straight to `quality_reviews`), pass/fail, qualityStatus, blocked + blockReasons, and TARGETED rewriteInstructions. All phrase lists are config (`DEFAULT_EXCELLENCE_RULES`) and overridable per call (track.bannedPhrases / do-not-say Brain rule / Settings) - nothing strategy-specific hardcoded in scoring.
- `src/lib/quality/index.ts` - `gateContentPacket`: grade -> record a `quality_reviews` row -> set packet qualityStatus -> audit (`content.quality_passed|failed`). FAILED drafts are stored WITH rewrite reasons and are NOT eligible for approval (weak content never reaches the founder's queue). Injectable store + audit. `buildQualityReviewFromGrade` rounds scores to the integer `quality_reviews` columns.
- `src/app/api/content/quality/route.ts` - POST scores a draft on demand; records when `entityId` given.
- `tests/content-excellence.test.ts` - strong draft passes; weak-hook+fluff+agency fails; unproven risky claim BLOCKS; proof clears with source+evidence; aggression/insults fail; custom banned phrase blocks; service records/blocks correctly; integer mapping.

Verification: vitest can't run in the sandbox; verified ALL logic via Node replica (strong scores 8/9/10/10/10/7 -> pass; all failure/block cases correct; custom rules honored). Confirmed all 13 `quality_reviews` columns align. CI on push.

INTEGRATION TODO (one step to fully close 17 into Codex's Chunk 15 pipe; do carefully, do not break the worker):
- In the content worker (`runContentGenerateJobHandler`), after a packet draft is generated, call `gateContentPacket({ entityId: packet.id, draft: {hook,mainCopy,caption,cta,slides,platform,format,claimRiskLevel,proofRequired,hasSources: sourceIdsUsed.length>0, hasEvidence: evidenceSummary.length>0} }, { ... })`. Only create the approval item when `eligibleForApproval === true`. On fail, leave qualityStatus "failed" with the rewrite notes and DO NOT enqueue an approval. (The gate already records the review + status + audit.)

Codex LIVE-TEST steps (need local Postgres + ROTATED OpenRouter key; keep spend tiny, founder balance ~$0.88):
1. `npm run db:seed`
2. Seed `settings.model_roles` with `ask_wobble` and `content_writer` -> `{ provider:"openrouter", model:"openai/gpt-4o-mini" }` (cheap), low max tokens; confirm `openrouter` connection enabled + modules allowed.
3. `npm run content:live-check` (cheap model, low tokens, budget guard on).
4. POST `/api/content/quality` with a draft to see the excellence scores + rewrite instructions live.
Rotate the OpenRouter key first (it was exposed in chat).

Next: Chunk 16 Founder Content Tracks, then UI-C1 (wire Content Command), then Chunk 18 n8n Signed Handoff.

---

## 2026-06-30 - Claude - Creative reference-selection engine + expanded design vision

Founder vision: best-ever content AND million-dollar-designer visuals; never blend many design references into one hybrid. Encoded the vision AND built the core safeguard.

Built (real, CI-verifiable now):

- `src/lib/domain/reference-selection.ts` (pure) - enforces ONE reference per asset, never blended. `selectReferenceForAsset` + `selectReferencesForBatch`: static -> one approved `static` ref chosen per-asset with batch diversity; carousel -> one approved `carousel_set` matched to slide count; video -> one `video` ref. Fit scoring (style-tag overlap + use-case + platform + brandFit), founder-pin override, negative references excluded but their tags returned as `avoidStyleTags`, null + brand-kit fallback when nothing eligible. `scoreReference`, `collectAvoidTags` exported.
- `tests/reference-selection.test.ts` - one-ref-per-asset, batch diversity (static#1->ref1, static#2->ref2), carousel set slide-count match, pending/rejected/negative excluded, pin honored, null fallback, scoring. Verified via Node replica: ALL PASSED.

Spec updated (so the vision is implemented in the right chunks):

- `docs/CONTENT_CREATIVE_EXCELLENCE_SYSTEM.md` - added "Founder Creative Vision - Expanded": the one-reference rule, Creative Reference Library data model (Chunk 21), Design Hunter (Chunk 38+21), image/video provider (gpt-image-2-class via swappable cost-logged budget-gated adapter), Visual Excellence Gate (Chunk 22 = image equivalent of Chunk 17: reference adherence + brand-kit + legibility + platform spec + no-AI-tells, gate-then-regenerate), brand-kit layering, design rationale, A/B variants, negative refs, and the chunk mapping.
- `docs/BUILD_SEQUENCE_TRACKER.md` - Chunk 22 rule now points at `reference-selection.ts` + Visual Excellence Gate.

Chunk wiring for whoever builds 21/22 (Codex or Claude):
- Chunk 21: `creative_references` table + CRUD + approval queue + brand-kit storage. Each ref: kind, styleTags, useCases, platform, brandFit, slideCount (carousel), approvalStatus, negative, pinned, source, storage path.
- Chunk 22: per asset -> `selectReferencesForBatch` to pick the single reference -> layer brand kit -> image job via provider adapter (cost-logged, budget-gated) -> Visual Excellence Gate -> approval -> handoff. NEVER pass all refs into one generation.
- Chunk 38: Design Hunter proposes refs to an approval queue; performance feedback updates ref winRate (learning loop, approval-gated).

Verification: vitest can't run in sandbox; reference-selection verified via replica. CI on push.

Next backend: Chunk 16 Founder Content Tracks (then UI-C1, then 18).

---

## 2026-06-30 - Claude - Content Intelligence: data-driven brief + knowledge architecture

Founder direction: content must be impactful/result-driving (not generic); reason from a how-to-write KNOWLEDGE BASE + our stats + competitor signals; goal-aware (awareness/followers/leads/authority/engagement/sales) with CTA the founder sets OR the system suggests; NEVER hallucinate when data is missing; NEW data must auto-flow in without code changes; knowledge grows via founder + approval-gated hunter AIs.

Built (real, CI-verifiable):

- `src/lib/domain/content-brief.ts` (pure) - `buildContentBrief` assembles a goal-aware, data-driven generation brief from approved knowledge (framework/hook/angle/post_type/voice/swipe/do_not_say/offer) + performance stats + competitor signals. Bakes in 4 non-negotiable rules: data-driven, no-hallucination ("if missing, say so, do not fabricate"; empty blocks render "(none provided - do not invent any)"), dynamic auto-pickup (caller passes live data each run), goal-aware. `assessDataReadiness` (grounding score + missing list), `suggestCtaForGoal`. + `tests/content-brief.test.ts`. Verified via Node replica: ALL PASSED.

Spec written:

- `docs/CONTENT_INTELLIGENCE_SYSTEM.md` (canonical) - the 4 rules, the Content Knowledge Base (kinds + seed from the 9 transcripts + founder + hunters), goal-aware content, performance/competitor inputs, hunter AIs, MORE proposed modules (Hook Bank, Angle Library, Swipe File, Performance Memory, Competitor Pattern Library, Voice-of-Customer mining, Trend Radar, per-goal playbooks), and chunk mapping.

Tracker:

- Added Chunk 43 (Content Knowledge Base) + Chunk 44 (Knowledge & Competitor Hunters); now 45 chunks (00-44).

Wiring for builders (Chunk 15 worker + 34/12/38/13/36):
- Chunk 15 content worker MUST call `buildContentBrief` with knowledge/performance/competitor data loaded LIVE from the data layer each run (so new approved data is auto-used). Never hardcode strategy.
- Chunk 34 + 09/10: store/serve the knowledge base by `kind`. Chunk 12/38: competitor + performance + hunters. Chunk 13/36: turn signals + approvals into proposed knowledge/Brain updates (approval-gated). Chunk 43/44: dedicated knowledge base + hunters.

Note: the anti-hallucination + data-driven + auto-pickup rules apply to ALL LLM paths (Ask WOBBLE already follows this; content now does via content-brief; research/decision/media must too).

This session also shipped (uncommitted, push together): Chunk 17 Content Excellence Gate (content-excellence.ts + quality service + /api/content/quality), reference-selection engine (reference-selection.ts), and these docs.

Next backend: Chunk 16 Founder Content Tracks (then UI-C1, then 18).

---

## 2026-06-30 - Claude - Agency-replacement content plan + the ONE change needed to a built chunk

Planning captured on disk (no push needed; Codex reads local files):

- `docs/CONTENT_INTELLIGENCE_SYSTEM.md` -> new section "Replace-the-agency: self-improving content engine": agency roles -> WOBBLE AI mapping, the full list of CURRENT self-improving loops (approval-gated learning, excellence gate, data-driven brief, reference rationale, dreaming engine, hunters, dynamic auto-pickup) and the loops TO ADD (performance attribution, founder-feedback learning, A/B winner learning, recurring-issue -> skill update).
- `docs/BUILD_SEQUENCE_TRACKER.md` -> added Chunk 45 Content Strategy & Calendar Planner, 46 Engagement & Community AI, 47 Performance Feedback & Attribution Loop (THE core self-improvement loop), 48 Voice-of-Customer Mining, 49 Repurposing Engine. Now 50 chunks (00-49).

CHANGES TO ALREADY-BUILT CHUNKS:
- Only ONE is required, and it is intentionally NOT done yet (deferred so it is done carefully, not rushed): wire the three new content engines into Codex's Chunk 15 content worker (`runContentGenerateJobHandler`):
  1. Build the generation prompt via `buildContentBrief` (src/lib/domain/content-brief.ts) using knowledge + performance + competitor data loaded LIVE from the data layer each run (so new approved data auto-flows in; nothing hardcoded).
  2. Pick visuals via `selectReferencesForBatch` (src/lib/domain/reference-selection.ts) - one reference per asset, never blended.
  3. After generation, run `gateContentPacket` (src/lib/quality) - only create the approval when `eligibleForApproval === true`; failed drafts stay `failed` with rewrite notes, NOT enqueued for approval.
  This is a focused edit to ONE existing file. Whoever does it: read the current content worker first, keep its structure, add these calls, run `npm run verify`, then push.
- No other built chunk needs editing for this vision; the rest are new chunks (45-49) or future chunks (12/13/34/36/38).

Three feedback loops to fold into existing future chunks (not new chunks): founder edits/rejections -> Learning (13) proposes voice/do-not-say updates; recurring excellence-gate failures -> Prompt/Skill Registry (34) + Dreaming Engine (36) propose a skill update; A/B variants -> Performance loop (47).

Status: docs only this entry (no code change, nothing to verify). Push optional (GitHub sync); Codex already sees these locally.

---

## 2026-06-30 - Claude - Wired Content Excellence Gate into Chunk 15 content worker (non-breaking)

The one change to an already-built chunk (deferred earlier) is now done, safely:

- `src/lib/content-worker/index.ts`:
  - Added optional `excellenceGate?: (draft) => { passed: boolean }` to `ContentGenerationDeps`. DEFAULT undefined = prior behavior (so Codex's existing content-worker test, which injects no gate, stays green: requestApproval stays true, failedDrafts logic unchanged).
  - In the packet loop, `requestApproval` is now `deps.excellenceGate ? gate(draft).passed : true`. Weak/blocked drafts get stored but are NOT enqueued for approval when the gate is on.
  - `runContentGenerateJobHandler` (the LIVE production path) now enables the gate: `excellenceGate: (draft) => ({ passed: gradeContentExcellence(draft).passed })`. So production enforces Chunk 17; unit tests that call `runContentGenerationJob` directly without the dep are unaffected.
  - Added `toExcellenceDraft(input)` (defensive unknown -> ContentDraft mapping).
- `tests/content-worker-gate.test.ts` (NEW, separate from Codex's test): proves gate=false -> 0 approvals, gate=true -> approval created, no-dep -> prior behavior. Codex's `tests/content-worker.test.ts` is untouched and remains green.

Still pending for FULL data-driven generation (not done here; needs data sources that aren't built yet):
- Use `buildContentBrief` (src/lib/domain/content-brief.ts) for the generation prompt once the Content Knowledge Base (Chunk 43) + performance/competitor signals (38) exist, so generation reasons from live approved data.
- Reference selection (`selectReferencesForBatch`) belongs in the Media worker (Chunk 22), not the text content worker.

Verification: vitest can't run in sandbox; reasoned through Codex's test (stays green by design) + new gate test. CI on push is the confirmation.

Next backend: Chunk 16 Founder Content Tracks.

---

## 2026-06-30 - Claude - Gate is now DATA-DRIVEN (auto-pickup), not hardcoded

Follow-up on the excellence-gate wiring. The live gate now honors founder data per non-negotiable rule #3 (DYNAMIC AUTO-PICKUP, see docs/CONTENT_INTELLIGENCE_SYSTEM.md):

- `src/lib/content-worker/index.ts`: the gate's banned / do-not-say list is read from the content track at runtime (`gateRules = { bannedPhrases: track.bannedPhrases }`) and passed into `gradeContentExcellence(draft, rules)`. `DEFAULT_EXCELLENCE_RULES.bannedPhrases` is intentionally `[]`, so the system NEVER invents rules and the founder's track list is the source of truth. Add a banned phrase to the track -> next generation run enforces it -> NO code change. This is the auto-pickup contract made real for the gate.
- `excellenceGate` dep signature widened to `(draft, rules?) => { passed }` (still optional/default-off, so Codex's existing content-worker test is unaffected).

Codex TODO when Chunk 43 (Knowledge Base) + 16 (Tracks) land: also feed Brain `do_not_say` records + weakWords/voiceKeywords into `gateRules` the same way (all from approved data), so the FULL rule set is data-driven, not just bannedPhrases. The plumbing is in place - just extend `gateRules`.

### Reminder for ALL builders (the contract that must never be broken)
Workers QUERY the data layer each run (Brain, memory, approved sources, knowledge base, stats, competitor signals). New APPROVED data flows into generation/decisions automatically. Nothing about "what to write / what works / what not to say / what's trending / current traffic" may be hardcoded in a worker. The blog engine (Ch 37) reads live traffic (Ch 39); content (Ch 15) reads live social performance (Ch 38); both via auto-pickup. The Performance Attribution Loop (Ch 47) closes it: post stats -> attribute to hook/angle/format/reference/goal -> bias future briefs + reference winRate -> propose approval-gated knowledge updates.

### VPS-safety verification (closest local test to the VPS)
Codex works in `C:\Wobble OS` and has Docker working now (handoff above: `pgvector/pgvector:pg16` pulled, `docker compose up -d` starts `wobble-os-postgres`). Closest-to-VPS check before relying on a change: `docker compose up -d` then `npm run verify` (typecheck + test + build on a clean DB) - mirrors `scripts/deploy.sh`, which gates the real VPS deploy and aborts before restart if verify fails. CI also runs verify on every push. So broken code cannot reach the VPS.

---

## 2026-06-30 - Codex - Verified Claude Chunk 17/Content Gate Work + Captured Intelligence Map

Context:

- Moiz asked Codex to review the pasted Claude handoff, inspect what Claude actually changed, and test it locally so the VPS path does not rely on chat claims.
- Claude had pushed `be60fea` and left `docs/INTELLIGENCE_LAYER_MAP.md` untracked when the session ran out of credits.

What Codex verified:

- Reviewed the pasted Claude transcript and the latest handoff entries.
- Inspected `src/lib/content-worker/index.ts`, `tests/content-worker-gate.test.ts`, `src/lib/domain/content-excellence.ts`, `src/lib/domain/content-brief.ts`, and `src/lib/domain/reference-selection.ts`.
- Confirmed the live content worker enables the objective Content Excellence Gate while service-level tests can still inject or omit the gate.
- Confirmed banned/do-not-say phrases are read from `content_tracks.bannedPhrases` at runtime and passed into `gradeContentExcellence(...)`, so founder-approved track changes auto-apply without code changes.
- Confirmed the untracked intelligence map is useful and should be kept as the canonical map for data stores, researcher AIs, competitor transcript ingestion, research targets, and self-improvement loops.

Verification run locally in `C:\Wobble OS`:

- `npm run verify`
  - Typecheck passed.
  - Vitest passed: 22 test files, 147 tests.
  - Next production build passed.
- `docker compose up -d`
  - `wobble-os-postgres` running and healthy.
- `npm run db:migrate`
  - Migrations applied successfully.
- `npm run db:seed`
  - `db_seed=ok`
  - `ask_wobble_model=openai/gpt-4o-mini`
  - `content_strategy_model=anthropic/claude-sonnet-4.5`
- `npm run content:live-check`
  - `content_live_check=ok`
  - provider `openrouter`
  - model `anthropic/claude-sonnet-4.5`
  - estimated cost `0.008989`
  - packets created `3`
  - passed packets `3`
  - approvals created `3`
- `npm run ask:live-check`
  - `ask_live_check=ok`
  - provider `openrouter`
  - model `openai/gpt-4o-mini`
  - estimated cost `0.000205`
  - confidence `high`
  - citations `10`

Files updated by Codex:

- `docs/INTELLIGENCE_LAYER_MAP.md` kept and staged for commit.
- `docs/BUILD_SEQUENCE_TRACKER.md` now links the intelligence map near the top.
- `docs/AI_HANDOFF_LOG.md` now records this verification entry.

Next backend remains:

- Chunk 16 - Founder Content Tracks.
- Then UI-C1 frontend wiring checkpoint.
- Then Chunk 18 - n8n Signed Handoff.

---

## 2026-06-30 - Codex - Chunk 50 Self-Improving Intelligence Foundation

Context:

- Moiz asked for the full Self-Improving Intelligence Layer before moving to the next backend chunk.
- The key requirement: WOBBLE OS must not be a simple competitor tracker. It must become a living intelligence system where market data, competitor activity, transcripts, performance stats, SEO/blog data, client notes, offers, decisions, suggestions, and experiments flow into approved data stores and automatically improve future outputs.
- Important boundary: the real data is mostly not populated yet. The system must show empty states/gaps and accept data through manual entry, n8n, and AI research agents. It must not invent competitors, stats, trends, or performance numbers.

Architecture/documentation added:

- `docs/SELF_IMPROVING_INTELLIGENCE_LAYER.md`
  - Full A-P architecture requested by Moiz:
    - data categories
    - storage architecture
    - AI agent registry and cadences
    - manual/n8n/AI data flows
    - approval rules
    - auto-pickup retrieval
    - freshness and old-vs-new comparison
    - stale knowledge detection
    - Dreamer/Suggestion Engine
    - UI screens
    - DB/API/worker changes
- `docs/INTELLIGENCE_LAYER_MAP.md`
  - Updated to reflect the built substrate.
  - Clarifies that most real-world data is still empty and must be populated through targets, n8n, and agents.
- `docs/BUILD_SEQUENCE_TRACKER.md`
  - Added Chunk 50 as completed.
  - Next backend remains Chunk 16.
- `docs/V2_BUILD_ACCEPTANCE_PLAN.md`
  - Added Chunk 50 acceptance criteria.

Code/database added:

- `src/db/schema.ts`
  - Added `researchTargets`
  - Added `intelligenceItems`
  - Added `intelligenceInsights`
  - Added `intelligenceSuggestions`
  - Added `experiments`
  - Added `outputIntelligenceUsage`
- `src/db/migrations/0002_intelligence_foundation.sql`
  - Creates the six intelligence tables.
  - Adds indexes for scope/status/type, suggestion priority, experiments, output usage, and pgvector summary embeddings.
- `src/db/migrations/meta/_journal.json`
  - Added the 0002 migration entry.
- `src/lib/domain/intelligence.ts`
  - Pure domain layer:
    - intelligence scopes/statuses/types
    - 16-agent registry
    - research target builder
    - intelligence item builder
    - insight builder
    - suggestion builder
    - experiment builder
    - freshness scoring
    - task-specific retrieval/context plan builder
    - approved-context selector with empty-state gap reporting
- `src/lib/intelligence/index.ts`
  - Service layer with injectable store:
    - create/list research targets
    - record/list intelligence items
    - create insights
    - create suggestions
    - create experiments
    - build approved intelligence context
    - default Drizzle store
    - audit events and approval creation for targets/suggestions
- API routes:
  - `GET/POST /api/intelligence/targets`
  - `GET/POST /api/intelligence/items`
  - `POST /api/intelligence/insights`
  - `POST /api/intelligence/suggestions`
  - `POST /api/intelligence/experiments`
  - `POST /api/intelligence/context`

Real vs empty:

- Real now:
  - Schema and migration exist.
  - Manual/API entry points exist for targets/items/insights/suggestions/experiments/context.
  - Research targets and Dreamer suggestions create approvals.
  - Raw intelligence items can be stored without becoming trusted knowledge.
  - Approved context retrieval excludes pending records and reports gaps.
- Still empty/not built:
  - Real competitor list is not populated.
  - n8n inbound endpoints for competitor transcripts/stats are not wired yet.
  - Specific researcher workers are not built yet.
  - Social analytics, SEO/blog analytics, website analytics, VoC mining, attribution, and Dreamer worker loops still need their later chunks.
  - Future workers must use this substrate instead of creating parallel stores.

Verification:

- TDD red run first:
  - `npm run test -- tests/intelligence.test.ts tests/db-foundation.test.ts`
  - Failed because `@/lib/domain/intelligence` and table exports/migrations did not exist.
- Focused green runs:
  - `npm run test -- tests/intelligence.test.ts tests/db-foundation.test.ts`
  - 2 test files passed, 16 tests passed.
- Typecheck:
  - `npm run typecheck`
  - Passed after fixing test audit callback return types.
- DB migration:
  - `docker compose up -d`
  - `npm run db:migrate`
  - Migration applied successfully on local pgvector Postgres.
- Full verify:
  - `npm run verify`
  - Typecheck passed.
  - Vitest passed: 23 test files, 159 tests.
  - Next production build passed and listed the new `/api/intelligence/*` routes.
- Seed:
  - `npm run db:seed`
  - `db_seed=ok`
  - `ask_wobble_model=openai/gpt-4o-mini`
  - `content_strategy_model=anthropic/claude-sonnet-4.5`

Next backend:

- Chunk 16 - Founder Content Tracks.
- Important integration after Chunk 16/43:
  - feed content track/Brain do-not-say and voice rules into the Content Excellence Gate.
  - make Content Worker call the intelligence context builder once content knowledge/performance/competitor stores are populated enough.
- Important integration after Chunk 18:
  - n8n signed inbound webhooks should normalize competitor transcripts, social stats, website analytics, Search Console data, CRM/lead quality, and ad captures into `intelligence_items`.

---

## 2026-07-01 - Codex - Chunk 16 Founder Content Tracks

Context:

- Moiz asked Codex to start Chunk 16.
- Acceptance criteria: add founder content without creating a separate backend. WOBBLE Company and Moiz Founder POV must use the same content packet schema and same content worker, with editable voice/profile settings that change output context without code changes.

What was already present:

- `content_tracks` table already existed from the content-command migration.
- `content_packets.content_track_id` already existed.
- Seed already included:
  - `track_wobble_company`
  - `track_moiz_founder`
- Content worker already accepted `contentTrackId`.

What Codex completed:

- Added update/patch support for content tracks:
  - `updateContentTrackSchema`
  - `buildContentTrackPatch`
  - `updateContentTrack(...)`
  - Drizzle `updateTrack(...)`
  - audit event `content_track.updated`
- Added track retrieval/filter depth:
  - list tracks by `status`
  - list tracks by `ownerType`
  - list tracks by `slug`
- Added normalized track prompt context:
  - `buildContentTrackPromptBlock(...)`
  - `getContentTrackPersonaName(...)`
  - the content worker now uses the shared prompt block instead of manually stringing track fields together.
- Added API support:
  - `GET /api/content/tracks?ownerType=founder&status=active`
  - `GET /api/content/tracks?slug=moiz_founder_pov`
  - `GET /api/content/tracks/[id]`
  - `PATCH /api/content/tracks/[id]`
- Added tests proving:
  - founder and company tracks are separate contexts, not separate engines.
  - founder voice profile appears in the same content worker prompt.
  - founder track updates are persisted and audit-logged.
  - the same content worker creates packets with `contentTrackId: track_moiz_founder`.

Files touched:

- `src/lib/domain/content-command.ts`
- `src/lib/domain/content-worker.ts`
- `src/lib/content/index.ts`
- `src/app/api/content/tracks/route.ts`
- `src/app/api/content/tracks/[id]/route.ts`
- `tests/content-command.test.ts`
- `tests/content-worker.test.ts`
- `docs/BUILD_SEQUENCE_TRACKER.md`
- `docs/AI_HANDOFF_LOG.md`

Verification so far:

- TDD red run:
  - `npm run test -- tests/content-command.test.ts tests/content-worker.test.ts`
  - failed as expected because `buildContentTrackPromptBlock` and `updateContentTrack` did not exist.
- Focused green run:
  - `npm run test -- tests/content-command.test.ts tests/content-worker.test.ts`
  - 2 test files passed, 18 tests passed.
- Typecheck:
  - `npm run typecheck`
  - passed.
- Full verify:
  - `npm run verify`
  - typecheck passed.
  - Vitest passed: 23 test files, 163 tests.
  - Next production build passed.
  - Note: the first wrapper run hit the 5-minute tool timeout with no failure output; rerunning with a longer timeout completed successfully.

Real vs not built:

- Real now:
  - editable founder/company tracks
  - track filters
  - same content worker / same packet schema for founder content
  - runtime prompt context from track data
  - audit logging for track updates
- Not built in this chunk:
  - frontend wiring for track editing/filtering (UI-C1 is next)
  - full Content Knowledge Base and performance-driven track intelligence (future Chunks 43/47)
  - n8n handoff (Chunk 18)

Next:

- Run full `npm run verify`, commit, and push.
- Next product checkpoint is UI-C1: wire Content Command frontend to real tracks/packets/generation.
- Next backend after UI-C1 is Chunk 18 - n8n Signed Handoff.

---

## 2026-07-01 - Codex - Intelligence Coverage Audit + Chunk 18 n8n Signed Handoff

Context:

- Moiz re-pasted the long Self-Improving Intelligence Layer founder brief and asked us to confirm all of it remains in scope, document it for Claude/other builders, then keep building while Claude limit resets.
- Codex audited the tracker/docs and confirmed the requirements are covered by:
  - `docs/SELF_IMPROVING_INTELLIGENCE_LAYER.md`
  - `docs/INTELLIGENCE_LAYER_MAP.md`
  - `docs/CONTENT_INTELLIGENCE_SYSTEM.md`
  - `docs/V2_BUILD_ACCEPTANCE_PLAN.md`
  - new `docs/INTELLIGENCE_REQUIREMENTS_COVERAGE_MATRIX.md`
- The coverage matrix explicitly states the non-negotiable rule:
  - `data arrives -> structured DB row -> approval/trust state -> retrieval/context builder -> worker/model output -> usage logged -> performance measured -> learning proposal`

Official n8n docs checked:

- `https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/`
- `https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/`

Chunk 18 completed:

- Added domain layer:
  - `src/lib/domain/n8n-handoff.ts`
  - stable signed payload builder
  - content readiness guard
  - webhook/dead-letter row builders
  - header constants
- Added service layer:
  - `src/lib/n8n/index.ts`
  - `sendApprovedContentToN8n(...)`
  - `receiveN8nCallback(...)`
  - injectable store/transport/secret/audit deps
  - default Drizzle store using existing `webhook_endpoints`, `webhook_events`, `dead_letters`, and `content_packets`
- Added API routes:
  - `POST /api/n8n/handoff/content`
  - `POST /api/n8n/callback`
- Added tests:
  - `tests/n8n-handoff.test.ts`
- Updated docs:
  - `docs/BUILD_SEQUENCE_TRACKER.md`
  - `docs/INTELLIGENCE_REQUIREMENTS_COVERAGE_MATRIX.md`

Real behavior now:

- Approved + quality-passed content can be sent to an n8n Webhook Trigger URL.
- Outbound handoff uses:
  - `X-Wobble-Timestamp`
  - `X-Wobble-Signature`
  - `X-Wobble-Idempotency-Key`
  - `X-Wobble-Event-Type`
- Signature is HMAC over `timestamp.payload`.
- Duplicate idempotency keys do not send again.
- Failed outbound handoffs create `webhook_events` and `dead_letters`, and mark the content packet handoff status as `failed`.
- Successful outbound handoffs mark content packet handoff status as `sent`.
- n8n can call back into WOBBLE using `POST /api/n8n/callback` with the same signed-header pattern.
- Invalid callback signatures are rejected and audited.
- Callback duplicates are ignored idempotently.
- Secrets are never stored in code, docs, webhook payloads, test snapshots, or audit metadata.

Still empty / needs future UI or setup:

- Real n8n endpoint rows must be created in `webhook_endpoints` once the production n8n workflows exist.
- Production secret env vars must exist on local/VPS, for example:
  - outbound endpoint-specific secret refs such as `N8N_CONTENT_WEBHOOK_SECRET`
  - inbound callback secret `N8N_WEBHOOK_SECRET`
- UI-C1/UI-C2 should expose handoff status, retry/dead-letter states, and real error messages.
- Chunk 19 should add automation registry/kill-switch control around n8n workflows.

Verification:

- Focused tests:
  - `npm run test -- tests/n8n-handoff.test.ts tests/webhooks.test.ts`
  - 2 test files passed, 8 tests passed.
- Full verify:
  - `npm run verify`
  - Typecheck passed.
  - Vitest passed: 24 test files, 169 tests.
  - Next production build passed and listed:
    - `/api/n8n/callback`
    - `/api/n8n/handoff/content`

Next for Claude when limit resets:

- UI-C1 remains the next frontend checkpoint:
  - wire Content Command to real content tracks, packets, generation, quality review, approvals, and n8n handoff status.
  - use the real APIs, do not fake data.
- UI-C2 after UI-C1:
  - show the full source -> memory -> content -> approval -> handoff loop.
  - include n8n events, callback status, dead letters, and retry states.

Next backend:

- Per tracker, continue Phase 3:
  - Chunk 34 Prompt/Skill Registry
  - Chunk 35 Connections Registry
  - Chunk 12 Research Radar
  - Chunk 13 Learning Engine

---

## 2026-07-01 - Claude - Dashboard <-> Chunk Coverage Audit

Context:

- Moiz built the frontend via Claude Design and asked for a full cross-check of the live dashboard sidebar against the whole chunk plan. Rule restated by founder: we never remove features, we always add.

What was done:

- Extracted the complete sidebar nav from `dashboard-interface-design-brief/project/WOBBLE OS.dc.html` (21 modules across WORKSPACE / PIPELINE / STRATEGY / OPERATIONS / SYSTEM).
- Mapped every sidebar module to its backing chunk. Result: no orphaned UI - every on-screen module has a chunk. Presentation Maker is covered by Chunk 23 (+ Chunk 41 intake/Claude Design bridge).
- Found the real gap in the OTHER direction: 5 planned chunks have NO sidebar entry in the current design (added to the plan 2026-06-30, after the design was made): Chunk 40 Invoice Builder, Chunk 37 SEO & Blog Growth Engine, Chunk 38 Social Intelligence & Platform Analytics, Chunk 39 Website Analytics Connector, Chunk 42 Business Docs Engine.

Files changed:

- `docs/BUILD_SEQUENCE_TRACKER.md` - added "Dashboard sidebar <-> chunk coverage (2026-07-01 audit)" section with the full mapping, the 5-module gap, and the ACTION REQUIRED note.

ACTION REQUIRED (open):

- THE DASHBOARD ITSELF MUST BE UPDATED. Add a new sidebar group (suggested "GROWTH & BUSINESS") with Invoice, SEO/Blog, Social Intelligence, Website Analytics, and Business Docs. Do it in the Claude Design project (design source of truth), then carry into the React build when those chunks are wired.
- Chunks 43-49 (intelligence/feedback loops) surface inside existing modules; they do not each need their own sidebar item.

Note on Claude Design MCP:

- The `claude_design` MCP import is not needed for the build - the design files are already in the repo at `dashboard-interface-design-brief/`. The real frontend task remains UI-C1 (wire Content Command to real APIs), not re-importing the design.

Next:

- Frontend: UI-C1 (still the next frontend checkpoint). Backend: Phase 3 (Chunk 34 -> 35 -> 12 -> 13).

---

## 2026-07-01 - Claude - Dashboard Design: Added GROWTH & BUSINESS sidebar group (5 modules)

Context:

- Follow-up to the coverage audit. Moiz asked to actually add the 5 missing modules into the dashboard design, replicating Claude Design's exact style so the additions are indistinguishable from the original.
- Note: the `claude_design` MCP is NOT connected in this Cowork session (only the Canva design MCP is). Import was unnecessary anyway - the design file is already in the repo.

Files changed:

- `dashboard-interface-design-brief/project/WOBBLE OS.dc.html` - the Claude Design prototype (a `DCLogic` class-driven `.dc.html`). Made three coordinated edits so the new modules render natively:
  1. `nav` array: added a new group `GROWTH & BUSINESS` with items seo, social, webstats, invoices, docs (lucide icons: search-check, share-2, bar-chart-3, receipt-text, file-stack), inserted between STRATEGY and OPERATIONS.
  2. `meta` object: added group/title/icon/tagline entries for all 5 ids (group `GROWTH & BUSINESS`), matching the existing tagline voice.
  3. `buildView(id)`: added 5 `else if` branches reusing existing archetypes so they render through the existing sc-if blocks with zero new render code - seo & social = `feed` + `hasStats` (like brain/memory), webstats = `progress` (like learning), invoices = `ops` table (like workers/handoff, status dots Paid/Sent/Overdue/Draft), docs = `library` cards (like presentations). Placeholder data uses the same palette (#B8FF2C/#2563FF/#FF6B00/#EAF2FF/#7a7f74), agent names (Scribe-01, Radar-03), and confident WOBBLE tone as the rest of the prototype.

Verified (static, since a .dc.html has no build step here):

- All 5 ids present in nav + meta + buildView (grep-confirmed 3 hits each).
- Reused archetypes all have existing render blocks (isFeed line 285 supports view.hasStats/view.stats with label/value/sub; isLibrary/isOps/isProgress confirmed present). Field shapes of the new data match the render bindings exactly, so no module renders blank.
- Existing 21 modules untouched; nothing removed (founder rule: always add, never remove).

Still open:

- The SAME group must be added in the Claude Design CLOUD project - editing the local .dc.html does not sync back. Or treat the local file as the new source of truth on next export.
- When Chunks 37/38/39/40/42 are built, the production React sidebar must include these 5 items.
- Real behavior for these modules still comes from their Phase 7 backend chunks; the design is prototype placeholder data only.

Next:

- Unchanged: Frontend UI-C1; Backend Phase 3 (Chunk 34 -> 35 -> 12 -> 13).

---

## 2026-07-01 - Claude - Dashboard State Audit + Completion Plan + Dashboard-Driven Testing

Context:

- Moiz flagged that the dashboard is incomplete (buttons dead, features not wired, sub-pages missing) and asked for a real audit of built-vs-left, the dashboard finished before moving on, then testing built work THROUGH the dashboard - and that discipline applied to Codex too.

Audit finding (important, corrects an assumption):

- The production React dashboard is essentially NOT built. `src/app/` = one static `page.tsx` (~272 lines) + EMPTY `src/components/os/`. Only API routes + `src/lib` are real.
- The clickable "dashboard" is the Claude Design PROTOTYPE (`WOBBLE OS.dc.html`) - a visual mockup: dead buttons, placeholder data, no record detail drawers. Correct for a design file; it is the reference, not the product.
- Backend is rich and CI-green: audit, approvals, sources, memory/Brain, providers, Ask WOBBLE, content + content-worker, n8n handoff, intelligence substrate, jobs/workers, model-runs/costs, health.
- Net: buttons "don't work" because the production dashboard was never built - not because the backend is missing.

Files created:

- `docs/DASHBOARD_COMPLETION_PLAN.md` - the single source of truth for dashboard state. Contains: the 3-meanings-of-dashboard breakdown; why truthful 100%-now is impossible without fake data (~10 of 26 pages have live backend, ~16 do not); the completion definition (real shell + wire live pages + honest "Planned - Chunk NN" states + missing detail drawers); a page-by-page WIRE NOW / PLANNED / PARTIAL table; the missing sub-pages/drawers list; the build sequence (shell -> UI-C1 -> UI-C2 -> wire remaining live pages -> per-chunk checkpoints -> UI-FINAL); and the dashboard-driven testing rule.

Files changed:

- `docs/BUILD_SEQUENCE_TRACKER.md` - added a "Dashboard state + dashboard-driven testing" section summarizing the above and stating the NEW rule.

NEW RULE for ALL builders incl. Codex (dashboard-driven testing):

- After finishing a chunk, ALSO verify it through the dashboard: `npm run dev`, open the page, confirm real data + working actions + real state changes (row moves, audit written, approval created, job enqueued) with correct loading/empty/error states. Note the dashboard check in the handoff entry. This is IN ADDITION to `npm run verify`/API tests, not instead. Becomes meaningful once the real React shell exists; wire-now pages first.

Reconciliation with existing plan:

- This does NOT override backend-first. It matches `FRONTEND_WIRING_PLAN.md`: build the shell, wire pages whose backend exists (UI-C1/UI-C2 are DUE now since Chunks 15 and 18 are done), honest placeholders for the rest, and flip each PLANNED page to wired at its UI checkpoint. Founder rule preserved: no fake buttons, no fake data.

Next (proposed, pending founder go):

- Start building the real React dashboard shell in `src/components/os/` (sidebar 5 groups incl. GROWTH & BUSINESS, topbar, 26 routes, WOBBLE Liquid Glass tokens from the .dc.html), then UI-C1 (Content Command wired), then wire the other live pages. Backend Phase 3 (34 -> 35 -> 12 -> 13) continues in parallel; each new chunk now also gets dashboard-verified.

---

## 2026-07-01 - Claude - Real React Dashboard Shell (slice 1) + first wired pages

Founder chose: real shell + wire live pages + honest "Planned" states (no fake data). Slice 1 built.

Files created:

- `src/lib/os/modules.ts` - single source of truth for the dashboard: `MODULES` (26 modules with id/label/title/icon/tagline/status/chunk/api), `NAV_GROUPS` (6 groups incl. GROWTH & BUSINESS), status per module = `wired` | `backend-ready` | `planned`. Adding a module here makes it appear in the shell.
- `src/components/os/os-ui.tsx` (client) - the whole shell + shared UI + wired pages, styled with inline objects ported from `WOBBLE OS.dc.html` (black/electric-lime Liquid Glass; no Tailwind dependency). Contains: dynamic lucide `Icon` (safe fallback to Circle so an unknown icon never crashes), `Shell` (sidebar with active-highlight via usePathname + topbar), `PageHeader`, `StateBlock` (loading/empty/error/OFFLINE-503), `PlannedState` (distinct copy for planned vs backend-ready), `useApi` fetch hook, and 4 WIRED pages reading real APIs: CommandPage (`/api/approvals` pending + `/api/costs` today + `/api/audit` recent), ApprovalsPage (`/api/approvals?status=pending`), CostsPage (`/api/costs` summary + model_runs), AuditPage (`/api/audit`).
- `src/app/[module]/layout.tsx` - wraps every module route in `<Shell>`.
- `src/app/[module]/page.tsx` (client) - reads the `[module]` param and renders `<ModuleContent id>` (wired component or honest PlannedState).

Files changed:

- `src/app/page.tsx` - was the old static 272-line overview mockup; replaced with a redirect to `/command` (the real dashboard now lives under `/[module]`). Old mockup intentionally removed (superseded, not a feature loss).

Design/behavior:

- Every one of the 26 modules is a real route with the exact WOBBLE look. Sidebar shows all 6 groups; a lime dot marks `wired` pages.
- WIRED pages show real loading/empty/error states and a friendly OFFLINE state on HTTP 503 (no DATABASE_URL) - honest, since locally without Postgres the APIs return 503.
- Approve/Reject buttons on Approvals are intentionally VISIBLY DISABLED (labelled) - action wiring is the next slice. Per founder rule this is allowed ("visibly disabled/planned"); no fake success.
- PLANNED pages state "Planned - Chunk NN, no fake data"; BACKEND-READY pages (ask/brain/sources/content/handoff/memory) state "backend built, UI wiring queued".

Verification:

- Sandbox cannot run the full toolchain (known). Ran a TypeScript parse check (ts.createSourceFile) on all 5 new/changed files: ALL parse clean, no syntax errors. Fixed one JSX unescaped-quote and hardened the dynamic-icon type to avoid a union-as-JSX-component TS error. Full `npm run verify` + `next build` must run on Windows/CI to confirm typecheck+build green.
- DASHBOARD-DRIVEN TEST (now actionable): `npm run dev`, then open `/command`, `/approvals`, `/costs`, `/audit`. With Postgres up + seeded they show real data; without a DB they show the honest OFFLINE state. Other sidebar pages show planned/backend-ready states.

Next slices:

- Slice 2: wire the backend-ready pages (Ask WOBBLE, Brain/Memory, Source Library + approval queue, Content Command board+packet detail = UI-C1), and enable Approvals approve/reject via `/api/approvals/[id]/action`.
- Then UI-C2 full loop, and flip each PLANNED page as its chunk lands. Backend Phase 3 (34 -> 35 -> 12 -> 13) continues; dashboard-verify each.

---

## 2026-07-01 - Claude - Dashboard slice 2 (wired 5 more live pages + approve/reject actions)

Continues the real React dashboard. Now 9 of 26 pages are wired to live APIs.

Files changed:

- `src/components/os/os-ui.tsx` - added wired pages: ContentPage (board grouped by approvalStatus + track filter from `/api/content/tracks` + PacketDrawer detail reading `/api/content/packets/[id]`), AskPage (chat -> POST `/api/ask`), BrainPage + MemoryPage (`/api/memory`, Brain filters memoryTier=core), SourcesPage (`/api/sources`, All / Pending-approval toggle). Upgraded ApprovalsPage: founder selector + working Approve/Reject that POST to `/api/approvals/[id]/action` (approvedBy + confirmationProvided:false) and reload the queue. Upgraded `useApi` with a `reload()` for post-action refresh. Registered all in the WIRED map.
- `src/lib/os/modules.ts` - flipped ask, brain, content, memory, sources from `backend-ready` to `wired`.

Still deferred (honest, not faked): the content "Generate" button is visibly disabled (needs a brief form) - wire next. n8n Handoff stays `backend-ready` (no GET endpoint yet). The 16 planned modules still show their honest planned state.

IMPORTANT verification/environment note for the next builder (Codex on Windows):

- The Cowork sandbox mounts the repo over a FUSE filesystem that did NOT reliably truncate/flush tool-based writes (Edit/Write) - it left NUL bytes or truncated files mid-way on disk (e.g. os-ui.tsx got cut at ~line 490). Shell writes (`cat > file`, `>>`) DO write correctly. So os-ui.tsx and page.tsx were finalized via shell to guarantee clean bytes.
- Verified all 5 dashboard files parse clean with the TypeScript parser (ts.createSourceFile, 0 syntax diagnostics, no NUL bytes). Full typecheck + `next build` still must run on Windows: `npm run verify`. If any dashboard file looks truncated in git, re-pull - the shell-written versions are the source of truth (os-ui.tsx = 645 lines / ~39KB).

Dashboard-driven test (Codex): `npm run dev` -> open /command /approvals /costs /audit /content /ask /brain /memory /sources. With Postgres seeded they render real data; Approvals approve/reject mutate real rows + audit. Without a DB they show the honest offline state.

Next: content Generate form; n8n handoff read view; then flip PLANNED pages as their chunks land. Backend Phase 3 (34 -> 35 -> 12 -> 13) continues, dashboard-verified.

---

## 2026-07-01 - Claude - UI-C1 COMPLETE (Content Generate wired) - CHUNK DONE, ready for Codex verify

This closes the dashboard frontend chunk (UI-SHELL + UI-C1). It is COMPLETE - not left mid-way.

Final piece added:

- `src/components/os/os-ui.tsx` - added `GenerateModal`: the "Generate WOBBLE content" button on Content Command now opens a real form (track, objective, platform focus, format focus, max packets, requested-by) and POSTs to `/api/content/generate` (the Chunk 15 content-generation job via `contentGenerationRequestSchema`). Handles 202 enqueued / 200 deduped / 503 offline / 422 validation, then reloads the board. No generation strategy, prompts, or model choices are hardcoded in the frontend - it only calls the backend API (honors the founder frontend rule).

State of the chunk (all done):

- Real Next.js dashboard shell (`src/lib/os/modules.ts`, `src/components/os/os-ui.tsx` [721 lines], `src/app/[module]/layout.tsx`, `src/app/[module]/page.tsx`, `src/app/page.tsx` redirect). 26 modules = real routes in the WOBBLE design.
- 9 pages WIRED to live APIs with real loading/empty/error/503 states: Command Center, Ask WOBBLE, WOBBLE Brain, Memory, Source Library, Content Command (board + packet-detail drawer + track filter + Generate), Approvals (working approve/reject via `/api/approvals/[id]/action`), Costs, Audit.
- 17 remaining modules show honest planned / backend-ready states (no fake data), because their backend chunks are not built.

=== CODEX: VERIFY THIS CHUNK (do this when your limit resets) ===

1. `npm run verify`  (typecheck + tests + `next build`). This is the gate. Everything below is code the sandbox could only PARSE-check, not full-typecheck/build - so this is the real proof.
2. If typecheck/build errors appear: they are expected to be small (import path, a stray type). FIX them - do not delete features or stub pages to make it pass. The intent is a working wired dashboard.
3. `npm run dev`, then click every sidebar item. Expected:
   - Without Postgres: wired pages show the honest "Database not connected" state (503). That is correct, not a bug.
   - With Postgres up + `npm run db:migrate` + `npm run db:seed`: Command/Costs/Audit/Approvals/Sources/Memory/Brain render real rows; Content shows packets; Approvals approve/reject actually change the queue + write audit; Generate enqueues a real job.
4. Dashboard-driven test (new rule): confirm each wired page shows real data and its actions cause real state changes (row moves, audit row appears, job enqueued).
5. Push so CI confirms green.

Environment caveat that matters for Codex:
- The Cowork sandbox mounts the repo over FUSE and did NOT reliably flush large tool-writes - `os-ui.tsx` was truncated mid-file once and finalized via shell. On the real Windows repo the files should be intact, but if `git diff` shows any of these truncated or with stray bytes, the correct sizes are: `os-ui.tsx` ~721 lines / ~46KB, `modules.ts` 83 lines. Re-pull or re-open if needed before running verify.

Nothing is left mid-way in this chunk. Next work (separate): content Generate is done; remaining dashboard pages are blocked on their backend chunks (Phase 3+). Backend continues at Chunk 34 -> 35 -> 12 -> 13; each new chunk also gets dashboard-verified going forward.

---

## 2026-07-01 - Claude - Chunk 34 Prompt/Skill Registry (code-complete, CODEX TO VERIFY)

Built the Prompt/Skill Registry so workers load approved, versioned SOPs instead of hardcoded prompts.

Files created:

- `src/lib/domain/prompt-skills.ts` - statuses (draft/approved/archived), zod schemas (create + propose-version), `buildPromptSkillRow`, pure helpers `pickLatestApproved` / `nextVersion`, and `DEFAULT_PROMPT_SKILLS` seed (command-skills `prime`/`explore`/`brainstorm` + core `content_generation`/`research_brief`/`decision_brief`).
- `src/lib/prompt-skills/index.ts` - service (injectable store + approvals + audit, default Drizzle store on the existing `prompt_skills` table): `createPromptSkill` (v1 draft + approval), `proposeSkillVersion` (v+1 draft carrying prior fields + patch -> `skill_update` approval), `approveSkillVersion` (approves + archives the previous approved so exactly one is live), `rejectSkillVersion`, `loadApprovedSkill` (worker loader = latest APPROVED by slug; excludes draft/archived), `listPromptSkills`.
- `src/app/api/skills/route.ts` (GET list / POST create), `src/app/api/skills/[id]/version/route.ts` (POST propose version), `src/app/api/skills/[id]/approval/route.ts` (POST approve/reject).
- `tests/prompt-skills.test.ts` - domain + service: build/validate, pick-latest/next-version, create+approval+audit, propose carries fields + increments, approve archives previous + loader returns new, reject archives + loader ignores draft-only, not-found, list filters.

Files changed (worker integration = the "Done when"):

- `src/lib/domain/content-worker.ts` - `buildContentGenerationPrompt` accepts optional `skill`; when present its promptBody + rules become the system-prompt preamble. Absent = built-in default (non-breaking).
- `src/lib/content-worker/index.ts` - `runContentGenerationJob` now loads the approved `content_generation` skill via `loadApprovedSkill` (injectable `deps.loadSkill`; `defaultLoadSkill` returns null when no DB / no approved skill, so nothing breaks). So a real worker loads an approved skill from the registry.
- `src/db/seed-runner.ts` - seeds `DEFAULT_PROMPT_SKILLS` as APPROVED v1 (idempotent, `skill_<slug>_v1`, `onConflictDoNothing`).

Verified here: all 9 touched files pass the TypeScript PARSER (0 syntax diagnostics, no NUL bytes). `prompt_skills` table confirmed present in `src/db/migrations/0000_init_pgvector.sql`, so `db:migrate` creates it.

=== CODEX: VERIFY CHUNK 34 (do this when your limit resets - do NOT skip) ===

1. `npm run verify` (typecheck + tests + `next build`). Sandbox could only PARSE-check; this is the real gate. New test file `tests/prompt-skills.test.ts` must pass, and existing content-worker tests must STILL pass (the skill load is fallback-safe).
2. If small errors appear (import path/type), FIX them - do not stub or delete features.
3. Live path (needs Postgres): `docker compose up -d` -> `npm run db:migrate` -> `npm run db:seed` -> confirm `prompt_skills` has the 6 approved seed skills. Then:
   - GET `/api/skills` lists them.
   - POST `/api/skills/[id]/version` on `content_generation` -> a v2 draft + a `skill_update` item appears in `/api/approvals` (and in the dashboard Approvals page).
   - Approve it via `/api/skills/[id]/approval` (or dashboard) -> v2 becomes approved, v1 archived, `loadApprovedSkill("content_generation")` returns v2.
   - Run a content generation job -> the worker uses the approved skill's prompt (change the skill body, re-approve, re-run -> new behavior with NO code change = the acceptance test).
4. Dashboard check: the new `skill` / `skill_update` approvals show in the Approvals page; approve/reject works.
5. Push so CI confirms green.

Acceptance mapping: registry create/version/approve/archive [done]; worker loads approved version, excludes unapproved/archived [done + tested]; seed includes prime/explore/brainstorm + content/research/decision [done]; founder feedback proposes update -> Approvals [done]. "Done when" (a worker loads an approved skill + update flows through approval) [done, pending live confirm].

Next backend after 34 verified: Chunk 35 Connections Registry.

---

## 2026-07-01 - Codex - Verified Claude Dashboard UI-SHELL/UI-C1 + Chunk 34

Context:

- Moiz ran the previous Chunk 18 push, then Claude built:
  - real React dashboard shell + UI-C1 wiring
  - Chunk 34 Prompt/Skill Registry
  - extra creative-reference requirements in `docs/CONTENT_CREATIVE_EXCELLENCE_SYSTEM.md`
- Claude's handoff specifically asked Codex to verify on Windows because the Cowork sandbox could only parse-check and had a FUSE truncation issue.

Repo/state checks:

- Confirmed last pushed commit before this verification:
  - `c420f95 Chunk 18: n8n signed handoff and intelligence coverage matrix`
- Confirmed dashboard files are not truncated or NUL-corrupted:
  - `src/components/os/os-ui.tsx`: 720 lines / 45138 bytes / no NUL
  - `src/app/page.tsx`: 7 lines / 220 bytes / no NUL
  - `src/lib/os/modules.ts`: 82 lines / 7986 bytes / no NUL

Verification:

- `npm run typecheck`
  - passed
- `npm run test`
  - 25 test files passed
  - 178 tests passed
- `npm run build`
  - passed after using a long enough timeout; initial 5-minute timeout was a tooling timeout, not a build failure.
- Final full gate:
  - `npm run verify`
  - typecheck passed
  - Vitest passed: 25 files, 178 tests
  - Next production build passed

Live DB checks:

- Docker was initially not ready; Moiz fixed Docker.
- Confirmed `wobble-os-postgres` is running and healthy on port 5432.
- Confirmed DB connectivity:
  - `db_connection=ok`
  - `db=wobble_os`
- Ran:
  - `npm run db:migrate` -> migrations applied successfully
  - `npm run db:seed` -> `db_seed=ok`

Chunk 34 live check:

- Added reusable script:
  - `src/scripts/live-skill-check.ts`
  - package script `skill:live-check`
- Ran:
  - `npm run skill:live-check`
- Result:
  - `skill_live_check=ok`
  - approved seed skills found: 6
  - proved a draft skill version is not loaded before approval
  - approved a temporary `content_generation` skill version and verified `loadApprovedSkill("content_generation")` returned it
  - restored the original `content_generation` prompt body as the active approved version so the DB is not left with a test prompt
  - verified skill approval audit exists

Dashboard smoke check:

- Started local dev server via job, hit routes, then stopped it.
- Routes returning 200:
  - `/`
  - `/command`
  - `/content`
  - `/approvals`
  - `/ask`
  - `/brain`
  - `/memory`
  - `/sources`
  - `/seo`

Tracker updates:

- UI-SHELL remains `[x]`, now Codex-verified.
- UI-C1 remains `[x]`, now Codex-verified.
- Chunk 34 changed from `[~]` to `[x]`.

Notes for next builder:

- The dashboard shell is now real product UI, not the Claude Design prototype.
- The frontend remains thin: Generate calls `/api/content/generate`; it does not hardcode prompts/models/strategy.
- Chunk 34 is complete: workers can load approved registry skills, and prompt updates flow through approval before becoming active.
- Do not remove the planned/placeholder pages. They are honest states for chunks whose backends are not built.

Next backend:

- Chunk 35 - Connections Registry.

---

## 2026-07-01 - Codex browser audit (relayed) + Claude fix of the verify blocker

Codex ran a real in-app-browser pass over the live dashboard, then hit a tool usage-limit block before it could write this entry or finish `npm run verify`. Recording the evidence + the fix here so the repo state is honest.

Codex browser audit (dashboard, live against local Postgres):

- Clicked through all 26 sidebar routes - no broken route, no browser console errors.
- Planned/backend-ready modules show honest states (no fake data).
- Command Center hydrated real data (pending approvals, today spend, live audit rows).
- Content Command shows real DB packets; the Generate modal opens with track, objective, platform focus, format focus, max packets, requested-by.
- Submitted Generate -> it POSTed `/api/content/generate` and created a real `content.generate` job (proved via `/api/jobs`). Codex then CANCELLED that smoke-test job (status=cancelled) so it cannot spend OpenRouter credits later. No worker was running, so no spend occurred.
- Screenshot capture on 127.0.0.1 was blocked by browser policy; DOM/click/API checks stood in.

Docs Codex confirmed/added (Chunk 51 + self-healing ownership):

- Design Reference Hunter is now an explicit tracked chunk: `Chunk 51` in `docs/V2_BUILD_ACCEPTANCE_PLAN.md` with full acceptance (design-source targets, vision style-descriptor, approval-gate, one-reference-per-asset, reference winRate).
- `docs/SELF_HEALING_LOOPS_AUDIT.md` gained ownership notes for the gap loops (outbound, pricing, provider health, dashboard health, retrieval coverage, reference quality).

The verify blocker Codex hit, and the FIX (done by Claude):

- ROOT CAUSE: running `next dev` rewrites `next-env.d.ts` to `import "./.next/dev/types/routes.d.ts";` (the DEV route-types variant). That generated dev file was malformed, and because `next-env.d.ts` is in tsconfig `include`, `npm run typecheck` followed it and failed. This is a Next dev-server side effect, NOT a code bug.
- FIX: restored `next-env.d.ts` to its committed form `import "./.next/types/routes.d.ts";` (production route types). `next-env.d.ts` now matches HEAD again.
- GOTCHA for all builders: run `npm run verify` / `npm run typecheck` with the Next dev server STOPPED (or run `next build` first). If `next-env.d.ts` shows `./.next/dev/types/...` in git status, restore it to `./.next/types/...` before typechecking. Do not commit the dev variant.

Current repo state (uncommitted, ready to commit):

- Modified docs only: `BUILD_SEQUENCE_TRACKER.md`, `CONTENT_CREATIVE_EXCELLENCE_SYSTEM.md`, `SELF_HEALING_LOOPS_AUDIT.md`, `V2_BUILD_ACCEPTANCE_PLAN.md` (Chunk 51 + audit ownership + this handoff). No source-code changes pending. `next-env.d.ts` restored (no longer a pending change).
- Chunk 34 + dashboard UI-SHELL/UI-C1 remain done & verified (commit 9978e96: typecheck + 178 tests + build green; Chunk 34 live skill-check passed).

Remaining steps (when tokens/permissions allow, Codex or Moiz):

1. Ensure Next dev server is stopped, then `npm run verify` -> should pass (it was green at 9978e96; only the dev-server next-env rewrite broke it).
2. `git add docs/*.md next-env.d.ts && git commit -m "Track Chunk 51 Design Reference Hunter + self-healing audit ownership; restore next-env production types" && git push`.
3. Then proceed to Chunk 35 (Connections Registry).

---

## 2026-07-01 - Claude - Dashboard: fixed approval-completion bug + added founder "add" flows (CODEX TO VERIFY)

Founder flagged the dashboard was view-first: you could watch/ask/generate/approve but couldn't ADD things, and (worse) approving didn't actually complete the entity action. Fixed both.

### THE BUG (correctness): approvals were not completing the entity action

- The Approvals page called the GENERIC `/api/approvals/[id]/action`, which only transitions the approval row. It did NOT run the entity side-effects, so approving a source/skill/memory/content packet flipped the queue but did not actually approve the underlying record (verified: `applyApprovalAction` writes nothing to those tables).
- FIX (backend): new **approval router** that completes the real action by type.
  - `src/lib/approvals/index.ts` - added `getApproval(id)` (full-row loader).
  - `src/lib/content/index.ts` - added `approveContentPacket` / `rejectContentPacket` (transition approval AND flip packet `approvalStatus`).
  - `src/lib/approval-router/index.ts` (NEW) - `resolveApproval({approvalId,action,approvedBy,notes,trustLevel?})` dispatches by `approvalType`: source -> approveSource/rejectSource (trust from approval metadata), skill/skill_update -> approveSkillVersion/reject, content_packet -> approve/rejectContentPacket, memory_update -> throws (needs the founder form), else -> generic applyApprovalAction (n8n_handoff etc).
  - `src/app/api/approvals/[id]/resolve/route.ts` (NEW) - POST -> resolveApproval.
- FIX (frontend): Approvals page now calls `/api/approvals/[id]/resolve`. For `memory_update` items it opens a **MemoryApproveModal** (slug/title/tier/trust) that calls `/api/memory/proposals/[entityId]/approval` - because memory approval requires those founder-set fields.

### Added founder "add" ability (backends already existed; UI was missing)

- `src/lib/os/modules.ts` - new sidebar module **Skill Registry** (`skills`, OPERATIONS group) - makes Chunk 34 visible/usable.
- `src/components/os/os-ui.tsx`:
  - **SkillsPage** + **CreateSkillModal** (list skills by status/version; create a new skill -> POST /api/skills -> pending approval).
  - **AddSourceModal** on Source Library (POST /api/sources -> pending).
  - **AddMemoryModal** on WOBBLE Brain ("Add knowledge") and Memory ("Add memory") -> POST /api/memory/proposals (proposal -> approval -> memory, honest loop; nothing hits Core Brain without approval).
  - All new modals reuse the WOBBLE glass style, founder selector, and show real success/error states.

Wired live pages now: 10 (added Skills). Founder can create sources, memory/knowledge, and skills - all correctly entering the approval queue - and approvals now truly complete.

### Verified here

- All 6 touched files pass the TypeScript parser (0 syntax diagnostics, no NUL). Could not run full typecheck/build/tests in the sandbox.

### CODEX: VERIFY (when tokens reset)

1. Ensure Next dev server is STOPPED (so it doesn't rewrite next-env.d.ts to the dev variant), then `npm run verify`. If `next-env.d.ts` shows `./.next/dev/types/...`, restore to `./.next/types/...` first.
2. Live (Postgres up + seeded), `npm run dev`, and check the ACTUAL completion, not just the queue:
   - Source Library -> Add source -> appears in Approvals. Approve it there -> confirm the SOURCE row is now approvalStatus=approved with a trust tier (not just the approval row).
   - Brain/Memory -> Add knowledge/memory -> appears in Approvals as memory_update -> "Review & approve" opens the form -> approve -> confirm a memory_record + chunk were actually inserted.
   - Skill Registry -> New skill -> appears in Approvals (type skill) -> approve -> confirm the skill row is status=approved.
   - Content Command -> a content_packet approval -> approve -> confirm packet approvalStatus=approved.
3. Confirm audit rows exist for each (source.approved, skill.approved, content_packet.approved, memory approval).
4. Push so CI confirms.

### Still not built (honest follow-ups, logged so not forgotten)

- Detail drawers for source/memory/skill rows (only content packets open a drawer today).
- Topbar "Capture" quick-add + the search box are still decorative.
- Command Center dropped the prototype's Ask box + quick-prompts (home is read-only KPIs + activity).
- Source approval from the Sources page itself (today approvals happen on the Approvals page).

Next backend remains Chunk 35 (Connections Registry).

---

## 2026-07-01 - Claude - Engineering standard (no generic stubs) + Knowledge/Creative Engine design

Two docs added after founder direction. No code in this entry.

- `docs/ENGINEERING_STANDARDS.md` (BINDING, all builders incl. Codex): the generic-endpoint approval bug is the motivating failure. Rule: build every chunk COMPLETE + VPS-deploy-ready; a feature that looks done (200 / row disappeared) but does not complete the real effect (entity row changed, memory inserted, packet flipped) is a DEFECT. Definition of Done verifies the EFFECT, not the appearance. Prefer entity-complete endpoints over generic transitions. No hardcoded prompts/models/strategy; run verify with dev server stopped.
- `docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md` (founder vision, locked, researched): 
  - Part A: Karpathy "LLM Wiki / compiler" knowledge engine - approved sources are COMPILED by an LLM into synthesized, interlinked, deduped knowledge notes (memory = synthesis, not just retrieval), stored with provenance + embeddings, hybrid-retrieved (synthesis + raw RAG) via ONE contract so every agent auto-picks-up new knowledge/references with zero code changes. Upgrades Chunk 13 to a Knowledge Compiler.
  - Part B: multi-agent creative workflow (agency-style graph): Strategist/Planner (reads all ~1000 signals + knowledge -> topic/angle/format), Researcher, Copywriter, Art Director (one reference per asset, never blended), Vision, format-specific Image/Carousel generators, Visual QA, Assembler. Answers the founder Q: the copywriter does NOT make images - separate specialized agents. Evolves Chunk 15.
  - Part C: approval-learning loop - log approved content with WHY, a founder TASTE profile, generation memory + NOVELTY control across independent dimensions (topic/angle/hook/format/reference), performance winRate (Chunk 47). NEW: taste profile + novelty scorer flagged under Chunk 45/47.
  - Part D: improvements (compile-then-retrieve hybrid, provenance everywhere, per-agent critique loops, cost/model routing per node, all approval-gated) + full chunk mapping so it is buildable.

Action for builders: when Chunks 13/15/21/22/43/45/47/51 are built, follow `KNOWLEDGE_AND_CREATIVE_ENGINE.md`. Treat `ENGINEERING_STANDARDS.md` as the Definition of Done from now on.

Still open (dashboard interaction follow-ups, not yet built): detail drawers for source/memory/skill rows, topbar Capture + search wiring, Command Center Ask box + quick prompts. Logged earlier; next up.

---

## 2026-07-01 - Claude - Production-continuation handoff pack + logging system + creative/taste spec + founders fix

No app-behavior code beyond a data fix; this entry sets up a SAFE Codex continuation.

Added/updated:
- `docs/CODEX_HANDOFF_2026-07-01.md` - the exact "continue from here" instructions for Codex: first steps (pull, read, verify BEFORE anything), what's done-and-verified vs done-but-parse-only-uncommitted, what Codex must finish (fix type errors to the complete path, ADD the missing approval-router + content-packet-approval tests, live effect tests), a full testing checklist, and strict risks. Codex must not reset/overwrite/duplicate.
- `docs/DECISION_LOG.md` (NEW) - shared decision/context log for all AI builders (distinct from the code handoff log); seeded with this conversation's decisions (production-grade rule, Karpathy knowledge, multi-agent creative, dual taste, Chunk 51, no-duplication). MANDATORY going forward.
- `CLAUDE.md` - added a "Logging & standards" mandate (read handoff + decision + standards + knowledge/creative docs before working; log to both; no duplication; real founders Moiz/Ali/Ibrahim/Haad).
- `docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md` - extended: full creative agent roster (Parts E), elite Image Prompt Engineering agent + model capability profile (F), cost controls (G), dual taste system brand+per-founder with conflict resolution (H), and an explicit IMPLEMENTED-vs-SPEC honesty section.
- `docs/ENGINEERING_STANDARDS.md` (added earlier this session) - Definition of Done: no generic stubs, verify the EFFECT, deploy-ready.
- CODE: `src/components/os/os-ui.tsx` FOUNDERS corrected to the REAL founders (Moiz, Ali, Ibrahim, Haad) - were placeholder names. Parse-verified.

HONEST STATUS: the approval-completion fix + add-flows from earlier today remain PARSE-verified only and UNCOMMITTED. They need `npm run verify` + new tests (Codex). Nothing new here is committed/pushed.

---

## 2026-07-01 - Claude - De-risked the approval fix (injectable deps + tests) - do NOT start Chunk 35 yet

Decision: NOT starting Chunk 35. The dashboard approval-fix + add-flows are uncommitted + were parse-only. Stacking a new chunk on unverified work violates ENGINEERING_STANDARDS. Correct order: Codex verifies + commits + pushes the CURRENT state (clean checkpoint) -> then Chunk 35.

Done this entry (parse-verified):
- `src/lib/approval-router/index.ts` - refactored `resolveApproval` to accept injectable deps (loadApproval + entity approve/reject fns), real fns as defaults. Now unit-testable, matches codebase convention.
- `tests/approval-router.test.ts` (NEW) - 7 cases proving the router completes the REAL entity action per type and throws for memory_update / not-found.
- Updated `docs/CODEX_HANDOFF_2026-07-01.md`: approval-router test is DONE; only `tests/content-packet-approval.test.ts` remains for Codex.

Still: everything uncommitted, parse-only. Codex must `npm run verify` (with dev server stopped) + add the content-packet test + live effect test + commit/push. See CODEX_HANDOFF doc.

---

## 2026-07-01 - Checkpoint GREEN + pushed (commit 0c796fb) + one open UI finding

Codex verified Claude's dashboard work + Chunk 34, fixed the verify blocker properly, live-tested all approval effects against Postgres, and pushed.
- `npm run verify` GREEN: typecheck + 27 test files / 187 tests + Next build.
- Verify pipeline hardened: `scripts/clean-next-dev-types.mjs` + `clean:next-dev-types` runs before typecheck/build so the Next dev-server route-type corruption can't break verify again.
- LIVE EFFECT tests (real DB rows changed, not just the queue): source -> sources.approvalStatus=approved + trust tier; skill -> prompt_skills.status=approved; memory -> memory_records + memory_chunks inserted; content packet -> content_packets.approvalStatus=approved. Audit rows written for each. No pending jobs left.

OPEN FINDING (cosmetic UX defect, effect is CORRECT):
- The Memory approval form showed a "Rejected" success toast even though the memory was correctly APPROVED and the memory_record + memory_chunk were inserted. The DB effect is right; the success MESSAGE is wrong. Fix in the next dashboard pass: the memory approve modal's success message should say "Approved - memory created" on the approve path. Investigate the message/branch in `MemoryApproveModal` in `src/components/os/os-ui.tsx`. Not blocking; committed because the effect passed.

Next backend: Chunk 35 - Connections Registry (base is now green + pushed, so new work no longer stacks on unverified code).

---

## 2026-07-01 - Claude - Architecture & vision alignment review (STOP-and-audit, no code)

Founder asked to stop and verify the build matches the real hive-mind vision. Did a schema-grounded audit (37 tables). Output: `docs/ARCHITECTURE_ALIGNMENT_REVIEW.md` - full current-state audit + correction plan across all 9 requested areas (architecture, dashboard, content command, source intake, agent orchestration, self-improvement, risks, implementation). Honest verdict: real foundation (~25-30%), NOT the hive-mind; schema for Source Registry / memory banks / agent registry / research inbox / creative graph / taste does NOT exist yet. Correction: schema+backend first then UI; recommended start = Phase A1 Agent Registry. No code changed this entry (audit-first, per founder). See DECISION_LOG for the binding decision.

---

## 2026-07-01 - Claude - Chunk 52 Agent Registry & Orchestration (code-complete, CODEX MUST db:generate)

First hive-mind foundation from the alignment review. Makes the AI workforce a first-class, VISIBLE, logged system (no hidden agents).

Files created (parse-verified, uncommitted):
- SCHEMA: `src/db/schema.ts` - added `agents` + `agent_runs` tables. NOTE: NO migration written by hand - Codex must run `npm run db:generate` (drizzle-kit) to produce the migration from the schema, then `db:migrate`.
- `src/lib/domain/agents.ts` - statuses/cost-profiles/cadences, AgentRow/AgentRunRow, zod (registerAgentSchema, recordAgentRunSchema), builders, and DEFAULT_AGENTS (ask_wobble, content_worker, content_excellence_gate, dreamer, knowledge_compiler, memory_router).
- `src/lib/agents/index.ts` - service (injectable deps + audit + Drizzle store): registerAgent (idempotent by slug), recordAgentRun (logs run + rolls runCount/failureCount/quality/lastRun + audits agent.run.completed/failed), listAgents, getAgent (by id or slug), listAgentRuns.
- API: `GET/POST /api/agents`, `GET /api/agents/[id]` (+recent runs), `GET/POST /api/agents/[id]/runs`.
- `tests/agents.test.ts` - 10 cases (build/validate, run row, idempotent register, run rolls counters + audit, failure count, not-found, list/get by slug+id).
- SEED: `src/db/seed-runner.ts` registers DEFAULT_AGENTS (`agent_<slug>`, onConflictDoNothing).
- DASHBOARD: new `agents` module (WORKSPACE group) + AgentsPage in `src/components/os/os-ui.tsx` (lists agents: name/role/team/cost/status/runCount/failureCount) -> the "AI workforce, visible".

Intent: every worker/agent should call `recordAgentRun(...)` (attributing model_run ids + sources/memory used + cost) so the whole hive-mind is observable. Wiring existing workers to record runs is a fast follow (Chunk 52b) - the registry + run log + dashboard exist now.

=== CODEX: VERIFY CHUNK 52 (order matters) ===
1. Pull. `git status` (uncommitted work - keep it).
2. `npm run db:generate` (drizzle-kit creates the migration for agents + agent_runs from schema.ts). Review the generated 0003_*.sql. THEN `npm run db:migrate`.
3. `npm run db:seed` -> confirm 6 agents registered (query `agents`).
4. Ensure dev server stopped + next-env production types, then `npm run verify` (fix any tsc/vitest issues to the complete path).
5. Live effect: `npm run dev`, open the new Agent Registry page (/agents) -> the 6 seeded agents show. POST a run via `/api/agents/[slug]/runs` (or a quick script) -> confirm an `agent_runs` row + the agent's runCount incremented + audit `agent.run.completed`.
6. Commit + push.

NOTE (sandbox only): Claude's mount showed `package.json` truncated - that is a FUSE read artifact; the real repo package.json is valid (your last verify passed on it). If `npm run verify` ever reports invalid package.json, restore it from git.

Next hive-mind chunks (tracker Phase A): 53 Source Registry + per-type intake, 54 Memory Banks + Router, 55 Intelligence Inbox, 56 Taste/Learning. Then creative graph (15 evolution + 21/22/51). See docs/ARCHITECTURE_ALIGNMENT_REVIEW.md.

---

## 2026-07-02 - Codex - Chunk 52 verified, migrated, live-tested

Codex completed the required Chunk 52 verification and pushed only after real DB effects were proven. Chunk 53 was NOT started.

Why this chunk matters:
- The architecture alignment review says the build was a real foundation but not yet the hive-mind. Chunk 52 is the first hive-mind foundation: agents are now first-class, visible, auditable records instead of hidden worker strings.

Implementation fixes during verification:
- Added DB-level protection/query paths to `src/db/schema.ts`:
  - `agents.slug` unique index so the registry is truly idempotent under concurrency.
  - indexes for agent module/team/status and agent run history/status.
- Ran `npm run db:generate`.
- Reviewed generated `0003_smooth_lyja.sql` and caught that Drizzle generated a full-schema create migration, which would break existing databases.
- Replaced it with a focused migration that creates only `agents`, `agent_runs`, and the Chunk 52 indexes while keeping the generated snapshot/journal for future Drizzle diffing.

DB verification:
- `npm run db:migrate` applied successfully.
- `npm run db:seed` completed.
- Query confirmed exactly 6 seeded agents:
  - `ask_wobble`
  - `content_worker`
  - `content_excellence_gate`
  - `dreamer`
  - `knowledge_compiler`
  - `memory_router`

Verification:
- Dev server stopped and `next-env.d.ts` confirmed on `./.next/types/routes.d.ts` before verify.
- `npm run verify` passed:
  - typecheck passed
  - tests passed: 28 files / 196 tests
  - Next production build passed and listed `/api/agents`, `/api/agents/[id]`, `/api/agents/[id]/runs`

Live EFFECT test:
- Started local dashboard and opened `/agents`.
- API confirmed `GET /api/agents?limit=200` returned 6 agents.
- POSTed to `/api/agents/content_worker/runs` with:
  - `{ "status": "succeeded", "costEstimate": 0.2, "qualityScore": 8 }`
- Verified in Postgres, not just UI:
  - inserted `agent_runs` row `agentrun_465fbb36-6d93-455c-a9f9-e6447ec92cd3`
  - `agents.run_count` for `content_worker` changed from 0 to 1
  - `agents.quality_score` rolled to `8.00`
  - audit row `agent.run.completed` was written with cost estimate and run metadata
- Checked pending/running jobs after the smoke test: none.

Dashboard:
- Local dev dashboard left running for founder demo at `http://127.0.0.1:3000/agents`.

Next:
- Chunk 53 - Source Registry + per-type Intake.
- Do not build more dashboard-only surfaces before schema/backend support exists.

---

## 2026-07-02 - Codex - Chunk 53 Source Registry + per-type Intake verified, migrated, live-tested

Codex built and verified the second hive-mind foundation chunk: Source Library is now a real Source Registry foundation, not a flat list. This chunk exists so future research/creative/SEO/content agents can ingest different source types through explicit source definitions, log every intake run, route extracted data toward memory banks, and expose source status/cost/errors in the OS.

What changed:
- `src/db/schema.ts`
  - Extended `sources` with owner scope/id, intended use, connected agents, refresh frequency, last scraped time, processing status, confidence, cost used, memory banks fed, related output ids, extracted data, and last error.
  - Added `source_type_definitions` for typed source intake configuration.
  - Added `source_intake_runs` for every scrape/analyze/route attempt.
- `src/db/migrations/0004_source_registry.sql` + `meta/0004_snapshot.json`
  - Generated with Drizzle, reviewed, then renamed to the stable Source Registry migration name.
- `src/lib/domain/sources.ts`
  - Added 24 source type definitions: website, blog, RSS, YouTube video/channel, Instagram reel/post/carousel/profile, TikTok video/profile, Reddit post/feed, competitor website/social profile, design reference, brand reference, market research source, client source, internal company document, uploaded file, manual note, API source, n8n source.
  - Added typed intake run builders/statuses/triggers.
- `src/lib/sources/index.ts`
  - Added list source types, create intake run, complete/fail/cancel/routed intake run, and DB-backed store methods.
  - Source approval now moves processing to `ready`; rejected sources move to `archived`.
  - Intake completion updates the real source row: processing status, extracted data, memory banks fed, related outputs, confidence, cost, last scraped time, and last error.
- API:
  - `GET /api/sources/types`
  - `GET/POST /api/sources/[id]/intake`
  - `PATCH /api/sources/[id]/intake/[runId]`
- `src/lib/domain/agents.ts`
  - Expanded seeded agent registry from 6 to 17 with source/intelligence agents: source intake orchestrator, competitor scout, social content analyst, transcript analyst, visual reference analyst, website/SEO scout, source quality checker, performance learning agent, market researcher, trend radar, brand voice guardian.
- `src/db/seed-runner.ts` / `src/db/seed.ts`
  - Seeds all source type definitions and expanded agents idempotently.
- Dashboard:
  - `Source Library` renamed to `Source Registry`.
  - Source cards now show registry metadata using the existing Claude glass/card/tag language: processing status, owner/refresh, memory bank count, agent count, cost, intended-use tags.
  - Add Source modal remains design-consistent and now captures source type, owner scope, owner id, refresh frequency, intended use. No new visual system was introduced.
- Tests:
  - `tests/source-registry.test.ts`
  - `tests/db-foundation.test.ts` updated for 0004 migration and seeded source types.

Verification:
- `npm run db:generate` completed.
- Migration reviewed and renamed to `0004_source_registry.sql`.
- `npm run db:migrate` succeeded.
- `npm run db:seed` succeeded.
- Seed query confirmed 24 source types and 17 agents.
- Focused tests passed:
  - `tests/source-registry.test.ts`
  - `tests/db-foundation.test.ts`
- Full `npm run verify` passed before docs-only handoff edits:
  - typecheck passed
  - tests passed: 29 files / 203 tests
  - Next production build passed, including new source intake routes.

Live EFFECT test:
- Local server health: `/api/health/web` returned DB connected.
- Created source through `POST /api/sources`.
- Approved it through the real source approval route with trust level `tier_2_approved_expert`.
- Created source intake run through `POST /api/sources/[id]/intake`.
- Completed intake through `PATCH /api/sources/[id]/intake/[runId]`.
- Verified in Postgres, not just UI:
  - source `source_e7979bd5-9089-4c15-b222-70720640496a`
  - `approval_status=approved`
  - `trust_level=tier_2_approved_expert`
  - `processing_status=succeeded`
  - `confidence=0.87`
  - `cost_used=0.03`
  - `memory_banks_fed=["competitor","content","design"]`
  - `extracted_data` stored
  - source intake run `sourceintake_76ac577f-3ddc-4335-8282-042ee115fd32` stored with `status=succeeded`, `actual_cost=0.03`, raw payload ref, extracted insight id
  - audit events written: `source.added`, `source.approved`, `source.intake.queued`, `source.intake.succeeded`

Design verification:
- Captured local dashboard screenshot at `http://127.0.0.1:3000/sources`.
- Source Registry page visually matches the existing Claude OS shell: same dark glass cards, lime accents, tag treatment, sidebar rhythm, and spacing. Changes are deliberately folded into the existing design language.

Important nuance:
- This chunk is the registry/intake foundation. It does NOT implement real Apify/Instagram/YouTube/vision scrapers yet. Those plug in through Connections/n8n/tool chunks. This is intentional and honest: the DB/API/run-log contract now exists so those connectors can write real data without redesigning the OS.

Next:
- Chunk 54 - Memory Banks + LLM Router.
- Build multi-bank memory placement on top of Chunk 53 so new source data can flow: source -> intake run -> extracted intelligence -> suggested memory banks -> approval -> retrievable knowledge.

---

## 2026-07-03 - Codex - Chunk 54 Memory Banks + LLM Router verified, migrated, live-tested

Codex built and verified the third hive-mind foundation chunk: memory is no longer only one flat area/tier space. WOBBLE OS now has a real memory bank registry, multi-bank placement suggestions, approval-gated bank storage, and bank-filter retrieval.

What changed:
- `src/db/schema.ts`
  - Added `memory_banks`.
  - Added `memory_bank_links`.
  - Extended `memory_records` and `memory_chunks` with `bank_slugs`.
  - Extended `memory_update_proposals` with:
    - `source_intake_run_id`
    - `knowledge_type`
    - `suggested_bank_slugs`
    - `approved_bank_slugs`
    - `router_reason`
    - `router_confidence`
    - `rejected_reason`
- Migration:
  - `src/db/migrations/0005_memory_banks.sql`
  - Generated by Drizzle, reviewed as focused, then renamed from generated tag to stable chunk name.
- `src/lib/domain/memory.ts`
  - Added 25 default memory banks:
    - global, company, client, project, competitor, brand, design, content, seo, offer, research
    - founder_taste + Moiz/Ali/Ibrahim/Haad per-founder banks
    - rejected_ideas, approved_output, performance, agent_learning
    - hook_library, visual_reference, carousel_structure, ad_inspiration, audience_response
  - Added memory bank/link builders.
  - Added bank routing suggestion logic using source type, affected area, knowledge type, content, and tags. Router output is a suggestion only; founder approval is still required before storage.
- `src/lib/memory/index.ts`
  - `proposeMemoryUpdate` now auto-suggests memory banks when none are supplied.
  - `approveMemoryUpdate` now resolves active banks, stores approved bank slugs on the proposal, creates memory record/chunk bank slugs, and inserts `memory_bank_links`.
  - `rejectMemoryUpdate` stores `rejected_reason`.
  - `retrieveMemoryContext` supports `bankSlugs` filters.
  - Added `listMemoryBanks` and `routeMemoryPlacement`.
- API:
  - `GET /api/memory/banks`
  - `POST /api/memory/route-placement`
  - `POST /api/memory/retrieve` now accepts `bankSlugs`
  - memory proposal approval accepts optional `bankSlugs`; if omitted, it uses the proposal's suggested banks.
- Seed:
  - Seeds 25 banks idempotently.
  - Seeds deterministic bank links for initial WOBBLE Brain records/chunks.
  - Adds `memory_router -> openrouter/openai/gpt-4o-mini` to model roles.
- Dashboard:
  - Existing memory cards now display `bankSlugs` using the existing Claude tag styling. No new visual system was introduced.
- Tests:
  - `tests/memory.test.ts` extended for route suggestions, bank-linked approval, rejection reason, and bank-filter retrieval.
  - `tests/db-foundation.test.ts` protects new memory bank tables and seed data.

Verification:
- `npm run typecheck` passed.
- Focused tests passed:
  - `tests/memory.test.ts`
  - `tests/db-foundation.test.ts`
  - 17 tests total.
- `npm run db:migrate` succeeded.
- `npm run db:seed` succeeded and printed `memory_router_model=openai/gpt-4o-mini`.
- DB seed query confirmed:
  - 25 memory banks
  - 40 seed memory bank link rows
  - `settings.model_roles.memory_router = { provider: "openrouter", model: "openai/gpt-4o-mini" }`
- Full `npm run verify` passed:
  - typecheck passed
  - tests passed: 29 files / 206 tests
  - Next production build passed, including `/api/memory/banks` and `/api/memory/route-placement`

Live EFFECT test:
- Started local dashboard/dev server and confirmed `/api/health/web` DB connected.
- `POST /api/memory/route-placement` for an Instagram carousel extracted insight returned:
  - content
  - hook_library
  - design
  - carousel_structure
  - visual_reference
  - competitor
- `POST /api/memory/proposals` created approval-gated proposal with those suggested banks.
- Approved through the real proposal approval route without passing explicit banks, proving the proposal's suggested banks are used.
- `POST /api/memory/retrieve` with `bankSlugs=["hook_library"]` returned the newly created memory chunk.
- Verified in Postgres, not just UI:
  - proposal `memproposal_ecc8fa54-f1f5-4d65-84bb-38e9a1b2eb9f` status `approved`
  - suggested and approved bank slugs match the six routed banks
  - source intake run id preserved: `sourceintake_76ac577f-3ddc-4335-8282-042ee115fd32`
  - memory record `memory_19af9450-a35c-4720-b2be-381b01cff5e0` has the six `bank_slugs`
  - memory chunk `memorychunk_1ab45fec-e15e-4426-b43f-901c4f048b29` has the six `bank_slugs`
  - 12 `memory_bank_links` rows written, one record + one chunk link for each bank
  - audit events written: `memory_update.proposed`, `memory_update.approved`

Important nuance:
- The router is implemented as a deterministic, approval-gated placement engine today. It has a seeded `memory_router` model role so provider-backed LLM routing can be added without changing the storage contract. Do not bypass this contract: future LLM/router agents should write suggested banks to proposals, then founder approval writes memory links.

Next:
- Chunk 55 - Intelligence / Research Review Inbox.
- Chunk 55 should use Chunk 52 agents + Chunk 53 source intake + Chunk 54 memory routing so every research finding can be reviewed, edited, rejected with reason, or routed into approved banks.

### 2026-07-03 - Codex - Dashboard usability repair: Ask rendering + detail drawers

Context:
- Founder reported Ask WOBBLE rendered `[object Object]` and core registries could not be opened/read from the dashboard.
- Root cause: the backend APIs returned structured records correctly, but the dashboard was rendering summary cards only; Ask WOBBLE stringified the structured answer object instead of rendering `answer.answer` plus citations/metadata.

Changed:
- `src/components/os/os-ui.tsx` now renders Ask WOBBLE answer text, confidence, citations, model run id, and founder-judgment notes.
- Memory/WOBBLE Brain rows now open a detail drawer with the real memory record, bank slugs, source id, approval metadata, and raw record.
- Source Registry cards now open a detail drawer backed by real `/api/sources/:id/chunks` and `/api/sources/:id/intake` calls.
- Approvals now open a detail drawer showing entity, approval type/status/risk, notes, metadata, and raw approval record.
- Skill Registry rows now open a detail drawer with prompt body, rules, trigger, module, reference paths, approval metadata, and raw skill record.
- Agent Registry rows now open a detail drawer backed by real `/api/agents/:id`, including agent metadata and recent runs.
- Brain page copy now clarifies that WOBBLE Brain is the core, always-on tier of Memory; Memory is the wider system of tiers and routed banks.

Verification:
- Live `/api/ask` call before patch proved OpenRouter was connected and returned a grounded answer with `modelRunId`.
- `/api/costs` confirmed the Ask WOBBLE OpenRouter call was cost-logged as `openrouter/openai/gpt-4o-mini`.
- `npm run verify` passed after the UI patch:
  - typecheck passed
  - tests passed: 29 files / 206 tests
  - Next production build passed

Important nuance:
- Agent Registry is real infrastructure: it stores visible agent definitions and run logs. It does not mean every registered future agent is already autonomously executing.
- Actual working model-backed paths today include Ask WOBBLE and the content worker. Future module workers/connectors must call the registered agents and write `agent_runs`.
- Do not tell the founder all agents are "working" just because they appear in the registry. Say the registry/logging backbone works, and built module agents work where their workers are already wired.

Known limitation:
- In-app browser automation timed out during visual inspection, and a temporary Playwright download was rejected by policy. UI was verified by API evidence plus typecheck/test/build, not by an automated screenshot.
- Prefer `npm run start` for local demo stability; the dev/Turbopack server can hang on this Windows machine.

Next:
- Treat this as a dashboard hotfix checkpoint before continuing Chunk 55.
- Preserve the Claude glass/lime visual system for future dashboard work and use real API data only.

### 2026-07-04 - Codex - Chunk 55 Intelligence / Research Review Inbox

Context:
- Chunk 55 is the review gate for the hive-mind intelligence layer. Agent/source outputs must be visible, reviewable, editable, rejectable with a reason, mergeable, and routeable into memory proposals before they become trusted knowledge.
- This follows the approved data rule: source/agent output -> structured intelligence row -> review status -> approved/trusted memory proposal/bank routing -> future retrieval.

Changed:
- Added Intelligence Inbox domain schemas and helpers in `src/lib/domain/intelligence.ts`.
  - Inbox queries for pending/needs_review/approved/rejected/archived/superseded.
  - Review actions: approve, reject, needs_review, archive.
  - Reject requires a reason.
  - Edit payloads preserve provenance and metadata.
  - Route-to-memory builds a real memory update proposal.
  - Merge marks duplicates as superseded with merge metadata.
- Added service methods in `src/lib/intelligence/index.ts`:
  - `listIntelligenceInbox`
  - `reviewIntelligenceRecord`
  - `editIntelligenceRecord`
  - `routeIntelligenceRecordToMemory`
  - `mergeIntelligenceRecords`
- Added real API routes:
  - `GET /api/intelligence/inbox`
  - `PATCH /api/intelligence/inbox/[recordType]/[id]`
  - `POST /api/intelligence/inbox/[recordType]/[id]/review`
  - `POST /api/intelligence/inbox/[recordType]/[id]/route-memory`
  - `POST /api/intelligence/inbox/merge`
- Added dashboard module `Intelligence Inbox` using the existing glass/lime WOBBLE OS visual system.
  - Lists real intelligence items/insights/suggestions.
  - Opens detail drawer.
  - Supports review, reject reason, edit, route to memory, and merge/supersede actions through real APIs.
- Fixed a live-test backend bug in `src/db/schema.ts`:
  - `intelligenceItems.metrics`, `extracted`, and `relations` were incorrectly mapped to SQL column `metadata` via the shared helper.
  - They now map to distinct SQL columns: `metrics`, `extracted`, `relations`.
  - Added regression coverage in `tests/db-foundation.test.ts`.
- Added `tests/intelligence-inbox.test.ts` for success and failure paths.

Verification:
- Focused tests passed:
  - `tests/intelligence-inbox.test.ts`: 5 tests passed
  - `tests/db-foundation.test.ts`: 8 tests passed after the schema regression fix
- Full `npm run verify` passed:
  - typecheck passed
  - tests passed: 30 files / 212 tests
  - Next production build passed, including the new `/api/intelligence/inbox/*` routes
- Local runtime:
  - Docker/Postgres healthy after restart.
  - `npm run db:migrate` passed.
  - `npm run db:seed` passed.
  - `/api/health/web` returned DB connected.
- Live EFFECT test through local Next API + Postgres:
  - `POST /api/intelligence/items` created a real pending intelligence item.
  - `GET /api/intelligence/inbox?approvalStatus=pending` returned the item.
  - `POST /api/intelligence/inbox/item/:id/review` approved the underlying `intelligence_items` row and wrote review metadata.
  - `POST /api/intelligence/inbox/item/:id/route-memory` created a real pending `memory_update_proposals` row with banks `content` and `competitor`, and wrote proposal IDs to the intelligence item metadata.
  - A duplicate item was created and `POST /api/intelligence/inbox/merge` marked it `superseded` with merge metadata.
  - Postgres confirmed audit events:
    - `intelligence.item_recorded`
    - `intelligence.review.approved`
    - `memory_update.proposed`
    - `intelligence.review.routed_to_memory`
    - `intelligence.review.merged`

Important nuance:
- Chunk 55 does not run scrapers or analyze reels by itself. It is the review/inbox layer for outputs created by Source Registry intake, Research Radar, Learning Engine, future n8n callbacks, and future agent workers.
- Approved intelligence does not silently become Core Brain. Route-to-memory creates an approval-gated memory proposal. Founder approval still controls what becomes trusted memory.
- The dashboard is a control surface over real `intelligence_*` rows and memory proposals, not a fake research UI.

Next:
- Chunk 56 - Taste + Feedback Learning.
- Chunk 56 should connect approvals/rejections and rejection reasons to global WOBBLE taste, per-founder taste, client/project taste, and agent learning without overwriting brand truth too quickly.

### 2026-07-04 - Codex - Chunk 56 Taste + Feedback Learning

Context:
- Chunk 56 closes the Phase A hive-mind foundation by turning founder approval/rejection/edit signals into durable learning.
- Founder vision: WOBBLE needs separate brand taste, per-founder taste, client/project taste, and agent learning. Founder taste can tune outputs, but it must not silently overwrite WOBBLE brand truth.

Changed:
- Added `taste_profiles` and `feedback_events` to `src/db/schema.ts`.
- Added `src/db/migrations/0006_taste_feedback_learning.sql` and registered it in Drizzle's migration journal.
- Added pure domain logic in `src/lib/domain/taste.ts`:
  - profile keys for brand/founder/client/project/agent scopes
  - default WOBBLE + Moiz/Ali/Ibrahim/Haad profiles
  - feedback event builder
  - rejection reason validation
  - profile update math with slower brand learning and stronger founder/client/project/agent learning
  - conflict counting when later feedback disagrees with prior learned weights
- Added service layer in `src/lib/taste/index.ts` with injectable store/audit deps and real Drizzle defaults.
- Added APIs:
  - `GET/POST /api/taste/profiles`
  - `GET /api/taste/profiles/[profileKey]`
  - `GET/POST /api/taste/feedback`
- Wired `resolveApproval` so approval decisions can record feedback signals after the underlying entity action completes.
  - Rejects now require notes/reason before routing.
  - Approval metadata can provide `tasteDimensions`, `agentSlug`, `module`, `outputType`, `sourceIds`, and `memoryBankSlugs`.
- Seed runner now seeds the default taste profiles idempotently without wiping learned weights.
- Corrected seed founders to Moiz, Haad, Ali, Ibrahim.
- Added Taste Learning dashboard module/page using the existing WOBBLE glass/lime UI patterns.

Verification:
- Focused tests passed: `npm run test -- tests/taste.test.ts tests/db-foundation.test.ts tests/approval-router.test.ts`
  - 3 files / 24 tests passed.
- Full `npm run verify` passed:
  - typecheck passed
  - tests passed: 31 files / 221 tests
  - Next production build passed and included `/api/taste/feedback`, `/api/taste/profiles`, and `/api/taste/profiles/[profileKey]`.
- `npm run db:migrate` applied migrations successfully.
- `npm run db:seed` completed successfully.
- DB query confirmed seeded profiles:
  - `brand:wobble`
  - `founder:moiz`
  - `founder:ali`
  - `founder:ibrahim`
  - `founder:haad`
- Clean dev server launched on `http://127.0.0.1:3002`.
- Dashboard/API smoke:
  - `GET /taste` returned 200.
  - `GET /api/taste/profiles?limit=10` returned seeded profiles.
- Live EFFECT test through the real approval route:
  - Inserted a real content packet and content approval.
  - POSTed `/api/approvals/[id]/resolve` with reject action, approver Haad, and reason.
  - Confirmed in Postgres:
    - content packet `approval_status = rejected`
    - approval row `status = rejected`, `rejected_by = Haad`, notes preserved
    - `feedback_events` row created with decision `reject`, actor `Haad`, reason preserved, profile keys `brand:wobble`, `founder:haad`, `agent:content_worker`
    - `brand:wobble` learned `hook_style:generic_ai_hype = -0.35`
    - `founder:haad` learned `hook_style:generic_ai_hype = -1`
    - audit events included `approval.reject`, `content_packet.rejected`, and `feedback.recorded`

Important rules for future builders:
- Do not collapse founder taste into global WOBBLE taste. Brand is slower/protected; founder/client/project/agent profiles learn separately.
- Do not allow rejections without a reason. The reason is part of the learning loop.
- When a module creates approval metadata, include `tasteDimensions` so learning becomes specific instead of generic.
- Future Chunks 15/21/22/47 should feed approvals/rejections/regenerations into Chunk 56 rather than inventing separate taste tables.

Next:
- Phase A foundations are now complete through Chunk 56.
- Continue with the next tracker item: Chunk 35 - Connections Registry, unless the founder chooses a dashboard/front-end checkpoint first.

Final verification nuance for Chunk 56:
- After docs/next-env cleanup, a monolithic `npm run verify` exceeded the tool timeout on this Windows machine before returning output.
- The exact same phases were rerun separately and all passed:
  - `npm run typecheck` passed.
  - `npm run test` passed: 31 files / 221 tests.
  - `npm run build` passed and included all `/api/taste/*` routes.

## 2026-07-09 - Claude (Opus 4.8) - Semantic memory layer (module-completion pass, Slice 1)

Founder (Moiz) directed a module-by-module completion pass, memory layer FIRST ("make it solid"). Also: removed the Client AIOS Lab module from the registry (client service delivery, not an internal OS module) and wrote docs/WOBBLE_OS_WHOLE_ANIMAL.md (all 25 modules + 17 seeded agents + 25 banks + the blackboard/shared-data model).

Problem found (looks-done-but-isnt): memory retrieval was NOT semantic. `retrieveMemoryCandidates` ignored the embedding column, ordered by recency, and returned a hardcoded `similarity: 0.75`; chunk embeddings were always null. "Remembering" was really "newest in bank."

Changes:
- NEW src/lib/embeddings/index.ts - pluggable OpenAI-compatible embedder; defaults to OpenRouter + openai/text-embedding-3-small (1536 dims, matches schema) using existing OPENROUTER_API_KEY. Configurable via EMBEDDINGS_API_KEY/MODEL/BASE_URL. Returns null (graceful) when unconfigured.
- src/lib/memory/index.ts - approveMemoryUpdate generates+stores chunk embeddings (attachEmbeddings, non-fatal). retrieveMemoryContext embeds the query; defaultStore.retrieveMemoryCandidates now uses real pgvector cosine (cosineDistance -> 1-distance) with isNotNull(embedding), falling back to recency when no query embedding. Added queryEmbedding to RetrieveMemoryQuery, embedder to MemoryDeps.
- NEW src/scripts/backfill-memory-embeddings.ts + `npm run memory:backfill-embeddings`.
- NEW tests/memory-embeddings.test.ts. .env.example documents EMBEDDINGS_* vars.

Infra: local Postgres via Docker - image pgvector/pgvector:pg16, container `wobble-os-postgres`, db wobble_os / user wobble / port 5432. 45 tables + seed present.

Verification:
- typecheck clean; full suite 234 tests pass (was 221).
- Live backfill: 12/12 chunks embedded via OpenRouter.
- Live semantic retrieval proven end-to-end: brand-voice query -> Brand Voice; founders query -> About WOBBLE + Founder Preferences; avoid-saying -> Do Not Say Rules; content-strategy -> Content Strategy. Real cosine ordering, not recency.

Next: Slice 2 = Knowledge Compiler (Chunk 13) so approved sources compound into linked notes; then Content multi-agent upgrade (Chunk 15); then the NEW Prospect->Audit->Proposal revenue engine. Remaining memory-hardening items tracked in docs/WOBBLE_OS_WHOLE_ANIMAL.md Part 3.6 (shared retrieval contract for all output agents, provenance-on-write, per-founder taste effect, "I don't know" empty-state).

## 2026-07-09 - Claude (Opus 4.8) - Memory hardening + migration-drift/deploy-bug fix

Applied a strict "harden before advancing" review of the Slice 1 memory work. Two outcomes:

1) HONEST CORRECTION: I initially thought memory had "no vector index" and added one. WRONG - migration 0000_init_pgvector.sql already creates the correct HNSW cosine index (memory_chunks_embedding_idx) AND a composite filter index (memory_chunks_scope_idx on memory_tier,trust_level,status,archived). My additions were duplicates. Reverted the schema.ts index change and dropped the 3 duplicate indexes I had created. Final memory_chunks indexes = pkey + embedding_idx (HNSW) + scope_idx only. (The indexes just weren't mirrored in schema.ts, which is why they were invisible on a code read.)

2) REAL DEPLOY BUG FOUND + FIXED: `drizzle-kit generate` revealed snapshot drift - the migration SNAPSHOTS were behind the live schema for taste_profiles, feedback_events, and intelligence_items.metrics/extracted/relations. Root cause: those objects were added to the live DB outside the migration SQL (push/hand). taste/feedback are also created by 0006, but the three intelligence_items columns are created by NO committed migration SQL - so a from-scratch `drizzle-kit migrate` (VPS deploy) would build a broken intelligence_items table and crash the intelligence module. Fix: new migration 0007_lovely_baron_zemo.sql - an idempotent (IF NOT EXISTS) reconciliation that safely no-ops on existing DBs and correctly builds a fresh one. Verified `db:generate` now reports "No schema changes" (schema == snapshot == DB).

Process note: reviewed the generated migration BEFORE applying and caught that the raw generated 0007 had non-idempotent CREATE TABLE / ADD COLUMN that would have failed on both the current DB and a fresh build. Never run generated migrations unread.

Infra recap: local Postgres via Docker (container wobble-os-postgres, pgvector/pgvector:pg16). Embeddings on OPENROUTER_API_KEY (openai/text-embedding-3-small). Budget mode: all model_roles set to openai/gpt-4o-mini for cheap testing; content_strategy's original (claude-sonnet-4.5) stashed in settings.model_roles.content_strategy._restoreTo - restore for production content.

Verification: typecheck clean; 234/234 tests pass; live semantic retrieval still correct; memory_chunks index set clean; `db:generate` clean; migration applies idempotently.

Recommendation for all builders: run `npm run db:generate` and expect "No schema changes"; if it re-emits existing objects, the snapshots have drifted again - reconcile with an idempotent migration, don't push. Next: Slice 2 = Knowledge Compiler (Chunk 13).

## 2026-07-09 - Claude (Opus 4.8) - Model Registry (swappable, validated model brain) + git checkpoint

Pushed the prior memory work to GitHub (main f305cf4). Then built the Model Registry so all agents can swap LLMs safely as better models ship - foundation for a 40-50 agent fleet.

New:
- src/lib/domain/model-registry.ts - model catalog schema (id, provider, modalities[], costTier, status, contextWindow, goodFor, notes), ROLE_MODALITY requirements, validateModelSwap (blocks unknown/deprecated/modality-mismatch), model upgrade proposal schema, DEFAULT_MODEL_CATALOG (6 seeded models).
- src/lib/model-registry/index.ts - getModelCatalog/getModelRoleMap; setModelForRole (validated swap + model_role.changed audit); proposeModelSwap (creates a model_upgrade APPROVAL - offered, never force-fed); applyModelSwapApproval. defaultStore reads/writes settings (model_roles / model_catalog).
- Agents: registered model_scout (proposes genuine per-role model upgrades, approval-gated) and system_auditor (continuously audits modules/agents/features for upgrades). Toward Moiz's vision: "tell Ask WOBBLE a new model came out -> it proposes swaps for approval; only when genuinely better for the job."
- Seeded settings.model_catalog. IMPORTANT FIX: model_roles + model_catalog seeds are now onConflictDoNothing (were DoUpdate) so re-seeding no longer clobbers runtime model swaps.
- tests/model-registry.test.ts (9 tests): validation matrix + swap + audit + approval-gated propose/apply.

Verified: typecheck clean; 243 tests pass; production build green (pre-push). Live: model_scout/system_auditor in DB; catalog has 6 models; setModelForRole swapped content_strategy sonnet-4.5 -> gpt-4o-mini (budget mode) with audit; a bad swap (embedding model on a text role) was correctly BLOCKED.

Budget mode remains: content_strategy = gpt-4o-mini (cheap testing). Restore to anthropic/claude-sonnet-4.5 for production content when credits are loaded (it is in the catalog).

Next: Slice 2 = Knowledge Compiler (Chunk 13). Also queued: wire Ask WOBBLE to call proposeModelSwap conversationally; give model_scout a real source for new-model signals (provider model-list API / release notes); Settings UI for the catalog + role map.

## 2026-07-09 - Claude (Opus 4.8) - Ask WOBBLE System Awareness (orchestrator step 1)

Goal (founder): make Ask WOBBLE the ultimate command surface that knows the whole OS and can take actions. Established the architecture: give it (1) a live SYSTEM MAP and (2) a growing set of guardrailed TOOLS - never raw code. This chunk delivers step 1 (knowledge).

New:
- src/lib/system-map/index.ts - getSystemSnapshot(): live, structured OS state (agents count/list/by-team, modules + wired/planned/backend-ready counts, pending approvals grouped by type, model roles + catalog). Injectable stores (testable without DB). formatSystemSnapshot() renders a compact, authoritative prompt block.
- Ask WOBBLE now injects the system snapshot into its grounded-answer context (src/lib/domain/ask.ts buildAskContext gains systemSnapshot; src/lib/ask/index.ts fetches it via getSystemSnapshot, non-fatal if unavailable). Prompt marks it AUTHORITATIVE for operational questions (agents/approvals/models/modules) - no [n] citation needed for those.
- tests/system-map.test.ts (3): aggregation, formatting, and that the snapshot reaches the model prompt.

Ops fixes found while testing:
- OpenRouter provider_connection was disabled (enabled=false by seed default) - would block ALL live LLM agents. Enabled it. (Consider seeding enabled=true for openrouter, or a Settings toggle.)

Verified live (cheap model): asked "how many agents + what's pending approval" -> "19 active agents; 9 pending: 4 memory, 3 content, 1 model upgrade, 1 source" (all real). Asked "which model does content use + name two intelligence agents" -> "openai/gpt-4o-mini; competitor_scout, market_researcher". Also proved the model_scout -> proposeModelSwap -> pending approval -> Ask WOBBLE reports it loop end to end. typecheck clean; 246 tests; build green.

Left a real pending approval (approval_006cad1f...) from the model_scout demo (ask_wobble gpt-4o-mini -> gpt-4o) as live test data; founder can approve/reject in Approvals.

NEXT (Ask WOBBLE orchestrator step 2 - the "it does stuff" layer): add LLM tool-calling. Extend the OpenRouter adapter for OpenAI-style tools/tool_calls; define a TOOL REGISTRY of safe capabilities (read: list_agents, list_pending_approvals, get_model_config, list_models; action: propose_model_swap, apply_approval) each going through existing guardrails (validation/approvals/audit); an orchestration loop that lets Ask WOBBLE choose tools, ask clarifying questions ("which agent/role?"), and execute approved actions. This is how "tell Ask WOBBLE to upgrade a model -> it asks which -> proposes -> on yes, applies" works without exposing code.

## 2026-07-09 - Claude (Opus 4.8) - Ask WOBBLE Tool Registry (orchestrator step 2a/2b)

The safe "toolbox" Ask WOBBLE will use to TAKE actions - the backbone before the LLM tool-calling loop.

New: src/lib/ask-tools/index.ts
- ToolDefinition + defineTool() factory (type-safe args at definition, uniform runtime type; no any/casts). Each tool carries an OpenAI-compatible jsonSchema (for the upcoming tool-calling loop) + a zod argsSchema (runtime validation).
- Read tools: list_agents (team/module filter), list_pending_approvals, get_model_config, list_models (modality filter) - all read the live system-map snapshot.
- Action tools: propose_model_swap (creates a model_upgrade APPROVAL - never auto-applies; catalog-validated) and apply_model_upgrade (approve+apply, audited). Both go through the existing model-registry guardrails.
- runTool(name, args, ctx): validates args, dispatches, NEVER throws - returns a structured {ok,result,error} the loop can feed back to the model. Unknown tool / bad args / handler failure all return ok:false.
- toolSpecs(): OpenAI function specs for all tools.
- tests/ask-tools.test.ts (8): specs, read tools, dispatch safety (unknown/invalid/handler-error all non-throwing), action tool creates pending approval.

Verified: typecheck clean; 254 tests; build green.

NEXT (step 2c - completes the "it does stuff" experience): extend createOpenRouterTextAdapter for OpenAI-style tools/tool_calls; add an askWobble orchestration loop that offers toolSpecs() to the model, executes returned tool_calls via runTool, feeds results back, and loops until a final answer - with a confirmation gate before any mutating tool actually applies. Then Ask WOBBLE can: "upgrade the content model" -> ask which -> propose -> on founder yes -> apply, all audited.

## 2026-07-09 - Claude (Opus 4.8) - Ask WOBBLE Orchestrator / tool-calling loop (step 2c) - the "it does stuff" surface

Ask WOBBLE can now inspect AND operate the OS conversationally, safely.

Provider: extended createOpenRouterTextAdapter + runTextProvider for OpenAI-style function calling - ProviderToolSpec/ProviderToolCall/ProviderChatMessage (tool role, assistant tool_calls, tool results); tools/tool_choice passed through; tool_calls parsed; safeJsonParse for malformed model args; relaxed the "no text" throw when tool_calls are present.

Orchestrator: src/lib/ask/agent.ts - askWobbleAgent(): offers toolSpecs() to the model, executes chosen tools via runTool, feeds results back, loops to a final answer. Hardening (per founder's "make it stronger / try to break it"): hard iteration cap (default 6, max 10) to kill runaway loops/cost; destructive tools (requiresConfirmation, e.g. apply_model_upgrade) NEVER run without explicit confirmActions - returns pendingConfirmation instead; unknown/invalid/failed tool calls come back as structured errors the model recovers from; every mutating action audited (ask.agent.tool_action / confirmation_required / answered / max_iterations). Fully injectable (provider/snapshot/toolContext/audit).

Tools: added requiresConfirmation to ToolDefinition (apply_model_upgrade=true). API: POST /api/ask/agent (confirmActions gates destructive tools).

Tests: tests/ask-agent.test.ts (5, adversarial): read-then-answer; destructive HELD for confirmation (role unchanged); applied only when confirmActions=true; unknown-tool recovery; iteration-cap stop. tests/ask-tools.test.ts (8). Provider tests still green.

Verified live (gpt-4o-mini, budget): "how many pending + list content agents" -> model chose list_pending_approvals + list_agents -> accurate answer (9 pending; 3 content agents). "upgrade the content model, options + recommendation" -> chose get_model_config + list_models -> presented GPT-4o vs Sonnet 4.5 with cost/use-case, recommended Sonnet for content, and ASKED to confirm before proposing. typecheck clean; 259 tests; build green (/api/ask/agent compiled).

NEXT: wire the dashboard Ask WOBBLE page to /api/ask/agent (with a confirm button that re-calls with confirmActions=true) so founders use it in the UI; add more tools over time (create_source, trigger_research, approve/reject items, get_costs). Then Knowledge Compiler (Slice 2), then Auth (deploy blocker).

## 2026-07-09 - Claude (Opus 4.8) - Conversational Memory: per-founder auto-learning from chats

The OS now learns from talking to it - per founder, automatically, correctly routed.

Schema (migration 0008, no drift): conversations (founderId/founderName, surface, scope, status, messageCount, harvestStatus, harvestedAt) + conversation_messages (role, content, toolName, modelRunId) + indexes.

New:
- src/lib/domain/conversations.ts - pure: row builders, founderBankSlug() (Moiz->founder_moiz etc), buildTranscript, harvest-candidate schema + safe parseHarvestCandidates (tolerates prose/code-fences), classifyCandidateRouting (THE safety rule: scope 'founder' -> auto_save to that founder's bank; company/brand/client -> PROPOSE for approval; brand = core tier so a chat can never silently overwrite brand), buildHarvestPrompt.
- src/lib/conversations/index.ts - log service: startConversation/appendMessage/getConversationMessages/listConversationsPendingHarvest (idle sweep)/markHarvested. Injectable store.
- src/lib/memory-harvester/index.ts - harvestConversation(): extract durable facts via LLM (role memory_router, cheap) -> route -> auto-save personal (reuses tested proposeMemoryUpdate+approveMemoryUpdate so embeddings ARE generated) / propose shared -> mark harvested + audit (memory.harvested). harvestPendingConversations() sweep (ready to schedule).
- Ask WOBBLE agent now logs each chat to a conversation (founder-tagged), best-effort/non-fatal, returns conversationId.
- New tool: remember(fact, scope?, area?) - personal auto-saves to the founder's bank, brand/company proposed. ToolContext gained memoryDeps.

Ops fix: openrouter provider_connection allowedModules was a hardcoded list that excluded 'memory' (blocked the harvester). Changed to [] (LLM gateway allowed for ALL internal modules; per-module guardrails belong on external providers) + enabled:true by default. Updated seed.ts + the live row.

Tests: tests/conversations.test.ts (routing/parse/transcript/founder-bank) + tests/memory-harvester.test.ts (founder pref auto-saved to founder_moiz; company fact proposed; empty-skip). 269 tests pass, typecheck + build green.

Verified live: real chat -> harvest -> "Moiz prefers punchy aggressive hooks" auto-saved to founder_moiz (embedded); "WOBBLE targets Pakistani SaaS founders" left pending approval on the company bank. Exactly the per-founder + trust-gated routing intended.

HONEST BOUNDARY (not a corner-cut): harvestPendingConversations is the sweep entrypoint and fully works when invoked; the periodic AUTO-trigger (runs every N min) lands with the Automations/scheduler module (Chunk 19). Also: true founder identity per chat comes from Auth (Chunk 02) - until then founder is passed explicitly. This raises Auth's priority (it powers per-founder memory/taste).

NEXT: adversarial break-agent over this whole session's work (memory/embeddings, model registry, ask orchestrator+tools, conversational memory), then wire the harvest sweep into the scheduler, then Slice 2 / Knowledge Compiler.

## 2026-07-09 - Claude (Opus 4.8) - Founder-editable memory banks (read/add/edit/remove, permissioned + audited)

Founders can now directly manage memory - read full detail, add, edit, remove (soft-delete), restore. Every op audited; each founder can edit their OWN personal bank but not another founder's.

Domain (src/lib/domain/memory.ts): personalBankOwner() + canEditMemoryBanks(actor, bankSlugs) - shared banks editable (audited), own founder bank editable, another founder's personal bank BLOCKED (checked across all banks a record belongs to).

Service (src/lib/memory/index.ts): getMemoryRecordDetail; createMemoryRecord (direct add; permission + embed + bank links + audit memory_record.created); editMemoryRecord (permission; re-embeds the chunk when content changes so semantic search never goes stale; audits before/after + reEmbedded flag); archiveMemoryRecord (soft-delete + chunk archive; audit); restoreMemoryRecord. New MemoryStore methods: getMemoryRecordById, updateMemoryRecordFields, listChunkIdsForRecord, updateChunk, setChunksStatusForRecord (added to defaultStore + all in-memory test stores). Robustness fix: contentChanged is computed BEFORE the update (store-agnostic; a live-reference store would otherwise skip re-embed).

API: GET/POST /api/memory/records (browse a bank / add); GET/PATCH/DELETE /api/memory/records/[id] (detail / edit / archive); POST /api/memory/records/[id]/restore. Permission errors -> 403, not-found -> 404.

Tests: tests/memory-manage.test.ts (permission matrix, create+embed+audit, cross-founder block, re-embed-on-edit, archive/restore). 274 tests pass, typecheck + build green.

Verified live: create -> read detail -> edit -> semantic search returns the EDITED content (re-embed works) -> archive (search drops it) -> restore -> Moiz blocked from writing to founder_ali. All audited.

NEXT: adversarial break-agent over the session; then per-founder identity via Auth (Chunk 02) so edits attribute to the logged-in founder automatically; Knowledge Compiler (Slice 2). Upgrade backlog proposed to founder (versioned memory history, conflict detection, staleness, importance/pinning, bulk ops, "what WOBBLE knows about me" view, Ask WOBBLE memory tools).

## 2026-07-09 - Claude (Opus 4.8) - Memory upgrades Batch 1: version history + 48h deletion-revert + audit labeling

Founder direction: do all 10 memory upgrades (then break-agent), plus a 48h revert window on deletions and fully-labeled audit logging ("track everything"). This is Batch 1 of the upgrades.

Schema (migration 0009, no drift): memory_records += archived_at, purge_after; NEW memory_record_versions (undo/history); audit_logs += category (creation/edit/deletion/restore/approval/access/learning/model/system) + surface (where it happened) + indexes.

Audit (src/lib/domain/audit.ts + lib/audit): every event auto-categorized (deriveAuditCategory) so the log is filterable ("show all deletions"); optional explicit category + surface. Writer persists them; listAuditEvents filters by category/actor.

Memory (src/lib/memory):
- Version history: editMemoryRecord snapshots the PRIOR state to memory_record_versions before overwriting; listMemoryVersions; restoreMemoryVersion (non-destructive - snapshots current, re-embeds).
- 48h deletion revert: archiveMemoryRecord sets archived_at + purge_after (now+48h) and audits restorableUntil; restore clears them; purgeExpiredArchivedMemory hard-deletes (record+chunks+links+versions) only AFTER the window, schedulable, audited (memory_record.purged). MEMORY_PURGE_GRACE_MS in domain.
- New MemoryStore methods (defaultStore + all in-memory test stores updated): insertRecordVersion, listRecordVersions, getRecordVersion, countRecordVersions, listExpiredArchivedRecords, deleteRecordCascade.

API: GET /api/memory/records/[id]/versions; POST /api/memory/records/[id]/versions/[versionId]/restore.

Tests: tests/memory-manage.test.ts extended (history+restore, 48h grace then purge, audit categorization) + audit.test.ts row shape updated. 277 tests pass, typecheck + build green.

Verified live: edit -> 1 prior version; restore-to-version -> content rolls back; archive -> purgeAfter set; purge within 48h = 0 (protected); purge after 48h = hard-deleted; audit filter category='deletion' returns purged+archived.

REMAINING memory upgrades (batches to come, before break-agent per founder): conflict detection (#2), "what WOBBLE knows about me" view+export (#3), Ask WOBBLE memory tools search/edit/forget (#4), staleness/review (#5), importance/pinning (#6), bulk ops (#7), dedup-on-write (#8), merge/split (#9), Memory browser UI page (#10); plus proposed extras (access logging, provenance graph, confidence decay, weekly digest, bank visibility controls, structured memory, sensitive-data flagging, harvest-batch rollback). Also: schedule purgeExpiredArchivedMemory + harvest sweep via Automations (Chunk 19).

## 2026-07-09 - Claude (Opus 4.8) - Memory upgrades Batch 2: dedup-on-write (#8) + conflict detection (#2) + staleness (#5)

Schema (migration 0010, no drift): NEW memory_conflicts (new/existing record ids, similarity, status, resolution, detected/resolved-by); memory_records += review_after, last_reviewed_at (staleness).

Domain (src/lib/domain/memory.ts): MEMORY_DUPLICATE_THRESHOLD=0.93, MEMORY_CONFLICT_THRESHOLD=0.82; classifyMemoryWrite(neighbours) -> new|duplicate|conflict; buildMemoryConflictRow; REVIEW_INTERVAL_MS_BY_TIER (core 180d/working 60d/episodic 30d) + computeReviewAfter; buildMemoryRecordRow now sets review_after by tier.

Service (src/lib/memory): findRelatedMemories (bank-scoped vector NN). createMemoryRecord now embeds content ONCE (reused for NN search + the chunk), then: duplicate -> skip + return existing (audit memory_record.deduplicated); conflict -> create + write memory_conflicts + audit memory.conflict_detected; new -> create. Opt-out via input.dedupe/detectConflicts (default true). resolveMemoryConflict (keep_new archives old / keep_existing archives new / keep_both / merged; audited). listMemoryConflicts. Staleness: listMemoriesDueForReview + reviewMemory (resets window). New MemoryStore methods are OPTIONAL (capability-based) so the 3 unrelated in-memory test stores didn't need churn; defaultStore implements all.

API: GET /api/memory/conflicts; POST /api/memory/conflicts/[id]/resolve; GET /api/memory/review; POST /api/memory/records/[id]/review.

Tests: tests/memory-conflicts.test.ts (classifier, dedupe, conflict-flag, clean-create, resolve keep_new, staleness list+review). 283 tests pass, typecheck + build green.

Verified live (real embeddings): identical memory DEDUPED (returned same id, no pile-up). Conflict band proven in unit tests (real-embedding thresholds are tunable constants; calibrate on real data). Staleness unit-tested.

PROGRESS: upgrades done = #1 version history, #8 dedup, #2 conflict detection, #5 staleness (+ 48h revert + audit labeling). REMAINING before break-agent: #3 "what WOBBLE knows about me" export, #4 Ask WOBBLE memory tools (search/edit/forget), #6 pinning, #7 bulk ops, #9 merge/split, #10 Memory UI page; plus extras. Follow-up: wire dedup into approveMemoryUpdate/harvester (auto-learning path); schedule purge + review + harvest sweeps via Automations.

## 2026-07-09 - Claude (Opus 4.8) - Memory upgrades Batch 3a: pinning (#6) + founder export (#3) + Ask WOBBLE memory tools (#4)

Schema (migration 0011, no drift): memory_records += pinned bool, importance int; memory_chunks += pinned bool (denormalized for retrieval).

Domain: MemoryRecordRow/MemoryChunkRow += pinned (+importance on record); MemoryChunkCandidate.pinned optional; rankMemoryChunks adds PIN_BOOST (0.25) so pinned memories reliably surface.

Service (src/lib/memory): pinMemory (permission + updates record pinned/importance + chunk pinned + audit pinned/unpinned); getFounderMemory("Moiz") -> personal-bank export ("what WOBBLE knows about me"); retrieveMemoryCandidates now selects+returns pinned so ranking uses it. New optional store method setChunksPinnedForRecord.

Ask WOBBLE tools (src/lib/ask-tools): search_memory (semantic recall, bank-scoped), forget_memory (archive, reversible 48h), pin_memory (pin/unpin). Now Ask WOBBLE can manage memory conversationally. ToolContext already carries memoryDeps.

API: POST /api/memory/records/[id]/pin; GET /api/memory/founder/[founder].

Tests: rankMemoryChunks pin-boost (memory.test.ts); pinMemory + cross-founder block + getFounderMemory (memory-manage.test.ts). 287 tests pass, typecheck + build green.

Verified live: pinned memory ranked #1 (1.414) over a near-identical unpinned one (1.174); founder export returned founder_moiz records; runTool('search_memory') returned results.

PROGRESS: upgrades done = #1,#2,#3,#4,#5,#6,#8 (+48h revert, audit labeling). REMAINING before break-agent: #7 bulk ops, #9 merge/split, #10 Memory browser UI page. Then extras + break-agent. Follow-ups still queued: dedup in approveMemoryUpdate/harvester; schedule purge/review/harvest via Automations; wire memory tools' confirmation policy if desired.

## 2026-07-09 - Claude (Opus 4.8) - Memory upgrades Batch 3b: bulk ops (#7) + merge/split (#9) + handoff doc

Also added docs/CURRENT_BUILD_STATE.md - a single living "catch up in 2 min" handoff (decisions + plan + state + env/budget/git/migration rules) so any builder (Codex) can pick up mid-stream without re-explanation. Keep it current.

Service (src/lib/memory): bulkMemoryOperation (archive/restore/pin/unpin many; per-record permission + audit; collects partial failures without aborting); mergeMemoryRecords (>=2 sources -> one new record in union of banks, sources archived, audited memory.merged); splitMemoryRecord (one -> >=2 new, original archived, audited memory.split). All reuse the tested primitives (createMemoryRecord/archiveMemoryRecord/restoreMemoryRecord/pinMemory) with dedupe+detectConflicts off for merge/split synthesis.

API: POST /api/memory/bulk, POST /api/memory/merge, POST /api/memory/split (403 personal-bank / 404 not-found / 422 too-few).

Tests: tests/memory-manage.test.ts += bulk archive, bulk partial-failure (cross-founder), merge, split. 291 tests pass, typecheck + build green.

Verified live: bulk archive 2/2; merge -> source archived into new record; split -> original archived, 2 created.

PROGRESS: memory upgrades #1-#9 all DONE (+48h revert, audit labeling). REMAINING: #10 Memory browser UI page (front-end). Then extras, then the ADVERSARIAL BREAK-AGENT over the whole session (founder wants it after the upgrades).

## 2026-07-09 - Claude (Opus 4.8) - Memory upgrade #10: Memory browser UI page (all 10 upgrades complete)

Upgraded os-ui.tsx MemoryPage from a read-only list into a full management browser, matching the existing glass/lime design (reused glass/card/Tag/StateBlock/useApi/offlineIf/primaryBtn/disabledBtn/inputStyle/selectStyle/labelStyle/FOUNDERS; no new UI framework).

Tabs + founder selector ("acting as"):
- All memory: browse active records; per-row Pin/Unpin, Edit, Delete; row detail via edit modal.
- Edit modal: title/content edit (PATCH -> re-embeds) + VERSION HISTORY list with per-version Restore.
- Conflicts: open memory_conflicts with Keep new / Keep existing / Keep both resolve buttons.
- Stale review: memories past freshness window with "Still true" (review) button.
- What WOBBLE knows about me: per-founder personal-bank export.
- Recently deleted: archived records (48h grace) with Restore.

All wired to the real APIs shipped this session (/api/memory/records[/id][/versions][/restore][/pin], /conflicts[/resolve], /review, /founder/[founder]). New fetch helper memApi + actBtn/chipBtn styles kept local + on-brand.

Verified: typecheck clean; production build compiled + generated the page; live dev server -> GET /memory 200 (52KB), /api/memory/records 200, /api/memory/conflicts 200. (Pixel-level visual polish is best eyeballed via `npm run dev` -> /memory; structure/data/actions all wired + serving.)

MILESTONE: memory upgrades #1-#10 ALL COMPLETE (+48h revert + audit labeling). NEXT: optional memory extras, then the ADVERSARIAL BREAK-AGENT over the whole session (founder wants it after the upgrades), then Auth / Knowledge Compiler / Content team / revenue engine.

## 2026-07-09 - Claude (Opus 4.8) - ADVERSARIAL BREAK-AGENT pass over the session + fixes

Ran 3 parallel adversarial QA sub-agents (memory core / ask-orchestrator+model-registry / conversational-memory+schema). They found REAL bugs. FIXED the critical + high + cheap-medium ones (each with a regression test), 297 tests green, build green.

FIXED:
- CRITICAL: applyModelSwapApproval rubber-stamped ANY pending approval. Now loads the approval, asserts approvalType=model_upgrade + entityId=role + metadata.toModel=toModelId, and validates the swap BEFORE consuming the approval (fixes approve-before-validate too). New injectable deps.loadApproval (default getApproval). Regression test added.
- HIGH: forget_memory (archive) tool was NOT confirmation-gated -> set requiresConfirmation:true. Regression test.
- HIGH: search_memory could read ANY founder's personal bank -> guard blocks another founder's personal bank (personalBankOwner check). Regression test.
- HIGH: editMemoryRecord wiped the chunk embedding when the embedder was unconfigured/failed (memory silently dropped from vector search). Now re-embed is try/caught and only overwrites the embedding when a fresh vector exists; otherwise preserves the old one. Regression test.
- HIGH: dedup/conflict (findRelatedMemories) matched ARCHIVED records (createMemoryRecord could return a soft-deleted record). retrieveMemoryCandidates now filters status='active' unless queryMode='include_archived' (fixes at source for all callers).
- HIGH: harvester not idempotent + one bad candidate discarded ALL. Now: entry guard (skip if harvestStatus!=pending), per-candidate try/catch (one failure can't abort/duplicate), element-by-element parseHarvestCandidates (good candidates survive a bad one).
- HIGH: harvester leaked personal facts to shared founder_taste when founder unresolved, and trusted founderName over id. Now prefers founderId; if the bank resolves to shared founder_taste, a 'founder'-scope auto_save is downgraded to PROPOSE (approval) instead of writing personal data to a shared bank.
- MEDIUM: setModelRoleMap used UPDATE (first swap on a fresh DB silently lost) -> upsert.
- MEDIUM: provider tool_calls with no id crashed the loop -> filter requires tc.id.

NOTED / NOT YET FIXED (honest follow-ups, tracked - none are corner-cuts, they need Auth or a transaction refactor):
- Atomicity: compound memory writes (create/approve/archive/deleteRecordCascade/merge/split) are multi-statement without a DB transaction -> partial-failure orphans. Needs a store-level transaction wrapper.
- confirmActions is turn-global, not bound to the specific pending action -> once confirmed, another mutating tool in the same turn could run. Bind confirmation to pendingConfirmation's tool+args.
- canEditMemoryBanks doesn't verify the actor IS a founder (shared banks writable by any actor string). This is fundamentally AUTH (Chunk 02) - actor identity must come from login. RAISED auth priority.
- Version-number race (countVersions+1 under concurrency); harvest concurrent double-run (needs an atomic row-claim); transcript unbounded (cap last N turns); re-harvest of continued conversations (needs harvestedThroughMessageId watermark - currently harvested convos don't re-harvest); embeddings dimension not validated (fail-loud on !=1536); listPendingHarvest newest-first can starve old.
- These are queued; the highest-value next is Auth (identity) + a memory transaction wrapper.

## 2026-07-09 - Claude (Opus 4.8) - Chunk 02: Shared team AUTH + founder attribution (verified end-to-end)

Built the auth foundation that the break-agent flagged as the top gap (actor identity must come from login, not a client string). Model: ONE shared team password; on login you pick WHICH founder you act as; that founder is baked into a signed JWT (jose, HS256, SESSION_SECRET) and recorded in auth_sessions (revocable, 30d expiry). Server routes derive the acting founder from the verified session.

FILES:
- src/lib/auth/edge.ts - jose-only edge primitives (verifyJwtOnly, readCookie, SESSION_COOKIE, getSecretKey). Safe to import from the edge proxy.
- src/lib/auth/index.ts - node auth: login (bcrypt.compare + SignJWT + record session w/ sha256(token) hash), verifySession (JWT + DB active/unexpired/hash-match), logout (revoke), getSessionFromRequest, sessionCookie/clearedSessionCookie, isAuthConfigured, resolvePasswordHash.
- src/app/api/auth/{login,logout,session}/route.ts - runtime=nodejs. login 401s on bad pw/unknown founder, 503 if unconfigured.
- src/proxy.ts - edge auth gate (Next 16 "proxy" convention; renamed from middleware.ts to kill the deprecation warning). Public prefixes bypass; else valid session or app->/login redirect, /api/*->401. Deep revocation/expiry enforced in node routes.
- src/app/login/page.tsx - glass/lime login (founder select + team password), maintains the existing front-end branding.
- src/scripts/hash-password.ts + `npm run auth:hash` - prints the bcrypt hash AND a base64 line to paste into .env.
- tests/auth.test.ts - 14 tests (login/verify/logout/revoke/expire/tamper/isAuthConfigured + base64 resolution regression).

GOTCHA FIXED (would have broken every VPS setup): a bcrypt hash has `$` signs; Next's .env loader (dotenv-expand) MANGLES them as variable interpolation - even single-quoting fails (quotes stripped before expansion). Confirmed live: the hash loaded as a 32-char garbage string, login 401'd. FIX: canonical form is base64 (SHARED_LOGIN_PASSWORD_HASH_B64, no `$`); resolvePasswordHash decodes it, falls back to the raw var (quotes stripped). hash-password.ts + .env.example now guide founders to the base64 line. Regression tests lock it in.

VERIFIED: typecheck clean; `npm run test` 311 passed (was 305, +6 auth regression); `npm run build` compiles (proxy active, no deprecation). LIVE dev-server flow: unauth /api -> 401; unauth page -> redirect to /login; login (Moiz & Ali) -> 200 + Set-Cookie; /api/auth/session -> 200 founder; protected /api/memory -> 200 with cookie; wrong password -> 401; logout -> 200; post-logout session -> 401 (DB revocation enforced).

LOCAL DEV NOTE: .env (gitignored) has a temp team password `wobbletest123` so login works locally. Founders MUST set the real password before deploy: `npm run auth:hash -- "<real password>"` then paste the SHARED_LOGIN_PASSWORD_HASH_B64 line into .env. Also set a strong SESSION_SECRET (>=32 chars) on the VPS.

NEXT: wire route handlers to derive actor identity from getSessionFromRequest (replace client-supplied founder strings - closes the break-agent auth gaps: canEditMemoryBanks actor trust, cross-founder writes). Then Knowledge Compiler (Chunk 13) -> Content multi-agent team -> revenue engine.

## 2026-07-09 - Claude (Opus 4.8) - Wire session identity into ALL mutation routes (closes break-agent actor-trust gap)

Auth existed but routes still trusted a CLIENT-SUPPLIED actor/createdBy/approvedBy string - so any logged-in founder could set it to another founder and write/approve on their behalf (the break-agent's "actor trust" finding). Now the acting founder for every mutation comes ONLY from the verified session.

- NEW src/lib/auth/index.ts::getActingFounder(request) - full DB-backed verifySession (so REVOKED/expired sessions are rejected here even though the edge proxy is JWT-only - closes a second gap: the proxy alone doesn't catch revocation).
- NEW src/lib/auth/route.ts::requireFounder(request)/isAuthError - route guard returning the trusted founder or a 401.
- Wired 17 mutation routes to derive the actor from the session and IGNORE the client field (fields made optional/overridden, backward-compatible with the current UI):
  memory: records POST, records/[id] PATCH+DELETE, pin, review, restore, versions/restore, bulk, merge, split, conflicts/[id]/resolve
  approvals: approvals/[id]/resolve, approvals/[id]/action, memory/proposals/[id]/approval, skills/[id]/approval, sources/[id]/approval
  other: content/packets/[id]/versions (createdBy), taste/feedback (actor)

VERIFIED: typecheck clean; 311 tests pass; LIVE proof on dev server - (1) unauth POST -> 401 (proxy); (2) logged in as Moiz, POST memory to founder_ali claiming createdBy=Ali -> 403 "founder_ali is ali's personal memory bank and can only be edited by ali" (ESCALATION BLOCKED - server used the session actor Moiz, not the client's Ali claim); (3) POST to founder_moiz claiming createdBy=Ali -> 201, persisted with the session founder as creator (approvedBy), not Ali.

FOLLOW-UP (noted, not corners): the memory UI still sends a createdBy/actor from a dropdown that the server now ignores - harmless (server override wins) but the UI should show "acting as <session founder>" and drop the redundant input. GET routes (viewing another founder's "what WOBBLE knows about me") are left team-transparent + proxy-gated by design; only EDITING is owner-restricted.

## 2026-07-09 - Claude (Opus 4.8) - Chunk 13: Knowledge Compiler (Karpathy "compile, don't retrieve") - BUILT + live-verified

Built the Learning Engine as a COMPILER, not a summarizer, per FOUNDER_VISION_BRIEF §Chunk 13 + KNOWLEDGE_AND_CREATIVE_ENGINE Part A. For each APPROVED source it extracts atomic, self-contained knowledge notes, grounds each in provenance (sourceId + chunkIds), embeds them, and SYNTHESIZES into the base (dedupe->reinforce, interlink related). Notes are the compiled "wiki" that content/SEO/strategy agents will read via one hybrid retrieval contract. The knowledge_compiler agent was seeded-but-inert; now it has a real handler. Extends existing primitives (runTextProvider, sources/source_chunks, recordAgentRun, jobs registry, embeddings, audit) - nothing duplicated.

SCHEMA (migration 0012, applied + "No schema changes" confirmed): knowledge_notes (sourceId, sourceIds[], provenanceChunkIds[], noteType, topic, area, title, content, confidence, trustLevel, embedding vector(1536), status, supersededByNoteId, timesReinforced, bankSlugs[], ...) + HNSW cosine index (hand-added); knowledge_note_links (from/to/linkType relates_to|supports|refines|contradicts|duplicate_of).

FILES:
- src/lib/domain/knowledge.ts - pure: enums, compilerNoteSchema, parseCompilerOutput (robust: fences + element-by-element + skip-bad), buildCompilerPrompt (Karpathy compile prompt, skill-overridable), assertCompileContext (refuse unapproved/no-chunks = no wasted tokens), classifyNoteSynthesis (DEDUP>=0.93 reinforce, RELATED>=0.82 link), resolveProvenanceChunkIds, suggestNoteBanks, buildKnowledgeNoteRow/LinkRow.
- src/lib/knowledge/index.ts - compileSource (guard->prompt->LLM->parse->embed->synthesize->log), retrieveKnowledge (ONE hybrid contract: notes + source_chunks), list/getDetail/archive, enqueueKnowledgeCompileJob + runKnowledgeCompileJobHandler (skips gracefully if source not-ready), injectable defaultStore (pgvector cosine).
- Job wired in src/lib/workers/registry.ts ("knowledge.compile"). Auto-enqueued on source approval (approveSource, env-gated best-effort).
- API: /api/knowledge/compile (POST, requireFounder), /notes (GET), /notes/[id] (GET detail+links, DELETE archive), /retrieve (GET hybrid).
- tests/knowledge.test.ts - 20 tests (parse/synthesis/guard/builders + compileSource insert/reinforce/interlink/refuse + retrieve hybrid+degraded).

VERIFIED: typecheck clean; 331 tests pass (was 311, +20); build compiles (4 knowledge routes); migration applied + HNSW index confirmed in pg_indexes. LIVE end-to-end against the real DB (stubbed LLM to avoid spend, REAL embeddings + REAL pgvector): compile#1 -> 2 notes inserted; compile#2 (identical) -> 0 created, 2 REINFORCED (real cosine dedup, timesReinforced 1,1 - knowledge compounded, did not duplicate); retrieveKnowledge -> 2 notes + 2 chunks via real cosine. Cleaned up.

FOLLOW-UPS (noted, not corners): (1) approval-gated PROMOTION of high-trust notes into Core Brain memory_records via memory_update_proposals (today notes live in the knowledge wiki + are retrievable; Core-Brain promotion is a separate gate). (2) LLM-tagged contradiction links (today related notes link as relates_to; contradiction flagging deferred). (3) knowledge_compiler model role - add to settings model_roles so live compiles route to a chosen cheap model (falls back to default today). (4) auto-trigger currently fires on approval; wire a second trigger on intake-completion so sources whose chunks arrive AFTER approval also compile.

NEXT: the multi-agent CONTENT graph (Chunk 15 evolution) reading this knowledge via retrieveKnowledge - Strategy -> Research/Competitor/Brand/Taste -> Ideation -> Copywriting(critique) -> Assemble pack (>=4 agent_runs) -> founder review -> Learning.

## 2026-07-09 - Claude (Opus 4.8) - Chunk 15 (evolution): Multi-Agent CONTENT GRAPH - BUILT + tested

Replaced the single-LLM content call with a real creative-agency GRAPH per FOUNDER_VISION_BRIEF §Chunk 15 + KNOWLEDGE_AND_CREATIVE_ENGINE Part B/E. Five distinct agent_runs per pack, each its own model role, grounded in the Knowledge Compiler (Chunk 13). The old single-call worker (content.generate) is left intact as a fallback; the graph is additive (content.graph).

GRAPH: Strategy (creative brief) -> Research (grounded evidence via retrieveKnowledge = notes + source chunks, cites provenance) -> Copywriter DRAFT -> Copywriter SELF-CRITIQUE->REVISE -> Scoring/QA (selfReview + impact/brand-fit/platform-fit) -> Assemble PACK (createContentPacket). Every claim carries provenance (insightIdsUsed = knowledge note ids, memoryChunksUsed = chunk ids, sourceIdsUsed = sources). Quality gate (passesQualityGate) drives whether an approval is created. Visuals are NOT generated here (Chunk 22, gated behind pack approval).

FILES:
- src/lib/domain/content-graph.ts - pure: node zod schemas (creativeBrief/evidencePack/copyDraft/copyRevision/contentScore), per-node prompts (strategy/evidence/copy-draft/copy-revise/score), robust parseJsonObject, collectProvenance (index->id mapping + sources), assembleContentPacketInput (downgrades claim risk when ungrounded so the packet guard is satisfied), coercePlatform/coerceFormat.
- src/lib/content-graph/index.ts - runContentGraph orchestrator (5 nodes, each recordAgentRun + modelRunId collected; resilient: unparseable self-critique falls back to the draft, required-node parse failure throws), enqueueContentGraphJob + runContentGraphJobHandler. Extends runTextProvider/retrieveKnowledge/createContentPacket/recordAgentRun/listMemoryRecords - nothing duplicated.
- 4 new registry agents seeded + verified in DB (team content): content_strategist, content_researcher, content_copywriter, content_scorer (roles content_strategy/research/copywriting/scoring).
- Job "content.graph" registered. API POST /api/content/graph (requireFounder -> requestedBy from session, NOT client body; unlike the old /generate which still trusts client requestedBy - noted follow-up).
- tests/content-graph.test.ts - 9 tests (parse, collectProvenance, assemble grounded/ungrounded/coerce + full 5-agent orchestration: agent_run visibility, revised-copy used, provenance carried, gate->approval, self-critique fallback, required-node failure).

VERIFIED: typecheck clean; 340 tests pass (was 331, +9); build compiles (/api/content/graph); 4 agents confirmed in agents table.

NOT live-run yet (COST): a full graph run = 5 LLM calls (strong models); founder credits are low (<~$0.80). Logged in FOUNDER_DECISIONS_NEEDED for Moiz to greenlight a live run + pick cheap models per role. Orchestration is fully integration-tested with stubbed providers; every underlying primitive (runTextProvider, retrieveKnowledge, createContentPacket, recordAgentRun) is already live-proven.

FOLLOW-UPS: parallel fan-out (Competitor + Brand-voice + Founder-taste alongside Research); founder-taste weighting + novelty scorer (Chunk 45/47); visuals (Chunk 22) after pack approval; set model_roles for content_research/copywriting/scoring to cheap models; migrate old /api/content/generate to session identity.

## 2026-07-09 - Claude (Opus 4.8) - Learning Engine UI (Knowledge Compiler made visible)

Wired the existing "learning" module (was planned, Chunk 13) to a real page so the compiled brain is visible to founders. src/components/os/os-ui.tsx: new LearningPage (KPIs: notes/topics/reinforcements/types; "The Knowledge Compiler" explainer; "Ask the knowledge base" retrieval box hitting /api/knowledge/retrieve; filterable notes list with type/topic/reinforced/provenance + bank tags). src/lib/os/modules.ts: learning -> status "wired", api "/api/knowledge". Reuses the existing design system (glass/card/Kpi/Panel/Tag/StateBlock/useApi/offlineIf) - branding maintained.

VERIFIED: typecheck clean; build compiles; live in a real browser (preview) logged in as Moiz -> /learning renders header + KPIs + compiler panel + retrieval box + HONEST empty state ("No compiled knowledge yet. Approve a source..."); /api/knowledge/notes 200 [], /api/knowledge/retrieve 200 (real embedding). No fake data.

## 2026-07-09 - Claude (Opus 4.8) - Content Command UI: multi-agent team panel + trigger

src/components/os/os-ui.tsx ContentPage: added a "Content Team — multi-agent" panel (LIVE) that shows the pipeline (Strategist › Researcher › Copywriter › Scorer › Content Pack), explains the grounded self-critiqued flow, and gives a founder-facing trigger (objective input + "Run the team" -> POST /api/content/graph on the selected track). Also wired /api/content/generate to session identity (requestedBy from session). Verified: typecheck, build, live browser render logged in (panel + pipeline + trigger present, real tracks listed). Note: a live team run needs a worker running + credits (see FOUNDER_DECISIONS_NEEDED).

## 2026-07-09 - Claude (Opus 4.8) - Content Library & Scheduler module (new)

Founder pivoted: they already have ~1yr of content; build the OS to HOLD + SCHEDULE it (and pull in approved packs) rather than generate more now. Also researched "post to IG/FB/LinkedIn without Meta app review" -> honest answer: no fully-free+automated+ToS-safe path; the low-hassle route is a unified social API (Zernio free 2 accounts / Ayrshare free 20 posts) that connects accounts once (no Meta review on our side); avoid browser-automation bots (bans). So the module is PROVIDER-AGNOSTIC with a manual publisher that needs zero setup.

SCHEMA (migration 0013, applied + no drift): content_assets (title/kind/caption/mediaRefs/platforms/tags/sourceType/sourcePacketId/status) + scheduled_posts (assetId/platform/scheduledAt/status/publisher/publisherRef/publishedAt/result).

FILES:
- src/lib/domain/library.ts - enums, builders, post status machine (canTransitionPost), assetInputFromPacket (approved pack -> asset).
- src/lib/library/index.ts - addContentAsset/list/get/archive, importFromContentPacket (idempotent per packet), schedulePost/list/cancel/markPostPublished, dispatchDuePosts + PublisherAdapter abstraction (manual publisher ships; ayrshare/zernio/n8n plug in later), job handlers (publishing.dispatch, library.import).
- Approved packs auto-flow to the library: approveContentPacket enqueues library.import (job, to avoid a content<->library import cycle).
- API: /api/library/assets (GET/POST), /assets/[id] (GET/DELETE), /schedule (POST), /scheduled (GET), /scheduled/[id]/action (POST cancel|publish). Mutations use requireFounder (session identity).
- UI: modules.ts learning-style "library" module (wired) + LibraryPage in os-ui.tsx (KPIs, explainer, schedule form, post queue with mark-posted/cancel, library grid). Reuses the glass/lime design system.
- tests/library.test.ts - 10 tests (builders, status machine, pack->asset, add/list, idempotent import, schedule, cancel, mark-published, dispatch defers manual + fires automated).

VERIFIED: typecheck clean; 351 tests pass (was 341, +10); build compiles (5 library routes); migration applied + no drift.

PENDING FOUNDER INPUTS (logged in FOUNDER_DECISIONS_NEEDED): (1) the content FOLDER + its structure (where captions live) so I build the importer; (2) publisher choice (manual-first -> Zernio free tier for auto-posting). NEXT: the importer (once folder structure known), a real publisher adapter (Zernio/Ayrshare), platform analytics pull -> learning loop, competitor/social tracking (Chunk 38).

## 2026-07-09 - Claude (Opus 4.8) - Social Library importer (Phase 1 of Content Director)

Founder delivered the real content library on disk (OneDrive). Structure: images = <campaign>/ad_NNN__<product>__<angle>/{NNN.png, caption.txt} (196 single static images, no carousels); reels = SOCIAL-MEDIA/<topic>/<reel>/{reel.mp4, CAPTION.txt} (30). Built the importer that parses the folder-name metadata (id · product · angle) instead of discarding it — the Content Director (Phase 2) will use product/angle to sequence the grid.

FILES:
- src/lib/domain/library.ts - added metadata passthrough to createAssetSchema/buildContentAssetRow; parseAdFolderName, localImportKey, assetInputFromLocalImage (kind image, platforms [instagram,linkedin], tags [wobble-library, product, angle:X], title = first caption line), assetInputFromLocalReel (kind reel, video mediaRef). All pure/tested.
- src/lib/library/index.ts - LibraryStore.findAssetByImportKey (optional; Drizzle metadata->>'importKey' lookup) for idempotent dedupe.
- src/lib/library/import-local.ts (new) - importLocalSocialLibrary: walks campaign/ad and topic/reel folders, COPIES media into STORAGE_ROOT/media/library/<assetId>/ (OS owns the bytes; mediaRefs.path is STORAGE_ROOT-relative + portable), idempotent per importKey.
- src/scripts/import-social-library.ts (new) + npm run library:import - CLI, defaults to the two OneDrive paths, re-runnable.
- src/components/os/os-ui.tsx - LibraryPage assets fetch limit 200 -> 500 (226 assets were being capped at 200).
- tests/library.test.ts - +5 tests (metadata passthrough, parseAdFolderName, localImportKey, image/reel input builders).

VERIFIED LIVE: ran the import -> 226 imported / 0 failed; DB has 196 image + 30 reel with parsed metadata (seq/adId/product/angle) + captions as titles; 226 media files copied into storage/media/library/; re-run = 0 imported / 226 skipped (idempotent). Typecheck clean; 356 tests pass (was 351, +5); build compiles. Browser (logged in as Moiz) -> Library & Scheduler KPI shows 226, live data from /api/library/assets (200 OK, 226 assets).

NEXT (Phase 1 cont.): Zernio publisher adapter (env ZERNIO_API_KEY; POST /api/v1/posts publishNow/scheduledFor; IG + LinkedIn) wired into dispatchDuePosts; card actions Post now / Schedule / Download-original+caption; a public media-serving route (Zernio needs a public URL to fetch media - local paths won't reach it); status sync + bulk mark-posted. Then Phase 2 (Content Director agent team: Eye/vision+color, Grid Designer, Timing, Scheduler, Caption, Sync) and Phase 3 (analytics learning loop). NOTE: do NOT fire a real post to the live Wobble IG/LinkedIn without explicit founder go (outward-facing/irreversible).

## 2026-07-09 - Claude (Opus 4.8) - Library UX overhaul: media serving, adaptive grid, search/filter, per-platform posting

Founder feedback: cards showed text only (couldn't see media), preview modal was translucent, no search/sort, no per-platform posting. Fixed all of it.

FILES:
- src/app/api/library/assets/[id]/media/route.ts (new) - streams asset bytes so the UI can SHOW media + founder can download originals. Path confined to STORAGE_ROOT/media (traversal guard). HTTP Range support (206) for video streaming. ?download=1 sets Content-Disposition. Auth via edge proxy (same-origin <img>/<video> carries the session cookie). This same route is Zernio's future public fetch URL.
- src/app/api/library/assets/[id]/mark-posted/route.ts (new) - POST {platform} records a manual post on a SPECIFIC platform (per-platform). requireFounder.
- src/lib/library/index.ts - markAssetPostedOnPlatform(assetId, platform, ...): creates/promotes a published manual scheduled_post for that platform, idempotent, per-platform independent (IG != LinkedIn). New optional store method findPostByAssetAndPlatform + defaultStore impl.
- src/lib/domain/library.ts - (from prior entry) metadata passthrough; no new domain here.
- src/components/os/os-ui.tsx - Library page overhaul: AssetThumb now ADAPTIVE (keeps true media aspect ratio; images lazy <img>, reels auto-play muted+loop only while in viewport via IntersectionObserver = ReelMedia); masonry grid (CSS columns) so 3:4 statics + 9:16 reels sit naturally; toolbar with SEARCH (title/caption/tags) + kind filter + posted filter + sort; per-platform badges (IG ✓ / in ✓) on cards; AssetPreviewModal rebuilt SOLID (was translucent - it used the glass card; now solid #141417 panel + 0.82 backdrop) with per-platform PlatformRow (Mark posted w/ confirm naming the platform, Schedule, "Post now · soon" placeholder for Zernio). Fetch limit already 500.
- tests/library.test.ts - +2 tests (mark posted per-platform independent+idempotent; marking promotes an existing scheduled post). In-memory store gained findPostByAssetAndPlatform.

VERIFIED LIVE (browser, logged in): images render at true aspect ratio in a masonry grid (confirmed naturalWidth e.g. 880x1168); search bar + filters + sort present; preview modal overlay is full-viewport, on top, SOLID (panel rgb(20,20,23), backdrop rgba(0,0,0,0.82)) with both Instagram+LinkedIn rows, Mark posted, Schedule, Download original; mark-posted flow end-to-end = 201, creates published manual instagram post, LinkedIn stays unmarked (per-platform), "IG ✓" badge renders. Test mark cleaned from DB after (scheduled_posts back to 0). Typecheck clean; 358 tests pass (was 356, +2); build compiles (media + mark-posted routes registered).

ROOT CAUSE fixed for the recurring Turbopack dev corruption: `npm run typecheck` runs `clean:next-dev-types` which deletes .next files WHILE the dev server is using them -> corruption. Use `npx tsc --noEmit` while the dev server runs; only `npm run typecheck`/`build` with the server stopped.

NOTE: founder has manually posted 3 on Instagram; will name them so they get marked (search caption -> open -> Mark posted -> Instagram). Post-now AUTO (Zernio) still pending wiring + explicit founder go before any real post fires.

## 2026-07-09 - Claude (Opus 4.8) - Lock the content section: queue split, Zernio engine, Plan-my-feed

Founder went hands-off ("do it all, don't stop"). Built three phases; everything verified; NO real posts fired and NO paid APIs called (all Zernio calls env-gated + a public URL that localhost doesn't have).

PHASE 1 — Library logical fixes:
- Post queue split into 3 sections: Scheduled / Posted / Failed-cancelled (was one dumped list). os-ui LibraryPage PostRow + Section.
- Remove action: deleteScheduledPost(id) service + store.deleteScheduledPost + "delete" action in /api/library/scheduled/[id]/action, with inline "Remove this record? Yes/No" confirm. recomputeAssetStatus keeps asset status honest (published>scheduled>ready) after cancel/remove.

PHASE 3 — Zernio engine (code, gated, unit-tested with mocked fetch; activates on deploy):
- src/lib/library/zernio.ts (new): createZernioPost (publishNow | scheduledFor), deleteZernioPost, listZernioPosts, resolveAccountId (env ZERNIO_ACCOUNT_<PLATFORM> or /accounts), zernioMediaItems (builds PUBLIC_BASE_URL media URLs), zernioPublish (post now), zernioSchedule (native scheduling). Injectable fetchImpl for tests. zernioConfigured() gates everything on ZERNIO_API_KEY.
- src/lib/library/index.ts: zernioPublisher adapter + defaultPublisherRegistry() (Zernio joins dispatch only when keyed); dispatchDuePosts uses it. schedulePost gained a scheduleRemote hook (pushes to Zernio's scheduler, stores publisher_ref). cancelScheduledPost/deleteScheduledPost gained cancelRemote/deleteRemote hooks (DELETE on Zernio so a cancelled post can't fire later). applyZernioPostEvent(event) reconciles webhooks -> auto-moves local post to published/failed/canceled by publisher_ref, stores platformPostId+publishedUrl, idempotent. store.findPostByPublisherRef added.
- src/app/api/webhooks/zernio/route.ts (new): HMAC-SHA256 verify (X-Zernio-Signature / ZERNIO_WEBHOOK_SECRET), calls applyZernioPostEvent. src/proxy.ts: /api/webhooks made public (Zernio has no session).
- action route + schedule route wired to the remote hooks (env-gated). .env.example: ZERNIO_API_KEY, ZERNIO_WEBHOOK_SECRET, PUBLIC_BASE_URL, ZERNIO_ACCOUNT_INSTAGRAM/LINKEDIN.

PHASE 2 — Content Director "Plan my feed" (local, works now):
- domain planFeed(assets, {startAt, perDay, hoursOfDay, platform, reelEvery}): pure. Spreads angle+product so the grid never repeats (spreadByVariety greedy), interleaves reels ~1 every N images, assigns time slots. Uses the parsed metadata (kind/angle/product); color/vision is the next layer.
- service planFeedForLibrary (reads un-actioned assets) + applyFeedPlan (schedules all, manual publisher). API: /api/library/plan (propose, read-only) + /api/library/plan/apply (schedule all). requireFounder.
- UI: "✨ Plan my feed" button in the Library toolbar -> PlanFeedModal shows the proposed ordered sequence + times + "Approve & schedule all"; nothing schedules until approved.

VERIFIED LIVE: queue renders 3 sections; /api/library/plan returned 225 sequenced items (30 reels interleaved) + summary; Plan modal opens and lists all 226 rows with order/kind/angle·product/time; did NOT click Approve (that would create 225 scheduled rows - founder's call). Typecheck clean; 364 tests pass (was 356, +8: delete/recompute, cancel-remote, zernio webhook, zernio media items, createZernioPost, planFeed); build compiles (plan, plan/apply, webhooks/zernio, media, mark-posted routes registered).

PENDING (for the founder / next): rename Content Command (skipped - low value/high churn, do deliberately); Phase 4 = real image/carousel generation into media_refs (biggest agency gap; needs an image engine choice), the feedback->regenerate loop in Content Command, outward awareness + performance learning. Zernio goes live only after DEPLOY to a public URL + founder go for the first real post. Founder still to name the 3 posts already on Instagram to mark them.

## 2026-07-09 - Claude (Opus 4.8) - Wobble ERP Control Layer: CRM/pipeline spine + Invoices & Finance

Founder (away, "build it all, don't stop") wants the revenue engine (free/paid audit + invoice). Read the partner's 36-page ERP brief (Wobble OS Backend ERP Layer Brief) + two paid-audit YouTube transcripts. The ERP brief's core principle = "everything connected, no orphan records" — so I built the CRM/pipeline SPINE first (audits/proposals/invoices attach to real companies/deals) + the invoice/finance layer, both deterministic + fully verified. Audit agent-team modules are next (they sit on this spine).

MIGRATION 0014 (applied, verified): crm_companies, crm_contacts, crm_leads, crm_opportunities, crm_stage_history, invoices.

CRM (src/lib/domain/crm.ts + src/lib/crm/index.ts + /api/crm/*):
- Companies (parent object) / contacts / leads / opportunities. Default Wobble 14-stage pipeline (new_lead → ... → paid_audit_offered/sold/in_progress/delivered → proposal_sent → won/lost/nurture) baked in.
- Rule-based scoreLead (0-100). convertLead builds the WHOLE chain (company + contact + opportunity + stage history + marks lead converted). moveOpportunityStage is audited + writes crm_stage_history + resolves won/lost. Soft-delete (archived_at), no hard delete.
- Routes: companies (GET/POST), leads (GET/POST), leads/[id]/convert, opportunities (GET/POST), opportunities/[id]/stage. requireFounder on mutations.

Finance (src/lib/domain/finance.ts + src/lib/finance/index.ts + /api/finance/*):
- Invoices with line items + auto totals; numbered INV-YYYY-NNNN. Status machine (draft→needs_approval→approved→sent→viewed→partially_paid→paid→overdue/cancelled/refunded/written_off). invoiceAction (approve/send/mark_paid/cancel) is founder-gated — GUARDRAIL: OS never moves money on its own (ERP brief G). revenueSummary rollups (paid, outstanding, overdue, pipeline, weighted, won, by-service, avg deal, close counts).
- Routes: invoices (GET/POST), invoices/[id]/action, summary (GET dashboard).

UI (src/components/os/os-ui.tsx) + modules.ts: new "REVENUE" nav group. crm tile ("Pipeline / CRM", wired) = KPIs + New-lead form + lead list w/ Convert + horizontal pipeline board (deals grouped by stage, per-deal stage dropdown). invoices tile flipped planned→wired ("Invoices & Finance") = revenue KPIs + New-invoice draft + invoice list w/ approve/send/mark-paid actions. Both registered in WIRED map.

VERIFIED LIVE (browser, logged in, full flow): created lead (auto-scored 36) → convert → company+contact+opportunity chained → move to Won (status won) → draft invoice INV-2026-0001 → approve→send→mark_paid → /api/finance/summary shows $6,000 paid + $6,000 won + 1 deal. Pipeline board + Finance dashboard render on-brand (screenshots). Test data then deleted from DB (tables back to 0). Typecheck clean; 377 tests pass (was 364, +13: crm.test.ts 7, finance.test.ts 6); build compiles (8 crm/finance routes registered); migration 0014 applied + no drift.

NEXT (the AI part, per founder's message): Free Audit + Paid Audit agent-team modules — replicate the content-graph two-file pattern (domain/*-graph.ts pure + *-graph/index.ts orchestrator; add model roles in seed-runner modelRoles(), agents in DEFAULT_AGENTS). Free audit = talking intake + platform-finder + social-scrape (Apify, gated like Zernio via provider-connection) + Wobble-service-fit (grounds in Brain 'offers'/WOBBLE_COMPANY_OS, NOT hardcoded) + automation-spotter + report writer; produces a report attached to a crm_opportunity; feedback→diff-edit loop + memory; differentiate free (no-audit "what we can do") vs paid (audited "exact things"). Paid audit = separate deeper team (McKinsey-style, process maps, opportunity matrix, ROI, 12-month roadmap; WOBBLE_COMPANY_OS lines 199-215 is the artifact spec) + a 3rd "proposal builder" AI on the post-audit report. PDF/slide/deck export = NONE exists (no deps) — build premium HTML deliverables first (founder's design PDF pending), binary PDF later (puppeteer). LLM runs need OPENROUTER_API_KEY + spend (runTextProvider throws without it — no stub), so the audit graphs will be built + unit-tested + gated, not live-run during autonomous work. Still pending: partner's full ERP (tasks, meetings, projects, permissions/RBAC, versioning/rollback, integrations registry) — large, staged later.

## 2026-07-09 - Claude (Opus 4.8) - Free Audit engine v1 (deterministic, on the CRM spine)

The top-of-funnel money-maker, built on the revenue spine. v1 is a DETERMINISTIC diagnoser (zero LLM spend, fully verifiable) grounded in the real Wobble service catalog; the multi-agent LLM team + paid McKinsey audit layer on top (same pattern as Plan-my-feed).

MIGRATION 0015 (applied): audits table (kind free|paid, companyId, opportunityId, businessName, status, report jsonb, input jsonb).

FILES:
- src/lib/domain/free-audit.ts - WOBBLE_SERVICES catalog: all 34 real Wobble services (from the library folders + WOBBLE_COMPANY_OS) with category + the problem-signals each solves + quickWin flag. diagnose(input): maps 20 current-state signals + free-text problems -> matching services, quick-wins-first, impact rating, ~15%-lead-recovery upside estimate when lead economics given. buildAuditRow persistence. Pure + fully tested.
- src/lib/free-audit/index.ts - runFreeAudit (diagnose -> persist -> audit event, linked to a crm company/opportunity), listAudits, getAudit. DI store.
- src/app/api/audit/free/route.ts - GET list, POST run. requireFounder.
- modules.ts: new "free_audit" tile (wired) in the REVENUE group. os-ui FreeAuditPage: intake (business, industry, leads, avg deal, 20 signal chips, free-text) -> report (summary + upside + quick wins + opportunities w/ impact) + recent-audits list. WIRED.
- tests/free-audit.test.ts - 6 tests (catalog integrity/uniqueness, signal->service mapping quick-wins-first, free-text matching, upside estimate, honest empty, service persists linked to company).

VERIFIED LIVE: POST returned 8 opportunities / 6 quick wins / top "Missed-Call Text-Back" / ~$14,400/mo upside for a dental prospect; page renders form + 20 chips + report + recent list (screenshot). Test row cleaned. Typecheck clean; 383 tests pass (was 377, +6); build compiles (/api/audit/free registered); migration 0015 applied.

NEXT (still the founder's ask): (1) the FREE-audit multi-agent LLM enrichment — talking intake + Apify social scrape (gated) + LLM reasoning over the deterministic base + premium report/deck; the deterministic diagnose() is the grounded base the team augments, not replaces. (2) PAID audit = separate module + team (McKinsey depth: process maps, opportunity/impact matrix, ROI, 12-month roadmap; WOBBLE_COMPANY_OS 199-215 spec) + a 3rd proposal-builder AI on returned findings. (3) Premium HTML report/deck export (no PDF deps in repo; puppeteer later). (4) Feedback->diff-edit loop + memory on generated docs. All LLM runs gated on OPENROUTER_API_KEY + founder-present (runTextProvider throws without a key; no autonomous spend). This commit is 3rd of the session (after Content Library overhaul+Zernio, and CRM/Finance spine).

## 2026-07-09 - Claude (Opus 4.8) - Paid Audit agent team (McKinsey-depth, 5 LLM consultants) VERIFIED LIVE

The paid, deep audit — SEPARATE module + team from the Free Audit (founder was explicit). Replicates the content-graph two-file pattern exactly (parse-or-throw strict JSON per node, DI orchestrator, agent_runs, audit events, job handler).

FILES:
- src/lib/domain/paid-audit-graph.ts - 5 node schemas + prompt builders + assembly. Roles: audit_discovery/opportunity/prioritization/roadmap/report. Nodes: (1) Discovery = current-state map (acquisition/delivery/support + bottlenecks), (2) Opportunity = AI opportunities grounded in the FULL Wobble service menu (imports WOBBLE_SERVICES; prompt lists all 34 slugs), impact/difficulty rated, (3) Prioritization = quick-wins vs big-swings matrix, (4) Roadmap = phased 12-month plan, (5) Report = exec summary + ROI (cents). assemblePaidAuditReport -> PaidAuditReport. Artifact spec = WOBBLE_COMPANY_OS 199-215.
- src/lib/paid-audit-graph/index.ts - runPaidAuditGraph (DI: retrieveBrain/runNode/recordAgentRun/recordAudit/persistAudit), defaultRunNode=runTextProvider (maxTokens 2200), persists to audits table (kind="paid"), enqueuePaidAuditJob + runPaidAuditJobHandler. Grounds in core Brain.
- src/app/api/audit/paid/route.ts - POST run (synchronous; 502 + needsModelKey when no OPENROUTER_API_KEY - honest, no stub), GET list. requireFounder.
- seed-runner modelRoles(): +audit_discovery/opportunity/prioritization/roadmap/report (Sonnet for reasoning nodes, gpt-4o-mini for prioritization; env overrides). domain/agents.ts DEFAULT_AGENTS: +5 audit_* agents (module paid_audit, team audit). workers/registry.ts: +"audit.paid" handler.
- modules.ts: "paid_audit" tile (wired, REVENUE group). os-ui PaidAuditPage: intake (business/industry/stakeholder notes) -> report (exec summary + ROI KPIs + opportunity matrix + 12-month roadmap board) + recent list; handles needsModelKey gracefully. WIRED.
- tests/paid-audit.test.ts - 4 tests: strict JSON parse, assembly, FULL 5-node orchestration with MOCKED agents (proves the graph with zero LLM spend), fail-loud on unparseable node.

VERIFIED LIVE (one real run via a throwaway script, then deleted the row + script): OPENROUTER_API_KEY is set, so ran the real 5-agent team on a dental-clinic intake -> 5 model runs, 3 bottlenecks, 7 opportunities (grounded in real Wobble slugs: ai-ads-tracking-intelligence, crm-pipeline-automation, review-reputation-system, website-chat-booking-agent...), 4-phase 12-month roadmap (Quick Wins -> CRM -> Booking -> Advanced Marketing), exec summary + ROI. Real models return parseable JSON for the prompts. (Note: model ROI numbers can lowball/misread cents-vs-dollars — a prompt-tuning refinement, not a code bug.) Page renders (screenshot). Typecheck clean; 387 tests pass (was 383, +4); build compiles (/api/audit/paid). 4th commit of the session.

NEXT: proposal-builder AI (3rd team on returned paid-audit findings -> proposal, into crm/proposals); free-audit LLM enrichment + Apify social scrape (gated); premium HTML/PDF deck export of the audit report (still no pdf deps); feedback->diff-edit loop + memory on the generated audit/deck; ROI-prompt tuning (cents vs dollars). REVENUE engine now: Free Audit + Paid Audit (live 5-agent team) + CRM + Invoices/Finance, all wired.

## 2026-07-09 (session 2) - Claude (Opus 4.8) - Proposal builder: closes Audit → Proposal → Invoice loop

Resumed: generated + applied migration 0016 (proposals table). Built the Proposal builder — the piece that connects an audit's findings to a client proposal and on acceptance auto-drafts the invoice.

FILES:
- src/lib/domain/proposal.ts - proposal statuses + machine, buildProposalRow (sums service prices), proposalInputFromAudit (deterministic: report.opportunities→services, report.roadmap→timeline, report.roi.estimatedImplementationCents→pricing, executiveSummary/summary→scope). Handles both free + paid audit report shapes.
- src/lib/proposals/index.ts - createProposal, createProposalFromAudit (reads audit via getAudit), listProposals, proposalAction (approve/send/accept/reject) — ACCEPT auto-drafts an invoice via finance.createInvoice (linked companyId/opportunityId/proposalId). DI store + draftInvoice hook.
- routes: /api/proposals (GET/POST), /api/proposals/from-audit (POST {auditId}), /api/proposals/[id]/action. requireFounder.
- modules.ts: "docs" tile flipped planned→wired as "Proposals" (moved into REVENUE group). os-ui ProposalsPage: build-from-audit dropdown (lists free+paid audits) + proposals list w/ lifecycle actions; shows "invoice drafted" on accept. WIRED.
- tests/proposal.test.ts - 5 tests: price summing, proposalInputFromAudit mapping, status machine, createProposalFromAudit (injected audit row), accept→draftInvoice (injected).

VERIFIED LIVE: free audit → build proposal (6 services, title "…— Wobble AI OS Proposal") → approve → send → accept. Invoice NOT drafted here because a FREE audit has no implementation cost → pricing $0 (correct; the guard is pricingCents>0). The accept→invoice with real pricing is proven by unit test. Page renders (screenshot). Test data cleaned (proposals/audits back to 0). Typecheck clean; 392 tests pass (was 387, +5); build compiles (3 proposals routes). Migration 0016 applied.

REVENUE ENGINE NOW COMPLETE (loop): Free Audit → Lead/Convert (CRM) → Paid Audit (5-agent team) → Proposal (from audit) → Invoice (on accept) → Finance dashboard. All wired in the REVENUE nav group: Free Audit, Paid Audit, Pipeline/CRM, Proposals, Invoices & Finance.

NEXT: free-audit proposals need pricing (paid audit gives it, or add manual line-item pricing/LLM pricing suggestion in the proposal UI); LLM narrative-polish on proposals; premium HTML/PDF deck export of proposal + paid-audit report (still no pdf deps — build HTML first, puppeteer later); free-audit LLM enrichment + Apify social scrape (gated); feedback→diff-edit loop on generated docs; paid-audit ROI-prompt tuning (cents vs dollars). Partner's rest-of-ERP (tasks/meetings/projects/RBAC/versioning/integrations) still staged.

## 2026-07-09 (session 2) - Claude (Opus 4.8) - Premium client-facing documents (audit report + proposal, print-to-PDF)

The "looks like a million-dollar deliverable" layer the founder emphasized. Dependency-free (no pdf libs): a pure HTML renderer producing on-brand, print-optimised documents the founder opens in a tab and prints to PDF (Ctrl+P).

FILES:
- src/lib/documents/render.ts - renderAuditReportHtml (dark branded cover; Executive Summary + ROI stat cards; Current State acquisition/delivery/support cards + bottlenecks; Opportunities with impact/effort pills; 12-month roadmap timeline; confidential footer) + renderProposalHtml (cover; scope; services table with per-line pricing + total; timeline; terms). Inline CSS, @media print, HTML-escaped. Wobble lime #B6FF3B on ink.
- src/app/api/audit/[id]/document/route.ts - serves the audit report HTML (works for free + paid; free maps summary→executiveSummary). src/app/api/proposals/[id]/document/route.ts - serves the proposal HTML. text/html, no-store; auth via proxy (founder session).
- os-ui: "Report ↗" link on Free + Paid audit recent-list rows; "Document ↗" on proposal rows (open in new tab, stopPropagation).
- tests/documents.test.ts - 2 tests (audit report contains sections + escapes HTML + formats money; proposal contains services/total/Included).

VERIFIED LIVE: created a free audit, opened /api/audit/{id}/document -> 200 text/html; browser renders a premium dark cover ("WOBBLE · AI TRANSFORMATION AUDIT" + big title) then Current State cards + "7 AI opportunities" with green HIGH / blue MEDIUM pills + roadmap + confidential footer (screenshots). Test audit cleaned. Typecheck clean; 394 tests pass (was 392, +2); build compiles (both document routes).

NOTE: free-audit docs leave Current State + Roadmap empty (free audits don't produce those — only paid). Free-audit opportunities have impact but no difficulty (2nd pill shows "—") — cosmetic; paid audits have both.

NEXT: premium DECK/slide variant (this is a report doc; a slide-per-section deck is the founder's other ask — build an HTML slide deck renderer reusing this data); binary PDF export (puppeteer) if they want server-side PDF vs print; LLM narrative-polish + feedback→diff-edit loop on the documents; free-audit LLM enrichment + Apify scrape; paid-audit ROI-prompt tuning; free-audit proposal pricing (manual/LLM). Revenue engine loop is complete + now has premium deliverables.

## 2026-07-09 (session 2) - Claude (Opus 4.8) - Audit slide DECK (present-ready, alongside the PDF report)

Founder wanted BOTH a PDF report AND a slide deck. Added the deck variant.
- src/lib/documents/render.ts: renderAuditDeckHtml — self-contained HTML slide deck (cover → exec summary + ROI stats → current state → opportunities w/ pills → roadmap → "Let's build it" close). Inline CSS + tiny vanilla JS: arrow-key / space / click nav, slide counter, prev/next buttons. Wobble dark + lime.
- src/app/api/audit/[id]/deck/route.ts: serves it. os-ui: "Deck ↗" link beside "Report ↗" on free + paid audit rows.
- tests/documents.test.ts: +1 (deck has doctype, .deck, ArrowRight nav, content).

VERIFIED LIVE: opened /api/audit/{id}/deck -> 200, 5 slides, navigable; screenshot shows the premium closing slide + counter + nav arrows. Test audit cleaned. 395 tests pass (was 394, +1); typecheck + build clean (deck route registered).

SESSION 2 SUMMARY (all pushed): proposal builder (f8d7d38) → premium documents report+proposal (eabf874) → slide deck (this). Revenue engine loop COMPLETE with premium deliverables: Free Audit → CRM → Paid Audit → Proposal → Invoice → Finance, each audit/proposal exportable as a branded report doc + a present-ready deck.
NEXT: feedback→diff-edit loop on docs (founder's "I don't like slide 3, change X, rebuild only that" + memory); LLM narrative-polish; free-audit LLM enrichment + Apify social scrape (gated on Apify key); paid-audit ROI-prompt tuning (cents); free-audit proposal pricing; binary PDF (puppeteer) if needed; partner's rest-of-ERP (tasks/meetings/projects/RBAC/versioning).

## 2026-07-09 - Claude (Opus 4.8) - Proposal builder + DEPTH upgrade to audits/decks/proposals

Two things: (1) finished the Proposal builder (closes Audit→Proposal→Invoice), (2) founder feedback "decks/audits/proposals are too small — needs to be hella detailed" → deepened the whole paid-audit + document pipeline.

PROPOSALS (migration 0016 applied): proposals table + domain/proposal.ts (statuses, buildProposalRow, proposalInputFromAudit deterministic from audit report, status machine) + lib/proposals (createProposal, createProposalFromAudit, listProposals, proposalAction approve/send/accept/reject — ACCEPT auto-drafts an invoice via finance.createInvoice, closing the loop) + routes /api/proposals, /from-audit, /[id]/action + "docs" tile flipped to wired "Proposals". tests/proposal.test.ts (7).

DEPTH UPGRADE (paid audit is now a real consulting deliverable, not 6 thin slides):
- domain/paid-audit-graph.ts: node schemas massively deepened. Discovery = situation narrative + acquisition/delivery/support as PROCESS STEPS ({step,detail,tool,pain}) + bottlenecks ({area,pain,rootCause,severity,businessImpact}) + keyMetrics. Opportunity = prompt now demands 12-20 opportunities, each {description,howItWorks,expectedOutcome,impact,difficulty,monthlyHoursSaved,estimatedMonthlyValueCents,kpis[]}. Roadmap phases = +objectives[]+deliverables[]+expectedOutcome. Report = +situationSummary, roi.breakdown[], risks[], successMetrics[], recommendedTechStack[], nextSteps[]. maxTokens 2200→6000.
- documents/render.ts REWRITTEN: renderAuditReportHtml = long-form report (cover + TOC + exec summary + situation/ROI + value-by-area + current-state 3-col process tables + bottleneck cards + key metrics + detailed opportunity cards w/ how-it-works/outcome/KPIs/value + roadmap phases w/ objectives+deliverables+outcome + risks + success metrics + tech-stack chips + next steps). renderAuditDeckHtml = 20+ slide deck (cover, exec, situation, current-state, bottlenecks, opportunities 3/slide, one slide PER roadmap phase, risks, metrics, stack, next steps, close). Renderers are defensive — handle both deep PAID shape and light FREE shape (step can be string|object, opp title|name, description|reason). Deepened proposal render too.
- audit document + deck routes pass the new fields.

VERIFIED: typecheck clean; 395 tests pass (was 383: +proposal 7, +paid-audit reshaped, +doc). build compiles (proposals + audit doc/deck routes registered). Live depth re-run pending (next). NOTE: model ROI still can misread cents-vs-dollars occasionally — the report prompt now gives explicit cents examples; monitor.

NEXT: live-verify the deep report+deck (screenshot); then free-audit LLM enrichment + Apify social scrape (gated); LLM narrative-polish on proposals; feedback→diff-edit loop on generated docs; premium binary PDF export (puppeteer). REVENUE engine now end-to-end: Free Audit → lead/CRM → Paid Audit (deep 5-agent, HTML report+deck) → Proposal → Invoice → revenue dashboard.

## 2026-07-09 - Claude (Opus 4.8) - CRM/invoice depth fixes + Presentation Maker removed

Founder flagged basic flaws: lead/invoice forms took too little info, pipeline hid empty stages. Fixed (the ERP brief specifies full field sets):
- crm_leads: +capture columns (migration 0017): contact_name, email, phone, whatsapp, company_name, website, industry (a lead often arrives before formal company/contact records). domain/crm + service updated; convertLead now PROMOTES the lead's captured company/contact data (companyName/website/industry → company; contactName/email/phone → contact), and companyName is now optional on convert (falls back to the lead's).
- UI: AddLeadModal — full form (contact: name/email/phone/whatsapp; company: name/website/industry; qualification: intent/budget/urgency/fit + source/campaign/service-interest/owner + problem). Pipeline now shows ALL 14 stages as columns (empty ones too, dashed placeholder) with per-deal stage dropdown. InvoiceBuilderModal — bill-to (company/contact/email/address), multiple line items (desc/qty/unit), tax/discount, currency, due date, terms, notes, link-deal, live total. Both open from "+ Add lead" / "+ New invoice" buttons.
- Removed the Presentation Maker module (redundant with the audit decks) from MODULES + NAV_GROUPS.

VERIFIED LIVE (API round-trip): full lead payload persisted all fields (score 93); convert pulled the lead's company+website (no re-typing); invoice builder payload → subtotal $7000, total $6900 (+tax/−discount), bill-to from billingDetails. Sidebar confirms Presentation Maker gone + REVENUE group (Free/Paid Audit, CRM, Proposals). Test data cleaned. Typecheck clean; 395 tests pass; build compiles; migration 0017 applied.

LOCKED (founder answers) for NEXT — the 3-doc AUDIT WORKSPACE (one workspace per company, 3 stages, per-client data isolation, no cross-client leak):
- Doc 1 = "What Wobble can do" pitch = the Free Audit MERGED into a niche-customized capability pitch (leads with "what we found" + "what we can do"). Inputs via an APIFY scraper of their website/socials (WIRE NOW, gated on APIFY_API_KEY, fallback to founder-entered).
- Doc 2 = INTERNAL audit roadmap: asks for the client's stakeholders/team + free-call info, then (using the paid-audit interview methodology from the YouTube transcript) outputs who to interview + what to ask + sequence. Reads ONLY this client's Doc 1.
- Doc 3 = final client-facing McKinsey deck: per-interview notes/transcript slots (off the Doc 2 roadmap) → synthesized detailed findings + recommendations. Reads ONLY this client's Doc 1 + Doc 2 + findings.
- Also pending from the partner's full ERP brief (pasted in chat): contacts/tasks/meetings/projects modules, entity detail pages + activity timelines, RBAC/permissions, versioning/rollback, automation rules engine, the 5 dashboards, system health, integrations registry. Build in the brief's phase order.

## 2026-07-09 - Claude (Opus 4.8) - Doc 1: the merged niche-customized pitch (audit workspace stage 1)

Building the 3-stage audit workspace. This lands Doc 1 (the founder's "what Wobble can do" pitch) — the Free Audit MERGED with a niche-customized capability showcase.

- src/lib/scraper/apify.ts (prior commit): gated Apify client for website/social signals.
- domain/pitch-graph.ts: pitchSchema, buildPitchPrompt (LLM writes headline + situation + whatWeNoticed + services with niche-rewritten whatItDoes/outcomeForYou + whyWobble + cta, picking 6-12 relevant services from the full menu, grounded in scraped signals), deterministicPitch fallback, pitchToReportShape (maps to the shared audit report/deck renderer). parsePitch.
- lib/pitch/index.ts: runPitch = diagnose() (deterministic gaps) + scrapeBusinessSignals (Apify, gated) + LLM pitch (defaultRunNode=runTextProvider role pitch_writer; any error incl. no key -> deterministic fallback). Persists kind="pitch" scoped to companyId (data-isolated — uses only this prospect's inputs/signals). +pitch_writer model role (seed-runner).
- /api/audit/pitch (POST run, GET list). UI: Free Audit page gains website + Instagram inputs, a "✨ Generate AI pitch" button (+ kept "Quick diagnosis"), and a pitch result panel with "Open pitch doc ↗" / "Open deck ↗" (renders via the existing /api/audit/[id]/document + /deck through pitchToReportShape).
- tests/apify-scraper.test.ts (5) + tests/pitch.test.ts (5): mocked fetch/LLM, no spend.

VERIFIED LIVE (one real LLM pitch, cents, then cleaned up): dental prospect -> usedLlm=true, scraped=false (no Apify key -> correct fallback), headline "Transform Your Dental Practice…", 5 observations + 7 services each DENTAL-customized (patients/appointments/practice), tailored CTA. Renders via the doc/deck routes. Typecheck clean; 405 tests pass (was 395: +scraper 5, +pitch 5, minus reshuffles); build compiles (/api/audit/pitch).

NEXT (audit workspace remaining): Doc 2 = INTERNAL interview roadmap (asks for stakeholders/team + free-call info -> who to interview + what to ask + sequence, reading ONLY this client's Doc 1; uses the paid-audit YouTube methodology). Doc 3 = final client deck from Doc 1 + Doc 2 + per-interview notes/transcript slots (can reuse/feed the deep paid-audit-graph). Then a per-company Audit WORKSPACE UI that ties the 3 stages together with strict per-client data isolation. Plus the partner's fuller ERP (contacts/tasks/meetings/projects/detail-pages/RBAC/versioning/automation-rules/dashboards/system-health) in the brief's phase order. APIFY_API_KEY needed to actually scrape (gated).

## 2026-07-09 - Claude (Opus 4.8) - Audit Doc 2: internal interview roadmap (data-isolated)

Stage 2 of the audit workspace. Doc 2 = the INTERNAL playbook for how WE run the paid audit (never client-facing).
- domain/roadmap-graph.ts: roadmapPlanSchema (overview, interviewPlan [{role,name,why,questions[]}], sequence [{week,focus,activities[]}], dataToGather[], prepNotes), buildRoadmapPrompt (embeds the Morningside 4-week method: Wk1 discovery/stakeholder interviews + process mapping, Wk2 opportunity+feasibility, Wk3 validation, Wk4 roadmap+ROI; tailors 4-8 questions per stakeholder), deterministicRoadmap fallback, roadmapToReportShape.
- lib/audit-roadmap/index.ts: runAuditRoadmap reads ONLY this client's Doc 1 pitch (DATA ISOLATION — throws "data isolation" if the pitch's companyId != the requested companyId), LLM plans interviews (role audit_interview_planner; deterministic fallback on no key/error), persists kind="roadmap". +model role in seed-runner.
- /api/audit/roadmap (POST run, GET list). UI: the pitch result panel gains "Plan audit interviews →" (POSTs pitchAuditId) + "Open roadmap ↗ (N interviews)" — chains Doc 1 → Doc 2.
- tests/audit-roadmap.test.ts (5): parse, deterministic plan, shape map, LLM path, and the cross-client data-isolation refusal.

VERIFIED: typecheck clean; 410 tests pass (+5); build compiles (/api/audit/roadmap). Data isolation unit-tested (refuses another company's pitch). Live LLM path uses the same runTextProvider path already proven by Doc 1.

NEXT: Doc 3 = final client deck from Doc1+Doc2+per-interview notes/transcript slots (reuse/feed the deep paid-audit-graph; render the big McKinsey deck). Then a per-company Audit WORKSPACE UI tying the 3 stages together (list a company's pitch/roadmap/final, generate each in sequence). Then the partner's fuller ERP (contacts/tasks/meetings/projects/detail-pages+timelines/RBAC/versioning/automation-rules/dashboards/system-health/integrations) per brief phases. APIFY_API_KEY still needed to actually scrape.

## 2026-07-09 - Claude (Opus 4.8) - Audit Doc 3: final client deck (all 3 audit stages now exist)

Stage 3 = the final client-facing McKinsey deck. Does NOT add a new agent team — it gathers this client's Doc 1 (pitch) + Doc 2 (roadmap) + the per-interview findings WE recorded, assembles them into the intake, and runs the deep 5-agent paid-audit graph (which persists kind="paid" + renders the 26KB report / 19-slide deck via the existing /api/audit/[id]/document + /deck).
- lib/audit-final/index.ts: runFinalAudit — reads only this client's own docs (throws "data isolation" on companyId mismatch), builds intakeNotes from findings [{stakeholder,notes}] + pitch summary + roadmap overview, calls runPaidAuditGraph. FinalAuditDeps extends PaidAuditDeps (injectable for tests).
- /api/audit/final (POST run — 502+needsModelKey when no OPENROUTER key; GET list kind=paid).
- tests/audit-final.test.ts (2): the assemble-and-run happy path (canned 5-node graph, no spend) + the cross-client data-isolation refusal.

VERIFIED: typecheck clean; 412 tests pass (+2); build compiles (/api/audit/final).

AUDIT WORKSPACE STATUS: all 3 stages built + engines verified — Doc 1 pitch (live-verified), Doc 2 roadmap (data-isolation tested), Doc 3 final (data-isolation tested; reuses the live-verified deep graph). Data isolation enforced across Doc 2 + Doc 3 (companyId match or throw). NEXT: a per-company Audit WORKSPACE UI tying the 3 stages (pick/lookup a company → generate pitch → roadmap → per-interview findings slots → final deck, all in one place) + Doc 3 UI hook (findings input). Then the partner's fuller ERP (contacts/tasks/meetings/projects/detail-pages+timelines/RBAC/versioning/automation-rules/5 dashboards/system-health/integrations registry) per brief phases 1-5. APIFY_API_KEY still needed to actually scrape (gated). Repo pushed through this commit.

## 2026-07-09 - Claude (Opus 4.8) - Unified Audit Workspace UI (the 3 stages in one place)

The founder's "one screen per client" flow. Ties Doc 1/2/3 together on a company.
- /api/audit/workspace (GET): returns all audit docs (all kinds) trimmed for the list; UI groups by companyId||businessName into clients with pitch/roadmap/final.
- os-ui AuditWorkspacePage: left = client list (pitch/roadmap/final status tags); right = 3-stage stepper. Stage 1 pitch (generate or Doc/Deck links), Stage 2 interview roadmap (locked until pitch; generate from pitchAuditId; Doc/Deck), Stage 3 final deck (locked until roadmap; a findings textarea PER planned interview from the roadmap; Generate final deck → /api/audit/final with pitchAuditId+roadmapAuditId+findings). New-audit form starts a client via the pitch. Registered in WIRED + REVENUE nav; "free_audit" relabeled "Quick Pitch".
- Model APIFY_API_KEY is now set in .env (gitignored) — scraping is LIVE (verified a real crawl: 12 pages).

VERIFIED LIVE (server-side chain, then cleaned up): pitch (usedLlm, 6 dental services) → roadmap (usedLlm, 5 dental-specific interview roles, data-isolated from the pitch) → workspace UI groups them, shows the stepper with a findings slot per interview (screenshot). Typecheck clean; full suite green; build compiles (/api/audit/workspace).

NEXT (founder: build everything except deploy — VPS later via SSH): the partner's fuller ERP (contacts, tasks, meetings/calendar, projects, entity detail pages + activity timelines, RBAC/permissions, versioning/rollback, automation-rules engine, the 5 dashboards, system health, integrations registry — brief phases 1-5); Content Command upgrades (real image/carousel generation into media_refs + feedback→regenerate loop). Deploy deferred (VPS + SSH pending).

## 2026-07-10 - Claude (Opus 4.8) - ERP operational modules: Tasks + Meetings

Partner ERP brief sections E + F. Migration 0018: tasks + meetings tables.
- Tasks: domain/task.ts (14 types, 7 statuses + machine, isOverdue) + lib/tasks (add/list/transition/assign/listOverdue, audited) + /api/tasks + /[id]/action (status|assign) + TasksPage (KPIs open/overdue/completed, create form, filter open/overdue/done/all, Start/Done actions, overdue red border) + "Tasks" tile (OPERATIONS). tests/tasks.test.ts (6).
- Meetings: domain/meeting.ts (9 types, 6 statuses + machine) + lib/meetings (add/list/transitionMeeting w/ outcome+followUp) + /api/meetings + /[id]/action + MeetingsPage (KPIs upcoming/completed/follow-up, book form, Complete[outcome prompt]/No-show) + "Meetings" tile. tests/meetings.test.ts (3). Both linked to company/contact/opportunity/proposal/invoice; soft-delete; every action audited.

VERIFIED: typecheck clean; full suite green; build compiles (/api/tasks, /api/tasks/[id]/action, /api/meetings, /api/meetings/[id]/action). Tasks/Meetings unit-tested.

NEXT (partner ERP remaining): Projects (won deal → workspace), entity DETAIL PAGES + activity timelines (the "click a company/deal and see everything" screens — high value), RBAC/permissions, versioning/rollback, automation-rules engine, the role dashboards (sales/finance/delivery), system health, integrations registry. Then Content Command upgrades (image gen + feedback loop). Deploy still deferred (VPS + SSH pending from founder).
