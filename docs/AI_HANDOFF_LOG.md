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
