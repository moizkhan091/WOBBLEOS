# WOBBLE OS — Deep Audit Supplement (the 2 modules that re-ran)

Companion to `MODULE_DEEP_AUDIT.md`. Covers `agent-registry` and `intelligence-loop`, which failed the first pass and were re-audited.

## agent-registry — "the 28-agent workforce" is 36% real

Of **28** registered agents in `DEFAULT_AGENTS`:

- **10 (36%)** actually execute AND log an `agent_run`: the content graph (strategist, researcher, copywriter, scorer), the paid-audit graph (5 agents), and knowledge_compiler.
- **7 (25%)** execute but **never log a run** — their roster row stays `run_count=0` forever: `ask_wobble`, `content_worker`, `dreamer`, `competitor_scout`, `performance_learning_agent`, `content_excellence_gate`, `memory_router`.
- **11 (39%) are pure decoration — no code path runs them at all**: `source_intake_orchestrator`, `social_content_analyst`, `transcript_analyst`, `visual_reference_analyst`, `website_seo_scout`, `source_quality_checker`, `market_researcher`, `trend_radar`, `brand_voice_guardian`, `model_scout`, `system_auditor`.

Other real findings:
- **C2 — orphan run-writers:** `pitch` and `audit-roadmap` log runs to slugs (`wobble_pitch_writer`, `audit_interview_planner`) that aren't registered → `recordAgentRun` throws "not found" and a `catch {}` swallows it. Real LLM work, never recorded.
- **H2 — failure tracking broken:** graphs only log a run on the *success* path; a node that throws records nothing, so `failure_count` stays 0 even when agents fail. Dashboard shows a flawless workforce that's actually failing silently.
- **H3 — quality never captured:** `qualityScore` is optional and no caller ever passes it (not even `content_scorer`). "Quality per agent" is unimplemented.
- **M1 — cost/latency mostly null:** only knowledge_compiler passes a cost estimate. "Cost per agent" is not really captured.
- **M2/M3 — `cadence:"schedule"` and `tools[]` are aspirational labels** for agents that don't run or don't use those tools.
- **C1 (auth) — NUANCE:** the agent flagged `/api/agents` as "zero auth," but `proxy.ts` (Next middleware) already gates every non-public route behind login. So it's **not an open hole** — the residual risk is that any logged-in founder could POST fabricated runs (attribution/integrity), which is lower severity.

## intelligence-loop — the loop is real, but nothing drives it

- **C1 — no scheduler:** `intelligence.scout/analyze/dream` handlers are registered but **nothing enqueues them**; `research_targets.cadence`/`nextRunAt` are written but never read. The loop only advances on a manual button. (Same root gap as Automations/Memory/Library.)
- **H1 — unbounded analyst cost:** inlines up to 200 items' captions with no length cap → a big webhook batch can be a hundreds-of-thousands-of-token prompt.
- **H2 — untrusted competitor text not fenced:** ingested captions/transcripts flow into the analyst/dreamer and into generators, and the context-block presents them as an authoritative *"act on these"* system directive — a prompt-injection path.
- **H3 — analyst reads rejected items + can mix client scopes** into a shared `wobble` insight (no `approvalStatus` filter; scope defaults blend client data).
- **M2 — global knowledge never retrieved:** `buildApprovedIntelligenceContext` filters `scope = task-scope` exactly, so `global`-scoped approved rows are never fetched into prompts. Approved global brand rules are dead.
- **M3 — unbounded insight/suggestion count** can flood the approval queue.

**Correctly done (do not regress):** the `scopeMatches` client-isolation fix, webhook fail-closed + timing-safe HMAC, founder-gated triggers, approval-gated promotion, evidence-id filtering, and context-block degrading to empty on error.

## The cross-cutting theme (both + the main audit agree)
1. **No scheduler anywhere** → every "continuous/cadence" agent is a manual button.
2. **"Registered ≠ running"** → the workforce roster and several module features advertise more than executes.
3. **Auth "criticals" are mostly the proxy gate** → real security items are narrower (cross-bank memory retrieval, prompt-injection via ingested/source text, a couple public GET routes).
4. **Cost/quality/failure telemetry is largely unimplemented** despite being a headline promise.
