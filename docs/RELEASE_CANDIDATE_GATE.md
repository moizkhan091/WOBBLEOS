# WOBBLE OS — Pre-Deployment Release-Candidate Gate

> ⚠️ **HISTORICAL SNAPSHOT — captured at `cc97fc0` (pre-Phase-1, pre-Phase-2).** Its "open defects"
> section is now PARTLY OUTDATED: the payment-integrity cluster, provider health checks, approval
> route consistency, proposal→CRM, won→delivery, scout→analyze (all its items 1-12) were CLOSED in
> Phase 1 (`2bb2230`, `4a71655`), and structured handoff envelopes now exist and are used
> (`ba58dff`, `d797b6f`). For the authoritative current state, read the ⭐ block at the top of
> `REMEDIATION_LEDGER.md`. This file is kept as the evidence trail of the original 4-agent audit.
> The release gate is STILL NOT passed (Phases 3-10 not built; VPS blocked).

**Release candidate (at capture):** `main` @ `cc97fc0` (frozen point tagged `rc-pre-deploy-83750e8`; candidate advanced by audit fixes since the freeze).
**Migrations:** `0028` latest, 30 applied to the local dev DB, **zero drift** (`drizzle-kit generate` → "nothing to migrate").
**Gate result on this pass:** `typecheck 0 · vitest 535 (74 files) · build 0`.
**Verdict: DO NOT DEPLOY YET.** The build/test/migration gate is green, but the release-candidate audit found remaining **open defects** and a material **architecture gap** between what is advertised and what is built. Details below, split exactly as the gate requires.

> This document is produced by a real multi-agent audit (4 parallel code auditors) + direct verification (real OpenRouter call, real-DB checkpoint/constraint proofs). Every claim is evidence-based. "NOT-BUILT" means the code does not exist — not that it wasn't tested.

---

## A. PROVEN LOCALLY (verified without the VPS)

- **Build/test/type gate**: `npm run typecheck`, `npx vitest run` (535 tests, 74 files), `npm run build` — all green, matching CI commands.
- **Migrations + rollback (real DB)**: `0027` (graph_checkpoints) and `0028` (published-post partial unique index) applied to live Postgres; zero drift; rollbacks documented (`DROP TABLE graph_checkpoints;`, `DROP INDEX scheduled_posts_published_asset_platform_uidx;`).
- **Graph checkpointing / resumability (real DB)**: proven end-to-end — late-node failure preserves completed nodes; retry re-runs ONLY the failed node (no re-charge); survival across a fresh store (process/worker restart); concurrent same-node upserts → one row; corrupted checkpoint → re-run; schema-version mismatch → re-run; cancellation clears; DB-failure degrades gracefully. (`src/scripts/verify-checkpoint-db.ts`, `tests/graph-checkpoint.test.ts`, raw-SQL constraint proof.)
- **Queue robustness**: `claimNext` uses `FOR UPDATE SKIP LOCKED` (concurrent workers don't collide); retry w/ backoff (`evaluateJobFailure`); SIGINT/SIGTERM graceful shutdown; DB + file heartbeats; **stalled-job reclaim now WIRED into the scheduler tick** (was implemented-but-dormant — fixed FIX #20).
- **Data-integrity (fixed + tested this gate, FIX #20)**: memory write chains atomic; CRM double-conversion race closed (conditional claim); invoice numbering retries on unique-violation instead of 500; `reinforceNote` lost-update closed (`SELECT … FOR UPDATE`). Prior: CRM convert atomic (FIX #10), revenue excludes reversed invoices (FIX #ded6ef8), library double-post + mark-posted dupes closed (FIX #16/#19).
- **Security mechanisms**: memory deny-by-default bank scoping (FIX #9), knowledge-compiler + intelligence prompt-injection fencing (FIX #11), Plausible period allowlist + host validation (FIX #12/#18), signed expiring media URLs (FIX #7), HMAC webhook verification (Zernio/intelligence), `proxy.ts` gates all non-public routes, Ask destructive-action confirmation pinned to `confirmActions:true` (verified in code).
- **Module reachability**: 21/23 audited modules are WIRED to a real backend (many key-gated but fail honestly with 502/503/`configured:false`, never faking). See §F.
- **Registry integrity**: `tests/registry-integrity.test.ts` fails the build if an active agent has no execution path, a job type has no handler, or an available Ask route has no handler.

## B. PROVEN WITH REAL PROVIDERS

- **OpenRouter (LLM) — PASS.** One controlled live call via the real `runTextProvider` path (`src/scripts/smoke-provider.ts`): credential auth ✓, model availability (`openai/gpt-4o-mini`) ✓, structured JSON parse ✓, token accounting (26 in / 9 out) ✓, cost recorded ($0.000009) ✓, `model_runs` row persisted `status=succeeded` ✓. Cost ~nil. Secrets never logged.
- **Apify** key is present locally but not smoke-tested this pass (scrape actors cost real credits + time); the intake/scout paths are WIRED and gated. Marked residual, not blocked.

## C. BLOCKED ON CREDENTIALS (cannot run locally — key not set)

| Provider | Used by | Status |
|---|---|---|
| Embeddings (`EMBEDDINGS_API_KEY`; falls back to OpenRouter) | semantic memory/knowledge retrieval | key empty — retrieval falls back to recency; real embedding path unproven locally |
| Tavily (`TAVILY_API_KEY`) | research search | blocked |
| Zernio (`ZERNIO_API_KEY` + `PUBLIC_BASE_URL`) | auto social publishing | blocked — publishing stays manual/human without it |
| Plausible (`PLAUSIBLE_API_KEY`+`SITE_ID`) | website analytics | blocked — returns `configured:false`, never fabricates |
| fal.ai (`FAL_KEY`) | media generation | blocked — AND the pipeline itself is not built (see §E) |

A provider is **not** shown "healthy" merely because an env var exists — but note the connections health check is shallow (§E, open defect): it does not do a live provider ping.

## D. VPS-DEPENDENT (cannot be truthfully proven until deployment — DO NOT claim as local-proven)

Linux filesystem/permissions; Docker networking on the VPS; **coexistence with the protected n8n stack**; reverse proxy; DNS; TLS certs; firewall/ports; external webhook reachability; public signed-media URL fetch by Zernio; production secrets; systemd/process-manager restart policies; server-reboot recovery; real backups/restore; storage mounts + disk behaviour; CPU/RAM limits; host log rotation; monitoring/alerts; real scheduler behaviour over time; queue recovery after server interruption; **actual production migration execution**; public-hostname browser/API smoke tests; **proof n8n stays healthy through deploy + reboot**.

## E. OPEN DEFECTS (verified; must be resolved or explicitly accepted before deploy)

**Data-integrity / concurrency (remaining after FIX #20):**
1. **Payment partial-payment idempotency** — `mark_paid` has no `paymentReference` dedup and no ledger; a duplicate *partial* payment double-counts, and two concurrent partials lost-update (undercount). Full re-pay is blocked by the status guard. _Fix: a payments ledger keyed by paymentReference, or a dedup check + `FOR UPDATE`._ (Severity: high — financial.)
2. **Approvals not atomic across the flip↔downstream effect** — `applyApprovalAction` update is unconditional (double-approve possible), and the approval-flip vs source-activation run on separate store handles (no shared tx), so a partial failure can consume an approval with no effect (source stuck). Compile-enqueue is idempotent (good). _Fix: conditional claim on the approval (`WHERE status='pending'`) + reconcile the cross-store step (outbox or idempotent re-drive)._ (Severity: high.)

**Workflow wiring gaps (real, from the reachability audit):**
3. **Proposal accept does not advance the CRM deal** — accepting a proposal drafts an invoice but never moves the opportunity to won / creates delivery. (Severity: medium.)
4. **Won→delivery lives only in the HTTP route** — `POST /api/crm/opportunities/[id]/stage` creates the project; any other caller of `moveOpportunityStage` (job, automation, Ask) moves to won WITHOUT a project, and **no tasks are seeded** on win. _Fix: move the won→delivery hook into the domain layer._ (Severity: medium.)
5. **Two approval routes diverge** — `/api/approvals/[id]/resolve` triggers the content `library.import`; `/api/approvals/[id]/action` only flips the row and does NOT import. Approving via `/action` silently doesn't publish. _Fix: converge on one path or make `/action` dispatch too._ (Severity: medium.)
6. **Self-improvement loop stalls at analysis** — scouting auto-runs on schedule, but `intelligence.scout` does not auto-chain to `intelligence.analyze`; turning observations into insight proposals needs a manual/automation trigger. (Severity: low-medium.)
7. **Connections health check is shallow** — a revoked/rotated key still shows "healthy" (no live provider ping). (Severity: medium — false confidence.)

**Architecture gap — advertised but NOT BUILT (from the architecture audit):**
8. **Structured inter-agent handoff envelopes: NOT BUILT.** Both graphs pass plain typed objects as function args; there is no envelope carrying workflowId/correlationId/causationId/department/dataClassification/authorizedMemoryScopes/schemaVersion/etc. Phases 4 of the gate ("prove every handoff validates …") cannot be satisfied because the contract does not exist.
9. **Department abstraction: NOT BUILT.** Agents have only a free-text `team` string; no department model/table/routing.
10. **Independent QA board: NOT BUILT.** Quality = one self-grading content scorer + one deterministic gate; the paid-audit graph has no reviewer node at all.
11. **Free Audit is thinner than advertised** — deterministic keyword diagnoser, no research/social/competitor stages, founder-gated (no public lead entry). Multi-agent depth exists only in the **paid** graph. (Proposal generation exists and is wired, but is deterministic assembly — no generative solution-design agent.)

## F. Module inventory (backend reachability)

WIRED (21): Command Centre, Ask WOBBLE, Research/Intelligence, Sources & Intake, Memory & Knowledge, Free Audit, Paid Audit, CRM, Finance, Delivery/Projects, Content (graph+worker), SEO, Library, Automations, Approvals, Offer Lab, Decision Room, Connections, Agent Registry, Scheduler (engine; needs the worker/cron to call `tick`), Settings.
PARTIAL (1): **Publishing** — scheduling + dispatch real; auto-post to platforms needs Zernio, else human-in-the-loop.
FACADE (1): **Media Studio** — `/api/media` returns `generationBuilt:false`; no fal.ai client / media queue / video worker. Honestly disclosed in the tile + code, but non-operational as a generator. _Recommend: relabel its module status from `wired` to `planned` to match reality._

## G. ACCEPTED RISKS (deliberate, with justification)

- **Key-gated modules degrade honestly** (502/503/`configured:false`) rather than faking output — acceptable; enable per provider on the VPS.
- **Intentional human gates** (content-packet approval, scheduling, manual posting, founder approval of intelligence/memory) are by design, not defects.
- **Media generation deferred** (roadmap) — acceptable if the tile is relabeled `planned`.

## H. What the gate still requires before "GO"

Blocking: resolve or explicitly accept §E items 1–2 (financial/approval integrity) at minimum; decide on 3–7 (workflow completeness) and 8–11 (whether the departments/envelopes/QA-board architecture is in-scope for v1 or a later roadmap — this is a founder scope decision, not a code fix). Then re-freeze a new RC after a green gate, and proceed to the VPS steps (§D) with the additive migrations + documented rollbacks.
