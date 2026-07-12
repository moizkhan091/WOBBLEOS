import { newId } from "@/lib/ids";
import type { HandoffEnvelope } from "@/lib/domain/handoff";

/**
 * Durable handoff DELIVERY state machine (Phase 2 runtime). A handoff is not just an audit line — it
 * is a persisted, leased, retried, dead-letterable, redrivable unit of inter-agent work. This pure
 * module owns the state graph + retry policy; the IO service (`src/lib/handoff`) persists it.
 */

export const HANDOFF_DELIVERY_STATES = [
  "created", // persisted by the sender, not yet handed to a consumer
  "delivered", // available for a consumer to claim
  "processing", // a consumer holds a lease and is working
  "acknowledged", // consumer accepted the work (optional intermediate)
  "completed", // done
  "failed", // a run failed; will retry or dead-letter
  "dead_lettered", // out of retries; awaits manual redrive
  "cancelled", // superseded/aborted
] as const;
export type HandoffDeliveryState = (typeof HANDOFF_DELIVERY_STATES)[number];

const TRANSITIONS: Record<HandoffDeliveryState, HandoffDeliveryState[]> = {
  created: ["delivered", "cancelled"],
  delivered: ["processing", "cancelled"],
  processing: ["acknowledged", "completed", "failed", "delivered", "cancelled"], // ->delivered = lease reclaim
  acknowledged: ["completed", "failed", "cancelled"],
  completed: [],
  failed: ["delivered", "dead_lettered"], // ->delivered = retry
  dead_lettered: ["delivered", "cancelled"], // ->delivered = manual redrive (resume); ->cancelled = abort/supersede (terminate/reroute)
  cancelled: [],
};

export function canTransitionHandoff(from: HandoffDeliveryState, to: HandoffDeliveryState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const HANDOFF_DEFAULT_MAX_RETRIES = 5;
export const HANDOFF_LEASE_MS = 5 * 60_000; // a processing lease is valid for 5 min

/** On failure: retry (back to `delivered`) with exponential backoff until out of attempts, then dead-letter. */
export function decideHandoffFailure(input: { retryCount: number; maxRetries?: number }): { next: "delivered" | "dead_lettered"; backoffMs: number } {
  const max = input.maxRetries ?? HANDOFF_DEFAULT_MAX_RETRIES;
  if (input.retryCount >= max) return { next: "dead_lettered", backoffMs: 0 };
  const backoffMs = Math.min(60_000, 1000 * 2 ** input.retryCount); // 1s,2s,4s,… capped at 60s
  return { next: "delivered", backoffMs };
}

/** A lease is stale when its holder went away — reclaim so a peer crash self-heals. */
export function isLeaseExpired(leaseExpiresAt: Date | null, now: Date): boolean {
  return leaseExpiresAt !== null && leaseExpiresAt.getTime() <= now.getTime();
}

export interface HandoffRow {
  id: string;
  workflowId: string;
  taskId: string;
  parentTaskId: string | null;
  correlationId: string;
  causationId: string | null;
  department: string;
  sourceAgent: string;
  destinationAgent: string | null;
  destinationCapability: string | null;
  companyId: string | null;
  clientWorkspaceId: string | null;
  projectId: string | null;
  leadId: string | null;
  actor: string;
  dataClassification: string;
  schemaVersion: number;
  envelope: HandoffEnvelope;
  deliveryState: HandoffDeliveryState;
  idempotencyKey: string;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  retryCount: number;
  maxRetries: number;
  runAfter: Date | null; // backoff gate — not claimable until this time
  failureReason: string | null;
  costEstimate: string | null;
  latencyMs: number | null;
  qualityScore: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  deliveredAt: Date | null;
  acknowledgedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  deadLetteredAt: Date | null;
  cancelledAt: Date | null;
  updatedAt: Date;
}

/** Build the persisted row for a freshly-dispatched handoff (state `delivered` — ready to consume). */
export function buildHandoffRow(envelope: HandoffEnvelope, opts: { now: Date; id?: string; maxRetries?: number }): HandoffRow {
  const now = opts.now;
  return {
    id: opts.id ?? newId("handoff"),
    workflowId: envelope.workflowId,
    taskId: envelope.taskId,
    parentTaskId: envelope.parentTaskId,
    correlationId: envelope.correlationId,
    causationId: envelope.causationId,
    department: envelope.department,
    sourceAgent: envelope.sourceAgent,
    destinationAgent: envelope.destinationAgent,
    destinationCapability: envelope.destinationCapability,
    companyId: envelope.companyId,
    clientWorkspaceId: envelope.clientWorkspaceId,
    projectId: envelope.projectId,
    leadId: envelope.leadId,
    actor: envelope.actor,
    dataClassification: envelope.dataClassification,
    schemaVersion: envelope.schemaVersion,
    envelope,
    deliveryState: "delivered",
    idempotencyKey: envelope.idempotencyKey,
    leaseOwner: null,
    leaseExpiresAt: null,
    retryCount: 0,
    maxRetries: opts.maxRetries ?? HANDOFF_DEFAULT_MAX_RETRIES,
    runAfter: null,
    failureReason: null,
    costEstimate: null,
    latencyMs: null,
    qualityScore: null,
    metadata: {},
    createdAt: now,
    deliveredAt: now,
    acknowledgedAt: null,
    completedAt: null,
    failedAt: null,
    deadLetteredAt: null,
    cancelledAt: null,
    updatedAt: now,
  };
}
