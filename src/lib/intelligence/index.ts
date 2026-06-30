import { and, desc, eq } from "drizzle-orm";
import {
  experiments,
  intelligenceInsights,
  intelligenceItems,
  intelligenceSuggestions,
  outputIntelligenceUsage,
  researchTargets,
} from "@/db/schema";
import { getDb, type Db } from "@/db";
import { createApproval, type ApprovalRow, type ApprovalStore } from "@/lib/approvals";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  buildExperimentRow,
  buildIntelligenceContextPlan,
  buildIntelligenceInsightRow,
  buildIntelligenceItemRow,
  buildIntelligenceSuggestionRow,
  buildResearchTargetRow,
  selectApprovedIntelligenceForTask,
  type ApprovedIntelligenceContext,
  type ExperimentInput,
  type ExperimentRow,
  type IntelligenceApprovalStatus,
  type IntelligenceInsightInput,
  type IntelligenceInsightRow,
  type IntelligenceItemInput,
  type IntelligenceItemRow,
  type IntelligenceScope,
  type IntelligenceSuggestionInput,
  type IntelligenceSuggestionRow,
  type IntelligenceTask,
  type ResearchTargetInput,
  type ResearchTargetRow,
} from "@/lib/domain/intelligence";

export type {
  ApprovedIntelligenceContext,
  ExperimentRow,
  IntelligenceInsightRow,
  IntelligenceItemRow,
  IntelligenceSuggestionRow,
  ResearchTargetRow,
};

export interface ListIntelligenceQuery {
  scope?: IntelligenceScope;
  clientId?: string;
  approvalStatus?: IntelligenceApprovalStatus;
  limit?: number;
}

export const DEFAULT_INTELLIGENCE_LIMIT = 50;
export const MAX_INTELLIGENCE_LIMIT = 200;

export function clampIntelligenceLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_INTELLIGENCE_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_INTELLIGENCE_LIMIT);
}

export interface IntelligenceStore {
  insertResearchTarget(row: ResearchTargetRow): Promise<void>;
  listResearchTargets(query: Required<Pick<ListIntelligenceQuery, "limit">> & Omit<ListIntelligenceQuery, "limit">): Promise<ResearchTargetRow[]>;
  insertIntelligenceItem(row: IntelligenceItemRow): Promise<void>;
  listIntelligenceItems(query: Required<Pick<ListIntelligenceQuery, "limit">> & Omit<ListIntelligenceQuery, "limit">): Promise<IntelligenceItemRow[]>;
  insertIntelligenceInsight?(row: IntelligenceInsightRow): Promise<void>;
  listIntelligenceInsights(query: Required<Pick<ListIntelligenceQuery, "limit">> & Omit<ListIntelligenceQuery, "limit">): Promise<IntelligenceInsightRow[]>;
  insertIntelligenceSuggestion(row: IntelligenceSuggestionRow): Promise<void>;
  listIntelligenceSuggestions?(query: Required<Pick<ListIntelligenceQuery, "limit">> & Omit<ListIntelligenceQuery, "limit">): Promise<IntelligenceSuggestionRow[]>;
  insertExperiment?(row: ExperimentRow): Promise<void>;
  recordOutputUsage?(row: OutputIntelligenceUsageRow): Promise<void>;
}

export interface IntelligenceDeps {
  store?: IntelligenceStore;
  approvalStore?: ApprovalStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

export interface CreateResearchTargetResult {
  target: ResearchTargetRow;
  approval: ApprovalRow;
}

export async function createResearchTarget(
  input: ResearchTargetInput,
  deps: IntelligenceDeps = {},
): Promise<CreateResearchTargetResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const target = buildResearchTargetRow(input, { now });

  await store.insertResearchTarget(target);
  await recordAudit({
    eventType: "intelligence.research_target_created",
    module: "intelligence",
    entityType: "research_target",
    entityId: target.id,
    actor: target.addedBy ?? undefined,
    metadata: { targetType: target.targetType, scope: target.scope, cadence: target.cadence, approvalStatus: target.approvalStatus },
  });

  const approval = await createApproval(
    {
      approvalType: "research_target",
      entityType: "research_target",
      entityId: target.id,
      riskLevel: "normal",
      requestedBy: target.addedBy ?? undefined,
      notes: `Review research target: ${target.name}`,
      metadata: { targetType: target.targetType, scope: target.scope, platform: target.platform, cadence: target.cadence },
    },
    { store: deps.approvalStore, recordAudit, now },
  );

  return { target, approval };
}

export async function listResearchTargets(query: ListIntelligenceQuery = {}, deps: IntelligenceDeps = {}): Promise<ResearchTargetRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listResearchTargets({ ...query, limit: clampIntelligenceLimit(query.limit) });
}

export interface RecordIntelligenceItemResult {
  item: IntelligenceItemRow;
}

export async function recordIntelligenceItem(
  input: IntelligenceItemInput,
  deps: IntelligenceDeps = {},
): Promise<RecordIntelligenceItemResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const item = buildIntelligenceItemRow(input, { now });

  await store.insertIntelligenceItem(item);
  await recordAudit({
    eventType: "intelligence.item_recorded",
    module: "intelligence",
    entityType: "intelligence_item",
    entityId: item.id,
    actor: item.createdByAgent ?? undefined,
    metadata: {
      itemType: item.itemType,
      scope: item.scope,
      approvalStatus: item.approvalStatus,
      freshnessStatus: item.freshnessStatus,
      targetId: item.targetId,
      sourceId: item.sourceId,
    },
  });

  return { item };
}

export async function listIntelligenceItems(query: ListIntelligenceQuery = {}, deps: IntelligenceDeps = {}): Promise<IntelligenceItemRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listIntelligenceItems({ ...query, limit: clampIntelligenceLimit(query.limit) });
}

export interface CreateIntelligenceInsightResult {
  insight: IntelligenceInsightRow;
}

export async function createIntelligenceInsight(
  input: IntelligenceInsightInput,
  deps: IntelligenceDeps = {},
): Promise<CreateIntelligenceInsightResult> {
  const store = deps.store ?? defaultStore();
  if (!store.insertIntelligenceInsight) throw new Error("intelligence store does not support insight creation");
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const insight = buildIntelligenceInsightRow(input, { now });
  await store.insertIntelligenceInsight(insight);
  await recordAudit({
    eventType: "intelligence.insight_created",
    module: "intelligence",
    entityType: "intelligence_insight",
    entityId: insight.id,
    actor: insight.createdByAgent ?? undefined,
    metadata: { insightType: insight.insightType, scope: insight.scope, approvalStatus: insight.approvalStatus },
  });
  return { insight };
}

export interface CreateIntelligenceSuggestionResult {
  suggestion: IntelligenceSuggestionRow;
  approval: ApprovalRow;
}

export async function createIntelligenceSuggestion(
  input: IntelligenceSuggestionInput,
  deps: IntelligenceDeps = {},
): Promise<CreateIntelligenceSuggestionResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const suggestion = buildIntelligenceSuggestionRow(input, { now });
  await store.insertIntelligenceSuggestion(suggestion);
  await recordAudit({
    eventType: "intelligence.suggestion_created",
    module: "intelligence",
    entityType: "intelligence_suggestion",
    entityId: suggestion.id,
    actor: suggestion.createdByAgent,
    metadata: { suggestionType: suggestion.suggestionType, priority: suggestion.priority, approvalStatus: suggestion.approvalStatus },
  });

  const approval = await createApproval(
    {
      approvalType: "intelligence_suggestion",
      entityType: "intelligence_suggestion",
      entityId: suggestion.id,
      riskLevel: suggestion.priority === "urgent" || suggestion.priority === "high" ? "high" : "normal",
      requestedBy: suggestion.createdByAgent,
      notes: `Review suggestion: ${suggestion.title}`,
      metadata: {
        suggestionType: suggestion.suggestionType,
        priority: suggestion.priority,
        confidence: suggestion.confidence,
        evidenceItemIds: suggestion.evidenceItemIds,
        evidenceInsightIds: suggestion.evidenceInsightIds,
      },
    },
    { store: deps.approvalStore, recordAudit, now },
  );

  return { suggestion: { ...suggestion, approvalId: approval.id }, approval };
}

export async function createExperiment(input: ExperimentInput, deps: IntelligenceDeps = {}): Promise<{ experiment: ExperimentRow }> {
  const store = deps.store ?? defaultStore();
  if (!store.insertExperiment) throw new Error("intelligence store does not support experiment creation");
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const experiment = buildExperimentRow(input, { now });
  await store.insertExperiment(experiment);
  await recordAudit({
    eventType: "intelligence.experiment_created",
    module: "intelligence",
    entityType: "experiment",
    entityId: experiment.id,
    actor: experiment.owner ?? undefined,
    metadata: { scope: experiment.scope, approvalStatus: experiment.approvalStatus, primaryMetric: experiment.primaryMetric },
  });
  return { experiment };
}

export async function buildApprovedIntelligenceContext(
  input: { task: IntelligenceTask; scope?: IntelligenceScope; clientId?: string; limit?: number },
  deps: IntelligenceDeps = {},
): Promise<ApprovedIntelligenceContext> {
  const store = deps.store ?? defaultStore();
  const plan = buildIntelligenceContextPlan({ task: input.task, scope: input.scope, clientId: input.clientId });
  const limit = clampIntelligenceLimit(input.limit);
  const [items, insights] = await Promise.all([
    store.listIntelligenceItems({ scope: plan.scope, clientId: plan.clientId ?? undefined, approvalStatus: "approved", limit }),
    store.listIntelligenceInsights({ scope: plan.scope, clientId: plan.clientId ?? undefined, approvalStatus: "approved", limit }),
  ]);
  return selectApprovedIntelligenceForTask({ plan, items, insights, limit, now: deps.now });
}

export interface OutputIntelligenceUsageRow {
  id: string;
  outputType: string;
  outputId: string;
  sourceId: string | null;
  intelligenceItemId: string | null;
  insightId: string | null;
  memoryChunkId: string | null;
  weight: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export function defaultStore(db: Db = getDb()): IntelligenceStore {
  return {
    async insertResearchTarget(row) {
      await db.insert(researchTargets).values(row);
    },
    async listResearchTargets(query) {
      const conditions = [];
      if (query.scope) conditions.push(eq(researchTargets.scope, query.scope));
      if (query.clientId) conditions.push(eq(researchTargets.clientId, query.clientId));
      if (query.approvalStatus) conditions.push(eq(researchTargets.approvalStatus, query.approvalStatus));
      const where = conditions.length ? and(...conditions) : undefined;
      return db.select().from(researchTargets).where(where).orderBy(desc(researchTargets.createdAt)).limit(query.limit) as Promise<ResearchTargetRow[]>;
    },
    async insertIntelligenceItem(row) {
      await db.insert(intelligenceItems).values(row);
    },
    async listIntelligenceItems(query) {
      const conditions = [];
      if (query.scope) conditions.push(eq(intelligenceItems.scope, query.scope));
      if (query.clientId) conditions.push(eq(intelligenceItems.clientId, query.clientId));
      if (query.approvalStatus) conditions.push(eq(intelligenceItems.approvalStatus, query.approvalStatus));
      const where = conditions.length ? and(...conditions) : undefined;
      return db.select().from(intelligenceItems).where(where).orderBy(desc(intelligenceItems.collectedAt)).limit(query.limit) as Promise<IntelligenceItemRow[]>;
    },
    async insertIntelligenceInsight(row) {
      await db.insert(intelligenceInsights).values(row);
    },
    async listIntelligenceInsights(query) {
      const conditions = [];
      if (query.scope) conditions.push(eq(intelligenceInsights.scope, query.scope));
      if (query.clientId) conditions.push(eq(intelligenceInsights.clientId, query.clientId));
      if (query.approvalStatus) conditions.push(eq(intelligenceInsights.approvalStatus, query.approvalStatus));
      const where = conditions.length ? and(...conditions) : undefined;
      return db
        .select()
        .from(intelligenceInsights)
        .where(where)
        .orderBy(desc(intelligenceInsights.createdAt))
        .limit(query.limit) as Promise<IntelligenceInsightRow[]>;
    },
    async insertIntelligenceSuggestion(row) {
      await db.insert(intelligenceSuggestions).values(row);
    },
    async listIntelligenceSuggestions(query) {
      const conditions = [];
      if (query.scope) conditions.push(eq(intelligenceSuggestions.scope, query.scope));
      if (query.clientId) conditions.push(eq(intelligenceSuggestions.clientId, query.clientId));
      if (query.approvalStatus) conditions.push(eq(intelligenceSuggestions.approvalStatus, query.approvalStatus));
      const where = conditions.length ? and(...conditions) : undefined;
      return db
        .select()
        .from(intelligenceSuggestions)
        .where(where)
        .orderBy(desc(intelligenceSuggestions.createdAt))
        .limit(query.limit) as Promise<IntelligenceSuggestionRow[]>;
    },
    async insertExperiment(row) {
      await db.insert(experiments).values(row);
    },
    async recordOutputUsage(row) {
      await db.insert(outputIntelligenceUsage).values(row);
    },
  };
}
