import type { AuditEventInput } from "@/lib/domain/audit";
import { validateHandoff, type HandoffEnvelope } from "@/lib/domain/handoff";
import type { HandoffRow } from "@/lib/domain/handoff-delivery";
import {
  acknowledgeHandoff,
  claimHandoffById,
  completeHandoff,
  dispatchHandoff,
  failHandoff,
  type HandoffStore,
} from "@/lib/handoff";

/**
 * Synchronous, in-process durable-handoff TRANSPORT (Phase 2 execution backbone).
 *
 * A graph node must never execute unless a valid handoff addressed to it has been durably persisted and
 * CLAIMED. This transport drives one agent→agent hop through the full runtime lifecycle in-process:
 *
 *   dispatch (persist + validate tenant/memory-scope) → claim (lease MY row, delivered→processing)
 *   → re-validate the claimed envelope → EXECUTE the destination node → acknowledge → complete.
 *
 * On executor failure the handoff is FAILED (retry/backoff → dead-letter) and the error is re-thrown so
 * the caller's checkpoint/rollback still runs. It is a real transport — same table, same state machine,
 * same acknowledgement path a distributed worker would use — just delivered synchronously so a single
 * job stays cheap, checkpointed, and observable. Nothing runs off an unclaimed handoff.
 */

export interface HandoffTransportContext {
  /** Durable handoff store (DB-backed in prod; injectable in-memory for tests). */
  store: HandoffStore;
  /** Receiver authorization — the claimed envelope is validated against these (tenant + memory scope). */
  clientWorkspaceId: string | null;
  grantedMemoryScopes: string[];
  /** Lease owner / consumer id recorded on the claim (defaults to `${department}:${destinationAgent}`). */
  consumer?: string;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

export interface HopExecution<T> {
  /** The node's real result, returned to the caller. */
  value: T;
  /** Optional delivery telemetry recorded on completion (cost/latency/quality). */
  telemetry?: { costEstimate?: number; latencyMs?: number; qualityScore?: number };
}

export interface HandoffHopResult<T> {
  result: T;
  handoffId: string;
}

/** Thrown when a hop's envelope is dispatched but was already delivered once (duplicate delivery). The
 *  destination node is NOT re-executed — exactly-once. Callers that resume from checkpoints can ignore it. */
export class HandoffAlreadyProcessedError extends Error {
  readonly handoff: HandoffRow;
  constructor(handoff: HandoffRow) {
    super(`handoff ${handoff.id} already processed (state=${handoff.deliveryState}); node not re-executed`);
    this.name = "HandoffAlreadyProcessedError";
    this.handoff = handoff;
  }
}

/**
 * Drive ONE hop. `execute` runs the destination node body and is invoked ONLY after a valid claim, so no
 * agent executes without a claimed handoff addressed to it.
 */
export async function runHandoffHop<T>(
  envelope: HandoffEnvelope,
  execute: (claimed: HandoffRow) => Promise<HopExecution<T>>,
  ctx: HandoffTransportContext,
): Promise<HandoffHopResult<T>> {
  const deps = { store: ctx.store, recordAudit: ctx.recordAudit, now: ctx.now };
  const receiverCtx = { clientWorkspaceId: ctx.clientWorkspaceId, grantedMemoryScopes: ctx.grantedMemoryScopes };
  const consumer = ctx.consumer ?? `${envelope.department}:${envelope.destinationAgent ?? envelope.destinationCapability ?? "consumer"}`;

  // 1. Dispatch: persist the envelope, rejecting wrong-workspace / over-authorized-memory BEFORE storing.
  const { handoff, deduped } = await dispatchHandoff(envelope, receiverCtx, deps);

  // 2. Duplicate delivery: the envelope was dispatched before. If it is already past `delivered`
  //    (processing/acknowledged/completed/dead), it was handled once — do NOT re-execute (exactly-once).
  if (deduped && handoff.deliveryState !== "delivered") {
    throw new HandoffAlreadyProcessedError(handoff);
  }

  // 3. Claim MY specific handoff under a lease (atomic delivered→processing). If we can't, another
  //    consumer already holds it — never double-process.
  const claimed = await claimHandoffById(handoff.id, consumer, deps);
  if (!claimed) throw new Error(`handoff transport: could not claim ${handoff.id} (no longer delivered)`);

  // 4. Defense-in-depth: re-validate the CLAIMED envelope against the receiver (destination + auth). A
  //    tampered/mis-routed row is failed, not executed.
  const check = validateHandoff(claimed.envelope, receiverCtx);
  if (!check.ok) {
    await failHandoff(claimed.id, `claimed handoff failed re-validation: ${check.errors.join("; ")}`, deps);
    throw new Error(`handoff transport: claimed handoff ${claimed.id} invalid — ${check.errors.join("; ")}`);
  }

  // 5. Execute the destination node — gated behind the valid claim.
  let out: HopExecution<T>;
  try {
    out = await execute(claimed);
  } catch (error) {
    // Failure → retry (backoff) or dead-letter. Re-throw so the caller's checkpoint/rollback runs.
    await failHandoff(claimed.id, error instanceof Error ? error.message : String(error), deps);
    throw error;
  }

  // 6. Durable acknowledgement + completion (with delivery telemetry).
  await acknowledgeHandoff(claimed.id, deps);
  await completeHandoff(claimed.id, out.telemetry ?? {}, deps);
  return { result: out.value, handoffId: claimed.id };
}
