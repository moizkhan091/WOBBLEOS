# Codex Handoff - 2026-07-01 (continue from Claude's work)

Give this to Codex when its limit resets. It is safe to continue from here IF Codex follows the order below. Do NOT hard-reset, do NOT overwrite, do NOT duplicate.

## Exact first steps (do in order)

1. `git status` and READ it. There is uncommitted work in the tree (below). Do NOT reset/checkout-discard it.
2. Remove any stale lock: `del ".git\index.lock"` (only if `git status` complains about a lock).
3. Read: `docs/AI_HANDOFF_LOG.md` (tail), `docs/DECISION_LOG.md`, `docs/ENGINEERING_STANDARDS.md`, `docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md`, `docs/BUILD_SEQUENCE_TRACKER.md`.
4. Ensure the Next dev server is STOPPED. Confirm `next-env.d.ts` imports `./.next/types/routes.d.ts` (NOT `./.next/dev/types/...`). If it points at dev, restore it.
5. `npm run verify` (typecheck + tests + build). Expect possible NEW type errors in the uncommitted files - fix them to the COMPLETE path, do not stub. Do not delete features to make it pass.
6. Add the MISSING tests (see below), re-run verify.
7. Live DB test the approval-completion path (see checklist).
8. Only when everything is green + effect-verified: `git add -A && git commit && git push`.

## What is DONE and VERIFIED (committed at HEAD 9978e96, Codex-verified: typecheck + 178 tests + build green)

- Chunks 01,03,04,05,06,07,09,10,08,11 (spine); 14,15,17,50,16,18 (content loop); 34 (Prompt/Skill Registry, live-checked).
- Dashboard shell + 9 wired pages (Command, Ask, Brain, Memory, Sources, Content+detail+Generate, Approvals[old generic approve], Costs, Audit). 25 test files / 178 tests.

## What is DONE but ONLY PARSE-VERIFIED (uncommitted; NOT typecheck/test/build-verified; NO new tests) - VERIFY THESE FIRST

- BUG FIX - approvals now complete the real entity action:
  - `src/lib/approvals/index.ts` (+ `getApproval`), `src/lib/content/index.ts` (+ `approveContentPacket`/`rejectContentPacket`), NEW `src/lib/approval-router/index.ts` (`resolveApproval` dispatches by type), NEW `src/app/api/approvals/[id]/resolve/route.ts`.
  - Frontend `src/components/os/os-ui.tsx`: Approvals page calls `/resolve`; `memory_update` opens a MemoryApproveModal (slug/title/tier/trust) -> `/api/memory/proposals/[entityId]/approval`.
- FOUNDER "ADD" FLOWS (backends already existed): Skill Registry page + New skill (POST /api/skills); Add Source (POST /api/sources); Add knowledge/memory (POST /api/memory/proposals). `src/lib/os/modules.ts` (+ `skills` module).
- Dashboard founder list corrected to real founders (Moiz, Ali, Ibrahim, Haad).
- `next-env.d.ts` restored to production types (was broken by dev server).
- Docs: ENGINEERING_STANDARDS, KNOWLEDGE_AND_CREATIVE_ENGINE, DECISION_LOG, SELF_HEALING_LOOPS_AUDIT, CONTENT_CREATIVE_EXCELLENCE_SYSTEM (founder clarifications), V2 plan (Chunk 51), tracker.

## What Codex must FINISH before push

1. Run `npm run verify`; fix any type/lint/build errors in the uncommitted files (complete path, no stubs).
2. TESTS:
   - DONE (Claude, parse-verified): `resolveApproval` refactored to injectable deps AND `tests/approval-router.test.ts` written (7 cases: source trust from metadata + default fallback, skill_update, content_packet reject, generic->applyApprovalAction, memory_update throws, not-found throws). Just run it in `npm run verify`; fix if tsc/vitest flags anything.
   - STILL TO ADD (Codex): `tests/content-packet-approval.test.ts` - approveContentPacket transitions the approval AND sets packet approvalStatus=approved (+audit); reject sets rejected. (Inject a fake content store + fake ApprovalStore like `tests/sources.test.ts`.)
3. Live DB effect test (Postgres up + seeded): see checklist.
4. Commit + push only when green.

## Testing checklist (before ANY push)

- [ ] Next dev server stopped; `next-env.d.ts` uses `./.next/types/...`.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test` passes (existing 178 + new approval-router + content-packet-approval tests).
- [ ] `npm run build` passes.
- [ ] `npm run verify` (all three) green on a clean run.
- [ ] Live: `docker compose up -d`, `npm run db:migrate`, `npm run db:seed`.
- [ ] EFFECT test - Source: Add source in UI -> appears in Approvals -> Approve -> the SOURCE row is approvalStatus=approved WITH a trust tier (query the DB), not just the approval row.
- [ ] EFFECT test - Skill: New skill -> Approvals -> Approve -> skill row status=approved.
- [ ] EFFECT test - Memory: Add knowledge -> Approvals memory form -> Approve -> a memory_record + memory_chunk were actually inserted.
- [ ] EFFECT test - Content packet: a content_packet approval -> Approve -> packet approvalStatus=approved.
- [ ] Audit rows exist for each (source.approved, skill.approved, content_packet.approved, memory approval).
- [ ] `npm run dev`, click every sidebar route: no console errors, planned pages honest, no fake data.
- [ ] Cancel any smoke-test job created so it cannot spend credits later.

## Risks (be strict)

- HIGH: the uncommitted bug-fix code is PARSE-verified only. tsc may find type errors (e.g. resolveApproval's direct service calls, ContentApprovalStatus cast, approveSource trust param). Run verify FIRST.
- HIGH: no unit tests yet for resolveApproval / approveContentPacket (the critical fix). Add them (item above) - do not push the fix untested.
- MED: default source trust in resolveApproval falls back to "tier_3_monitored" if the approval metadata has no requestedTrustLevel; confirm that tier exists in seed and is acceptable, or surface a trust picker in the Approvals UI for source items.
- MED: memory approve form defaults slug/title if the founder leaves them blank - fine for MVP, but consider requiring them.
- LOW: dashboard still has honest not-built follow-ups (detail drawers, topbar Capture/search, Command Center Ask box) - logged, not blocking.

## Do NOT

- Do NOT rewrite os-ui.tsx, modules.ts, or the prompt-skills/approval code from scratch. Extend.
- Do NOT create parallel approval/skill/source systems or duplicate routes/tables.
- Do NOT mark anything done on parse/compile alone - verify the real effect.
