import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { escalations as escalationsTable } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  buildEscalationRow,
  type EscalationInput,
  type EscalationRow,
  type EscalationStatus,
  type EscalationResolutionAction,
} from "@/lib/domain/escalation";

/**
 * Escalation service (Phase 3). Creates escalations when department work is blocked (idempotent: one OPEN
 * escalation per department/workflow/task/reason so a retrying step doesn't spam), lists/inspects them for
 * the Founder Command Centre, and resolves them with a truthful action (resume / reroute / blocked /
 * terminate) that the workflow reads to decide what to do next. Every transition is audited.
 */

export interface EscalationStore {
  findOpen(departmentSlug: string, workflowId: string | null, taskId: string | null, reason: string): Promise<EscalationRow | null>;
  insert(row: EscalationRow): Promise<void>;
  getById(id: string): Promise<EscalationRow | null>;
  transition(id: string, fromStatuses: EscalationStatus[], fields: Partial<EscalationRow>): Promise<boolean>;
  list(query: EscalationListQuery & { limit: number }): Promise<EscalationRow[]>;
  countByStatus(): Promise<Record<string, number>>;
}

export interface EscalationListQuery {
  departmentSlug?: string;
  status?: EscalationStatus;
  reason?: string;
}

export interface EscalationDeps {
  store?: EscalationStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

async function audit(deps: EscalationDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

/** Raise an escalation. Idempotent: if an OPEN escalation already exists for this blocked step, it is
 *  returned unchanged (deduped) rather than creating a duplicate. */
export async function createEscalation(input: EscalationInput, deps: EscalationDeps = {}): Promise<{ escalation: EscalationRow; deduped: boolean }> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const row = buildEscalationRow(input, { now });
  const existing = await store.findOpen(row.departmentSlug, row.workflowId, row.taskId, row.reason);
  if (existing) return { escalation: existing, deduped: true };
  try {
    await store.insert(row);
  } catch {
    const raced = await store.findOpen(row.departmentSlug, row.workflowId, row.taskId, row.reason);
    if (raced) return { escalation: raced, deduped: true };
    throw new Error("escalation: insert failed");
  }
  await audit(deps, { eventType: "escalation.created", module: "departments", entityType: "escalation", entityId: row.id, actor: "system", metadata: { departmentSlug: row.departmentSlug, workflowId: row.workflowId, reason: row.reason, severity: row.severity, assignee: row.assignee } });
  return { escalation: row, deduped: false };
}

export async function acknowledgeEscalation(id: string, actor: string, deps: EscalationDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const ok = await store.transition(id, ["open"], { status: "acknowledged", acknowledgedAt: now, updatedAt: now });
  if (ok) await audit(deps, { eventType: "escalation.acknowledged", module: "departments", entityType: "escalation", entityId: id, actor, metadata: {} });
  return ok;
}

export interface ResolveEscalationInput {
  action: EscalationResolutionAction;
  resolution: string;
  resolvedBy: string;
}

/** Resolve an escalation with a decision. The `action` is what the workflow should do next (resume /
 *  reroute / blocked / terminate). `dismissed` is for a non-actionable escalation. */
export async function resolveEscalation(id: string, input: ResolveEscalationInput, deps: EscalationDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const status: EscalationStatus = input.action === "blocked" ? "acknowledged" : "resolved";
  const ok = await store.transition(id, ["open", "acknowledged"], { status, resolution: input.resolution, resolutionAction: input.action, resolvedBy: input.resolvedBy, resolvedAt: status === "resolved" ? now : null, updatedAt: now });
  if (ok) await audit(deps, { eventType: "escalation.resolved", module: "departments", entityType: "escalation", entityId: id, actor: input.resolvedBy, metadata: { action: input.action, resolution: input.resolution, status } });
  return ok;
}

/** Injectable seams so the real-workflow actions are testable without a DB. Default to the live runtime. */
export interface EscalationActionDeps extends EscalationDeps {
  redriveHandoff?: (id: string, actor: string) => Promise<boolean>;
  cancelHandoff?: (id: string, actor: string) => Promise<boolean>;
  getHandoffState?: (id: string) => Promise<string | null>;
  listWorkflowHandoffs?: (workflowId: string) => Promise<Array<{ id: string; deliveryState: string }>>;
  releaseReservation?: (reservationId: string) => Promise<boolean>;
}

async function handoffRuntime(deps: EscalationActionDeps) {
  const h = await import("@/lib/handoff");
  return {
    redrive: deps.redriveHandoff ?? ((id: string, actor: string) => h.redriveHandoff(id, actor)),
    cancel: deps.cancelHandoff ?? ((id: string, actor: string) => h.cancelHandoff(id, actor)),
    getState: deps.getHandoffState ?? (async (id: string) => (await h.getHandoff(id))?.deliveryState ?? null),
    listWorkflow: deps.listWorkflowHandoffs ?? (async (wf: string) => (await h.listHandoffs({ workflowId: wf, limit: 200 })).map((r) => ({ id: r.id, deliveryState: r.deliveryState }))),
  };
}

/**
 * RESUME: put the real blocked execution back in flight. Redrives the linked handoff (which validates it
 * is resumable — a completed/cancelled handoff cannot be resumed), then resolves the escalation with
 * action=resume. The runtime re-executes from the correct point (handoff + checkpoint dedup preserve
 * completed stages, lineage and tenant scope). If the block persists, a fresh escalation is raised.
 * Idempotent: resuming an already-resolved escalation is a no-op success.
 */
export async function resumeEscalation(id: string, actor: string, deps: EscalationActionDeps = {}): Promise<{ ok: boolean; error?: string }> {
  const store = deps.store ?? defaultStore();
  const row = await store.getById(id);
  if (!row) return { ok: false, error: "escalation not found" };
  if (row.status === "resolved") return { ok: true }; // idempotent
  if (!row.handoffId) return { ok: false, error: "escalation has no linked handoff to resume" };
  const rt = await handoffRuntime(deps);
  const state = await rt.getState(row.handoffId);
  if (state === "completed" || state === "cancelled") return { ok: false, error: `handoff is ${state} — not resumable` };
  const redriven = await rt.redrive(row.handoffId, actor);
  if (!redriven) return { ok: false, error: "handoff could not be redriven (not in a resumable state)" };
  await resolveEscalation(id, { action: "resume", resolution: `Resumed by ${actor}: handoff ${row.handoffId} redriven`, resolvedBy: actor }, deps);
  await audit(deps, { eventType: "escalation.resumed", module: "departments", entityType: "escalation", entityId: id, actor, metadata: { handoffId: row.handoffId, workflowId: row.workflowId } });
  return { ok: true };
}

/**
 * TERMINATE: stop the real workflow. Cancels the linked handoff AND every other non-terminal handoff for
 * the workflow (prevents future retry/redrive + child execution), releases any held budget reservation,
 * preserves completed outputs + evidence + audit, then resolves the escalation with action=terminate.
 * A terminated workflow will not restart unless a founder explicitly starts a new run.
 */
export async function terminateEscalation(id: string, actor: string, deps: EscalationActionDeps = {}): Promise<{ ok: boolean; cancelled: number; error?: string }> {
  const store = deps.store ?? defaultStore();
  const row = await store.getById(id);
  if (!row) return { ok: false, cancelled: 0, error: "escalation not found" };
  if (row.status === "resolved" && row.resolutionAction === "terminate") return { ok: true, cancelled: 0 }; // idempotent
  const rt = await handoffRuntime(deps);
  let cancelled = 0;
  // Cancel every non-terminal handoff for the workflow (the linked one + siblings/children).
  if (row.workflowId) {
    for (const h of await rt.listWorkflow(row.workflowId)) {
      if (!["completed", "cancelled", "dead_lettered"].includes(h.deliveryState)) { if (await rt.cancel(h.id, actor)) cancelled += 1; }
    }
  } else if (row.handoffId) {
    if (await rt.cancel(row.handoffId, actor)) cancelled += 1;
  }
  // Release any held budget reservation.
  if (row.budgetReservationId) {
    const releaseFn = deps.releaseReservation ?? (async (rid: string) => (await import("@/lib/departments/budget")).releaseBudget(rid, {}));
    await releaseFn(row.budgetReservationId).catch(() => false);
  }
  await resolveEscalation(id, { action: "terminate", resolution: `Terminated by ${actor}: ${cancelled} handoff(s) cancelled`, resolvedBy: actor }, deps);
  await audit(deps, { eventType: "escalation.terminated", module: "departments", entityType: "escalation", entityId: id, actor, metadata: { workflowId: row.workflowId, cancelled } });
  return { ok: true, cancelled };
}

export async function dismissEscalation(id: string, actor: string, reason: string, deps: EscalationDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const ok = await store.transition(id, ["open", "acknowledged"], { status: "dismissed", resolution: reason, resolvedBy: actor, resolvedAt: now, updatedAt: now });
  if (ok) await audit(deps, { eventType: "escalation.dismissed", module: "departments", entityType: "escalation", entityId: id, actor, metadata: { reason } });
  return ok;
}

export async function getEscalation(id: string, deps: EscalationDeps = {}): Promise<EscalationRow | null> {
  return (deps.store ?? defaultStore()).getById(id);
}

export async function listEscalations(query: EscalationListQuery & { limit?: number } = {}, deps: EscalationDeps = {}): Promise<EscalationRow[]> {
  const store = deps.store ?? defaultStore();
  return store.list({ ...query, limit: Math.min(Math.max(query.limit ?? 100, 1), 500) });
}

export async function escalationStatusCounts(deps: EscalationDeps = {}): Promise<Record<string, number>> {
  return (deps.store ?? defaultStore()).countByStatus();
}

/**
 * Sweep: raise a `dead_lettered` escalation for every dead-lettered handoff that doesn't already have one
 * open (dedup is per department/workflow/task/reason). The scheduler calls this so blocked inter-agent
 * work surfaces in the Command Centre without any code path having to remember to escalate.
 */
export async function escalateDeadLetteredHandoffs(deps: EscalationDeps & { listDeadLettered?: () => Promise<Array<{ id: string; department: string; workflowId: string; taskId: string; clientWorkspaceId: string | null; sourceAgent: string; failureReason: string | null }>> } = {}): Promise<number> {
  const list = deps.listDeadLettered ?? (async () => {
    const { listHandoffs } = await import("@/lib/handoff");
    const rows = await listHandoffs({ deliveryState: "dead_lettered", limit: 200 });
    return rows.map((r) => ({ id: r.id, department: r.department, workflowId: r.workflowId, taskId: r.taskId, clientWorkspaceId: r.clientWorkspaceId, sourceAgent: r.sourceAgent, failureReason: r.failureReason }));
  });
  const dead = await list();
  let created = 0;
  for (const h of dead) {
    const r = await createEscalation(
      { departmentSlug: h.department, workflowId: h.workflowId, taskId: h.taskId, clientWorkspaceId: h.clientWorkspaceId, sourceAgent: h.sourceAgent, reason: "dead_lettered", severity: "high", handoffId: h.id, requiredDecision: "Dead-lettered handoff: resume (redrive), reroute, or terminate this workflow step.", evidence: { handoffId: h.id, failureReason: h.failureReason }, attemptedRecoveries: ["automatic retries exhausted → dead-lettered"] },
      deps,
    );
    if (!r.deduped) created += 1;
  }
  return created;
}

export function defaultStore(db: Db = getDb()): EscalationStore {
  return {
    async findOpen(departmentSlug, workflowId, taskId, reason) {
      const conds = [eq(escalationsTable.departmentSlug, departmentSlug), eq(escalationsTable.reason, reason), eq(escalationsTable.status, "open")];
      conds.push(workflowId === null ? sql`${escalationsTable.workflowId} is null` : eq(escalationsTable.workflowId, workflowId));
      conds.push(taskId === null ? sql`${escalationsTable.taskId} is null` : eq(escalationsTable.taskId, taskId));
      const rows = await db.select().from(escalationsTable).where(and(...conds)).limit(1);
      return (rows[0] as unknown as EscalationRow) ?? null;
    },
    async insert(row) {
      await db.insert(escalationsTable).values(row as never);
    },
    async getById(id) {
      const rows = await db.select().from(escalationsTable).where(eq(escalationsTable.id, id)).limit(1);
      return (rows[0] as unknown as EscalationRow) ?? null;
    },
    async transition(id, fromStatuses, fields) {
      const updated = await db
        .update(escalationsTable)
        .set(fields as never)
        .where(and(eq(escalationsTable.id, id), sql`${escalationsTable.status} in (${sql.join(fromStatuses.map((s) => sql`${s}`), sql`, `)})`))
        .returning({ id: escalationsTable.id });
      return updated.length > 0;
    },
    async list(query) {
      const conds = [];
      if (query.departmentSlug) conds.push(eq(escalationsTable.departmentSlug, query.departmentSlug));
      if (query.status) conds.push(eq(escalationsTable.status, query.status));
      if (query.reason) conds.push(eq(escalationsTable.reason, query.reason));
      const base = db.select().from(escalationsTable);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(escalationsTable.createdAt)).limit(query.limit);
      return rows as unknown as EscalationRow[];
    },
    async countByStatus() {
      const rows = await db.select({ status: escalationsTable.status, n: sql<number>`count(*)::int` }).from(escalationsTable).groupBy(escalationsTable.status);
      const out: Record<string, number> = {};
      for (const r of rows) out[r.status as string] = Number(r.n);
      return out;
    },
  };
}
