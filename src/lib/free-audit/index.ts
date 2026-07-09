import { desc, eq } from "drizzle-orm";
import { audits as auditsTable } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { FREE_AUDIT_MODULE, buildAuditRow, diagnose, type AuditRow, type RunAuditInput } from "@/lib/domain/free-audit";

/**
 * Free Audit service (IO). Runs the deterministic diagnosis, persists the audit, links it to a CRM
 * company/opportunity. Zero LLM spend. The multi-agent LLM enrichment is a later layer that writes
 * into the same audits row.
 */

export interface AuditStore {
  insertAudit(row: AuditRow): Promise<void>;
  listAudits(q: { kind?: string; limit: number }): Promise<AuditRow[]>;
  getAudit(id: string): Promise<AuditRow | null>;
}

export interface FreeAuditDeps {
  store?: AuditStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

export async function runFreeAudit(input: RunAuditInput, deps: FreeAuditDeps = {}): Promise<AuditRow> {
  const store = deps.store ?? defaultStore();
  const report = diagnose(input);
  const row = buildAuditRow(input, report, { now: deps.now, kind: "free" });
  await store.insertAudit(row);
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))({
    eventType: "audit.free_completed",
    module: FREE_AUDIT_MODULE,
    entityType: "audit",
    entityId: row.id,
    actor: row.createdBy ?? "system",
    metadata: { businessName: row.businessName, opportunities: report.serviceCount, quickWins: report.quickWins.length, companyId: row.companyId },
  });
  return row;
}

export async function listAudits(query: { kind?: string; limit?: number } = {}, deps: FreeAuditDeps = {}): Promise<AuditRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listAudits({ kind: query.kind, limit: Math.min(Math.max(query.limit ?? 100, 1), 300) });
}

export async function getAudit(id: string, deps: FreeAuditDeps = {}): Promise<AuditRow | null> {
  return (deps.store ?? defaultStore()).getAudit(id);
}

export function defaultStore(db: Db = getDb()): AuditStore {
  return {
    async insertAudit(row) { await db.insert(auditsTable).values({ ...row, report: row.report as unknown as Record<string, unknown> }); },
    async listAudits(q) {
      const base = db.select().from(auditsTable);
      const rows = await (q.kind ? base.where(eq(auditsTable.kind, q.kind)) : base).orderBy(desc(auditsTable.createdAt)).limit(q.limit);
      return rows as unknown as AuditRow[];
    },
    async getAudit(id) { const r = await db.select().from(auditsTable).where(eq(auditsTable.id, id)).limit(1); return (r[0] as unknown as AuditRow) ?? null; },
  };
}
