# WOBBLE OS — Release Gate Checklist (Phase 11)

The gate that must pass before a production deploy. Nothing here is optional; do not disable a failing check.

## 1. Code gate (automated — mirrors required CI job "typecheck + test + build")
```
npm run release:check      # typecheck (0) + full test suite (green) + production build (0)
```

## 2. Real-DB proofs (automated — every stateful capability, each idempotent + repeatable)
```
DATABASE_URL=... npm run verify:all-db
```
Runs, in order: commercial chain · autonomous consumer + origination · escalation reroute · QA gate · research
QA gate · content gate · content publishing · delivery completion · decision learning · AIOS value · daily
brief · source granular-approval · source discovery · source value · intel propagation/isolation · founder taste.
Each cleans up after itself and can be run repeatedly against a populated DB.

Or the whole thing (code gate + all DB proofs):
```
DATABASE_URL=... npm run release:full
```

## 3. Migration integrity
- From-scratch: create a fresh database, `npm run db:migrate` applies ALL migrations cleanly (exit 0).
- Zero drift: `npm run db:generate` reports "No schema changes, nothing to migrate".

## 4. Browser gate (required CI job "e2e browser gate (Playwright)")
- `npm run e2e` — 23 tests: department grid, handoffs, escalations (all 4 actions + edge cases), budget/KPI,
  content publishing surfaces, proposal-accept full autonomous chain, auth gate. Real DB effects asserted.

## 5. System coherence (automated — in the test suite)
- `tests/release-coherence.test.ts` — every active department has a registered non-paused orchestrator; no
  dangling downstream routes; self-triggering departments accept their own schema; QA reviewers registered.

## 6. Required GitHub CI
- Both jobs green on the release commit: "typecheck + test + build" AND "e2e browser gate (Playwright)".

## 7. VPS deployment (EXTERNAL-BLOCKED until host/SSH/domain/secrets/backup are supplied)
When access exists, deploy in an ISOLATED stack that never touches the existing n8n:
- separate Compose project · directory · network · Postgres/pgvector · volumes · ports · credentials · backups
- back up + prove-restore existing n8n FIRST; no broad `docker prune`/`stop`
- run migrations · start web + workers + scheduler · health checks · restart/reboot recovery · backup/restore proof
- authenticated founder access · production hostname · verify n8n remains healthy

## Standing rules
- Do not label an estimate as an actual. Do not call a module operational without a real trigger + consumer.
- Financial/CRM/project/publishing writes are deterministic; LLMs reason/classify/recommend, never mutate money.
- Every QA gate must control real work; every routed handoff must have a real consumer.
