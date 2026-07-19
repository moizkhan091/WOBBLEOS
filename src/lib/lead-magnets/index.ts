import { and, desc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { leadMagnets } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import { buildLeadMagnetPrompt, parseLeadMagnet, buildLeadMagnetRow, type LeadMagnetRow, type LeadMagnetStatus, type LeadMagnetType } from "@/lib/domain/lead-magnets";

/**
 * Lead-magnet service — generates a deeply-educational, usable magnet from a topic, lands it pending_review;
 * a founder approves; the portfolio stays small + excellent (inventory-first: list existing approved magnets so
 * the content loop attaches one that fits before building a new one). Provider + store injectable for tests.
 */

export const LEAD_MAGNETS_MODULE = "content";
export const LEAD_MAGNET_AGENT = "content_strategist";

export interface LeadMagnetStore {
  insert(row: LeadMagnetRow): Promise<void>;
  list(filter: { status?: LeadMagnetStatus; magnetType?: LeadMagnetType; limit?: number }): Promise<LeadMagnetRow[]>;
  get(id: string): Promise<LeadMagnetRow | null>;
  update(id: string, fields: Partial<LeadMagnetRow>): Promise<void>;
}

export type MagnetProvider = (input: { role: string; module: string; model?: string; messages: ProviderChatMessage[]; maxTokens?: number; temperature?: number }) => Promise<{ text: string }>;

export interface LeadMagnetDeps {
  store?: LeadMagnetStore;
  runProvider?: MagnetProvider;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
  model?: string;
}

async function audit(deps: LeadMagnetDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export interface GenerateLeadMagnetInput {
  topicTitle: string;
  teachingJob: string;
  pillar?: string;
  audience?: string;
  topicId?: string;
  requestedBy: string;
}

/** Generate a deeply-educational, usable lead magnet from a topic; lands pending_review. */
export async function generateLeadMagnet(input: GenerateLeadMagnetInput, deps: LeadMagnetDeps = {}): Promise<LeadMagnetRow | null> {
  const store = deps.store ?? defaultStore();
  const model = deps.model ?? "anthropic/claude-sonnet-4.5";
  const { system, user } = buildLeadMagnetPrompt(input);
  const runProvider = deps.runProvider ?? (async (i) => runTextProvider({ ...i, usageContext: { agentSlug: LEAD_MAGNET_AGENT, module: LEAD_MAGNETS_MODULE } }));
  const r = await runProvider({
    role: "content_strategy",
    module: LEAD_MAGNETS_MODULE,
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: 4000,
    temperature: 0.5,
  });
  const spec = parseLeadMagnet(r.text);
  if (!spec) {
    await audit(deps, { eventType: "lead_magnet.unparseable", module: LEAD_MAGNETS_MODULE, entityType: "lead_magnet", entityId: input.topicId ?? input.topicTitle, actor: input.requestedBy, metadata: {} });
    return null;
  }
  const row = buildLeadMagnetRow({ spec, pillar: input.pillar, topicId: input.topicId, createdByAgent: LEAD_MAGNET_AGENT, model }, { now: deps.now });
  await store.insert(row);
  await audit(deps, { eventType: "lead_magnet.generated", module: LEAD_MAGNETS_MODULE, entityType: "lead_magnet", entityId: row.id, actor: input.requestedBy, metadata: { magnetType: row.magnetType, sections: row.sections.length } });
  return row;
}

export interface ReviewLeadMagnetInput {
  magnetId: string;
  decision: "approved" | "rejected" | "retired";
  reviewedBy: string;
}

/** Human gate: pending_review → approved/rejected (or approved → retired). Idempotent for terminal states, audited. */
export async function reviewLeadMagnet(input: ReviewLeadMagnetInput, deps: LeadMagnetDeps = {}): Promise<LeadMagnetRow | null> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const magnet = await store.get(input.magnetId);
  if (!magnet) return null;
  if (input.decision !== "retired" && magnet.status !== "pending_review") return magnet; // idempotent approve/reject
  if (input.decision === "retired" && magnet.status !== "approved") return magnet; // only an approved magnet retires
  const fields: Partial<LeadMagnetRow> = { status: input.decision, reviewedBy: input.reviewedBy, reviewedAt: now, updatedAt: now };
  await store.update(input.magnetId, fields);
  await audit(deps, { eventType: `lead_magnet.${input.decision}`, module: LEAD_MAGNETS_MODULE, entityType: "lead_magnet", entityId: input.magnetId, actor: input.reviewedBy, metadata: { magnetType: magnet.magnetType } });
  return { ...magnet, ...fields };
}

export async function listLeadMagnets(filter: { status?: LeadMagnetStatus; magnetType?: LeadMagnetType; limit?: number } = {}, deps: LeadMagnetDeps = {}): Promise<LeadMagnetRow[]> {
  return (deps.store ?? defaultStore()).list(filter);
}

export async function getLeadMagnet(id: string, deps: LeadMagnetDeps = {}): Promise<LeadMagnetRow | null> {
  return (deps.store ?? defaultStore()).get(id);
}

/** Inventory-first: the approved portfolio the content loop attaches from before building a new magnet. */
export async function approvedInventory(deps: LeadMagnetDeps = {}): Promise<LeadMagnetRow[]> {
  return (deps.store ?? defaultStore()).list({ status: "approved", limit: 50 });
}

export function defaultStore(db: Db = getDb()): LeadMagnetStore {
  return {
    async insert(row) {
      await db.insert(leadMagnets).values(row as unknown as typeof leadMagnets.$inferInsert);
    },
    async list(filter) {
      const conds = [];
      if (filter.status) conds.push(eq(leadMagnets.status, filter.status));
      if (filter.magnetType) conds.push(eq(leadMagnets.magnetType, filter.magnetType));
      const base = db.select().from(leadMagnets);
      const q = conds.length ? base.where(and(...conds)) : base;
      const r = await q.orderBy(desc(leadMagnets.createdAt)).limit(Math.min(Math.max(filter.limit ?? 100, 1), 200));
      return r as unknown as LeadMagnetRow[];
    },
    async get(id) {
      const r = await db.select().from(leadMagnets).where(eq(leadMagnets.id, id)).limit(1);
      return (r[0] as unknown as LeadMagnetRow) ?? null;
    },
    async update(id, fields) {
      await db.update(leadMagnets).set(fields as Partial<typeof leadMagnets.$inferInsert>).where(eq(leadMagnets.id, id));
    },
  };
}
