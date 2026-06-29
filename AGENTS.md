# AGENTS.md

You are working in `C:\Wobble OS`.

Before edits, read:

- `docs/PROJECT_START_HERE.md`
- `docs/AI_HANDOFF_LOG.md`
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

## Key folders

- `src/app`: Next.js UI and health routes
- `src/lib/domain`: tested business/domain logic
- `src/lib/security`: security helpers
- `src/db`: Drizzle schema and migrations
- `src/workers`: persistent worker entrypoints
- `docs`: PRD, source docs, implementation notes
- `public/brand`: WOBBLE brand assets
- `storage`: local operational storage scaffold
