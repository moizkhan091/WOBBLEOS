import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import type { IntelligenceScope } from "@/lib/domain/intelligence";
import type { ProviderUsageContext } from "@/lib/domain/provider-usage";
import { runCompetitorScout, type ScoutInput, type ScoutResult } from "@/lib/intelligence/scout";
import { runIntelligenceAnalyst, type AnalystResult } from "@/lib/intelligence/analyst";
import { runDreamer, type DreamerResult } from "@/lib/intelligence/dreamer";
import type { IntelligenceDeps } from "@/lib/intelligence";
import { runDepartment, type DepartmentPolicy, type DepartmentRunResult, type RunDepartmentDeps } from "@/lib/departments/orchestrator";

/**
 * Research & Intelligence DEPARTMENT vertical (Phase 3 → the Phase-5 continuous-research foundation).
 * Unlike Paid Audit / Content (single graphs whose nodes are each driven through a claimed handoff), the
 * intelligence agents are three real, job-backed services: Competitor Scout (ingests observations), the
 * Intelligence Analyst (observations → durable insights, pending approval), and the WOBBLE Dreamer
 * (approved intelligence → proactive suggestions, each opening a real approval row). This vertical wraps
 * them as the department's POLICY on the shared runtime: it accepts a validated inbound handoff, confirms
 * the specialist team from the registry, SEQUENCES scout → analyst → dreamer (scout optional / Apify-gated),
 * and routes the approval-gated intelligence to the Founder Command Centre as a real durable handoff.
 * Nothing is auto-trusted: insights + suggestions land PENDING founder approval (the governance gate).
 */

const RESEARCH_MEMORY_SCOPES = ["research", "competitor", "market", "company"];

export interface RunResearchIntelligenceInput {
  scope?: IntelligenceScope;
  clientId?: string | null;
  /** Optional competitor handle/URL to scout first. Skipped (not failed) when Apify is not configured. */
  scoutTarget?: Omit<ScoutInput, "scope" | "clientId">;
  /** How many recent observations the analyst/dreamer consider. */
  itemLimit?: number;
  requestedBy: string;
  workflowId?: string;
}

export interface ResearchIntelligenceProduct {
  scout: ScoutResult | null;
  analysis: AnalystResult;
  suggestions: DreamerResult;
}

export interface RunResearchIntelligenceDeps extends RunDepartmentDeps {
  /** Injectable service seams (default to the real agents; canned in proofs — no LLM / no Apify spend). */
  scout?: (input: ScoutInput, deps: IntelligenceDeps) => Promise<ScoutResult>;
  analyze?: (input: { scope?: IntelligenceScope; clientId?: string; limit?: number }, deps: IntelligenceDeps & { usageContext?: ProviderUsageContext }) => Promise<AnalystResult>;
  dream?: (input: { scope?: IntelligenceScope; clientId?: string; limit?: number }, deps: IntelligenceDeps & { usageContext?: ProviderUsageContext }) => Promise<DreamerResult>;
  /** Shared intelligence deps (store, approvalStore, recordAudit) threaded to the three services. */
  intelligenceDeps?: IntelligenceDeps;
}

/**
 * Run the Research & Intelligence department: trigger → accept a validated department handoff → confirm
 * the analyst team → (optionally scout) → analyse recent observations into insights → dream up proactive
 * suggestions (approval-gated) → route the validated intelligence to the Founder Command Centre.
 */
export async function runResearchIntelligenceDepartment(
  input: RunResearchIntelligenceInput,
  deps: RunResearchIntelligenceDeps = {},
): Promise<DepartmentRunResult<ResearchIntelligenceProduct>> {
  const now = deps.now ?? new Date();
  const scope: IntelligenceScope = input.scope ?? "wobble";
  const clientId = input.clientId ?? undefined;
  const workflowId = input.workflowId ?? input.clientId ?? `research_${scope}`;
  const scout = deps.scout ?? runCompetitorScout;
  const analyze = deps.analyze ?? runIntelligenceAnalyst;
  const dream = deps.dream ?? runDreamer;
  const intel = deps.intelligenceDeps ?? {};

  const envelope = buildHandoffEnvelope(
    {
      workflowId,
      department: "research_intelligence",
      sourceAgent: input.requestedBy || "founder",
      destinationAgent: "research_intelligence_orchestrator",
      objective: `Produce validated intelligence (${scope})`,
      requestedAction: "analyse",
      expectedOutputSchema: "validated_intelligence",
      confidence: 0.7,
      // Research is INTERNAL-classification only (the department permits no client_confidential); client
      // isolation is still carried on clientWorkspaceId + the scoped intelligence store queries.
      companyId: null,
      clientWorkspaceId: clientId ?? null,
      dataClassification: "internal",
      authorizedMemoryScopes: RESEARCH_MEMORY_SCOPES,
      idempotencyKey: `${workflowId}:research:inbound`,
    },
    { now },
  );
  const receiverCtx = { clientWorkspaceId: clientId ?? null, grantedMemoryScopes: RESEARCH_MEMORY_SCOPES };

  const policy: DepartmentPolicy<ResearchIntelligenceProduct> = async (api) => {
    // Confirm the department actually has its analyst registered (real membership, not a label).
    if (!api.selectSpecialists({ capability: "analyse" }).length) api.escalate("research_intelligence has no registered analyst");

    const usageContext: ProviderUsageContext = { departmentSlug: "research_intelligence", workflowId, taskId: api.envelope.taskId, companyId: null, clientWorkspaceId: clientId ?? null };
    const intelWithUsage = { ...intel, usageContext };

    // 1. Optionally scout new observations (Apify-gated — skipped, not failed, when unconfigured).
    let scoutResult: ScoutResult | null = null;
    if (input.scoutTarget) {
      // The scout ingests into a narrower scope set (wobble|client|global); map the broader research scope.
      const scoutScope = scope === "client" ? "client" : scope === "global" ? "global" : "wobble";
      scoutResult = await scout({ ...input.scoutTarget, scope: scoutScope, clientId }, intel);
      if (scoutResult && scoutResult.configured === false) api.escalate("competitor scout is not configured (APIFY_API_KEY missing) — ingestion skipped");
    }

    // 2. Analyse recent observations into durable insights (PENDING founder approval).
    const analysis = await analyze({ scope, clientId, limit: input.itemLimit }, intelWithUsage);

    // 3. Dream proactive suggestions from approved intelligence + recent items (each opens an approval row).
    const suggestions = await dream({ scope, clientId, limit: input.itemLimit }, intelWithUsage);

    // Honest degraded signal: if the department produced no new insights AND no new suggestions, this is a
    // stale/insufficient-intelligence escalation, not a silent success.
    if (analysis.proposedInsights === 0 && suggestions.proposed === 0) api.escalate("stale intelligence — no new insights or suggestions produced (ingest more observations)");

    return {
      product: { scout: scoutResult, analysis, suggestions },
      productSchema: "validated_intelligence",
      outputs: { insightIds: analysis.insightIds, suggestionIds: suggestions.suggestionIds, scouted: scoutResult?.found ?? 0 },
      confidence: 0.75,
      // The validated intelligence is delivered to the Founder Command Centre for review; content/proposal
      // consume APPROVED intelligence via the shared context, not a direct handoff, so they are not routed here.
      routeTo: ["founder_command_centre"],
    };
  };

  return runDepartment({ departmentSlug: "research_intelligence", inbound: { envelope, receiverCtx }, policy }, deps);
}
