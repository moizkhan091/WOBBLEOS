# WOBBLE OS

Internal WOBBLE OS V2 project.

This app lives in `C:\Wobble OS` by design so Codex, Claude Code, and other AI builders can open the same standalone project folder.

## Read first

1. `docs/PROJECT_START_HERE.md`
2. `docs/AI_HANDOFF_LOG.md`
3. `docs/V2_BUILD_ACCEPTANCE_PLAN.md`
4. `docs/FINAL_V2_MASTER_BUILD_PLAN.md`
5. `docs/AI_OS_TRANSCRIPT_LESSONS_FOR_WOBBLE.md`
6. `docs/PLAIN_ENGLISH_WOBBLE_OS_MAP.md`
7. `docs/WOBBLE_OS_BACKEND_ORCHESTRATION_MAP.md`
8. `docs/CLAUDE_BROWSER_AUDIT_ROUND_2.md`
9. `docs/CLAUDE_DESIGN_AUDIT_AND_BUILD_PROMPT.md`
10. `docs/WOBBLE_OS_V2_PRD.md`
11. `docs/WOBBLE_COMPANY_OS.md`
12. `docs/IMPLEMENTATION_PLAN.md`
13. `dashboard-interface-design-brief/project/WOBBLE OS.dc.html`
14. `public/brand/wobble-brand-identity.jpeg`

## Commands

```powershell
npm install
npm run dev

# one command runs everything: typecheck + test + build
npm run verify
```

## Testing & CI (you should not need to run tests by hand)

The whole suite runs automatically. You do not have to remember three commands or run them manually.

- `npm run verify` = `typecheck` + `test` + `build` in one shot. This is the single command that proves the project is healthy.
- `npm run ci` = `npm ci` + `verify` (clean install from the lockfile, then verify). Used by automation.
- GitHub Actions (`.github/workflows/ci.yml`) runs `npm ci` + typecheck + test + build on a clean Linux runner on every push and pull request. This is the automatic safety net for every AI builder. Push code, and GitHub tells you green/red - no manual testing.
- VPS deploys must go through `scripts/deploy.sh`, which runs `verify` first and ABORTS if anything fails, so broken code never goes live. Edit its RESTART section for your process manager (pm2/systemd/docker).

Why automation instead of running locally: `node_modules` is git-ignored and platform-specific. A `node_modules` installed on Windows cannot run the Linux test binaries (and vice versa). CI and the VPS each do a fresh `npm ci`, so they always have the correct binaries. That is why the automated path is the source of truth for "is it broken?", not any single machine.

To activate CI: push this repo to GitHub. The workflow runs automatically. No extra setup needed.

## Current status

This project is ready for multi-AI local backend build work. The current shared docs include:

- full Claude Design frontend handoff and browser audit
- final V2 master build plan with all 30 build areas
- transcript-derived AI OS lessons from the four source videos
- plain-English WOBBLE OS map for non-coders and agents
- worker vs n8n vs OS backend orchestration map
- V2 build acceptance plan with chunk-by-chunk success criteria
- shared AI handoff log for Codex, Claude, Gemini, Antigravity, and future builders

Existing first build pass includes:

- Next.js app shell
- WOBBLE Liquid Glass command center dashboard
- copied brand board and WOBBLE source docs
- AIOS transcript source folder
- domain tests for approvals, budgets, content packets, memory ranking, and webhook signatures
- Drizzle schema and first pgvector SQL migration
- health endpoints
- separate worker and video-worker entrypoints
- docs for the complete V2 plan

## Safety rules

- Do not commit `.env` or secrets.
- Production Compose secrets should live outside the checkout and be supplied with
  `bash scripts/deploy.sh /absolute/path/to/wobble.env`; `.env.production` is only a legacy default.
- Keep provider keys in VPS environment variables only.
- Do not run workers inside Next.js request lifecycle.
- Keep FFmpeg/HyperFrames rendering isolated from the web process.
- Company assets should not be auto-deleted.
- Any serious AI output must preserve source/citation metadata.
- Build in this order: context, data, function, then cadence.

## Multi-AI Handoff Rule

Before working, read `docs/AI_HANDOFF_LOG.md`.

After meaningful work, append:

- agent/tool used
- what changed
- files touched
- what remains mocked
- verification commands run
- next recommended chunk
