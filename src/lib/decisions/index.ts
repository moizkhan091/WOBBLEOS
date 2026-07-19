import { and, desc, eq, isNull } from "drizzle-orm";
import { decisions as decisionsTable } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import { DECISION_MODULE, buildDecisionRow, canTransitionDecision, topOption, type CreateDecisionInput, type DecisionOption, type DecisionRow, type DecisionStatus, type ReasoningEntry } from "@/lib/domain/decision";

/** Decision Room service. Create/list/transition decisions, AI-score options, commit with a reasoning trail. */

export interface DecisionStore {
  insertDecision(row: DecisionRow): Promise<void>;
  listDecisions(q: { status?: string; category?: string; includeArchived?: boolean; limit: number }): Promise<DecisionRow[]>;
  getDecision(id: string): Promise<DecisionRow | null>;
  updateDecision(id: string, fields: Partial<DecisionRow>): Promise<void>;
}
export interface DecisionDeps {
  store?: DecisionStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  runProvider?: (input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number }) => Promise<{ text: string; run: { id: string } }>;
  /** Learned decision-policy guidance for the category (read-back of approved policies into scoring). */
  loadPolicyGuidance?: (category?: string) => Promise<string>;
  now?: Date;
}

// The READ-BACK of decision learning: fold FOUNDER-APPROVED (active) decision policies into the scorer's prompt
// so past-committed directions actually influence new decisions of the same category — otherwise activating a
// policy does nothing. Safe fallback: "" with no DB / no active policies.
async function defaultLoadPolicyGuidance(category?: string): Promise<string> {
  if (!process.env.DATABASE_URL) return "";
  try {
    const { listDecisionPolicies } = await import("@/lib/decision-learning");
    const policies = await listDecisionPolicies(category ? { category } : {});
    const relevant = policies.filter((p) => p.status === "active");
    if (!relevant.length) return "";
    return (
      "LEARNED DECISION POLICIES (founder-approved standing preferences from past committed decisions — weight them, but the specifics of THIS decision still win where they genuinely conflict):\n" +
      relevant.slice(0, 12).map((p) => `- ${p.statement}`).join("\n")
    );
  } catch {
    return "";
  }
}
async function audit(deps: DecisionDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export async function addDecision(input: CreateDecisionInput, deps: DecisionDeps = {}): Promise<DecisionRow> {
  const store = deps.store ?? defaultStore();
  const row = buildDecisionRow(input, { now: deps.now });
  await store.insertDecision(row);
  await audit(deps, { eventType: "decision.created", module: DECISION_MODULE, entityType: "decision", entityId: row.id, actor: row.createdBy ?? "system", metadata: { title: row.title, options: row.options.length } });
  return row;
}

export async function listDecisions(query: { status?: string; category?: string; limit?: number } = {}, deps: DecisionDeps = {}): Promise<DecisionRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listDecisions({ ...query, limit: Math.min(Math.max(query.limit ?? 200, 1), 1000) });
}

export async function addOption(id: string, option: { label: string; rationale?: string; pros?: string[]; cons?: string[] }, input: { actor?: string } = {}, deps: DecisionDeps = {}): Promise<DecisionRow | null> {
  const store = deps.store ?? defaultStore();
  const d = await store.getDecision(id);
  if (!d) return null;
  const now = deps.now ?? new Date();
  const opt: DecisionOption = { id: `opt_${now.getTime().toString(36)}_${d.options.length}`, label: option.label.trim(), rationale: option.rationale, pros: option.pros, cons: option.cons };
  const options = [...d.options, opt];
  await store.updateDecision(id, { options, updatedAt: now });
  await audit(deps, { eventType: "decision.option_added", module: DECISION_MODULE, entityType: "decision", entityId: id, actor: input.actor ?? "system", metadata: { label: opt.label } });
  return { ...d, options };
}

export async function transitionDecision(id: string, to: DecisionStatus, input: { actor?: string } = {}, deps: DecisionDeps = {}): Promise<DecisionRow | null> {
  const store = deps.store ?? defaultStore();
  const d = await store.getDecision(id);
  if (!d || !canTransitionDecision(d.status, to)) return null;
  const now = deps.now ?? new Date();
  const trail: ReasoningEntry[] = [...d.reasoningTrail, { at: now.toISOString(), note: `Status → ${to}`, by: input.actor }];
  await store.updateDecision(id, { status: to, reasoningTrail: trail, updatedAt: now });
  await audit(deps, { eventType: `decision.${to}`, module: DECISION_MODULE, entityType: "decision", entityId: id, actor: input.actor ?? "system", metadata: { from: d.status, to } });
  return { ...d, status: to, reasoningTrail: trail };
}

/** Commit a decision: pick the winning option + rationale + confidence. */
export async function commitDecision(id: string, input: { optionId: string; rationale: string; confidence?: number; actor?: string }, deps: DecisionDeps = {}): Promise<DecisionRow | null> {
  const store = deps.store ?? defaultStore();
  const d = await store.getDecision(id);
  if (!d) return null;
  if (!d.options.some((o) => o.id === input.optionId)) return null;
  const now = deps.now ?? new Date();
  const trail: ReasoningEntry[] = [...d.reasoningTrail, { at: now.toISOString(), note: `Decided: ${input.rationale}`, by: input.actor }];
  const fields: Partial<DecisionRow> = { status: "decided", decidedOptionId: input.optionId, decisionRationale: input.rationale, confidence: input.confidence ?? d.confidence, reasoningTrail: trail, updatedAt: now };
  await store.updateDecision(id, fields);
  await audit(deps, { eventType: "decision.decided", module: DECISION_MODULE, entityType: "decision", entityId: id, actor: input.actor ?? "system", metadata: { optionId: input.optionId, confidence: fields.confidence } });
  return { ...d, ...fields };
}

/** Use the LLM as a decision analyst: score each option 0-100 with a one-line rationale. Real AI, no stub. */
export async function scoreDecisionOptions(id: string, input: { actor?: string } = {}, deps: DecisionDeps = {}): Promise<DecisionRow | null> {
  const store = deps.store ?? defaultStore();
  const d = await store.getDecision(id);
  if (!d) return null;
  if (d.options.length === 0) throw new Error("add at least one option before scoring");
  const runProvider = deps.runProvider ?? defaultRunProvider;
  const now = deps.now ?? new Date();

  const policyGuidance = await (deps.loadPolicyGuidance ?? defaultLoadPolicyGuidance)(d.category);
  const messages: ProviderChatMessage[] = [
    { role: "system", content: "You are WOBBLE's decision analyst. Score each option 0-100 for how well it serves the stated goal, weighing pros/cons, risk, and speed-to-value. Reply ONLY with a JSON array like [{\"id\":\"opt_x\",\"score\":78,\"rationale\":\"one crisp line\"}]. No prose." },
    ...(policyGuidance ? [{ role: "system" as const, content: policyGuidance }] : []),
    { role: "user", content: `Decision: ${d.title}\nContext: ${d.context ?? "(none)"}\n\nOptions:\n${d.options.map((o) => `- id=${o.id} | ${o.label}${o.rationale ? ` — ${o.rationale}` : ""}${o.pros?.length ? ` | pros: ${o.pros.join(", ")}` : ""}${o.cons?.length ? ` | cons: ${o.cons.join(", ")}` : ""}`).join("\n")}` },
  ];
  const { text, run } = await runProvider({ role: "decision_scorer", module: DECISION_MODULE, messages, maxTokens: 900 });

  let scores: Array<{ id: string; score: number; rationale?: string }> = [];
  try {
    const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
    const start = cleaned.indexOf("["); const end = cleaned.lastIndexOf("]");
    scores = JSON.parse(start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned);
  } catch {
    throw new Error("decision scorer returned unparseable output");
  }
  const byId = new Map(scores.map((s) => [s.id, s]));
  const options = d.options.map((o) => { const s = byId.get(o.id); return s ? { ...o, score: Math.max(0, Math.min(100, Math.round(s.score))), rationale: s.rationale ?? o.rationale } : o; });
  const best = topOption(options);
  const trail: ReasoningEntry[] = [...d.reasoningTrail, { at: now.toISOString(), note: `AI scored options${best ? ` — leader: ${best.label} (${best.score})` : ""}`, by: input.actor ?? "WOBBLE" }];
  const fields: Partial<DecisionRow> = { options, status: d.status === "open" ? "scoring" : d.status, confidence: best?.score ?? d.confidence, reasoningTrail: trail, updatedAt: now };
  await store.updateDecision(id, fields);
  await audit(deps, { eventType: "decision.scored", module: DECISION_MODULE, entityType: "model_run", entityId: run.id, modelRunId: run.id, actor: input.actor ?? "system", metadata: { decisionId: id, leader: best?.id } });
  return { ...d, ...fields };
}

async function defaultRunProvider(input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number }) {
  const result = await runTextProvider(input);
  return { text: result.text, run: { id: result.run.id } };
}

export function defaultStore(db: Db = getDb()): DecisionStore {
  return {
    async insertDecision(row) { await db.insert(decisionsTable).values(row as typeof decisionsTable.$inferInsert); },
    async listDecisions(q) {
      const conds = [];
      if (q.status) conds.push(eq(decisionsTable.status, q.status));
      if (q.category) conds.push(eq(decisionsTable.category, q.category));
      if (!q.includeArchived) conds.push(isNull(decisionsTable.archivedAt));
      const base = db.select().from(decisionsTable);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(decisionsTable.createdAt)).limit(q.limit);
      return rows as DecisionRow[];
    },
    async getDecision(id) { const r = await db.select().from(decisionsTable).where(eq(decisionsTable.id, id)).limit(1); return (r[0] as DecisionRow) ?? null; },
    async updateDecision(id, fields) { await db.update(decisionsTable).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() } as Partial<typeof decisionsTable.$inferInsert>).where(eq(decisionsTable.id, id)); },
  };
}
