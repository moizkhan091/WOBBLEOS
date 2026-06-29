# Project Start Here

You are inside `C:\Wobble OS`, the standalone WOBBLE OS V2 project.

Read these before changing code:

1. `docs/AI_HANDOFF_LOG.md`
2. `docs/V2_BUILD_ACCEPTANCE_PLAN.md`
3. `docs/FINAL_V2_MASTER_BUILD_PLAN.md`
4. `docs/AI_OS_TRANSCRIPT_LESSONS_FOR_WOBBLE.md`
5. `docs/PLAIN_ENGLISH_WOBBLE_OS_MAP.md`
6. `docs/WOBBLE_OS_BACKEND_ORCHESTRATION_MAP.md`
7. `docs/CLAUDE_BROWSER_AUDIT_ROUND_2.md`
8. `docs/CLAUDE_DESIGN_AUDIT_AND_BUILD_PROMPT.md`
9. `docs/WOBBLE_OS_V2_PRD.md`
10. `docs/WOBBLE_COMPANY_OS.md`
11. `docs/IMPLEMENTATION_PLAN.md`
12. `docs/source/ai-os-youtubevideos/`
13. root transcript files:
    - `5 Skills to Build an AI Operating System Like The 1% (Full Guide).txt`
    - `6 thing people get wrong setting up ai os..txt`
    - `Build & Sell Claude Code Operating Systems (2+ Hour Course).txt`
    - `This INSANE AI Operating System Runs My $25M Business.txt`
14. `dashboard-interface-design-brief/project/WOBBLE OS.dc.html`
15. `dashboard-interface-design-brief/project/WOBBLE OS-print-qbwnpk.dc.html`
16. `public/brand/wobble-brand-identity.jpeg`

## Current build target

The current V2 target is the full internal WOBBLE OS, built locally first and deployed to the VPS only after the local spine works.

The next backend spine starts with:

1. Database foundation
2. Seed WOBBLE Brain essentials and source trust defaults
3. Audit log
4. Approvals
5. Model runs and cost tracking
6. Job queue
7. Worker runtime
8. Provider and Connections Registry
9. Prompt/Skill Registry
10. Source Library backend
11. Memory / WOBBLE Brain backend
12. Ask WOBBLE V1
13. Content Command backend
14. Content Worker V1
15. AI OS Auditor / Brain Optimizer
16. n8n signed handoff

Existing first implementation pass includes:

- Next.js app with WOBBLE Liquid Glass dashboard
- Core domain logic with tests
- Memory tiering and time-weighted retrieval helpers
- Approval attribution helpers
- Webhook HMAC/timestamp verification
- Budget gate helpers
- Content packet validation and quality gate
- Worker skeletons with graceful shutdown
- Drizzle schema/migration foundation

Transcript-derived operating rule:

```text
Context -> Data -> Function, and Context -> Connections -> Capabilities -> Cadence.
Do not build autonomous cadence before the manual workflow and Brain/data layer work.
```

## Running locally

```powershell
npm install
npm run test
npm run typecheck
npm run build
npm run dev
```

## Safety

Do not commit `.env`. Use `.env.example` for variable names only.

## Handoff Rule

After meaningful work, update `docs/AI_HANDOFF_LOG.md` with:

- what changed
- files touched
- what is real vs mocked
- verification run
- next suggested action
