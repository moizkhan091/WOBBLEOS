import { and, desc, eq, sql } from "drizzle-orm";
import { agents, agentRuns } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  buildAgentRow,
  buildAgentRunRow,
  recordAgentRunSchema,
  registerAgentSchema,
  type AgentRow,
  type AgentRunRow,
  type AgentStatus,
  type RecordAgentRunInput,
  type RegisterAgentInput,
} from "@/lib/domain/agents";

export type { AgentRow, AgentRunRow };

export interface ListAgentsQuery {
  module?: string;
  team?: string;
  status?: AgentStatus;
  limit?: number;
}

export const DEFAULT_AGENT_LIMIT = 100;
export const MAX_AGENT_LIMIT = 500;
export function clampAgentLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_AGENT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_AGENT_LIMIT);
}

export interface AgentStore {
  insertAgent(row: AgentRow): Promise<void>;
  getAgentById(id: string): Promise<AgentRow | null>;
  getAgentBySlug(slug: string): Promise<AgentRow | null>;
  listAgents(query: Required<Pick<ListAgentsQuery, "limit">> & Omit<ListAgentsQuery, "limit">): Promise<AgentRow[]>;
  updateAgent(id: string, fields: Partial<AgentRow>): Promise<void>;
  insertRun(row: AgentRunRow): Promise<void>;
  listRuns(query: { agentId?: string; limit: number }): Promise<AgentRunRow[]>;
}

export interface AgentDeps {
  store?: AgentStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

/** Register (or return existing) an agent. Idempotent by slug. */
export async function registerAgent(input: RegisterAgentInput, deps: AgentDeps = {}): Promise<AgentRow> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const parsed = registerAgentSchema.parse(input);
  const existing = await store.getAgentBySlug(parsed.slug);
  if (existing) return existing;

  const agent = buildAgentRow(parsed, { now });
  await store.insertAgent(agent);
  await recordAudit({
    eventType: "agent.registered",
    module: "agent_registry",
    entityType: "agent",
    entityId: agent.id,
    metadata: { slug: agent.slug, role: agent.role, module: agent.module, team: agent.team },
  });
  return agent;
}

export interface RecordAgentRunResult {
  run: AgentRunRow;
  agent: AgentRow;
}

/**
 * Log a completed agent run and roll the agent's counters/quality/last-run.
 * Every model call / agent action should attribute to a run so the hive-mind
 * is fully observable (cost + quality + provenance per agent).
 */
export async function recordAgentRun(input: RecordAgentRunInput, deps: AgentDeps = {}): Promise<RecordAgentRunResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const parsed = recordAgentRunSchema.parse(input);
  const agent = await store.getAgentBySlug(parsed.agentSlug);
  if (!agent) throw new Error(`agent '${parsed.agentSlug}' not found (register it first)`);

  const run = buildAgentRunRow(agent, parsed, { now });
  await store.insertRun(run);

  const failed = run.status === "failed";
  const nextQuality = run.qualityScore ?? agent.qualityScore;
  await store.updateAgent(agent.id, {
    lastRunAt: now,
    runCount: agent.runCount + 1,
    failureCount: agent.failureCount + (failed ? 1 : 0),
    qualityScore: nextQuality,
    updatedAt: now,
  });

  await recordAudit({
    eventType: failed ? "agent.run.failed" : "agent.run.completed",
    module: "agent_registry",
    entityType: "agent",
    entityId: agent.id,
    costEstimate: run.costEstimate !== null ? Number(run.costEstimate) : undefined,
    metadata: { agentSlug: agent.slug, runId: run.id, status: run.status, jobId: run.jobId },
  });

  return { run, agent: { ...agent, lastRunAt: now, runCount: agent.runCount + 1, failureCount: agent.failureCount + (failed ? 1 : 0) } };
}

export async function listAgents(query: ListAgentsQuery = {}, deps: AgentDeps = {}): Promise<AgentRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listAgents({ ...query, limit: clampAgentLimit(query.limit) });
}

export async function getAgent(idOrSlug: string, deps: AgentDeps = {}): Promise<AgentRow | null> {
  const store = deps.store ?? defaultStore();
  return (await store.getAgentById(idOrSlug)) ?? (await store.getAgentBySlug(idOrSlug));
}

export async function listAgentRuns(input: { agentId?: string; limit?: number } = {}, deps: AgentDeps = {}): Promise<AgentRunRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listRuns({ agentId: input.agentId, limit: clampAgentLimit(input.limit) });
}

export function defaultStore(db: Db = getDb()): AgentStore {
  return {
    async insertAgent(row) {
      await db.insert(agents).values(row).onConflictDoNothing();
    },
    async getAgentById(id) {
      const rows = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
      return (rows[0] as AgentRow | undefined) ?? null;
    },
    async getAgentBySlug(slug) {
      const rows = await db.select().from(agents).where(eq(agents.slug, slug)).limit(1);
      return (rows[0] as AgentRow | undefined) ?? null;
    },
    async listAgents(query) {
      const conditions = [];
      if (query.module) conditions.push(eq(agents.module, query.module));
      if (query.team) conditions.push(eq(agents.team, query.team));
      if (query.status) conditions.push(eq(agents.status, query.status));
      const where = conditions.length ? and(...conditions) : undefined;
      return db.select().from(agents).where(where).orderBy(desc(agents.createdAt)).limit(query.limit) as Promise<AgentRow[]>;
    },
    async updateAgent(id, fields) {
      await db.update(agents).set(fields).where(eq(agents.id, id));
    },
    async insertRun(row) {
      await db.insert(agentRuns).values(row);
    },
    async listRuns(query) {
      const where = query.agentId ? eq(agentRuns.agentId, query.agentId) : sql`true`;
      return db.select().from(agentRuns).where(where).orderBy(desc(agentRuns.createdAt)).limit(query.limit) as Promise<AgentRunRow[]>;
    },
  };
}
