import { and, desc, eq, isNull } from "drizzle-orm";
import { projects as projectsTable } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { PROJECT_MODULE, buildProjectRow, canTransitionProject, computeHealthScore, type CreateProjectInput, type ProjectMilestone, type ProjectDeliverable, type ProjectRow, type ProjectStatus } from "@/lib/domain/project";

/** Projects / client-delivery service (IO). Won deals become project workspaces. Soft-delete + audited. */

export interface ProjectStore {
  insertProject(row: ProjectRow): Promise<void>;
  listProjects(q: { status?: string; companyId?: string; opportunityId?: string; includeArchived?: boolean; limit: number }): Promise<ProjectRow[]>;
  getProject(id: string): Promise<ProjectRow | null>;
  updateProject(id: string, fields: Partial<ProjectRow>): Promise<void>;
}
export interface ProjectDeps {
  store?: ProjectStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
  /** Fired (best-effort) when a project transitions to `completed` — the real trigger for the Delivery
   *  Completion product (routes to Finance/Research/Founder). Injectable/off in tests; the default emits it. */
  onProjectCompleted?: (project: ProjectRow, actor: string) => Promise<void>;
}
async function audit(deps: ProjectDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export async function addProject(input: CreateProjectInput, deps: ProjectDeps = {}): Promise<ProjectRow> {
  const store = deps.store ?? defaultStore();
  const row = buildProjectRow(input, { now: deps.now });
  await store.insertProject(row);
  await audit(deps, { eventType: "project.created", module: PROJECT_MODULE, entityType: "project", entityId: row.id, actor: row.createdBy ?? "system", metadata: { name: row.name, companyId: row.companyId, opportunityId: row.opportunityId } });
  return row;
}

export async function listProjects(query: { status?: string; companyId?: string; opportunityId?: string; limit?: number } = {}, deps: ProjectDeps = {}): Promise<ProjectRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listProjects({ ...query, limit: Math.min(Math.max(query.limit ?? 300, 1), 1000) });
}

export async function transitionProject(id: string, to: ProjectStatus, input: { actor?: string } = {}, deps: ProjectDeps = {}): Promise<ProjectRow | null> {
  const store = deps.store ?? defaultStore();
  const project = await store.getProject(id);
  if (!project || !canTransitionProject(project.status, to)) return null;
  const now = deps.now ?? new Date();
  const next = { ...project, status: to };
  const fields: Partial<ProjectRow> = { status: to, updatedAt: now, healthScore: computeHealthScore(next, now) };
  await store.updateProject(id, fields);
  await audit(deps, { eventType: `project.${to}`, module: PROJECT_MODULE, entityType: "project", entityId: id, actor: input.actor ?? "system", metadata: { from: project.status, to } });
  const completed: ProjectRow = { ...project, ...fields };
  // REAL TRIGGER for the Delivery Completion product: when a project completes, emit the versioned completion
  // to Finance (deterministic recognition) / Research (lessons) / Founder. Best-effort — a routing failure
  // (e.g. departments unseeded) never fails the transition. Lazy import avoids a projects↔delivery cycle.
  if (to === "completed") {
    const emit = deps.onProjectCompleted ?? (process.env.DATABASE_URL ? async (p: ProjectRow, actor: string) => { const { completeDelivery } = await import("@/lib/delivery-completion"); await completeDelivery({ project: p, requestedBy: actor }, {}); } : undefined);
    if (emit) await emit(completed, input.actor ?? "system").catch((e) => console.error("[project.completed] delivery-completion emit failed (transition still committed):", e instanceof Error ? e.message : e));
  }
  return completed;
}

/** Toggle a milestone/deliverable done state and recompute health. index into combined list is item-specific. */
export async function updateProgress(id: string, patch: { milestones?: ProjectMilestone[]; deliverables?: ProjectDeliverable[] }, input: { actor?: string } = {}, deps: ProjectDeps = {}): Promise<ProjectRow | null> {
  const store = deps.store ?? defaultStore();
  const project = await store.getProject(id);
  if (!project) return null;
  const now = deps.now ?? new Date();
  const next: ProjectRow = { ...project, milestones: patch.milestones ?? project.milestones, deliverables: patch.deliverables ?? project.deliverables };
  const fields: Partial<ProjectRow> = { milestones: next.milestones, deliverables: next.deliverables, healthScore: computeHealthScore(next, now), updatedAt: now };
  await store.updateProject(id, fields);
  await audit(deps, { eventType: "project.progress", module: PROJECT_MODULE, entityType: "project", entityId: id, actor: input.actor ?? "system", metadata: { milestones: next.milestones.length, deliverables: next.deliverables.length } });
  return { ...project, ...fields };
}

export function defaultStore(db: Db = getDb()): ProjectStore {
  return {
    async insertProject(row) { await db.insert(projectsTable).values(row as typeof projectsTable.$inferInsert); },
    async listProjects(q) {
      const conds = [];
      if (q.status) conds.push(eq(projectsTable.status, q.status));
      if (q.companyId) conds.push(eq(projectsTable.companyId, q.companyId));
      if (q.opportunityId) conds.push(eq(projectsTable.opportunityId, q.opportunityId));
      if (!q.includeArchived) conds.push(isNull(projectsTable.archivedAt));
      const base = db.select().from(projectsTable);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(projectsTable.createdAt)).limit(q.limit);
      return rows as ProjectRow[];
    },
    async getProject(id) { const r = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1); return (r[0] as ProjectRow) ?? null; },
    async updateProject(id, fields) { await db.update(projectsTable).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() } as Partial<typeof projectsTable.$inferInsert>).where(eq(projectsTable.id, id)); },
  };
}
