import { sql, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";

/** Backup & Restore — a real point-in-time export + additive, non-destructive restore of business-critical tables. */

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
/** Restore-side guards: cap rows per table (matches the export cap) + chunk id lookups under the PG param ceiling. */
const PER_TABLE_RESTORE_CAP = 10_000;
const ID_QUERY_CHUNK = 1_000;

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

const BACKUP_TABLE_BY_KEY = new Map(BACKUP_TABLES.map((t) => [t.key, t.table]));

export interface SnapshotValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  version: string | null;
  tableKeys: string[];
}

/** Validate a snapshot's shape BEFORE any restore — a malformed / unknown-version / unknown-table payload is rejected. */
export function validateSnapshot(snapshot: unknown): SnapshotValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const s = snapshot as Partial<BackupSnapshot> | null;
  if (!s || typeof s !== "object") return { ok: false, errors: ["snapshot is not an object"], warnings, version: null, tableKeys: [] };
  if (s.version !== "wobble-os-backup-1") errors.push(`unsupported snapshot version: ${String(s.version)}`);
  if (!s.data || typeof s.data !== "object") { errors.push("snapshot.data is missing or not an object"); return { ok: false, errors, warnings, version: s.version ?? null, tableKeys: [] }; }
  const tableKeys = Object.keys(s.data);
  for (const key of tableKeys) {
    if (!BACKUP_TABLE_BY_KEY.has(key)) { warnings.push(`unknown table '${key}' will be ignored`); continue; }
    if (!Array.isArray(s.data[key])) errors.push(`table '${key}' is not an array of rows`);
    else for (const row of s.data[key]) if (!row || typeof (row as { id?: unknown }).id !== "string") { errors.push(`table '${key}' has a row without a string id`); break; }
  }
  if (Array.isArray(s.truncated) && s.truncated.length) warnings.push(`snapshot was TRUNCATED for: ${s.truncated.join(", ")} — those tables are incomplete`);
  return { ok: errors.length === 0, errors, warnings, version: s.version ?? null, tableKeys };
}

export interface RestoreTableResult {
  key: string;
  candidateRows: number;
  /** Rows whose id is not already present — inserted on apply, or would-be-inserted on dry_run. */
  newRows: number;
  /** Rows whose id already exists — ALWAYS skipped (restore is additive; it NEVER overwrites/deletes). */
  existingRows: number;
  inserted: number;
}

export interface RestoreResult {
  ok: boolean;
  mode: "dry_run" | "apply";
  errors: string[];
  warnings: string[];
  tables: RestoreTableResult[];
  totalNew: number;
  totalInserted: number;
}

/**
 * RESTORE a snapshot — ADDITIVE and NON-DESTRUCTIVE. It only ever INSERTS rows whose id is missing; it NEVER
 * deletes or overwrites an existing row (onConflictDoNothing on the PK). `dry_run` (the default) reports exactly
 * what WOULD be inserted per table without writing; `apply` performs the additive insert. This makes restore safe
 * to run against a live DB — the worst case is a no-op. Founder-gated at the route.
 */
export async function restoreSnapshot(
  snapshot: BackupSnapshot,
  opts: { mode?: "dry_run" | "apply"; tables?: string[]; actor?: string },
  deps: { db?: Db; recordAudit?: (i: AuditEventInput) => Promise<void> } = {},
): Promise<RestoreResult> {
  const db = deps.db ?? getDb();
  const mode = opts.mode ?? "dry_run";
  const validation = validateSnapshot(snapshot);
  if (!validation.ok) return { ok: false, mode, errors: validation.errors, warnings: validation.warnings, tables: [], totalNew: 0, totalInserted: 0 };

  const results: RestoreTableResult[] = [];
  const warnings = [...validation.warnings];
  const filter = opts.tables && opts.tables.length ? new Set(opts.tables) : null;
  for (const [key, rows] of Object.entries(snapshot.data)) {
    const table = BACKUP_TABLE_BY_KEY.get(key);
    if (!table || (filter && !filter.has(key))) continue;
    const candidates = rows as Array<Record<string, unknown>>;
    if (!candidates.length) { results.push({ key, candidateRows: 0, newRows: 0, existingRows: 0, inserted: 0 }); continue; }
    if (candidates.length > PER_TABLE_RESTORE_CAP) { warnings.push(`table '${key}' has ${candidates.length} rows (> ${PER_TABLE_RESTORE_CAP} cap) — skipped`); continue; }
    const ids = candidates.map((r) => String(r.id));
    const idCol = (table as unknown as { id: never }).id;
    // CHUNK the existence check so a large snapshot can't exceed Postgres's bind-parameter ceiling (~65k).
    const existingIds = new Set<string>();
    for (let i = 0; i < ids.length; i += ID_QUERY_CHUNK) {
      const chunk = ids.slice(i, i + ID_QUERY_CHUNK);
      const existing = await db.select({ id: idCol }).from(table as never).where(inArray(idCol, chunk));
      for (const r of existing as Array<{ id: string }>) existingIds.add(r.id);
    }
    const newRows = candidates.filter((r) => !existingIds.has(String(r.id)));
    let inserted = 0;
    if (mode === "apply" && newRows.length) {
      // Additive: onConflictDoNothing means a concurrent insert of the same id is a safe skip, never an overwrite.
      const out = await db.insert(table as never).values(newRows as never).onConflictDoNothing().returning({ id: idCol });
      inserted = (out as unknown[]).length;
      // Honesty: if fewer rows inserted than were "new" by id, a SECONDARY unique constraint (e.g. invoice number)
      // blocked them — surface it so the gap between newRows and inserted is never silent. Existing data is untouched.
      if (inserted < newRows.length) warnings.push(`table '${key}': ${newRows.length - inserted} missing row(s) were NOT restored — blocked by a unique constraint other than id (existing data unchanged)`);
    }
    results.push({ key, candidateRows: candidates.length, newRows: newRows.length, existingRows: candidates.length - newRows.length, inserted });
  }

  const totalNew = results.reduce((s, r) => s + r.newRows, 0);
  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  if (mode === "apply") {
    await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))({ eventType: "backup.restored", module: "backup", entityType: "system", actor: opts.actor ?? "founder", metadata: { totalInserted, tables: results.filter((r) => r.inserted > 0).map((r) => ({ key: r.key, inserted: r.inserted })) } });
  }
  return { ok: true, mode, errors: [], warnings, tables: results, totalNew, totalInserted };
}
