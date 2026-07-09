import { and, desc, eq, isNull } from "drizzle-orm";
import { automationRules } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { enqueueJob } from "@/lib/jobs";
import { AUTOMATION_MODULE, buildAutomationRow, matchingRules, type AutomationRow, type CreateAutomationInput } from "@/lib/domain/automation";

/** Automations service. Create/list/toggle rules; run a rule (enqueues a REAL job); fire event-matched rules. */

export interface AutomationStore {
  insertRule(row: AutomationRow): Promise<void>;
  listRules(q: { enabled?: boolean; includeArchived?: boolean; limit: number }): Promise<AutomationRow[]>;
  getRule(id: string): Promise<AutomationRow | null>;
  updateRule(id: string, fields: Partial<AutomationRow>): Promise<void>;
}
export interface AutomationDeps {
  store?: AutomationStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  enqueue?: (input: { queue: string; type: string; payload: Record<string, unknown>; linkedModule?: string }) => Promise<{ job: { id: string } }>;
  now?: Date;
}
async function audit(deps: AutomationDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}
async function doEnqueue(deps: AutomationDeps, input: { queue: string; type: string; payload: Record<string, unknown>; linkedModule?: string }) {
  if (deps.enqueue) return deps.enqueue(input);
  const r = await enqueueJob(input);
  return { job: { id: r.job.id } };
}

export async function addAutomation(input: CreateAutomationInput, deps: AutomationDeps = {}): Promise<AutomationRow> {
  const store = deps.store ?? defaultStore();
  const row = buildAutomationRow(input, { now: deps.now });
  await store.insertRule(row);
  await audit(deps, { eventType: "automation.created", module: AUTOMATION_MODULE, entityType: "automation_rule", entityId: row.id, actor: row.createdBy ?? "system", metadata: { name: row.name, triggerType: row.triggerType, actionType: row.actionType } });
  return row;
}

export async function listAutomations(query: { enabled?: boolean; limit?: number } = {}, deps: AutomationDeps = {}): Promise<AutomationRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listRules({ ...query, limit: Math.min(Math.max(query.limit ?? 200, 1), 1000) });
}

export async function toggleAutomation(id: string, enabled: boolean, input: { actor?: string } = {}, deps: AutomationDeps = {}): Promise<AutomationRow | null> {
  const store = deps.store ?? defaultStore();
  const rule = await store.getRule(id);
  if (!rule) return null;
  const now = deps.now ?? new Date();
  await store.updateRule(id, { enabled, updatedAt: now });
  await audit(deps, { eventType: enabled ? "automation.enabled" : "automation.disabled", module: AUTOMATION_MODULE, entityType: "automation_rule", entityId: id, actor: input.actor ?? "system", metadata: { name: rule.name } });
  return { ...rule, enabled };
}

/** Run a rule now: enqueue its action job, bump run stats. Returns the job id. */
export async function runAutomation(id: string, input: { actor?: string; extraPayload?: Record<string, unknown> } = {}, deps: AutomationDeps = {}): Promise<{ rule: AutomationRow; jobId: string } | null> {
  const store = deps.store ?? defaultStore();
  const rule = await store.getRule(id);
  if (!rule) return null;
  const now = deps.now ?? new Date();
  const { job } = await doEnqueue(deps, { queue: rule.actionQueue, type: rule.actionType, payload: { ...rule.actionPayload, ...(input.extraPayload ?? {}), _automationRuleId: id }, linkedModule: AUTOMATION_MODULE });
  const fields: Partial<AutomationRow> = { runCount: rule.runCount + 1, lastRunAt: now, lastStatus: "enqueued", updatedAt: now };
  await store.updateRule(id, fields);
  await audit(deps, { eventType: "automation.ran", module: AUTOMATION_MODULE, entityType: "automation_rule", entityId: id, actor: input.actor ?? "system", metadata: { jobId: job.id, actionType: rule.actionType } });
  return { rule: { ...rule, ...fields }, jobId: job.id };
}

/** Fire all enabled event-rules that match an audit event (called by the event bus / hooks). */
export async function fireEventRules(eventType: string, payload: Record<string, unknown>, deps: AutomationDeps = {}): Promise<string[]> {
  const store = deps.store ?? defaultStore();
  const rules = await store.listRules({ enabled: true, limit: 1000 });
  const matched = matchingRules(rules, eventType);
  const jobIds: string[] = [];
  for (const rule of matched) {
    const result = await runAutomation(rule.id, { actor: "event", extraPayload: { ...payload, _triggerEvent: eventType } }, deps);
    if (result) jobIds.push(result.jobId);
  }
  return jobIds;
}

export function defaultStore(db: Db = getDb()): AutomationStore {
  return {
    async insertRule(row) { await db.insert(automationRules).values(row as typeof automationRules.$inferInsert); },
    async listRules(q) {
      const conds = [];
      if (typeof q.enabled === "boolean") conds.push(eq(automationRules.enabled, q.enabled));
      if (!q.includeArchived) conds.push(isNull(automationRules.archivedAt));
      const base = db.select().from(automationRules);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(automationRules.createdAt)).limit(q.limit);
      return rows as AutomationRow[];
    },
    async getRule(id) { const r = await db.select().from(automationRules).where(eq(automationRules.id, id)).limit(1); return (r[0] as AutomationRow) ?? null; },
    async updateRule(id, fields) { await db.update(automationRules).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() } as Partial<typeof automationRules.$inferInsert>).where(eq(automationRules.id, id)); },
  };
}
