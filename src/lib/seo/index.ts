import { and, desc, eq, isNull } from "drizzle-orm";
import { seoPlans } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import { SEO_MODULE, buildSeoPlanRow, seoPlanOutputSchema, type CreateSeoPlanInput, type SeoPlanRow, type SeoStatus } from "@/lib/domain/seo";

/** SEO & Blog Engine service. Create a plan, let the LLM generate keywords + blog ideas, archive. */

export interface SeoStore {
  insertPlan(row: SeoPlanRow): Promise<void>;
  listPlans(q: { status?: string; includeArchived?: boolean; limit: number }): Promise<SeoPlanRow[]>;
  getPlan(id: string): Promise<SeoPlanRow | null>;
  updatePlan(id: string, fields: Partial<SeoPlanRow>): Promise<void>;
}
export interface SeoDeps {
  store?: SeoStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  runProvider?: (input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number }) => Promise<{ text: string; run: { id: string } }>;
  now?: Date;
}
async function audit(deps: SeoDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export async function addSeoPlan(input: CreateSeoPlanInput, deps: SeoDeps = {}): Promise<SeoPlanRow> {
  const store = deps.store ?? defaultStore();
  const row = buildSeoPlanRow(input, { now: deps.now });
  await store.insertPlan(row);
  await audit(deps, { eventType: "seo.created", module: SEO_MODULE, entityType: "seo_plan", entityId: row.id, actor: row.createdBy ?? "system", metadata: { topic: row.topic } });
  return row;
}

export async function listSeoPlans(query: { status?: string; limit?: number } = {}, deps: SeoDeps = {}): Promise<SeoPlanRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listPlans({ ...query, limit: Math.min(Math.max(query.limit ?? 100, 1), 500) });
}

export async function archiveSeoPlan(id: string, input: { actor?: string } = {}, deps: SeoDeps = {}): Promise<SeoPlanRow | null> {
  const store = deps.store ?? defaultStore();
  const plan = await store.getPlan(id);
  if (!plan) return null;
  const now = deps.now ?? new Date();
  await store.updatePlan(id, { status: "archived", archivedAt: now, updatedAt: now });
  await audit(deps, { eventType: "seo.archived", module: SEO_MODULE, entityType: "seo_plan", entityId: id, actor: input.actor ?? "system", metadata: {} });
  return { ...plan, status: "archived" as SeoStatus, archivedAt: now };
}

/** Real AI: generate target keywords + blog ideas for the plan's topic. */
export async function generateSeoPlan(id: string, input: { actor?: string } = {}, deps: SeoDeps = {}): Promise<SeoPlanRow | null> {
  const store = deps.store ?? defaultStore();
  const plan = await store.getPlan(id);
  if (!plan) return null;
  const runProvider = deps.runProvider ?? defaultRunProvider;
  const now = deps.now ?? new Date();

  const messages: ProviderChatMessage[] = [
    { role: "system", content: `You are WOBBLE's SEO + content strategist. WOBBLE is an AI automation studio (AI audits, chatbots/voice agents, content, automations) selling to growing businesses. Produce an SEO plan: a content pillar, 8-14 target keywords (each with search intent: informational|commercial|transactional, and a priority: high|medium|low), and 6-10 blog post ideas (each with a title, an angle, the target keyword, and a 3-5 bullet outline). Ground everything in real buyer questions. Reply ONLY with JSON: {"pillar": string, "targetKeywords":[{"keyword","intent","priority","note"}], "blogIdeas":[{"title","angle","targetKeyword","outline":[...]}]}. No prose.` },
    { role: "user", content: `Topic: ${plan.topic}\nAudience: ${plan.audience ?? "growing businesses considering AI"}\n${plan.pillar ? `Existing pillar: ${plan.pillar}` : ""}` },
  ];
  const { text, run } = await runProvider({ role: "seo_planner", module: SEO_MODULE, messages, maxTokens: 2500 });

  let parsed;
  try {
    const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
    const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
    parsed = seoPlanOutputSchema.parse(JSON.parse(start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned));
  } catch {
    throw new Error("SEO planner returned unparseable output");
  }
  const fields: Partial<SeoPlanRow> = {
    pillar: parsed.pillar ?? plan.pillar,
    targetKeywords: parsed.targetKeywords,
    blogIdeas: parsed.blogIdeas,
    status: plan.status === "draft" ? "planned" : plan.status,
    updatedAt: now,
  };
  await store.updatePlan(id, fields);
  await audit(deps, { eventType: "seo.generated", module: SEO_MODULE, entityType: "model_run", entityId: run.id, modelRunId: run.id, actor: input.actor ?? "system", metadata: { planId: id, keywords: parsed.targetKeywords.length, ideas: parsed.blogIdeas.length } });
  return { ...plan, ...fields };
}

async function defaultRunProvider(input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number }) {
  const result = await runTextProvider(input);
  return { text: result.text, run: { id: result.run.id } };
}

export function defaultStore(db: Db = getDb()): SeoStore {
  return {
    async insertPlan(row) { await db.insert(seoPlans).values(row as typeof seoPlans.$inferInsert); },
    async listPlans(q) {
      const conds = [];
      if (q.status) conds.push(eq(seoPlans.status, q.status));
      if (!q.includeArchived) conds.push(isNull(seoPlans.archivedAt));
      const base = db.select().from(seoPlans);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(seoPlans.createdAt)).limit(q.limit);
      return rows as SeoPlanRow[];
    },
    async getPlan(id) { const r = await db.select().from(seoPlans).where(eq(seoPlans.id, id)).limit(1); return (r[0] as SeoPlanRow) ?? null; },
    async updatePlan(id, fields) { await db.update(seoPlans).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() } as Partial<typeof seoPlans.$inferInsert>).where(eq(seoPlans.id, id)); },
  };
}
