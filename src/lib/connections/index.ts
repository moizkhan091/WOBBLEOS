import { and, desc, eq, sql } from "drizzle-orm";
import { providerConnections } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  buildConnectionRow,
  connectionGuardSchema,
  evaluateConnectionGuard,
  extractJobConnectionSlugs,
  sanitizeConnection,
  updateConnectionSchema,
  type ConnectionGuardDecision,
  type ConnectionGuardInput,
  type ConnectionRow,
  type ConnectionView,
  type RegisterConnectionInput,
  type UpdateConnectionInput,
} from "@/lib/domain/connections";

export type { ConnectionGuardDecision, ConnectionRow, ConnectionView };

export interface ListConnectionsQuery {
  providerType?: string;
  enabled?: boolean;
  limit?: number;
}

export const DEFAULT_CONNECTION_LIMIT = 100;
export const MAX_CONNECTION_LIMIT = 500;
export function clampConnectionLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_CONNECTION_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_CONNECTION_LIMIT);
}

export interface ConnectionStore {
  insertConnection(row: ConnectionRow): Promise<void>;
  getConnectionById(id: string): Promise<ConnectionRow | null>;
  getConnectionBySlug(slug: string): Promise<ConnectionRow | null>;
  listConnections(query: Required<Pick<ListConnectionsQuery, "limit">> & Omit<ListConnectionsQuery, "limit">): Promise<ConnectionRow[]>;
  updateConnection(id: string, fields: Partial<ConnectionRow>): Promise<void>;
  getCredential(credentialKeyName: string): Promise<string | null>;
}

export interface ConnectionDeps {
  store?: ConnectionStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

async function credentialConfigured(row: ConnectionRow, store: ConnectionStore): Promise<boolean> {
  const credential = await store.getCredential(row.credentialKeyName);
  return Boolean(credential);
}

async function toView(row: ConnectionRow, store: ConnectionStore): Promise<ConnectionView> {
  return sanitizeConnection(row, { credentialConfigured: await credentialConfigured(row, store) });
}

export async function registerConnection(input: RegisterConnectionInput, deps: ConnectionDeps = {}): Promise<ConnectionRow> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const row = buildConnectionRow(input, { now });
  const existing = await store.getConnectionBySlug(row.slug);
  if (existing) return existing;

  await store.insertConnection(row);
  await recordAudit({
    eventType: "connection.registered",
    module: "connections",
    entityType: "provider_connection",
    entityId: row.id,
    metadata: { slug: row.slug, providerType: row.providerType, costCategory: row.costCategory },
  });
  return row;
}

export async function listConnections(query: ListConnectionsQuery = {}, deps: ConnectionDeps = {}): Promise<ConnectionView[]> {
  const store = deps.store ?? defaultStore();
  const rows = await store.listConnections({
    providerType: query.providerType,
    enabled: query.enabled,
    limit: clampConnectionLimit(query.limit),
  });
  return Promise.all(rows.map((row) => toView(row, store)));
}

export async function getConnection(idOrSlug: string, deps: ConnectionDeps = {}): Promise<ConnectionView | null> {
  const store = deps.store ?? defaultStore();
  const row = (await store.getConnectionById(idOrSlug)) ?? (await store.getConnectionBySlug(idOrSlug));
  return row ? toView(row, store) : null;
}

export async function updateConnection(
  idOrSlug: string,
  input: UpdateConnectionInput,
  deps: ConnectionDeps = {},
): Promise<ConnectionView> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const parsed = updateConnectionSchema.parse(input);
  const row = (await store.getConnectionById(idOrSlug)) ?? (await store.getConnectionBySlug(idOrSlug));
  if (!row) throw new Error(`connection '${idOrSlug}' not found`);

  const fields: Partial<ConnectionRow> = { ...parsed, updatedAt: now };
  await store.updateConnection(row.id, fields);
  const updated = { ...row, ...fields } as ConnectionRow;

  const eventType =
    parsed.enabled === false ? "connection.disabled" : parsed.enabled === true ? "connection.enabled" : "connection.updated";
  await recordAudit({
    eventType,
    module: "connections",
    entityType: "provider_connection",
    entityId: row.id,
    metadata: {
      slug: row.slug,
      enabled: updated.enabled,
      allowedModules: updated.allowedModules,
      permissionMode: updated.permissionMode,
      healthStatus: updated.healthStatus,
    },
  });

  return toView(updated, store);
}

export interface ConnectionHealthResult {
  connection: ConnectionView;
  credentialConfigured: boolean;
}

export async function checkConnectionHealth(idOrSlug: string, deps: ConnectionDeps = {}): Promise<ConnectionHealthResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const row = (await store.getConnectionById(idOrSlug)) ?? (await store.getConnectionBySlug(idOrSlug));
  if (!row) throw new Error(`connection '${idOrSlug}' not found`);

  const hasCredential = await credentialConfigured(row, store);
  const healthStatus = !row.enabled ? "disabled" : hasCredential ? "healthy" : "missing_credential";
  await store.updateConnection(row.id, { healthStatus, updatedAt: now });
  const updated = { ...row, healthStatus, updatedAt: now };
  await recordAudit({
    eventType: "connection.health_checked",
    module: "connections",
    entityType: "provider_connection",
    entityId: row.id,
    metadata: { slug: row.slug, healthStatus, credentialConfigured: hasCredential },
  });
  return { connection: sanitizeConnection(updated, { credentialConfigured: hasCredential }), credentialConfigured: hasCredential };
}

export async function guardConnection(input: ConnectionGuardInput, deps: ConnectionDeps = {}): Promise<ConnectionGuardDecision> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const parsed = connectionGuardSchema.parse(input);
  const row = await store.getConnectionBySlug(parsed.slug);
  const decision = evaluateConnectionGuard({
    connection: row,
    slug: parsed.slug,
    module: parsed.module,
    action: parsed.action,
    credentialConfigured: row ? await credentialConfigured(row, store) : false,
  });

  if (!decision.allowed) {
    await recordAudit({
      eventType: "connection.guard_blocked",
      module: "connections",
      entityType: "provider_connection",
      entityId: row?.id ?? parsed.slug,
      metadata: { ...decision },
    });
  }

  return decision;
}

export async function assertConnectionAllowed(input: ConnectionGuardInput, deps: ConnectionDeps = {}): Promise<void> {
  const decision = await guardConnection(input, deps);
  if (!decision.allowed) throw new Error(decision.reason);
}

export async function assertJobConnectionsAllowed(
  job: { type: string; linkedModule?: string | null; payload?: Record<string, unknown> },
  deps: ConnectionDeps = {},
): Promise<void> {
  const payload = job.payload ?? {};
  const required = extractJobConnectionSlugs(payload);
  if (!required.length) return;

  const module = job.linkedModule ?? job.type.split(".")[0] ?? "jobs";
  for (const slug of required) {
    await assertConnectionAllowed({ slug, module, action: job.type }, deps);
  }
}

function mapConnection(row: typeof providerConnections.$inferSelect): ConnectionRow {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    providerType: row.providerType,
    credentialKeyName: row.credentialKeyName,
    enabled: row.enabled,
    allowedModules: row.allowedModules,
    permissionMode: row.permissionMode,
    costCategory: row.costCategory,
    healthStatus: row.healthStatus,
    referenceDocPath: row.referenceDocPath,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function defaultStore(db: Db = getDb()): ConnectionStore {
  return {
    async insertConnection(row) {
      await db.insert(providerConnections).values(row).onConflictDoNothing();
    },
    async getConnectionById(id) {
      const rows = await db.select().from(providerConnections).where(eq(providerConnections.id, id)).limit(1);
      return rows[0] ? mapConnection(rows[0]) : null;
    },
    async getConnectionBySlug(slug) {
      const rows = await db.select().from(providerConnections).where(eq(providerConnections.slug, slug)).limit(1);
      return rows[0] ? mapConnection(rows[0]) : null;
    },
    async listConnections(query) {
      const conditions = [];
      if (query.providerType) conditions.push(eq(providerConnections.providerType, query.providerType));
      if (query.enabled !== undefined) conditions.push(eq(providerConnections.enabled, query.enabled));
      const where = conditions.length ? and(...conditions) : sql`true`;
      const rows = await db.select().from(providerConnections).where(where).orderBy(desc(providerConnections.createdAt)).limit(query.limit);
      return rows.map(mapConnection);
    },
    async updateConnection(id, fields) {
      await db.update(providerConnections).set(fields).where(eq(providerConnections.id, id));
    },
    async getCredential(credentialKeyName) {
      return process.env[credentialKeyName] ?? null;
    },
  };
}
