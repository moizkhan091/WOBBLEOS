import { and, desc, eq, isNull } from "drizzle-orm";
import { tasks as tasksTable } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { TASK_MODULE, buildTaskRow, canTransitionTask, isOverdue, type CreateTaskInput, type TaskRow, type TaskStatus } from "@/lib/domain/task";

/** Tasks service (IO). Create/list/update tasks, transition status, assign. Soft-delete + audited. */

export interface TaskStore {
  insertTask(row: TaskRow): Promise<void>;
  listTasks(q: { status?: string; assignedTo?: string; companyId?: string; opportunityId?: string; includeArchived?: boolean; limit: number }): Promise<TaskRow[]>;
  getTask(id: string): Promise<TaskRow | null>;
  updateTask(id: string, fields: Partial<TaskRow>): Promise<void>;
}
export interface TaskDeps {
  store?: TaskStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}
async function audit(deps: TaskDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export async function addTask(input: CreateTaskInput, deps: TaskDeps = {}): Promise<TaskRow> {
  const store = deps.store ?? defaultStore();
  const row = buildTaskRow(input, { now: deps.now });
  await store.insertTask(row);
  await audit(deps, { eventType: "task.created", module: TASK_MODULE, entityType: "task", entityId: row.id, actor: row.createdBy ?? "system", metadata: { title: row.title, assignedTo: row.assignedTo, opportunityId: row.opportunityId } });
  return row;
}

export async function listTasks(query: { status?: string; assignedTo?: string; companyId?: string; opportunityId?: string; limit?: number } = {}, deps: TaskDeps = {}): Promise<TaskRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listTasks({ ...query, limit: Math.min(Math.max(query.limit ?? 300, 1), 1000) });
}

export async function listOverdueTasks(deps: TaskDeps = {}): Promise<TaskRow[]> {
  const now = deps.now ?? new Date();
  const all = await listTasks({ limit: 1000 }, deps);
  return all.filter((t) => isOverdue(t, now));
}

export async function transitionTask(id: string, to: TaskStatus, input: { actor?: string } = {}, deps: TaskDeps = {}): Promise<TaskRow | null> {
  const store = deps.store ?? defaultStore();
  const task = await store.getTask(id);
  if (!task || !canTransitionTask(task.status, to)) return null;
  const now = deps.now ?? new Date();
  const fields: Partial<TaskRow> = { status: to, updatedAt: now };
  if (to === "completed") fields.completedAt = now;
  await store.updateTask(id, fields);
  await audit(deps, { eventType: `task.${to}`, module: TASK_MODULE, entityType: "task", entityId: id, actor: input.actor ?? "system", metadata: { from: task.status, to } });
  return { ...task, ...fields };
}

export async function assignTask(id: string, assignedTo: string, input: { actor?: string } = {}, deps: TaskDeps = {}): Promise<TaskRow | null> {
  const store = deps.store ?? defaultStore();
  const task = await store.getTask(id);
  if (!task) return null;
  const now = deps.now ?? new Date();
  await store.updateTask(id, { assignedTo, updatedAt: now });
  await audit(deps, { eventType: "task.assigned", module: TASK_MODULE, entityType: "task", entityId: id, actor: input.actor ?? "system", metadata: { from: task.assignedTo, to: assignedTo } });
  return { ...task, assignedTo };
}

export function defaultStore(db: Db = getDb()): TaskStore {
  return {
    async insertTask(row) { await db.insert(tasksTable).values(row); },
    async listTasks(q) {
      const conds = [];
      if (q.status) conds.push(eq(tasksTable.status, q.status));
      if (q.assignedTo) conds.push(eq(tasksTable.assignedTo, q.assignedTo));
      if (q.companyId) conds.push(eq(tasksTable.companyId, q.companyId));
      if (q.opportunityId) conds.push(eq(tasksTable.opportunityId, q.opportunityId));
      if (!q.includeArchived) conds.push(isNull(tasksTable.archivedAt));
      const base = db.select().from(tasksTable);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(tasksTable.createdAt)).limit(q.limit);
      return rows as TaskRow[];
    },
    async getTask(id) { const r = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1); return (r[0] as TaskRow) ?? null; },
    async updateTask(id, fields) { await db.update(tasksTable).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() }).where(eq(tasksTable.id, id)); },
  };
}
