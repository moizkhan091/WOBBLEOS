import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getDb, type Db } from "@/db";

/** Backup & Restore — a real point-in-time export of the business-critical tables. Read-only. */

// The tables worth snapshotting (business data, not ephemeral job/queue rows).
const BACKUP_TABLES: Array<{ key: string; table: typeof schema.crmCompanies }> = [
  { key: "crm_companies", table: schema.crmCompanies },
  { key: "crm_contacts", table: schema.crmContacts as never },
  { key: "crm_opportunities", table: schema.crmOpportunities as never },
  { key: "crm_leads", table: schema.crmLeads as never },
  { key: "invoices", table: schema.invoices as never },
  { key: "proposals", table: schema.proposals as never },
  { key: "audits", table: schema.audits as never },
  { key: "tasks", table: schema.tasks as never },
  { key: "meetings", table: schema.meetings as never },
  { key: "projects", table: schema.projects as never },
  { key: "decisions", table: schema.decisions as never },
  { key: "offers", table: schema.offers as never },
  { key: "seo_plans", table: schema.seoPlans as never },
  { key: "radar_scans", table: schema.radarScans as never },
  { key: "automation_rules", table: schema.automationRules as never },
];

const PER_TABLE_CAP = 10_000;

export interface BackupOverview {
  tables: Array<{ key: string; rows: number }>;
  totalRows: number;
}

export async function getBackupOverview(deps: { db?: Db } = {}): Promise<BackupOverview> {
  const db = deps.db ?? getDb();
  const tables: Array<{ key: string; rows: number }> = [];
  for (const { key, table } of BACKUP_TABLES) {
    try {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(table as never);
      tables.push({ key, rows: Number(count) });
    } catch {
      tables.push({ key, rows: -1 }); // table missing / not migrated
    }
  }
  return { tables, totalRows: tables.reduce((s, t) => s + Math.max(0, t.rows), 0) };
}

export interface BackupSnapshot {
  generatedAt: string;
  version: string;
  data: Record<string, Record<string, unknown>[]>;
  truncated: string[];
}

/** Full snapshot of business tables (capped per table so a runaway export can't OOM; truncation is reported, never silent). */
export async function exportSnapshot(generatedAt: string, deps: { db?: Db } = {}): Promise<BackupSnapshot> {
  const db = deps.db ?? getDb();
  const data: Record<string, Record<string, unknown>[]> = {};
  const truncated: string[] = [];
  for (const { key, table } of BACKUP_TABLES) {
    try {
      const rows = await db.select().from(table as never).limit(PER_TABLE_CAP + 1);
      if (rows.length > PER_TABLE_CAP) { truncated.push(key); data[key] = rows.slice(0, PER_TABLE_CAP) as Record<string, unknown>[]; }
      else data[key] = rows as Record<string, unknown>[];
    } catch {
      data[key] = [];
    }
  }
  return { generatedAt, version: "wobble-os-backup-1", data, truncated };
}
