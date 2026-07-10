import { and, desc, eq, isNull } from "drizzle-orm";
import { radarScans } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import { getIntelligenceContextBlock, type IntelligenceContextBlock } from "@/lib/intelligence/context-block";
import { logOutputIntelligenceUsage } from "@/lib/intelligence";
import { RADAR_MODULE, buildRadarScanRow, radarOutputSchema, type CreateRadarScanInput, type RadarScanRow, type RadarStatus } from "@/lib/domain/radar";

/** Research Radar service. Create a scan, let the LLM surface + score signals, set review status. */

export interface RadarStore {
  insertScan(row: RadarScanRow): Promise<void>;
  listScans(q: { status?: string; includeArchived?: boolean; limit: number }): Promise<RadarScanRow[]>;
  getScan(id: string): Promise<RadarScanRow | null>;
  updateScan(id: string, fields: Partial<RadarScanRow>): Promise<void>;
}
export interface RadarDeps {
  store?: RadarStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  runProvider?: (input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number }) => Promise<{ text: string; run: { id: string } }>;
  retrieveIntelligence?: () => Promise<IntelligenceContextBlock>;
  now?: Date;
}
async function audit(deps: RadarDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export async function addRadarScan(input: CreateRadarScanInput, deps: RadarDeps = {}): Promise<RadarScanRow> {
  const store = deps.store ?? defaultStore();
  const row = buildRadarScanRow(input, { now: deps.now });
  await store.insertScan(row);
  await audit(deps, { eventType: "radar.created", module: RADAR_MODULE, entityType: "radar_scan", entityId: row.id, actor: row.createdBy ?? "system", metadata: { focus: row.focus } });
  return row;
}

export async function listRadarScans(query: { status?: string; limit?: number } = {}, deps: RadarDeps = {}): Promise<RadarScanRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listScans({ ...query, limit: Math.min(Math.max(query.limit ?? 100, 1), 500) });
}

export async function setRadarStatus(id: string, status: RadarStatus, input: { actor?: string } = {}, deps: RadarDeps = {}): Promise<RadarScanRow | null> {
  const store = deps.store ?? defaultStore();
  const scan = await store.getScan(id);
  if (!scan) return null;
  const now = deps.now ?? new Date();
  const fields: Partial<RadarScanRow> = { status, updatedAt: now };
  if (status === "dismissed") fields.archivedAt = now;
  await store.updateScan(id, fields);
  await audit(deps, { eventType: `radar.${status}`, module: RADAR_MODULE, entityType: "radar_scan", entityId: id, actor: input.actor ?? "system", metadata: {} });
  return { ...scan, ...fields };
}

/** Real AI: surface 6-10 signals for the focus area, each scored 0-100 by relevance to WOBBLE. */
export async function generateRadarScan(id: string, input: { actor?: string } = {}, deps: RadarDeps = {}): Promise<RadarScanRow | null> {
  const store = deps.store ?? defaultStore();
  const scan = await store.getScan(id);
  if (!scan) return null;
  const runProvider = deps.runProvider ?? defaultRunProvider;
  const now = deps.now ?? new Date();

  // Retrieval-before-generation: build on the latest APPROVED intelligence, and don't
  // re-surface signals we've already logged. Nothing hardcoded.
  const intel = await (deps.retrieveIntelligence ?? (() => getIntelligenceContextBlock("strategy")))();

  const messages: ProviderChatMessage[] = [
    ...(intel.block ? [{ role: "system" as const, content: intel.block }] : []),
    { role: "system", content: `You are WOBBLE's research radar. WOBBLE is an AI automation studio selling AI audits, chatbots/voice agents, content and automations to growing businesses. Surface 6-10 concrete signals for the given focus (market shifts, competitor moves, tech releases, cultural/behaviour changes, buyer pain). For each: a title, a category (market|competitor|technology|culture|regulation), a 1-2 sentence summary, the implication for WOBBLE, and a relevance score 0-100. Prefer specific, actionable signals over generic trends. Reply ONLY with JSON: {"signals":[{"title","category","summary","implication","score"}]}. No prose.` },
    { role: "user", content: `Focus: ${scan.focus}` },
  ];
  const { text, run } = await runProvider({ role: "radar_scout", module: RADAR_MODULE, messages, maxTokens: 2200 });

  let parsed;
  try {
    const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
    const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
    parsed = radarOutputSchema.parse(JSON.parse(start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned));
  } catch {
    throw new Error("radar scout returned unparseable output");
  }
  const signals = parsed.signals.map((s) => ({ ...s, score: typeof s.score === "number" ? Math.max(0, Math.min(100, Math.round(s.score))) : undefined }));
  const fields: Partial<RadarScanRow> = { signals, status: "reviewed", updatedAt: now };
  await store.updateScan(id, fields);
  await logOutputIntelligenceUsage({ outputType: "radar_scan", outputId: id, itemIds: intel.itemIds, insightIds: intel.insightIds }, { now }).catch(() => {});
  await audit(deps, { eventType: "radar.generated", module: RADAR_MODULE, entityType: "model_run", entityId: run.id, modelRunId: run.id, actor: input.actor ?? "system", metadata: { scanId: id, signals: signals.length, intelUsed: intel.itemIds.length + intel.insightIds.length } });
  return { ...scan, ...fields };
}

async function defaultRunProvider(input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number }) {
  const result = await runTextProvider(input);
  return { text: result.text, run: { id: result.run.id } };
}

export function defaultStore(db: Db = getDb()): RadarStore {
  return {
    async insertScan(row) { await db.insert(radarScans).values(row as typeof radarScans.$inferInsert); },
    async listScans(q) {
      const conds = [];
      if (q.status) conds.push(eq(radarScans.status, q.status));
      if (!q.includeArchived) conds.push(isNull(radarScans.archivedAt));
      const base = db.select().from(radarScans);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(radarScans.createdAt)).limit(q.limit);
      return rows as RadarScanRow[];
    },
    async getScan(id) { const r = await db.select().from(radarScans).where(eq(radarScans.id, id)).limit(1); return (r[0] as RadarScanRow) ?? null; },
    async updateScan(id, fields) { await db.update(radarScans).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() } as Partial<typeof radarScans.$inferInsert>).where(eq(radarScans.id, id)); },
  };
}
