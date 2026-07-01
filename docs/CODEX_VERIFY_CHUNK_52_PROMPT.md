# Paste to Codex - verify + push Chunk 52 (Agent Registry)

Continue WOBBLE OS. Claude built Chunk 52 (Agent Registry & Orchestration) - the first foundation of the HIVE-MIND from a fresh architecture alignment review. Your job: understand WHY it exists, verify it completely (including the DB migration + a live effect test), then commit + push. Do NOT reset, overwrite, or duplicate. Do NOT start Chunk 53 - stop after pushing 52.

STEP 0 - understand the vision first (do not verify blind):
- Read `docs/ARCHITECTURE_ALIGNMENT_REVIEW.md` (the honest audit: current build was ~25-30% of the vision; the missing hive-mind = Agent Registry, Source Registry, Memory Banks, Research Inbox, multi-agent creative graph, taste learning).
- Read `docs/DECISION_LOG.md` (the binding decisions + why) and the newest `docs/AI_HANDOFF_LOG.md` entry for Chunk 52.
- Context: 6 NEW chunks were added to reach the vision - Chunk 51 (Design Reference Hunter) + the new Phase A hive-mind chunks 52-56 (Agent Registry, Source Registry+intake, Memory Banks+Router, Intelligence Inbox, Taste/Learning). Everything else in the vision maps to chunks that already existed (e.g. Chunk 13 is now a Knowledge Compiler, Chunk 15 evolves into the multi-agent creative graph). Chunk 52 is the backbone: without a registry + run logs, agents are invisible.

STEP 1 - state: `git status` (uncommitted Chunk 52 work - keep it). Base is clean at pushed commit 0c796fb.
STEP 2 - MIGRATION (critical, order matters): Claude added `agents` + `agent_runs` to `src/db/schema.ts` but did NOT hand-write the migration. Run `npm run db:generate` (drizzle-kit) to create the migration, review the generated 0003_*.sql, then `npm run db:migrate`.
STEP 3 - `npm run db:seed` -> confirm 6 agents registered (query `agents`: ask_wobble, content_worker, content_excellence_gate, dreamer, knowledge_compiler, memory_router).
STEP 4 - dev server STOPPED + `next-env.d.ts` on `./.next/types/...`, then `npm run verify`. Fix any tsc/vitest issues to the COMPLETE path (no stubs). `tests/agents.test.ts` (10 cases) must pass.
STEP 5 - LIVE EFFECT test: `npm run dev`, open `/agents` -> the 6 agents render. POST to `/api/agents/content_worker/runs` (e.g. body `{"status":"succeeded","costEstimate":0.2,"qualityScore":8}`) -> confirm a real `agent_runs` row was inserted AND the agent's runCount incremented AND an audit `agent.run.completed` was written (query the DB, not just the UI). Cancel any smoke-test job.
STEP 6 - commit + push: `git add -A && git commit -m "Chunk 52: Agent Registry & Orchestration (schema + service + API + tests + seed + dashboard); verify green" && git push`.

Sandbox note (ignore unless it breaks): if `npm run verify` ever reports package.json invalid, restore it from git - Claude's mount showed it truncated but the real repo is valid.

After push: STOP. Report results. Next is Chunk 53 (Source Registry) - Claude builds it on the fresh green checkpoint.
