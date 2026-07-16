import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { dispatchHandoff } from "@/lib/handoff";
import type { JobRow } from "@/lib/domain/jobs";
import { GOVERNANCE_ORCHESTRATOR } from "@/lib/security-governance";
import { SECURITY_MEMORY_SCOPES } from "@/lib/departments/verticals/security-governance";

/**
 * The durable governance job (WOB-UAT-024).
 *
 * `GOVERNANCE_REVIEW_JOB_TYPE` is what makes governance survive a restart and run on a cadence rather
 * than only when a founder clicks. The handler does NOT run the review itself: it DISPATCHES a typed
 * handoff to the department, and the department consumer claims and executes it.
 *
 * That indirection is deliberate and is the difference between a cron and a department. It means
 * governance work arrives the same way every other department's work arrives — through the handoff
 * backbone, with `validateHandoff` checking it, the consumer leasing it atomically (SKIP LOCKED, so two
 * workers never double-run it), and `runDepartment` producing the accept/route/complete audit trail.
 * It also makes the department's consumer registration legitimate rather than decorative: this job is a
 * REAL upstream producer, which is the bar `departments/consumer.ts` sets for wiring one at all.
 *
 * Idempotency: the envelope's `idempotencyKey` is derived from the job id, so a retried job re-dispatches
 * the SAME handoff rather than queueing a second review of identical state.
 */

export const GOVERNANCE_REVIEW_JOB_TYPE = "governance.review";

export interface GovernanceReviewJobPayload {
  requestedBy?: string;
  clientWorkspaceId?: string | null;
}

export async function runGovernanceReviewJobHandler(job: JobRow): Promise<Record<string, unknown>> {
  const payload = (job.payload ?? {}) as GovernanceReviewJobPayload;
  const requestedBy = payload.requestedBy ?? "scheduler";
  const clientWorkspaceId = payload.clientWorkspaceId ?? null;

  const envelope = buildHandoffEnvelope(
    {
      workflowId: job.id,
      department: "security_governance",
      // The JOB is the source. Attributing this to a founder would be a lie for a scheduled run, and
      // attributing a founder-triggered run to "scheduler" would erase real accountability — the
      // requester rides in `actor`, which is where accountability belongs.
      sourceAgent: GOVERNANCE_REVIEW_JOB_TYPE,
      destinationAgent: GOVERNANCE_ORCHESTRATOR,
      actor: requestedBy,
      objective: "Run the deterministic access + policy governance review",
      requestedAction: "run_governance_review",
      expectedOutputSchema: "governance_request",
      confidence: 1,
      clientWorkspaceId,
      dataClassification: clientWorkspaceId ? "client_confidential" : "internal",
      authorizedMemoryScopes: SECURITY_MEMORY_SCOPES,
      idempotencyKey: `${job.id}:security_governance:inbound`,
    },
    { now: new Date() },
  );

  const { handoff, deduped } = await dispatchHandoff(envelope, {
    clientWorkspaceId,
    grantedMemoryScopes: SECURITY_MEMORY_SCOPES,
    permittedDataClassifications: ["internal", "restricted", "client_confidential"],
  });

  // The job's success means "the review was DISPATCHED", not "the review found nothing". The consumer
  // executes it and the findings are the department's output — conflating the two would let a job report
  // green while the review it queued never ran.
  return { dispatched: true, handoffId: handoff.id, deduped, requestedBy };
}
