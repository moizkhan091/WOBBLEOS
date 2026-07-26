# WOBBLE OS — improvements distilled from the AI-OS field (pre-VPS research pass)

Three parallel research agents read (a) Paperclip's **actual source** (108 tables, `server/services/*`),
(b) the serious open-source AI-OS / orchestration repos (LangGraph, OpenHands, CrewAI, Dify, n8n, Suna,
AutoGen, Activepieces), and (c) production reliability/agent-quality practice (OTel GenAI, Inngest,
DeepEval, Anthropic's "Building Effective Agents", hybrid-RAG). Every item below is cross-checked against
what WOBBLE already has (102 lib modules, 67 DB proofs) so we build genuine gaps, not duplicates.

Guiding principle (Anthropic): make it **reliable and observable before more agentic**. Everything here is
implementable in Postgres + in-repo code — no new managed service — so it stays self-hostable in one
Docker compose alongside the founder's n8n.

## SHIPPED in this pass (committed, tested)
- **Media budget circuit-breaker** (`5e3fd0f`) — image spend now counts against the OpenRouter cap
  (text already did; media bypassed it); exhaustion BLOCKS the job (resumable, no attempt consumed)
  instead of churning to failure. Both quality reports' #1 gap. DB proof: `verify-media-budget-circuit-db`.
- **Structured-output validation + single-retry repair** (`85abaee`) — `src/lib/providers/structured.ts`;
  first adopter the Decision scorer. <0.1% vs 5–10% malformed-output failure. 14 unit tests.
- **Jittered, capped, Retry-After-aware backoff** (`85abaee`) — full jitter (no thundering herd), 30-min
  cap, honours a 429 `Retry-After`. 15 jobs tests.
- **In-repo eval harness** (assertion tier) — golden set + deterministic assertions (must-cite,
  forbidden-phrase from WOBBLE_COMPANY_OS, schema-valid), `npm run eval`, no paid calls; LLM-judge tier
  scaffolded but off by default.

## NEXT BATCH — vetted, do as focused fully-proven changes (pre- or immediately post-first-deploy)
Ordered by (value ÷ risk). Each needs a migration and/or hot-path wiring, so each deserves its own
verified commit + DB proof, not a rushed lump.

1. **DB-level dedup for auto-generated work** — Paperclip #1 (S). Partial unique indexes
   (`... WHERE status NOT IN ('done','cancelled')`) so "one open incident/recovery/cadence task of this
   kind" is a *database* invariant. Kills watchdog/re-poll storms. Apply to escalations, research
   targets, scheduled cadence work. Must first assert no existing duplicates before adding the index.
2. **No-op re-wake / re-run throttle** — Paperclip #2 (M). Their cited incident: "25 sessions, 2.4× cost
   for one recovery." After ≥2 consecutive runs with no *durable* progress (comment/doc/artifact — tool
   calls don't count), hold event-free re-runs on an escalating cooldown (120s→30min); event-carrying
   wakes and crash retries bypass. Highest cost-safety lever for the autonomous loop.
3. **Agent span/trace table** — reliability #4 + repos #6 (M). One `agent_span` row per LLM/tool call
   using OpenTelemetry GenAI field names (`gen_ai.usage.*`, model, latency, status, cost_cents,
   parent_span_id, trace_id) via a `withSpan()` wrapper. Per-step cost + failure visibility with no heavy
   SDK; becomes the substrate for cost-per-run and the eval judge tier.
4. **HMAC-signed approval arguments** — Paperclip #4 (S/M). Canonicalise + HMAC the tool args at approval
   time; verify on execute (timing-safe). A founder approves *these exact args*; a confused/compromised
   agent can't swap them between approval and execution. Requires the confirm flow to replay the signed
   call rather than re-run the model.
5. **Idempotent `applied`-flag transitions** — Paperclip #9 (S). House pattern: `UPDATE … WHERE status IN
   (resolvable) RETURNING`; run side effects only when a row was actually updated. The success-path
   complement to the silent-failure fix already done.
6. **Guardrail-validate-then-retry on deliverables** — CrewAI (S/M). Extend the existing content
   excellence gate into a general `guardrail(output)→(ok|error)` + feed-error-back-and-retry (max 3) for
   proposals/audits, so weak deliverables never leave an agent.
7. **Per-action LLM-rated risk → confirmation** — OpenHands #3 (S). Let the model tag each tool call
   `security_risk: low|med|high` as part of normal generation (zero extra calls); route only high-risk to
   approval. Upgrades earned-autonomy from static per-tool rules to per-action.
8. **Global error handler** — n8n (S). On any job failure fire a structured handler
   (`{jobId, type, error, lastStep}`) → escalation + audit, instead of only a passive audit row.
9. **Hybrid search (pgvector + tsvector) fused with RRF + citations** — reliability #9 (M). Adds a lexical
   arm so exact matches (client names, addresses, IDs) aren't missed; fuse rank lists with Reciprocal
   Rank Fusion (k≈60); make citations a structured-output requirement + eval assertion.
10. **Run-liveness classifier** — Paperclip #3 (M/L). Classify each agent run advanced/blocked/plan-only/
    empty and route genuinely-blocked work to a human instead of auto-retrying. Pairs with #2.

## SECURITY hardening (borrow when multi-agent read-sharing grows)
- **Cross-agent trust-tiered quarantine + prompt-injection scan** (Paperclip #7) — tag low-trust agent
  outputs; redact when a higher-trust agent reads them; scan tool *results* for injection patterns before
  they enter the model. A firewall for 77 agents reading each other's comments + web research.
- **Secrets-by-reference + per-read audit** (Paperclip / Suna) — config stores a UUID ref, resolved at
  runtime, redacted from prompts and logs; every secret read audited.

## DELIBERATELY SKIPPED (both surveys agreed — N/A to a single-company vertical OS)
Git-worktree / code-execution sandboxes; multi-tenant cloud sync + invite flows; the multi-vendor adapter
marketplace; self-hosted Langfuse/Temporal/BullMQ **as services** (their *patterns* are ported to Postgres
instead — the managed infra is out of scope).

## NOT re-adopted — WOBBLE is at or ahead of the field here
Durable jobs queue, execution lease, advisory-lock leader election, kill-switch→budget→concurrency→ledger
governance, approvals + earned autonomy, audit log, graph-checkpoints, client isolation, pg_dump DR. Both
surveys explicitly said not to touch these.
