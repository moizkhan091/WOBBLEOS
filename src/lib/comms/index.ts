import { and, desc, eq } from "drizzle-orm";
import { communications as commsTable } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { AutonomyDecision } from "@/lib/domain/autonomy";
import {
  COMMUNICATION_MODULE,
  buildCommunicationRow,
  canTransitionCommunication,
  isExternalChannel,
  preparationAction,
  sendAction,
  type CommunicationChannel,
  type CommunicationRow,
  type PrepareCommunicationInput,
} from "@/lib/domain/comms";

export interface CommunicationStore {
  insert(row: CommunicationRow): Promise<void>;
  getById(id: string): Promise<CommunicationRow | null>;
  getByDedupeKey(key: string): Promise<CommunicationRow | null>;
  list(q: { status?: string; channel?: string; limit: number }): Promise<CommunicationRow[]>;
  update(id: string, fields: Partial<CommunicationRow>): Promise<void>;
}

export interface CommunicationDeps {
  store?: CommunicationStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  /** Resolve the earned-autonomy decision for an action. Injectable for tests; default is DB-backed. */
  resolveAutonomy?: (action: { category: string; reversible: boolean; riskLevel: "low" | "medium" | "high" | "critical"; qaPassed: boolean; companyId?: string | null; clientId?: string | null; projectId?: string | null }) => Promise<AutonomyDecision>;
  /** When true, an earned grant can RELEASE the reversible preparation/delivery. Off → always founder-held. */
  enforceAutonomy?: boolean;
  now?: Date;
}

async function audit(deps: CommunicationDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

async function resolve(deps: CommunicationDeps, action: Parameters<NonNullable<CommunicationDeps["resolveAutonomy"]>>[0]): Promise<AutonomyDecision> {
  if (deps.resolveAutonomy) return deps.resolveAutonomy(action);
  const { resolveActionAutonomy } = await import("@/lib/autonomy");
  return resolveActionAutonomy(action as never, { now: deps.now });
}

export interface PrepareResult {
  communication: CommunicationRow;
  /** true if a grant RELEASED the reversible action (internal → delivered; external/proposal → ready). */
  released: boolean;
  /** true if this call was a no-op because an idempotent (dedupeKey) row already existed. */
  deduped: boolean;
  decision: AutonomyDecision | null;
}

/**
 * PREPARE a communication (the reversible action point). Always creates a durable `prepared` draft first, so
 * the founder can inspect/cancel it — nothing is fabricated or hidden. Then Earned Autonomy decides:
 *   - level `autonomous` (an earned, scope-matched grant) → RELEASE the reversible step: an INTERNAL notification
 *     is DELIVERED (status `sent`); an EXTERNAL/PROPOSAL comm is advanced to `ready` (staged for a founder send).
 *   - otherwise → the draft stays `prepared` and is HELD; the resolved level (baseline `recommend`) is recorded.
 * The actual SEND of an external/proposal comm is a SEPARATE, confirm-capped action (`sendCommunication`).
 * Idempotent: a repeated prepare with the same `dedupeKey` returns the existing row (never double-creates/sends).
 */
export async function prepareCommunication(input: PrepareCommunicationInput, deps: CommunicationDeps = {}): Promise<PrepareResult> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();

  if (input.dedupeKey) {
    const existing = await store.getByDedupeKey(input.dedupeKey);
    if (existing) return { communication: existing, released: existing.actedAutonomously, deduped: true, decision: null };
  }

  const row = buildCommunicationRow(input, { now });
  await store.insert(row);
  await audit(deps, { eventType: "communication.prepared", module: COMMUNICATION_MODULE, entityType: "communication", entityId: row.id, actor: row.preparedBy, metadata: { channel: row.channel, kind: row.kind, scopeType: row.scopeType, companyId: row.companyId, clientId: row.clientId } });

  const act = preparationAction(row.channel);
  const decision = deps.enforceAutonomy
    ? await resolve(deps, { ...act, companyId: row.companyId, clientId: row.clientId, projectId: row.projectId })
    : null;

  if (decision && decision.level === "autonomous") {
    // RELEASE the reversible step. Internal notification → delivered; external/proposal → staged ready.
    const internal = !isExternalChannel(row.channel);
    const fields: Partial<CommunicationRow> = internal
      ? { status: "sent", sentBy: "autonomy:earned", sentAt: now, actedAutonomously: true, autonomyLevel: decision.level, autonomyPolicyId: decision.appliedPolicyId, updatedAt: now }
      : { status: "ready", actedAutonomously: true, autonomyLevel: decision.level, autonomyPolicyId: decision.appliedPolicyId, updatedAt: now };
    await store.update(row.id, fields);
    await audit(deps, { eventType: internal ? "communication.delivered_autonomously" : "communication.prepared_autonomously", module: COMMUNICATION_MODULE, entityType: "communication", entityId: row.id, actor: "autonomy:earned", metadata: { channel: row.channel, category: act.category, autonomyPolicyId: decision.appliedPolicyId } });
    return { communication: { ...row, ...fields }, released: true, deduped: false, decision };
  }

  // Held for the founder: record the resolved (or baseline) level so the queue shows WHY it is waiting.
  const level = decision?.level ?? "recommend";
  await store.update(row.id, { autonomyLevel: level, autonomyPolicyId: decision?.appliedPolicyId ?? null, updatedAt: now });
  return { communication: { ...row, autonomyLevel: level, autonomyPolicyId: decision?.appliedPolicyId ?? null }, released: false, deduped: false, decision };
}

export interface SendResult {
  communication: CommunicationRow;
  /** The resolved level for the SEND action — proves an external/proposal send is capped at `confirm`. */
  sendDecision: AutonomyDecision | null;
}

/**
 * SEND a prepared/ready communication. This is the confirm-capped action point: for an EXTERNAL/PROPOSAL channel
 * the send is irreversible, so the hard sensitivity cap forces a `confirm` ceiling — NO grant can auto-send it,
 * and this function is only ever reached through the founder-gated API (a founder is in the loop). We still
 * resolve + record the send-action decision to make the cap explicit + auditable. An internal notification send
 * is just delivery (low-risk). Returns null when the communication is missing or not in a sendable state.
 */
export async function sendCommunication(id: string, opts: { sentBy: string }, deps: CommunicationDeps = {}): Promise<SendResult | null> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const comm = await store.getById(id);
  if (!comm) return null;
  if (!canTransitionCommunication(comm.status, "sent")) return null;

  const act = sendAction(comm.channel);
  // Resolve the send decision to record WHY (external/proposal → capped at confirm; can never be autonomous here).
  const sendDecision = deps.enforceAutonomy
    ? await resolve(deps, { ...act, companyId: comm.companyId, clientId: comm.clientId, projectId: comm.projectId })
    : null;

  const fields: Partial<CommunicationRow> = { status: "sent", sentBy: opts.sentBy, sentAt: now, autonomyLevel: sendDecision?.level ?? comm.autonomyLevel, updatedAt: now };
  await store.update(id, fields);
  await audit(deps, { eventType: "communication.sent", module: COMMUNICATION_MODULE, entityType: "communication", entityId: id, actor: opts.sentBy, metadata: { channel: comm.channel, category: act.category, sendLevel: sendDecision?.level ?? null, capped: sendDecision?.capped ?? null } });
  return { communication: { ...comm, ...fields }, sendDecision };
}

/** CANCEL a prepared/ready communication (rollback of a reversible draft). Sent comms cannot be cancelled. */
export async function cancelCommunication(id: string, opts: { cancelledBy: string; reason?: string }, deps: CommunicationDeps = {}): Promise<CommunicationRow | null> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const comm = await store.getById(id);
  if (!comm) return null;
  if (!canTransitionCommunication(comm.status, "cancelled")) return null;
  const fields: Partial<CommunicationRow> = { status: "cancelled", cancelledAt: now, updatedAt: now };
  await store.update(id, fields);
  await audit(deps, { eventType: "communication.cancelled", module: COMMUNICATION_MODULE, entityType: "communication", entityId: id, actor: opts.cancelledBy, metadata: { channel: comm.channel, reason: opts.reason ?? null } });
  return { ...comm, ...fields };
}

export async function listCommunications(query: { status?: string; channel?: string; limit?: number } = {}, deps: CommunicationDeps = {}): Promise<CommunicationRow[]> {
  const store = deps.store ?? defaultStore();
  return store.list({ status: query.status, channel: query.channel, limit: Math.min(Math.max(query.limit ?? 100, 1), 500) });
}

export async function getCommunication(id: string, deps: CommunicationDeps = {}): Promise<CommunicationRow | null> {
  return (deps.store ?? defaultStore()).getById(id);
}

export function defaultStore(db: Db = getDb()): CommunicationStore {
  return {
    async insert(row) { await db.insert(commsTable).values(row as never); },
    async getById(id) { const r = await db.select().from(commsTable).where(eq(commsTable.id, id)).limit(1); return (r[0] as CommunicationRow) ?? null; },
    async getByDedupeKey(key) { const r = await db.select().from(commsTable).where(eq(commsTable.dedupeKey, key)).limit(1); return (r[0] as CommunicationRow) ?? null; },
    async list(q) {
      const conds = [];
      if (q.status) conds.push(eq(commsTable.status, q.status));
      if (q.channel) conds.push(eq(commsTable.channel, q.channel));
      const base = db.select().from(commsTable);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(commsTable.createdAt)).limit(q.limit);
      return rows as CommunicationRow[];
    },
    async update(id, fields) { await db.update(commsTable).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() }).where(eq(commsTable.id, id)); },
  };
}
