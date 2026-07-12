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
import { newId } from "@/lib/ids";
import { createApproval, type ApprovalRow, type ApprovalStore } from "@/lib/approvals";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { proposeMemoryUpdate, type ProposeMemoryUpdateInput, type ProposeMemoryUpdateResult } from "@/lib/memory";
import {
  buildExperimentRow,
  buildEditMetadata,
  buildIntelligenceContextPlan,
  buildIntelligenceInsightRow,
  buildIntelligenceItemRow,
  buildIntelligenceSuggestionRow,
  buildMemoryProposalFromIntelligence,
  buildMergeMetadata,
  buildResearchTargetRow,
  buildReviewMetadata,
  intelligenceEditInputSchema,
  intelligenceInboxQuerySchema,
  intelligenceMergeInputSchema,
  intelligenceReviewInputSchema,
  intelligenceRouteToMemoryInputSchema,
  mapReviewActionToApprovalStatus,
  normalizeIntelligenceInboxEntry,
  selectApprovedIntelligenceForTask,
  type ApprovedIntelligenceContext,
  type ExperimentInput,
  type ExperimentRow,
  type IntelligenceApprovalStatus,
  type IntelligenceEditInput,
  type IntelligenceInboxEntry,
  type IntelligenceInboxRecord,
  type IntelligenceInboxRecordType,
  type IntelligenceInboxQuery,
  type IntelligenceInsightInput,
  type IntelligenceInsightRow,
  type IntelligenceItemInput,
  type IntelligenceItemRow,
  type IntelligenceMergeInput,
  type IntelligenceReviewInput,
  type IntelligenceRouteToMemoryInput,
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

type LoadedIntelligenceRecord =
  | { recordType: "item"; record: IntelligenceItemRow }
  | { recordType: "insight"; record: IntelligenceInsightRow }
  | { recordType: "suggestion"; record: IntelligenceSuggestionRow };

function requireStoreMethod<T extends keyof IntelligenceStore>(store: IntelligenceStore, method: T): NonNullable<IntelligenceStore[T]> {
  const fn = store[method];
  if (!fn) throw new Error(`intelligence store does not support ${String(method)}`);
  return fn as NonNullable<IntelligenceStore[T]>;
}

async function loadIntelligenceRecord(
  store: IntelligenceStore,
  recordType: IntelligenceInboxRecordType,
  id: string,
): Promise<LoadedIntelligenceRecord> {
  if (recordType === "item") {
    const record = await requireStoreMethod(store, "getIntelligenceItemById").call(store, id);
    if (!record) throw new Error(`intelligence item '${id}' not found`);
    return { recordType, record };
  }
  if (recordType === "insight") {
    const record = await requireStoreMethod(store, "getIntelligenceInsightById").call(store, id);
    if (!record) throw new Error(`intelligence insight '${id}' not found`);
    return { recordType, record };
  }
  const record = await requireStoreMethod(store, "getIntelligenceSuggestionById").call(store, id);
  if (!record) throw new Error(`intelligence suggestion '${id}' not found`);
  return { recordType, record };
}

async function updateIntelligenceRecord(
  store: IntelligenceStore,
  loaded: LoadedIntelligenceRecord,
  fields: Partial<IntelligenceItemRow> | Partial<IntelligenceInsightRow> | Partial<IntelligenceSuggestionRow>,
): Promise<IntelligenceInboxRecord> {
  if (loaded.recordType === "item") {
    await requireStoreMethod(store, "updateIntelligenceItem").call(store, loaded.record.id, fields as Partial<IntelligenceItemRow>);
    return { ...loaded.record, ...(fields as Partial<IntelligenceItemRow>) };
  }
  if (loaded.recordType === "insight") {
    await requireStoreMethod(store, "updateIntelligenceInsight").call(store, loaded.record.id, fields as Partial<IntelligenceInsightRow>);
    return { ...loaded.record, ...(fields as Partial<IntelligenceInsightRow>) };
  }
  await requireStoreMethod(store, "updateIntelligenceSuggestion").call(store, loaded.record.id, fields as Partial<IntelligenceSuggestionRow>);
  return { ...loaded.record, ...(fields as Partial<IntelligenceSuggestionRow>) };
}

export interface IntelligenceStore {
  insertResearchTarget(row: ResearchTargetRow): Promise<void>;
  listResearchTargets(query: Required<Pick<ListIntelligenceQuery, "limit">> & Omit<ListIntelligenceQuery, "limit">): Promise<ResearchTargetRow[]>;
  updateResearchTarget?(id: string, fields: Partial<ResearchTargetRow>): Promise<void>;
  insertIntelligenceItem(row: IntelligenceItemRow): Promise<void>;
  listIntelligenceItems(query: Required<Pick<ListIntelligenceQuery, "limit">> & Omit<ListIntelligenceQuery, "limit">): Promise<IntelligenceItemRow[]>;
  getIntelligenceItemById?(id: string): Promise<IntelligenceItemRow | null>;
  updateIntelligenceItem?(id: string, fields: Partial<IntelligenceItemRow>): Promise<void>;
  insertIntelligenceInsight?(row: IntelligenceInsightRow): Promise<void>;
  listIntelligenceInsights(query: Required<Pick<ListIntelligenceQuery, "limit">> & Omit<ListIntelligenceQuery, "limit">): Promise<IntelligenceInsightRow[]>;
  getIntelligenceInsightById?(id: string): Promise<IntelligenceInsightRow | null>;
  updateIntelligenceInsight?(id: string, fields: Partial<IntelligenceInsightRow>): Promise<void>;
  insertIntelligenceSuggestion(row: IntelligenceSuggestionRow): Promise<void>;
  listIntelligenceSuggestions?(query: Required<Pick<ListIntelligenceQuery, "limit">> & Omit<ListIntelligenceQuery, "limit">): Promise<IntelligenceSuggestionRow[]>;
  getIntelligenceSuggestionById?(id: string): Promise<IntelligenceSuggestionRow | null>;
  updateIntelligenceSuggestion?(id: string, fields: Partial<IntelligenceSuggestionRow>): Promise<void>;
  insertExperiment?(row: ExperimentRow): Promise<void>;
  recordOutputUsage?(row: OutputIntelligenceUsageRow): Promise<void>;
}

export interface IntelligenceDeps {
  store?: IntelligenceStore;
  approvalStore?: ApprovalStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  proposeMemoryUpdate?: (input: ProposeMemoryUpdateInput) => Promise<ProposeMemoryUpdateResult>;
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

/**
 * Source value / ROI (Phase 5, mandate G): measure what a source actually produced — the findings (insights)
 * that cite its collected observations and how the founder judged them. Reads the source's items + the
 * insights that could cite them, then computes the pure value. Used by the founder-facing source-value surface
 * and to argue (never silently perform) a low-value-source deactivation proposal.
 */
export async function getSourceValue(targetId: string, deps: IntelligenceDeps = {}): Promise<import("@/lib/domain/intelligence").SourceValue> {
  const { computeSourceValue } = await import("@/lib/domain/intelligence");
  const store = deps.store ?? defaultStore();
  const items = await store.listIntelligenceItems({ limit: 5000 });
  const insights = await store.listIntelligenceInsights({ limit: 5000 });
  return computeSourceValue(targetId, items, insights);
}

export async function listResearchTargets(query: ListIntelligenceQuery = {}, deps: IntelligenceDeps = {}): Promise<ResearchTargetRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listResearchTargets({ ...query, limit: clampIntelligenceLimit(query.limit) });
}

/** Record that a research target was just scouted and schedule its next run (used by the scheduler). */
export async function markResearchTargetScouted(id: string, fields: { lastCheckedAt: Date; nextRunAt: Date | null }, deps: IntelligenceDeps = {}): Promise<void> {
  const store = deps.store ?? defaultStore();
  if (!store.updateResearchTarget) return;
  await store.updateResearchTarget(id, fields);
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
  // Fetch the task scope PLUS global (org-wide brand rules/insights must reach every generator) PLUS
  // this client's own data when a clientId is set. scopeMatches then filters precisely (no cross-client leak).
  const scopes: Array<{ scope: IntelligenceScope; clientId?: string }> = [{ scope: plan.scope, clientId: plan.clientId ?? undefined }];
  if (plan.scope !== "global") scopes.push({ scope: "global" });
  if (plan.clientId && plan.scope !== "client") scopes.push({ scope: "client", clientId: plan.clientId });
  const [itemArrays, insightArrays] = await Promise.all([
    Promise.all(scopes.map((s) => store.listIntelligenceItems({ scope: s.scope, clientId: s.clientId, approvalStatus: "approved", limit }))),
    Promise.all(scopes.map((s) => store.listIntelligenceInsights({ scope: s.scope, clientId: s.clientId, approvalStatus: "approved", limit }))),
  ]);
  const dedupe = <T extends { id: string }>(arrs: T[][]): T[] => { const m = new Map<string, T>(); for (const r of arrs.flat()) m.set(r.id, r); return [...m.values()]; };
  return selectApprovedIntelligenceForTask({ plan, items: dedupe(itemArrays), insights: dedupe(insightArrays), limit, now: deps.now });
}

export interface IntelligenceInboxResult {
  entries: IntelligenceInboxEntry[];
  counts: Record<IntelligenceApprovalStatus, number>;
}

function emptyApprovalCounts(): Record<IntelligenceApprovalStatus, number> {
  return { pending: 0, approved: 0, rejected: 0, needs_review: 0, archived: 0, superseded: 0 };
}

export async function listIntelligenceInbox(
  input: IntelligenceInboxQuery = {},
  deps: IntelligenceDeps = {},
): Promise<IntelligenceInboxResult> {
  const parsed = intelligenceInboxQuerySchema.parse(input);
  const store = deps.store ?? defaultStore();
  const limit = clampIntelligenceLimit(parsed.limit);
  const baseQuery = { scope: parsed.scope, clientId: parsed.clientId, limit: MAX_INTELLIGENCE_LIMIT };
  const [items, insights, suggestions] = await Promise.all([
    store.listIntelligenceItems(baseQuery),
    store.listIntelligenceInsights(baseQuery),
    store.listIntelligenceSuggestions ? store.listIntelligenceSuggestions(baseQuery) : Promise.resolve([]),
  ]);

  const all = [
    ...items.map((item) => normalizeIntelligenceInboxEntry("item", item)),
    ...insights.map((insight) => normalizeIntelligenceInboxEntry("insight", insight)),
    ...suggestions.map((suggestion) => normalizeIntelligenceInboxEntry("suggestion", suggestion)),
  ];

  const counts = emptyApprovalCounts();
  for (const entry of all) counts[entry.approvalStatus] += 1;

  const defaultStatuses = new Set<IntelligenceApprovalStatus>(["pending", "needs_review"]);
  const entries = all
    .filter((entry) => (parsed.approvalStatus ? entry.approvalStatus === parsed.approvalStatus : defaultStatuses.has(entry.approvalStatus)))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);

  return { entries, counts };
}

export async function reviewIntelligenceRecord(input: IntelligenceReviewInput, deps: IntelligenceDeps = {}) {
  const parsed = intelligenceReviewInputSchema.parse(input);
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const loaded = await loadIntelligenceRecord(store, parsed.recordType, parsed.id);
  const approvalStatus = mapReviewActionToApprovalStatus(parsed.action);
  const metadata = buildReviewMetadata(loaded.record.metadata, parsed, now);
  const baseFields = { approvalStatus, metadata, updatedAt: now };

  let fields: Partial<IntelligenceItemRow> | Partial<IntelligenceInsightRow> | Partial<IntelligenceSuggestionRow> = baseFields;
  if (loaded.recordType === "insight" && parsed.action === "approve") {
    fields = { ...baseFields, approvedBy: parsed.reviewedBy, approvedAt: now };
  }
  if (loaded.recordType === "suggestion") {
    const status =
      parsed.action === "approve" ? "approved" : parsed.action === "reject" ? "rejected" : parsed.action === "archive" ? "archived" : loaded.record.status;
    fields = { ...baseFields, status };
  }

  const updated = await updateIntelligenceRecord(store, loaded, fields);
  await recordAudit({
    eventType: `intelligence.review.${approvalStatus === "approved" ? "approved" : approvalStatus === "rejected" ? "rejected" : approvalStatus}`,
    module: "intelligence",
    entityType: `intelligence_${parsed.recordType}`,
    entityId: parsed.id,
    actor: parsed.reviewedBy,
    metadata: { action: parsed.action, approvalStatus, reason: parsed.reason, notes: parsed.notes },
  });

  return { recordType: parsed.recordType, record: updated };
}

function pickPatch(recordType: IntelligenceInboxRecordType, patch: Record<string, unknown>): Record<string, unknown> {
  const allowed: Record<IntelligenceInboxRecordType, string[]> = {
    item: ["title", "summary", "rawText", "tags", "metrics", "extracted", "relations", "confidence", "metadata"],
    insight: ["title", "summary", "recommendation", "evidenceItemIds", "sourceIds", "appliesToModules", "confidence", "impactScore", "metadata"],
    suggestion: ["title", "rationale", "proposedAction", "evidenceItemIds", "evidenceInsightIds", "priority", "confidence", "reviewAfter", "metadata"],
  };
  const out: Record<string, unknown> = {};
  for (const key of allowed[recordType]) {
    if (key in patch) out[key] = patch[key];
  }
  if (!Object.keys(out).length) throw new Error(`no editable fields supplied for ${recordType}`);
  return out;
}

export async function editIntelligenceRecord(input: IntelligenceEditInput, deps: IntelligenceDeps = {}) {
  const parsed = intelligenceEditInputSchema.parse(input);
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const loaded = await loadIntelligenceRecord(store, parsed.recordType, parsed.id);
  const patch = pickPatch(parsed.recordType, parsed.patch);
  const patchMetadata = typeof patch.metadata === "object" && patch.metadata !== null && !Array.isArray(patch.metadata) ? patch.metadata : {};
  const metadata = buildEditMetadata({ ...loaded.record.metadata, ...(patchMetadata as Record<string, unknown>) }, parsed, now);
  const updated = await updateIntelligenceRecord(store, loaded, { ...patch, metadata, updatedAt: now } as never);

  await recordAudit({
    eventType: "intelligence.review.edited",
    module: "intelligence",
    entityType: `intelligence_${parsed.recordType}`,
    entityId: parsed.id,
    actor: parsed.editedBy,
    metadata: { fields: Object.keys(patch), notes: parsed.notes },
  });

  return { recordType: parsed.recordType, record: updated };
}

export async function routeIntelligenceRecordToMemory(input: IntelligenceRouteToMemoryInput, deps: IntelligenceDeps = {}) {
  const parsed = intelligenceRouteToMemoryInputSchema.parse(input);
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const loaded = await loadIntelligenceRecord(store, parsed.recordType, parsed.id);
  const memoryInput = buildMemoryProposalFromIntelligence({
    recordType: parsed.recordType,
    record: loaded.record,
    affectedArea: parsed.affectedArea,
    knowledgeType: parsed.knowledgeType,
    suggestedBankSlugs: parsed.suggestedBankSlugs,
    proposedBy: parsed.proposedBy,
  });
  const createProposal = deps.proposeMemoryUpdate ?? proposeMemoryUpdate;
  const result = await createProposal(memoryInput);
  const proposalId = result.proposal.id;
  const currentProposalIds = Array.isArray(loaded.record.metadata.memoryProposalIds) ? loaded.record.metadata.memoryProposalIds.map((id) => String(id)) : [];
  const routeHistory = Array.isArray(loaded.record.metadata.memoryRouteHistory) ? loaded.record.metadata.memoryRouteHistory : [];
  const metadata = {
    ...loaded.record.metadata,
    memoryProposalIds: [...new Set([...currentProposalIds, proposalId])],
    memoryRouteHistory: [
      ...routeHistory,
      {
        proposalId,
        approvalId: result.approval.id,
        proposedBy: parsed.proposedBy,
        affectedArea: memoryInput.affectedArea,
        knowledgeType: memoryInput.knowledgeType,
        suggestedBankSlugs: memoryInput.suggestedBankSlugs,
        routedAt: now.toISOString(),
      },
    ],
  };
  const updated = await updateIntelligenceRecord(store, loaded, { metadata, updatedAt: now } as never);

  await recordAudit({
    eventType: "intelligence.review.routed_to_memory",
    module: "intelligence",
    entityType: `intelligence_${parsed.recordType}`,
    entityId: parsed.id,
    actor: parsed.proposedBy,
    metadata: {
      memoryProposalId: proposalId,
      approvalId: result.approval.id,
      affectedArea: memoryInput.affectedArea,
      knowledgeType: memoryInput.knowledgeType,
      suggestedBankSlugs: memoryInput.suggestedBankSlugs,
    },
  });

  return { recordType: parsed.recordType, record: updated, memoryProposalId: proposalId, approvalId: result.approval.id };
}

export async function mergeIntelligenceRecords(input: IntelligenceMergeInput, deps: IntelligenceDeps = {}) {
  const parsed = intelligenceMergeInputSchema.parse(input);
  if (parsed.primaryId === parsed.duplicateId) throw new Error("primaryId and duplicateId must be different");
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const primary = await loadIntelligenceRecord(store, parsed.recordType, parsed.primaryId);
  const duplicate = await loadIntelligenceRecord(store, parsed.recordType, parsed.duplicateId);
  const metadata = buildMergeMetadata(duplicate.record.metadata, parsed, now);
  const fields: Partial<IntelligenceItemRow> | Partial<IntelligenceInsightRow> | Partial<IntelligenceSuggestionRow> =
    duplicate.recordType === "suggestion"
      ? { approvalStatus: "superseded", status: "archived", metadata, updatedAt: now }
      : { approvalStatus: "superseded", metadata, updatedAt: now };
  const updatedDuplicate = await updateIntelligenceRecord(store, duplicate, fields);

  await recordAudit({
    eventType: "intelligence.review.merged",
    module: "intelligence",
    entityType: `intelligence_${parsed.recordType}`,
    entityId: parsed.duplicateId,
    actor: parsed.mergedBy,
    metadata: { primaryId: parsed.primaryId, duplicateId: parsed.duplicateId, reason: parsed.reason },
  });

  return { recordType: parsed.recordType, primary: primary.record, duplicate: updatedDuplicate };
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

/**
 * Record which approved intelligence an output used — the output→evidence provenance
 * that lets us later ask "what did this content rely on?" and measure what's working.
 * Best-effort: never throws (provenance logging must not break a generation).
 */
export async function logOutputIntelligenceUsage(
  input: { outputType: string; outputId: string; itemIds?: string[]; insightIds?: string[] },
  deps: IntelligenceDeps = {},
): Promise<void> {
  if (!(input.itemIds?.length || input.insightIds?.length)) return;
  const store = deps.store ?? defaultStore();
  if (!store.recordOutputUsage) return;
  const now = deps.now ?? new Date();
  const rows: OutputIntelligenceUsageRow[] = [
    ...(input.itemIds ?? []).map((intelligenceItemId) => ({ id: newId("oiu"), outputType: input.outputType, outputId: input.outputId, sourceId: null, intelligenceItemId, insightId: null, memoryChunkId: null, weight: null, metadata: {}, createdAt: now })),
    ...(input.insightIds ?? []).map((insightId) => ({ id: newId("oiu"), outputType: input.outputType, outputId: input.outputId, sourceId: null, intelligenceItemId: null, insightId, memoryChunkId: null, weight: null, metadata: {}, createdAt: now })),
  ];
  for (const row of rows) {
    try { await store.recordOutputUsage(row); } catch { /* provenance is best-effort */ }
  }
}

export function defaultStore(db: Db = getDb()): IntelligenceStore {
  return {
    async insertResearchTarget(row) {
      await db.insert(researchTargets).values(row);
    },
    async updateResearchTarget(id, fields) {
      await db.update(researchTargets).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() } as Partial<typeof researchTargets.$inferInsert>).where(eq(researchTargets.id, id));
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
    async getIntelligenceItemById(id) {
      const rows = await db.select().from(intelligenceItems).where(eq(intelligenceItems.id, id)).limit(1);
      return (rows[0] as IntelligenceItemRow | undefined) ?? null;
    },
    async updateIntelligenceItem(id, fields) {
      await db.update(intelligenceItems).set(fields).where(eq(intelligenceItems.id, id));
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
    async getIntelligenceInsightById(id) {
      const rows = await db.select().from(intelligenceInsights).where(eq(intelligenceInsights.id, id)).limit(1);
      return (rows[0] as IntelligenceInsightRow | undefined) ?? null;
    },
    async updateIntelligenceInsight(id, fields) {
      await db.update(intelligenceInsights).set(fields).where(eq(intelligenceInsights.id, id));
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
    async getIntelligenceSuggestionById(id) {
      const rows = await db.select().from(intelligenceSuggestions).where(eq(intelligenceSuggestions.id, id)).limit(1);
      return (rows[0] as IntelligenceSuggestionRow | undefined) ?? null;
    },
    async updateIntelligenceSuggestion(id, fields) {
      await db.update(intelligenceSuggestions).set(fields).where(eq(intelligenceSuggestions.id, id));
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
