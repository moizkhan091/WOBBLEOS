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
      { departmentSlug: h.department, workflowId: h.workflowId, taskId: h.taskId, clientWorkspaceId: h.clientWorkspaceId, sourceAgent: h.sourceAgent, reason: "dead_lettered", severity: "high", requiredDecision: "Dead-lettered handoff: redrive, reroute, or terminate this workflow step.", evidence: { handoffId: h.id, failureReason: h.failureReason }, attemptedRecoveries: ["automatic retries exhausted → dead-lettered"] },
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
