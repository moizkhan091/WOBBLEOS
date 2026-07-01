# WOBBLE OS - Engineering Standards (Definition of Done)

Date: 2026-07-01
Binding for ALL builders: Codex, Claude, Gemini, Antigravity, any future agent.

## Why this exists

A dashboard "Approve" button was wired to the GENERIC `/api/approvals/[id]/action` endpoint. It transitioned the approval row and the item disappeared from the queue - so it LOOKED done - but it never ran the entity side-effect: the source was not actually approved/trusted, the skill was not activated, the memory was not inserted, the content packet was not flipped live. That is a failure. A feature that looks done but does not complete the real action is worse than an unbuilt one, because it hides the gap.

This document exists so that never happens again.

## The core rule

Build every chunk COMPLETE and DEPLOY-READY for the VPS - never a generic stub that appears to work. "Compiles / returns 200 / row disappeared" is NOT done. Done = the real downstream effect happened and is verifiable.

## Definition of Done (every chunk / every wired action)

1. **Real effect, not surface transition.** If an action claims to do X, X must actually happen end to end: the entity row changes, the record is created/updated, the audit event is written. Never wire to a generic transition when an entity-complete path exists or is needed. If the complete path does not exist yet, BUILD it - do not ship the generic shortcut.
2. **Verify the effect, not the appearance.** Confirm the DB row changed (source approvalStatus=approved + trust tier; memory_record inserted; skill status=approved; packet approvalStatus=approved) - not just a 200 or a disappeared queue row.
3. **Deploy-ready for the VPS.** No localhost-only assumptions. All config from env. Migrations + seeds runnable on a clean machine. No hardcoded secrets, model choices, prompts, or strategy in code (those live in settings / registries / Brain).
4. **No fake data, no fake success states, no decorative buttons that imply function.** A control is either wired to a real effect or visibly disabled/planned.
5. **Dashboard-driven verification confirms the EFFECT.** `npm run dev`, do the action, then check the underlying record actually changed - not just the UI.
6. **Full gate before "done".** `npm run verify` (typecheck + tests + build) green, on a clean state, with the Next dev server STOPPED (dev server rewrites `next-env.d.ts` to `./.next/dev/types/...` which breaks typecheck; it must read `./.next/types/...`).
7. **Prefer the complete endpoint.** When both a generic and an entity-specific path exist, wire to the one that completes the real action. The generic transition is only for types that genuinely have no entity side-effect.

## Anti-patterns (do NOT do these)

- Wiring a UI action to a generic endpoint that only flips a status flag.
- Marking a chunk `[x]` based on parse/compile alone without an end-to-end effect check.
- "It returns ok so it works" without confirming the real record changed.
- Hardcoding prompts, model names, captions, or strategy into worker code (must come from the Prompt/Skill Registry, Settings, Brain).
- Leaving a smoke-test job/record in a queue that could later spend credits.

## For Codex specifically

Codex verifies chunks. Verification is not just `npm run verify` + a browser click - it must confirm the real effect (approve a source -> the source row is actually approved with a trust tier). If a builder shipped a generic-stub shortcut, treat it as a defect and fix it to the complete path before marking done.
