# WOBBLE OS V2 Implementation Plan

## Task 1: Foundation

- Create a Next.js app in `C:\Wobble OS`.
- Add WOBBLE source docs and brand image.
- Add `.env.example` with variable names only.
- Add Drizzle schema and first pgvector migration.
- Add worker skeletons as separate Node entrypoints.

## Task 2: Tested OS logic

Use TDD for:

- approval attribution and confirmation metadata
- budget gate decisions
- content packet quality gate
- memory filtering and time-weighted ranking
- webhook HMAC verification, timestamp replay protection, and idempotency keys

## Task 3: Premium Dashboard

Build a WOBBLE-branded dashboard shell with Apple Liquid Glass-inspired surfaces:

- Command Center overview
- Ask WOBBLE console
- Research Radar
- Content Command Center
- Media Studio
- Client AIOS Lab
- Decision Room
- Offer Lab
- Automations
- Approvals
- Memory, Costs, Audit Log, Settings

## Task 4: Verification

Run:

```powershell
npm run test
npm run typecheck
npm run build
```
