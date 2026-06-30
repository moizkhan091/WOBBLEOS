# AGENTS.md

You are working in `C:\Wobble OS`.

Before edits, read:

- `docs/PROJECT_START_HERE.md`
- `docs/AI_HANDOFF_LOG.md`
- `docs/BUILD_SEQUENCE_TRACKER.md` (what's done / next / deferred - keep it updated)
- `docs/WOBBLE_OS_BACKEND_ORCHESTRATION_MAP.md`
- `docs/WOBBLE_OS_V2_PRD.md`
- `docs/WOBBLE_COMPANY_OS.md`
- `README.md`

## Brand direction

WOBBLE is a black/electric-lime AI Workforce Company. The OS should feel premium, sharp, rebellious, and operationally serious. Use Apple Liquid Glass-inspired translucent panels only when readability stays strong.

## Engineering rules

- Use TDD for domain logic.
- Run `npm run test`, `npm run typecheck`, and `npm run build` before claiming done.
- Do not put workers inside Next.js routes or layouts.
- Keep the public WOBBLE website separate from this internal OS.
- Never write secrets into docs, code, logs, prompts, database rows, or UI.
- Preserve approval attribution, auditability, budget gates, memory tiers, source trust, and webhook idempotency.
- After meaningful work or architecture discussion, append a concise update to `docs/AI_HANDOFF_LOG.md` so Codex, Claude, Gemini, Antigravity, and future agents share context.
- Do not hardcode changing strategy, content angles, captions, hooks, posting decisions, or model choices in workers or n8n. Keep stable workflow in code; keep changing intelligence in WOBBLE Brain, approved sources, settings, prompts, model reasoning, and founder feedback.

## Ask WOBBLE Retrieval Rule

Ask WOBBLE is the OS command surface/conductor, not a hardcoded mega-prompt and not a place to duplicate downstream module logic.

Every new module that creates useful business intelligence must follow this ingestion path:

`new module data -> structured DB row -> chunk/vector/metadata if needed -> approved/trusted status -> Ask WOBBLE retrieval`

This applies to sources, memory, research radar, competitor tracking, content results, social stats, SEO/blog data, website analytics, invoices, presentation assets, client work, decisions, offers, media outputs, n8n/webhook results, cost records, and future module outputs.

Important rules:

- Future data must become queryable through structured storage, approved sources, memory chunks, module tables, rollups, citations, and retrieval adapters.
- Ask WOBBLE should automatically pick up newly approved/trusted data through retrieval. Do not manually rewrite Ask WOBBLE prompts every time a new source, connector, competitor feed, social metric, SEO result, or module output is added.
- Unknown/discovered sources are never trusted automatically. They go through approval and trust-tier assignment before serious Ask WOBBLE use.
- Fast questions can answer directly. Heavy work such as deep research, SEO audits, competitor scans, media generation, or large content batches should create worker jobs and return status quickly.
- Risky, public, expensive, or business-changing actions remain approval-gated and audit-logged.

## Cost Observability Rule

No external AI/search/media/video/provider cost may be incurred without a durable local cost record.

Required path for paid/credit-consuming calls:

`provider call -> model_runs/provider_runs row -> cost estimate or actual cost -> linked module/output/job -> audit event -> Costs dashboard/API`

Rules:

- Text LLM calls must go through the provider adapter and `recordModelCall`, not direct ad hoc `fetch`.
- Future search, media, video, SEO, social, and automation provider calls must use the same pattern or a provider-specific run table that rolls up into Costs.
- Record both successes and failures when the provider was attempted. Failed paid attempts still matter.
- Store provider, model/tool, role, module, input/output usage when available, estimated/actual cost, latency, status, error, provider run id, linked entity, and created date.
- Never reset/delete cost records automatically. Monthly, weekly, daily, provider, module, and job-level totals must be derivable from stored rows.
- Cost UI can be rebuilt, but the source of truth is the database.

## Source control, testing & CI (read this — added 2026-06-29)

This project is now a Git repo pushed to GitHub: https://github.com/moizkhan091/WOBBLEOS

Why this exists: WOBBLE OS deploys to a VPS and is built by several AIs (Codex, Claude, Gemini, Antigravity). We need ONE machine-independent check that proves nothing is broken before it ships, without the founder running tests by hand.

How every AI builder verifies:

- One command runs everything: `npm run verify` (= `typecheck` + `test` + `build`).
- If your environment can run Node/npm (e.g. Codex on the Windows machine), run `npm run verify` yourself before claiming done. You do not need GitHub for this — you can run it locally.
- On every push/PR, GitHub Actions (`.github/workflows/ci.yml`) runs `npm install` + typecheck + test + build on a clean Linux runner. This is the shared source of truth for "is it broken?" (Latest: 36/36 tests pass.)
- Deploy to the VPS ONLY via `scripts/deploy.sh`, which runs `verify` first and ABORTS if anything fails. Broken code cannot reach production.

Notes:

- CI/deploy use `npm install` (not `npm ci`) on purpose: multiple builders edit `package.json`, so the lockfile drifts and `npm ci` would hard-fail. If you regenerate `package-lock.json` cleanly, it can switch back to `npm ci`.
- The Cowork/Claude desktop sandbox is Linux reusing a Windows `node_modules`, so it cannot run the test binaries locally; it relies on CI. Other AIs on the Windows machine can run tests directly.
- After meaningful work: update `docs/AI_HANDOFF_LOG.md`, then commit + push so CI verifies it.

## Key folders

- `src/app`: Next.js UI and health routes
- `src/lib/domain`: tested business/domain logic
- `src/lib/security`: security helpers
- `src/db`: Drizzle schema and migrations
- `src/workers`: persistent worker entrypoints
- `docs`: PRD, source docs, implementation notes
- `public/brand`: WOBBLE brand assets
- `storage`: local operational storage scaffold
