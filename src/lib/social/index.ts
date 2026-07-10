import { and, desc, eq, isNull } from "drizzle-orm";
import { socialStrategies } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import { SOCIAL_MODULE, buildSocialRow, socialOutputSchema, type CreateSocialInput, type SocialStrategyRow, type SocialStatus } from "@/lib/domain/social";

/** Social Intelligence service. Create a target, let the LLM build a real platform content strategy. */

export interface SocialStore {
  insertRow(row: SocialStrategyRow): Promise<void>;
  listRows(q: { status?: string; platform?: string; includeArchived?: boolean; limit: number }): Promise<SocialStrategyRow[]>;
  getRow(id: string): Promise<SocialStrategyRow | null>;
  updateRow(id: string, fields: Partial<SocialStrategyRow>): Promise<void>;
}
export interface SocialDeps {
  store?: SocialStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  runProvider?: (input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number }) => Promise<{ text: string; run: { id: string } }>;
  now?: Date;
}
async function audit(deps: SocialDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export async function addSocialStrategy(input: CreateSocialInput, deps: SocialDeps = {}): Promise<SocialStrategyRow> {
  const store = deps.store ?? defaultStore();
  const row = buildSocialRow(input, { now: deps.now });
  await store.insertRow(row);
  await audit(deps, { eventType: "social.created", module: SOCIAL_MODULE, entityType: "social_strategy", entityId: row.id, actor: row.createdBy ?? "system", metadata: { platform: row.platform, niche: row.niche } });
  return row;
}

export async function listSocialStrategies(query: { status?: string; platform?: string; limit?: number } = {}, deps: SocialDeps = {}): Promise<SocialStrategyRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listRows({ ...query, limit: Math.min(Math.max(query.limit ?? 100, 1), 500) });
}

export async function archiveSocialStrategy(id: string, input: { actor?: string } = {}, deps: SocialDeps = {}): Promise<SocialStrategyRow | null> {
  const store = deps.store ?? defaultStore();
  const row = await store.getRow(id);
  if (!row) return null;
  const now = deps.now ?? new Date();
  await store.updateRow(id, { status: "archived", archivedAt: now, updatedAt: now });
  await audit(deps, { eventType: "social.archived", module: SOCIAL_MODULE, entityType: "social_strategy", entityId: id, actor: input.actor ?? "system", metadata: {} });
  return { ...row, status: "archived" as SocialStatus, archivedAt: now };
}

/** Real AI: build a platform content strategy — positioning, pillars, hooks, competitor angles, post ideas. */
export async function generateSocialStrategy(id: string, input: { actor?: string } = {}, deps: SocialDeps = {}): Promise<SocialStrategyRow | null> {
  const store = deps.store ?? defaultStore();
  const row = await store.getRow(id);
  if (!row) return null;
  const runProvider = deps.runProvider ?? defaultRunProvider;
  const now = deps.now ?? new Date();

  const messages: ProviderChatMessage[] = [
    { role: "system", content: `You are WOBBLE's social strategist. WOBBLE is an AI automation studio (AI audits, chatbots/voice agents, content, automations). Build a concrete ${row.platform} content strategy for the given niche: positioning (one line), posting cadence, 3-5 content pillars, 6-10 scroll-stopping hooks, 3-5 competitor/differentiation angles, and 6-10 post ideas (each with a format e.g. reel/carousel/text, the idea, and a hook). Make it specific and usable, not generic advice. Reply ONLY with JSON: {"positioning","cadence","pillars":[],"hooks":[],"competitorAngles":[],"contentIdeas":[{"format","idea","hook"}]}. No prose.` },
    { role: "user", content: `Platform: ${row.platform}\nNiche / account: ${row.niche}` },
  ];
  const { text, run } = await runProvider({ role: "social_strategist", module: SOCIAL_MODULE, messages, maxTokens: 2500 });

  let parsed;
  try {
    const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
    const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
    parsed = socialOutputSchema.parse(JSON.parse(start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned));
  } catch {
    throw new Error("social strategist returned unparseable output");
  }
  const fields: Partial<SocialStrategyRow> = { strategy: parsed, status: row.status === "draft" ? "active" : row.status, updatedAt: now };
  await store.updateRow(id, fields);
  await audit(deps, { eventType: "social.generated", module: SOCIAL_MODULE, entityType: "model_run", entityId: run.id, modelRunId: run.id, actor: input.actor ?? "system", metadata: { id, ideas: parsed.contentIdeas.length } });
  return { ...row, ...fields };
}

async function defaultRunProvider(input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number }) {
  const result = await runTextProvider(input);
  return { text: result.text, run: { id: result.run.id } };
}

export function defaultStore(db: Db = getDb()): SocialStore {
  return {
    async insertRow(row) { await db.insert(socialStrategies).values(row as typeof socialStrategies.$inferInsert); },
    async listRows(q) {
      const conds = [];
      if (q.status) conds.push(eq(socialStrategies.status, q.status));
      if (q.platform) conds.push(eq(socialStrategies.platform, q.platform));
      if (!q.includeArchived) conds.push(isNull(socialStrategies.archivedAt));
      const base = db.select().from(socialStrategies);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(socialStrategies.createdAt)).limit(q.limit);
      return rows as SocialStrategyRow[];
    },
    async getRow(id) { const r = await db.select().from(socialStrategies).where(eq(socialStrategies.id, id)).limit(1); return (r[0] as SocialStrategyRow) ?? null; },
    async updateRow(id, fields) { await db.update(socialStrategies).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() } as Partial<typeof socialStrategies.$inferInsert>).where(eq(socialStrategies.id, id)); },
  };
}
