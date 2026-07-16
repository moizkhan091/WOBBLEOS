import { buildHandoffEnvelope, type HandoffEnvelope, type HandoffReceiverContext } from "@/lib/domain/handoff";
import { runDepartment, type DepartmentPolicy, type DepartmentRunResult, type RunDepartmentDeps } from "@/lib/departments/orchestrator";
import { runQaGate } from "@/lib/qa/gate";
import { securityTenantIsolationBoardImpl, buildSecurityIsolationSubmission, type SecurityIsolationArtifact } from "@/lib/qa/boards";
import {
  runGovernanceReview,
  persistFindings,
  GOVERNANCE_ORCHESTRATOR,
  type GovernanceRunRecord,
  type SecurityDeps,
} from "@/lib/security-governance";
import type { SecurityFindingDraft } from "@/lib/domain/security-governance";

/**
 * Security & Governance department vertical (WOB-UAT-024).
 *
 * The department can now RECEIVE work through the handoff backbone rather than only through its own
 * API. That distinction is the whole point: an isolation review reachable only via the generic QA
 * endpoint is a tool a founder can call, not a department other departments can hand work to.
 *
 * Two inbound capabilities, matching the seed's `acceptedHandoffSchemas`:
 *   handoff_envelope    → review ANOTHER department's envelope for tenant isolation (the evaluator path)
 *   governance_request  → run the deterministic access + policy review (the orchestrator path)
 *
 * DELIBERATELY DETERMINISTIC end to end. Unlike `sales-crm.ts` there is no advisory LLM step, because
 * every question this department answers is decidable from real rows — and a security verdict that can
 * disagree with the enforcement it describes is worthless. That also means: no provider call, so no
 * cost record. Emitting a zero-cost provider run to look complete would be a fabrication.
 *
 * The `runDepartment` shell still gives us, for free and identically to every other department:
 * accept/reject validation, `department.accepted|rejected|escalated|routed|completed` audit events,
 * kill-switch enforcement (checked BEFORE acceptance), escalation rows, and routing to the seed's
 * declared `downstreamConsumers`.
 */

export const SECURITY_MEMORY_SCOPES = ["company"];

export interface SecurityReviewProduct {
  kind: "isolation_review" | "governance_review";
  /** For an isolation review: the QA verdict. Null for a governance review. */
  verdict: string | null;
  /** Whether downstream work may proceed. FALSE blocks the source department's product. */
  released: boolean;
  findings: number;
  incidents: number;
  run: GovernanceRunRecord | null;
  reviewId: string | null;
}

export interface RunSecurityGovernanceInput {
  /** `handoff_envelope` (review someone's envelope) or `governance_request` (run the review). */
  capability: "review_isolation" | "run_governance_review";
  requestedBy: string;
  workflowId?: string;
  clientWorkspaceId?: string | null;
  /** Required for `review_isolation`: the envelope under review + the receiver it is judged against. */
  isolation?: SecurityIsolationArtifact & { authorAgentSlug: string; sourceDepartment: string };
}

export interface RunSecurityGovernanceDeps extends RunDepartmentDeps {
  /** The already-claimed envelope when driven by the department consumer loop. */
  inboundEnvelope?: HandoffEnvelope;
  security?: SecurityDeps;
  /** Injectable QA gate deps so the evaluator is provable without a database. */
  qa?: Parameters<typeof runQaGate>[1];
}

export async function runSecurityGovernanceDepartment(
  input: RunSecurityGovernanceInput,
  deps: RunSecurityGovernanceDeps = {},
): Promise<DepartmentRunResult<SecurityReviewProduct>> {
  const now = deps.now ?? new Date();
  const workflowId = input.workflowId ?? `govwf_${now.getTime()}`;

  const envelope =
    deps.inboundEnvelope ??
    buildHandoffEnvelope(
      {
        workflowId,
        department: "security_governance",
        sourceAgent: input.isolation?.authorAgentSlug ?? "founder_command_centre",
        destinationAgent: GOVERNANCE_ORCHESTRATOR,
        objective:
          input.capability === "review_isolation"
            ? `Review tenant isolation for a ${input.isolation?.sourceDepartment ?? "source"} handoff`
            : "Run the deterministic access + policy governance review",
        requestedAction: input.capability === "review_isolation" ? "security_review" : "run_governance_review",
        expectedOutputSchema: input.capability === "review_isolation" ? "handoff_envelope" : "governance_request",
        confidence: 1,
        // Governance reads company-wide configuration, so it is `internal` unless a specific client is
        // named. It must never claim a client scope it does not have — that would let a governance run
        // widen its own reach.
        clientWorkspaceId: input.clientWorkspaceId ?? null,
        dataClassification: input.clientWorkspaceId ? "client_confidential" : "internal",
        authorizedMemoryScopes: SECURITY_MEMORY_SCOPES,
        idempotencyKey: `${workflowId}:security_governance:inbound`,
      },
      { now },
    );

  const receiverCtx: HandoffReceiverContext = {
    clientWorkspaceId: input.clientWorkspaceId ?? null,
    grantedMemoryScopes: SECURITY_MEMORY_SCOPES,
  };

  const policy: DepartmentPolicy<SecurityReviewProduct> = async (api) => {
    if (input.capability === "review_isolation") {
      // The department must actually HAVE the evaluator, not merely claim it in a seed.
      if (!api.selectSpecialists({ capability: "isolation_review" }).length) {
        api.escalate("security_governance has no registered isolation evaluator");
      }
      if (!input.isolation) throw new Error("security_governance: review_isolation requires an envelope + receiver to judge");

      // The DETERMINISTIC evaluator, reached through the department rather than the generic QA route.
      // `runQaGate` enforces reviewer independence, derives the verdict from evidence, and persists it.
      const submission = buildSecurityIsolationSubmission(
        { envelope: input.isolation.envelope, receiver: input.isolation.receiver },
        {
          workflowId,
          taskId: api.envelope.taskId,
          clientWorkspaceId: input.clientWorkspaceId ?? null,
          authorAgentSlug: input.isolation.authorAgentSlug,
        },
      );
      const decision = await runQaGate({ boards: [securityTenantIsolationBoardImpl], submission }, deps.qa ?? {});
      const review = decision.reviews[0] ?? null;

      // A FAILED isolation review is a security finding, not just a QA row. It is what makes this an
      // operating department rather than a linter: the failure enters the founder's queue with evidence.
      let findings = 0;
      if (!decision.released) {
        const draft: SecurityFindingDraft = {
          kind: "isolation",
          severity: "critical",
          title: `Tenant isolation failed for a ${input.isolation.sourceDepartment} handoff`,
          detail: (review?.criteria ?? []).filter((c) => !c.passed).map((c) => `${c.key}: ${c.rationale}`).join("; ") || "isolation review did not pass",
          affectedAssetType: "handoff_envelope",
          affectedAssetId: api.envelope.taskId,
          clientWorkspaceId: input.clientWorkspaceId ?? null,
          detectedBy: "security_isolation_reviewer",
          detectionMethod: "deterministic",
          evidence: { workflowId, verdict: review?.verdict ?? "unknown", qaReviewId: review?.id ?? null, sourceDepartment: input.isolation.sourceDepartment },
          reproduction: "Re-run the security_tenant_isolation board over the same envelope + receiver; it scores validateHandoff's real output.",
          remediation: "Correct the envelope's clientWorkspaceId / authorizedMemoryScopes / dataClassification, or the destination's grant.",
          // One open finding per WORKFLOW+TASK: a retrying handoff must not spawn a finding per attempt.
          dedupeKey: `isolation:${workflowId}:${api.envelope.taskId}`,
        };
        const persisted = await persistFindings([draft], {}, deps.security ?? {});
        findings = persisted.created.length;
        api.escalate(`security_governance blocked a ${input.isolation.sourceDepartment} handoff: tenant isolation failed`);
      }

      return {
        product: { kind: "isolation_review", verdict: review?.verdict ?? null, released: decision.released, findings, incidents: 0, run: null, reviewId: review?.id ?? null },
        productSchema: "security_reviews",
        outputs: { verdict: review?.verdict ?? null, released: decision.released, reviewId: review?.id ?? null, findingsOpened: findings },
        confidence: 1, // deterministic — there is nothing to be uncertain about
        // A FAILED review must not propagate. Emptying routeTo is how the QA-gated verticals block
        // downstream work (see research-intelligence.ts) — the finding + escalation carry it instead.
        routeTo: decision.released ? undefined : [],
      };
    }

    // ---- governance_request: the deterministic access + policy review ----
    if (!api.selectSpecialists({ capability: "access_review" }).length && !api.selectSpecialists({ capability: "policy_review" }).length) {
      api.escalate("security_governance has no registered governance specialist");
    }

    const run = await runGovernanceReview({ requestedBy: input.requestedBy }, deps.security ?? {});

    // A check that could not run is NOT a clean result. Escalating it is what stops "0 findings" from
    // being indistinguishable from "I could not look".
    for (const s of run.skipped) api.escalate(`security_governance could not run ${s.check}: ${s.reason}`);
    if (run.worst === "critical") api.escalate(`security_governance found a CRITICAL issue: ${run.findings.find((f) => f.severity === "critical")?.title ?? "see findings"}`);

    return {
      product: { kind: "governance_review", verdict: null, released: true, findings: run.created.length, incidents: run.incidents.length, run, reviewId: null },
      productSchema: "security_reviews",
      outputs: {
        runId: run.runId,
        executedBy: run.executedBy,
        checksRan: run.checks.filter((c) => c.ran).map((c) => c.check),
        skipped: run.skipped,
        findingsOpened: run.created.length,
        findingsDeduped: run.deduped.length,
        findingsRetestedClosed: run.retested.length,
        incidentsOpened: run.incidents.length,
        worst: run.worst,
        requiresFounderAttention: run.requiresAttention,
      },
      confidence: 1,
    };
  };

  return runDepartment({ departmentSlug: "security_governance", inbound: { envelope, receiverCtx }, policy }, deps);
}
