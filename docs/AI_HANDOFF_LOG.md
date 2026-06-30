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
