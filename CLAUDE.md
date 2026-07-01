# CLAUDE.md

Claude Code handoff for WOBBLE OS.

Start here:

1. Read `docs/PROJECT_START_HERE.md`.
2. Read `docs/AI_HANDOFF_LOG.md`.
3. Read `docs/WOBBLE_OS_BACKEND_ORCHESTRATION_MAP.md`.
4. Read `docs/WOBBLE_OS_V2_PRD.md`.
5. Read `docs/WOBBLE_COMPANY_OS.md` for voice, ICP, offers, what not to say, and WOBBLE positioning.
6. Run `npm run test`, `npm run typecheck`, and `npm run build` after changes.

This project is intentionally in `C:\Wobble OS` so multiple AI builders can work from one standalone folder.

Do not reduce V2 scope without explicit founder approval. Build order can be technical, but the planned system is a full internal OS.

After meaningful work or architecture discussion, append a short update to `docs/AI_HANDOFF_LOG.md`. Treat it as the shared memory between Codex, Claude, Gemini, Antigravity, and any other builder.

## Logging & standards (MANDATORY for every builder)

Before working: pull latest, then read `docs/AI_HANDOFF_LOG.md` (code-work log), `docs/DECISION_LOG.md` (decisions/context/why), `docs/ENGINEERING_STANDARDS.md` (Definition of Done - no generic stubs, verify the EFFECT), and `docs/FOUNDER_VISION_BRIEF.md` (THE canonical vision - every module is a team of agents; read first), `docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md` (knowledge compiler + multi-agent creative + taste), `docs/ARCHITECTURE_ALIGNMENT_REVIEW.md`. After working: append code changes to the handoff log AND decisions/context to the decision log. Never duplicate schemas/routes/tables/agents - extend what exists. Real founders: Moiz, Ali, Ibrahim, Haad.
