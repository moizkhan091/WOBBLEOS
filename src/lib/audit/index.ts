import { and, desc, eq } from "drizzle-orm";
import { auditLogs } from "@/db/schema";
import { getDb, type Db } from "@/db";
import {
  buildAuditEvent,
  type AuditEventInput,
  type AuditEventRow,
} from "@/lib/domain/audit";

/**
 * Chunk 03: Audit Log write/read layer.
 *
 * writeAuditEvent is the single entry point the rest of the OS uses. It
 * accepts an injectable writer so domain/unit tests can verify behavior
 * without a live Postgres; in production it falls back to the real Drizzle
 * insert.
 */

export interface AuditWriter {
  insertAudit(row: AuditEventRow): Promise<void>;
}

export interface WriteAuditEventDeps {
  writer?: AuditWriter;
  now?: Date;
  /** Skip the event bus for this write (used internally to prevent recursion). */
  skipEventBus?: boolean;
}

function defaultWriter(db: Db = getDb()): AuditWriter {
  return {
    async insertAudit(row) {
      await db.insert(auditLogs).values({
        id: row.id,
        eventType: row.eventType,
        category: row.category,
        module: row.module,
        entityType: row.entityType,
        entityId: row.entityId,
        actor: row.actor,
        surface: row.surface,
        modelRunId: row.modelRunId,
        costEstimate: row.costEstimate,
        metadata: row.metadata,
        createdAt: row.createdAt,
      });
    },
  };
}

// Modules whose own events must NEVER trigger automations (prevents recursion + noise storms).
const EVENT_BUS_SKIP = new Set(["automations", "scheduler", "jobs", "audit"]);

export async function writeAuditEvent(
  input: AuditEventInput,
  deps: WriteAuditEventDeps = {},
): Promise<AuditEventRow> {
  const row = buildAuditEvent(input, { now: deps.now });
  const writer = deps.writer ?? defaultWriter();
  await writer.insertAudit(row);
  // Event bus: fire event-triggered automation rules for this event. Fire-and-forget (never blocks
  // or breaks the audit write) + dynamic import (avoids an audit↔automations import cycle) +
  // cached rule lookup (dispatchEvent hits the DB at most once per TTL, not per event).
  if (!deps.skipEventBus && !EVENT_BUS_SKIP.has(input.module)) {
    void import("@/lib/automations")
      .then(({ dispatchEvent }) => dispatchEvent(input.eventType, (input.metadata ?? {}) as Record<string, unknown>))
      .catch(() => {});
  }
  return row;
}

export interface ListAuditQuery {
  module?: string;
  category?: string;
  entityType?: string;
  entityId?: string;
  actor?: string;
  limit?: number;
}

export const DEFAULT_AUDIT_LIMIT = 50;
export const MAX_AUDIT_LIMIT = 200;

/** Clamp a requested limit into a safe range (defaults to 50, caps at 200). */
export function clampLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_AUDIT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_AUDIT_LIMIT);
}

export async function listAuditEvents(query: ListAuditQuery = {}, db: Db = getDb()) {
  const conditions = [];
  if (query.module) conditions.push(eq(auditLogs.module, query.module));
  if (query.category) conditions.push(eq(auditLogs.category, query.category));
  if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
  if (query.entityId) conditions.push(eq(auditLogs.entityId, query.entityId));
  if (query.actor) conditions.push(eq(auditLogs.actor, query.actor));

  const where = conditions.length ? and(...conditions) : undefined;

  return db
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(clampLimit(query.limit));
}
