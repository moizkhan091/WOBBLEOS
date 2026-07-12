import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Escalation domain (Phase 3). When department work is blocked and can't be recovered automatically, a
 * real escalation is raised for a founder/department decision. It carries the reason, severity, evidence,
 * what recoveries were already attempted, the decision required, an assignee, an SLA, and — once acted on
 * — a truthful resolution (resume / reroute / blocked / terminate).
 */

export const ESCALATION_REASONS = [
  "exhausted_retries",
  "dead_lettered",
  "provider_unavailable",
  "permission_denied",
  "budget_exhausted",
  "stale_intelligence",
  "repeated_qa_failure",
  "conflicting_conclusions",
  "missing_approval",
  "sla_breach",
  "downstream_rejection",
  "other",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export const ESCALATION_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type EscalationSeverity = (typeof ESCALATION_SEVERITIES)[number];

export const ESCALATION_STATUSES = ["open", "acknowledged", "resolved", "dismissed"] as const;
export type EscalationStatus = (typeof ESCALATION_STATUSES)[number];

/** How a resolved escalation directs the blocked workflow. */
export const ESCALATION_RESOLUTION_ACTIONS = ["resume", "reroute", "blocked", "terminate"] as const;
export type EscalationResolutionAction = (typeof ESCALATION_RESOLUTION_ACTIONS)[number];

/** Default SLA (ms) by severity — how long before the escalation is itself overdue. */
export const ESCALATION_SLA_MS: Record<EscalationSeverity, number> = {
  critical: 60 * 60_000, // 1h
  high: 4 * 60 * 60_000, // 4h
  medium: 24 * 60 * 60_000, // 1d
  low: 3 * 24 * 60 * 60_000, // 3d
};

export interface EscalationRow {
  id: string;
  departmentSlug: string;
  workflowId: string | null;
  taskId: string | null;
  clientWorkspaceId: string | null;
  sourceAgent: string | null;
  reason: EscalationReason;
  severity: EscalationSeverity;
  /** Links to the real execution so a founder action controls the actual workflow, not just the record. */
  handoffId: string | null;
  budgetReservationId: string | null;
  approvalId: string | null;
  jobId: string | null;
  graphRunId: string | null;
  evidence: Record<string, unknown>;
  attemptedRecoveries: string[];
  requiredDecision: string;
  assignee: string | null;
  slaDueAt: Date | null;
  status: EscalationStatus;
  resolution: string | null;
  resolutionAction: EscalationResolutionAction | null;
  resolvedBy: string | null;
  createdAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  updatedAt: Date;
}

export const escalationInputSchema = z.object({
  departmentSlug: z.string().trim().min(1),
  workflowId: z.string().trim().min(1).nullable().default(null),
  taskId: z.string().trim().min(1).nullable().default(null),
  clientWorkspaceId: z.string().trim().min(1).nullable().default(null),
  sourceAgent: z.string().trim().min(1).nullable().default(null),
  reason: z.enum(ESCALATION_REASONS),
  severity: z.enum(ESCALATION_SEVERITIES).default("medium"),
  handoffId: z.string().trim().min(1).nullable().default(null),
  budgetReservationId: z.string().trim().min(1).nullable().default(null),
  approvalId: z.string().trim().min(1).nullable().default(null),
  jobId: z.string().trim().min(1).nullable().default(null),
  graphRunId: z.string().trim().min(1).nullable().default(null),
  evidence: z.record(z.string(), z.unknown()).default({}),
  attemptedRecoveries: z.array(z.string().trim().min(1)).default([]),
  requiredDecision: z.string().trim().min(1),
  assignee: z.string().trim().min(1).nullable().default("founder_command_centre"),
});
export type EscalationInput = z.input<typeof escalationInputSchema>;

export function buildEscalationRow(input: EscalationInput, opts: { id?: string; now: Date; slaMs?: number } = { now: new Date() }): EscalationRow {
  const parsed = escalationInputSchema.parse(input);
  const now = opts.now;
  const slaMs = opts.slaMs ?? ESCALATION_SLA_MS[parsed.severity];
  return {
    id: opts.id ?? newId("escalation"),
    departmentSlug: parsed.departmentSlug,
    workflowId: parsed.workflowId,
    taskId: parsed.taskId,
    clientWorkspaceId: parsed.clientWorkspaceId,
    sourceAgent: parsed.sourceAgent,
    reason: parsed.reason,
    severity: parsed.severity,
    handoffId: parsed.handoffId,
    budgetReservationId: parsed.budgetReservationId,
    approvalId: parsed.approvalId,
    jobId: parsed.jobId,
    graphRunId: parsed.graphRunId,
    evidence: parsed.evidence,
    attemptedRecoveries: parsed.attemptedRecoveries,
    requiredDecision: parsed.requiredDecision,
    assignee: parsed.assignee,
    slaDueAt: new Date(now.getTime() + slaMs),
    status: "open",
    resolution: null,
    resolutionAction: null,
    resolvedBy: null,
    createdAt: now,
    acknowledgedAt: null,
    resolvedAt: null,
    updatedAt: now,
  };
}

/** Is an open escalation past its SLA at `now`? */
export function isEscalationOverdue(row: Pick<EscalationRow, "status" | "slaDueAt">, now: Date): boolean {
  return row.status !== "resolved" && row.status !== "dismissed" && row.slaDueAt !== null && row.slaDueAt.getTime() < now.getTime();
}
