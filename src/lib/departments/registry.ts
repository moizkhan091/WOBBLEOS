import { and, eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { departments as departmentsTable, departmentMembers as departmentMembersTable } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  buildDepartmentRow,
  type DepartmentInput,
  type DepartmentRow,
  type DepartmentStatus,
  type DepartmentHealthStatus,
} from "@/lib/domain/department";
import {
  buildDepartmentMemberRow,
  type DepartmentMemberInput,
  type DepartmentMemberRow,
} from "@/lib/domain/department-membership";

/**
 * Department Registry service (Phase 3, Batch 3). The single source of truth for departments and their
 * memberships — CRUD + versioning + idempotent upsert (for seeding the canonical org). Injectable store
 * so it is DB-free testable; the default store is DB-backed and used when DATABASE_URL is set.
 */

export interface DepartmentRegistryStore {
  insertDepartment(row: DepartmentRow): Promise<void>;
  getDepartmentBySlug(slug: string): Promise<DepartmentRow | null>;
  listDepartments(query: { status?: DepartmentStatus }): Promise<DepartmentRow[]>;
  updateDepartment(slug: string, fields: Partial<DepartmentRow>): Promise<void>;
  insertMember(row: DepartmentMemberRow): Promise<void>;
  getMember(departmentSlug: string, memberType: string, memberRef: string): Promise<DepartmentMemberRow | null>;
  listMembers(departmentSlug: string): Promise<DepartmentMemberRow[]>;
  listMembershipsForRef(memberRef: string): Promise<DepartmentMemberRow[]>;
  updateMember(id: string, fields: Partial<DepartmentMemberRow>): Promise<void>;
}

export interface DepartmentRegistryDeps {
  store?: DepartmentRegistryStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

async function audit(deps: DepartmentRegistryDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

/** Order-independent JSON: Postgres jsonb does not preserve object key order, so a naive JSON.stringify
 *  reports a false "change" after a round-trip. Sorting keys recursively makes the comparison stable. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

/** Compare two department policies ignoring volatile fields (version/health/timestamps). */
function departmentPolicyChanged(desired: DepartmentRow, existing: DepartmentRow): boolean {
  const strip = (d: DepartmentRow) => ({ ...d, version: 0, healthStatus: "", createdAt: 0, updatedAt: 0 });
  return stableStringify(strip(desired)) !== stableStringify(strip(existing));
}

// ---- departments -------------------------------------------------------------------------------

export async function createDepartment(input: DepartmentInput, deps: DepartmentRegistryDeps = {}): Promise<DepartmentRow> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const row = buildDepartmentRow(input, { now });
  await store.insertDepartment(row);
  await audit(deps, { eventType: "department.created", module: "departments", entityType: "department", entityId: row.slug, actor: row.owner ?? "system", metadata: { name: row.name, status: row.status, version: row.version } });
  return row;
}

export async function getDepartment(slug: string, deps: DepartmentRegistryDeps = {}): Promise<DepartmentRow | null> {
  return (deps.store ?? defaultStore()).getDepartmentBySlug(slug);
}

export async function listDepartments(query: { status?: DepartmentStatus } = {}, deps: DepartmentRegistryDeps = {}): Promise<DepartmentRow[]> {
  return (deps.store ?? defaultStore()).listDepartments(query);
}

/** Idempotent seed/upsert: insert if new, else update the policy IN PLACE (preserving id + createdAt) and
 *  bump the version when the policy actually changed. Returns the resulting row. */
export async function upsertDepartment(input: DepartmentInput, deps: DepartmentRegistryDeps = {}): Promise<DepartmentRow> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const existing = await store.getDepartmentBySlug(typeof input.slug === "string" ? input.slug : "");
  if (!existing) return createDepartment(input, deps);

  // Rebuild the desired policy, preserving identity + creation time; version bumps only on a real change.
  const desired = buildDepartmentRow(input, { id: existing.id, now: existing.createdAt });
  const changed = departmentPolicyChanged(desired, existing);
  const version = changed ? existing.version + 1 : existing.version;
  const fields: Partial<DepartmentRow> = { ...desired, id: existing.id, createdAt: existing.createdAt, healthStatus: existing.healthStatus, version, updatedAt: now };
  await store.updateDepartment(existing.slug, fields);
  if (changed) await audit(deps, { eventType: "department.updated", module: "departments", entityType: "department", entityId: existing.slug, actor: desired.owner ?? "system", metadata: { version, fromVersion: existing.version } });
  return { ...existing, ...fields };
}

export async function setDepartmentStatus(slug: string, status: DepartmentStatus, actor: string, deps: DepartmentRegistryDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const existing = await store.getDepartmentBySlug(slug);
  if (!existing) return false;
  await store.updateDepartment(slug, { status, updatedAt: now });
  await audit(deps, { eventType: "department.status_changed", module: "departments", entityType: "department", entityId: slug, actor, metadata: { from: existing.status, to: status } });
  return true;
}

/** Persist a computed health status (Batch 6 writes this; kept here so the registry owns the field). */
export async function setDepartmentHealth(slug: string, health: DepartmentHealthStatus, deps: DepartmentRegistryDeps = {}): Promise<boolean> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const existing = await store.getDepartmentBySlug(slug);
  if (!existing) return false;
  if (existing.healthStatus === health) return true; // no-op, no audit churn
  await store.updateDepartment(slug, { healthStatus: health, updatedAt: now });
  await audit(deps, { eventType: "department.health_changed", module: "departments", entityType: "department", entityId: slug, actor: "system", metadata: { from: existing.healthStatus, to: health } });
  return true;
}

// ---- memberships -------------------------------------------------------------------------------

export async function addMember(input: DepartmentMemberInput, deps: DepartmentRegistryDeps = {}): Promise<DepartmentMemberRow> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const row = buildDepartmentMemberRow(input, { now });
  await store.insertMember(row);
  await audit(deps, { eventType: "department.member_added", module: "departments", entityType: "department_member", entityId: row.id, actor: "system", metadata: { department: row.departmentSlug, memberRef: row.memberRef, role: row.role } });
  return row;
}

/** Idempotent membership upsert (for seeding): update in place if the (dept, type, ref) exists. */
export async function upsertMember(input: DepartmentMemberInput, deps: DepartmentRegistryDeps = {}): Promise<DepartmentMemberRow> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const desired = buildDepartmentMemberRow(input, { now });
  const existing = await store.getMember(desired.departmentSlug, desired.memberType, desired.memberRef);
  if (!existing) return addMember(input, deps);
  const fields: Partial<DepartmentMemberRow> = { ...desired, id: existing.id, createdAt: existing.createdAt, updatedAt: now };
  await store.updateMember(existing.id, fields);
  return { ...existing, ...fields };
}

export async function listMembers(departmentSlug: string, deps: DepartmentRegistryDeps = {}): Promise<DepartmentMemberRow[]> {
  return (deps.store ?? defaultStore()).listMembers(departmentSlug);
}

export async function listMembershipsForRef(memberRef: string, deps: DepartmentRegistryDeps = {}): Promise<DepartmentMemberRow[]> {
  return (deps.store ?? defaultStore()).listMembershipsForRef(memberRef);
}

export async function setMemberActive(id: string, active: boolean, deps: DepartmentRegistryDeps = {}): Promise<void> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  await store.updateMember(id, { active, updatedAt: now });
}

// ---- DB default store --------------------------------------------------------------------------

function serializeDepartment(row: Partial<DepartmentRow>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const k of ["permissions", "io", "events", "governance", "kpis", "budget", "limits", "metadata", "deterministicServices"]) {
    if (k in out && out[k] !== undefined) out[k] = out[k] as unknown as Record<string, unknown>;
  }
  return out;
}

export function defaultStore(db: Db = getDb()): DepartmentRegistryStore {
  return {
    async insertDepartment(row) {
      await db.insert(departmentsTable).values(serializeDepartment(row) as never);
    },
    async getDepartmentBySlug(slug) {
      const rows = await db.select().from(departmentsTable).where(eq(departmentsTable.slug, slug)).limit(1);
      return (rows[0] as unknown as DepartmentRow) ?? null;
    },
    async listDepartments(query) {
      const base = db.select().from(departmentsTable);
      const rows = await (query.status ? base.where(eq(departmentsTable.status, query.status)) : base).orderBy(departmentsTable.slug);
      return rows as unknown as DepartmentRow[];
    },
    async updateDepartment(slug, fields) {
      await db.update(departmentsTable).set(serializeDepartment(fields) as never).where(eq(departmentsTable.slug, slug));
    },
    async insertMember(row) {
      await db.insert(departmentMembersTable).values({ ...row, budgetLimits: row.budgetLimits as unknown as Record<string, unknown> } as never);
    },
    async getMember(departmentSlug, memberType, memberRef) {
      const rows = await db
        .select()
        .from(departmentMembersTable)
        .where(and(eq(departmentMembersTable.departmentSlug, departmentSlug), eq(departmentMembersTable.memberType, memberType), eq(departmentMembersTable.memberRef, memberRef)))
        .limit(1);
      return (rows[0] as unknown as DepartmentMemberRow) ?? null;
    },
    async listMembers(departmentSlug) {
      const rows = await db.select().from(departmentMembersTable).where(eq(departmentMembersTable.departmentSlug, departmentSlug)).orderBy(departmentMembersTable.priority);
      return rows as unknown as DepartmentMemberRow[];
    },
    async listMembershipsForRef(memberRef) {
      const rows = await db.select().from(departmentMembersTable).where(eq(departmentMembersTable.memberRef, memberRef));
      return rows as unknown as DepartmentMemberRow[];
    },
    async updateMember(id, fields) {
      const set: Record<string, unknown> = { ...fields };
      if ("budgetLimits" in set) set.budgetLimits = set.budgetLimits as unknown as Record<string, unknown>;
      await db.update(departmentMembersTable).set(set as never).where(eq(departmentMembersTable.id, id));
    },
  };
}
