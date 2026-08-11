import { desc, eq } from "drizzle-orm";
import { audits as auditsTable, crmCompanies, crmLeads } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { FREE_AUDIT_MODULE, FREE_AUDIT_SOURCE, buildAuditRow, diagnose, type AuditRow, type RunAuditInput } from "@/lib/domain/free-audit";
import { findExistingCompanyContainer } from "@/lib/intake";
import { newId } from "@/lib/ids";

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

/**
 * A free audit is the lead magnet, so the business it was run for belongs in the pipeline.
 *
 * Before this, running a free audit for a business nobody had entered in the CRM produced an audit row
 * pointing at nothing: the founder could read the report but the business never appeared in Clients,
 * never got a health score, and never showed up in the worklist. The audit was the last anyone heard
 * of them.
 *
 * The container is found the same way the website form finds it (domain, then email, then an exact
 * name) so a business that later fills the form ENRICHES this record instead of forking a twin.
 */
export async function ensureAuditLandsInPipeline(
  input: { businessName: string; website?: string | null; industry?: string | null; email?: string | null; createdBy?: string | null },
  now: Date,
  db: Db = getDb(),
): Promise<{ companyId: string; created: boolean }> {
  const domain = (input.website ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null;
  const existing = await findExistingCompanyContainer({ domain, name: input.businessName, email: input.email ?? undefined });
  if (existing) return { companyId: existing.id, created: false };

  const companyId = newId("company");
  await db.insert(crmCompanies).values({
    id: companyId,
    name: input.businessName.trim(),
    industry: input.industry ?? null,
    website: input.website ?? null,
    email: input.email ?? null,
    leadSource: FREE_AUDIT_SOURCE,
    status: "prospect",
    tags: ["free_audit"],
    createdBy: input.createdBy ?? "free_audit",
    createdAt: now,
    updatedAt: now,
  });
  // A lead as well as a company: the pipeline counts leads, and a free audit IS an expression of interest.
  await db.insert(crmLeads).values({
    id: newId("lead"),
    name: input.businessName.trim(),
    companyId,
    companyName: input.businessName.trim(),
    website: input.website ?? null,
    industry: input.industry ?? null,
    email: input.email ?? null,
    source: FREE_AUDIT_SOURCE,
    status: "new",
    problemStated: "Ran the free AI audit.",
    createdAt: now,
    updatedAt: now,
  });
  return { companyId, created: true };
}

export async function runFreeAudit(input: RunAuditInput, deps: FreeAuditDeps = {}): Promise<AuditRow> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const report = diagnose(input);
  // Land it in the pipeline first, so the audit row carries the container id rather than orphaning it.
  const companyId = input.companyId ?? (process.env.DATABASE_URL ? (await ensureAuditLandsInPipeline({ businessName: input.businessName, website: input.website, industry: input.industry, createdBy: input.createdBy }, now)).companyId : undefined);
  const row = buildAuditRow({ ...input, companyId }, report, { now: deps.now, kind: "free" });
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
