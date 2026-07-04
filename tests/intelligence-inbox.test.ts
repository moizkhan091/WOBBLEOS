import { describe, expect, it, vi } from "vitest";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  buildIntelligenceInsightRow,
  buildIntelligenceItemRow,
  buildIntelligenceSuggestionRow,
  type IntelligenceInsightRow,
  type IntelligenceItemRow,
  type IntelligenceSuggestionRow,
} from "@/lib/domain/intelligence";
import {
  editIntelligenceRecord,
  listIntelligenceInbox,
  mergeIntelligenceRecords,
  reviewIntelligenceRecord,
  routeIntelligenceRecordToMemory,
  type IntelligenceStore,
} from "@/lib/intelligence";

const now = new Date("2026-07-04T09:00:00.000Z");

function makeItem(overrides: Partial<IntelligenceItemRow> = {}) {
  return {
    ...buildIntelligenceItemRow(
      {
        itemType: "competitor_reel",
        scope: "wobble",
        platform: "instagram",
        actorName: "Competitor X",
        title: "Competitor lead-follow-up reel",
        summary: "Competitor used a proof-led hook about slow lead follow-up.",
        rawText: "If your team replies after 2 hours, you already lost the buyer.",
        approvalStatus: "pending",
        confidence: 0.8,
        sourceId: "source_1",
        createdByAgent: "competitor_scout",
        tags: ["lead-follow-up"],
        metadata: { sourceIntakeRunId: "sourceintake_1" },
      },
      { id: "intel_item_1", now },
    ),
    ...overrides,
  };
}

function makeInsight(overrides: Partial<IntelligenceInsightRow> = {}) {
  return {
    ...buildIntelligenceInsightRow(
      {
        insightType: "content_pattern",
        scope: "wobble",
        title: "Proof-led lead follow-up hooks are rising",
        summary: "Competitor reels with proof-led lead follow-up hooks are getting stronger engagement.",
        recommendation: "Test a WOBBLE carousel around WhatsApp follow-up speed.",
        evidenceItemIds: ["intel_item_1"],
        sourceIds: ["source_1"],
        appliesToModules: ["content_command", "decision_room"],
        confidence: 0.84,
        approvalStatus: "pending",
        createdByAgent: "social_content_analyst",
      },
      { id: "intel_insight_1", now },
    ),
    ...overrides,
  };
}

function makeSuggestion(overrides: Partial<IntelligenceSuggestionRow> = {}) {
  return {
    ...buildIntelligenceSuggestionRow(
      {
        suggestionType: "content_idea",
        scope: "wobble",
        title: "Make a proof-led lead follow-up carousel",
        rationale: "The approved pattern gap says WOBBLE has not posted enough proof-led follow-up content.",
        proposedAction: "Draft one carousel and one LinkedIn text post.",
        evidenceItemIds: ["intel_item_1"],
        evidenceInsightIds: ["intel_insight_1"],
        priority: "high",
        confidence: 0.79,
        createdByAgent: "dreamer",
      },
      { id: "intel_suggestion_1", now },
    ),
    ...overrides,
  };
}

function makeStore(seed?: {
  items?: IntelligenceItemRow[];
  insights?: IntelligenceInsightRow[];
  suggestions?: IntelligenceSuggestionRow[];
}) {
  const items = new Map((seed?.items ?? []).map((row) => [row.id, row]));
  const insights = new Map((seed?.insights ?? []).map((row) => [row.id, row]));
  const suggestions = new Map((seed?.suggestions ?? []).map((row) => [row.id, row]));
  const updates: Array<{ table: string; id: string; fields: Record<string, unknown> }> = [];

  const store: IntelligenceStore = {
    insertResearchTarget: vi.fn(async () => {}),
    listResearchTargets: vi.fn(async () => []),
    insertIntelligenceItem: vi.fn(async (row) => {
      items.set(row.id, row);
    }),
    listIntelligenceItems: vi.fn(async () => [...items.values()]),
    insertIntelligenceInsight: vi.fn(async (row) => {
      insights.set(row.id, row);
    }),
    listIntelligenceInsights: vi.fn(async () => [...insights.values()]),
    insertIntelligenceSuggestion: vi.fn(async (row) => {
      suggestions.set(row.id, row);
    }),
    listIntelligenceSuggestions: vi.fn(async () => [...suggestions.values()]),
    getIntelligenceItemById: vi.fn(async (id) => items.get(id) ?? null),
    updateIntelligenceItem: vi.fn(async (id, fields) => {
      const current = items.get(id);
      if (!current) return;
      updates.push({ table: "items", id, fields: fields as Record<string, unknown> });
      items.set(id, { ...current, ...fields });
    }),
    getIntelligenceInsightById: vi.fn(async (id) => insights.get(id) ?? null),
    updateIntelligenceInsight: vi.fn(async (id, fields) => {
      const current = insights.get(id);
      if (!current) return;
      updates.push({ table: "insights", id, fields: fields as Record<string, unknown> });
      insights.set(id, { ...current, ...fields });
    }),
    getIntelligenceSuggestionById: vi.fn(async (id) => suggestions.get(id) ?? null),
    updateIntelligenceSuggestion: vi.fn(async (id, fields) => {
      const current = suggestions.get(id);
      if (!current) return;
      updates.push({ table: "suggestions", id, fields: fields as Record<string, unknown> });
      suggestions.set(id, { ...current, ...fields });
    }),
  };

  return { store, items, insights, suggestions, updates };
}

describe("intelligence review inbox", () => {
  it("lists pending and needs-review intelligence from items, insights, and suggestions in one inbox", async () => {
    const item = makeItem();
    const insight = makeInsight({ approvalStatus: "needs_review" });
    const suggestion = makeSuggestion({ approvalStatus: "approved", status: "approved" });
    const { store } = makeStore({ items: [item], insights: [insight], suggestions: [suggestion] });

    const result = await listIntelligenceInbox({ limit: 20 }, { store, now });

    expect(result.entries.map((entry) => `${entry.recordType}:${entry.id}`)).toEqual([
      "item:intel_item_1",
      "insight:intel_insight_1",
    ]);
    expect(result.counts).toMatchObject({ pending: 1, needs_review: 1, approved: 1 });
    expect(result.entries[0]).toMatchObject({
      recordType: "item",
      title: "Competitor lead-follow-up reel",
      sourceIds: ["source_1"],
      agentSlug: "competitor_scout",
    });
  });

  it("rejects intelligence only when a reason is supplied, stores the reason, and audits the decision", async () => {
    const item = makeItem();
    const { store, items } = makeStore({ items: [item] });
    const audit: AuditEventInput[] = [];

    await expect(
      reviewIntelligenceRecord(
        { recordType: "item", id: item.id, action: "reject", reviewedBy: "Moiz" },
        {
          store,
          recordAudit: async (event) => {
            audit.push(event);
          },
          now,
        },
      ),
    ).rejects.toThrow(/reason is required/i);

    const result = await reviewIntelligenceRecord(
      { recordType: "item", id: item.id, action: "reject", reviewedBy: "Moiz", reason: "Weak and too generic" },
      {
        store,
        recordAudit: async (event) => {
          audit.push(event);
        },
        now,
      },
    );

    expect(result.record.approvalStatus).toBe("rejected");
    expect(items.get(item.id)?.metadata.review).toMatchObject({
      action: "reject",
      reviewedBy: "Moiz",
      reason: "Weak and too generic",
    });
    expect(audit.map((event) => event.eventType)).toEqual(["intelligence.review.rejected"]);
  });

  it("edits an insight without losing provenance and records an audit event", async () => {
    const insight = makeInsight();
    const { store, insights } = makeStore({ insights: [insight] });
    const audit: AuditEventInput[] = [];

    const result = await editIntelligenceRecord(
      {
        recordType: "insight",
        id: insight.id,
        editedBy: "Haad",
        patch: {
          summary: "Proof-led lead follow-up hooks are promising, but need WOBBLE-specific proof before becoming a campaign rule.",
          recommendation: "Test once before promoting this as a recurring pattern.",
        },
      },
      {
        store,
        recordAudit: async (event) => {
          audit.push(event);
        },
        now,
      },
    );

    const edited = result.record as IntelligenceInsightRow;

    expect(edited.summary).toContain("WOBBLE-specific proof");
    expect(edited.sourceIds).toEqual(["source_1"]);
    expect(insights.get(insight.id)?.metadata.edit).toMatchObject({ editedBy: "Haad" });
    expect(audit.map((event) => event.eventType)).toEqual(["intelligence.review.edited"]);
  });

  it("routes reviewed intelligence into an approval-gated memory proposal instead of directly writing memory", async () => {
    const insight = makeInsight({ approvalStatus: "approved" });
    const { store, insights } = makeStore({ insights: [insight] });
    const audit: AuditEventInput[] = [];
    const proposed: unknown[] = [];

    const result = await routeIntelligenceRecordToMemory(
      {
        recordType: "insight",
        id: insight.id,
        proposedBy: "Moiz",
        affectedArea: "content",
        knowledgeType: "content_pattern",
        suggestedBankSlugs: ["content", "hook_library", "competitor"],
      },
      {
        store,
        proposeMemoryUpdate: async (input) => {
          proposed.push(input);
          return {
            proposal: { id: "memproposal_1", approvalId: "approval_1", suggestedBankSlugs: input.suggestedBankSlugs },
            approval: { id: "approval_1" },
          } as never;
        },
        recordAudit: async (event) => {
          audit.push(event);
        },
        now,
      },
    );

    expect(result.memoryProposalId).toBe("memproposal_1");
    expect(proposed[0]).toMatchObject({
      affectedArea: "content",
      knowledgeType: "content_pattern",
      sourceId: "source_1",
      suggestedBankSlugs: ["content", "hook_library", "competitor"],
      proposedBy: "Moiz",
    });
    expect(String((proposed[0] as { proposedMemory: string }).proposedMemory)).toContain("Proof-led lead follow-up hooks are rising");
    expect(insights.get(insight.id)?.metadata.memoryProposalIds).toEqual(["memproposal_1"]);
    expect(audit.map((event) => event.eventType)).toEqual(["intelligence.review.routed_to_memory"]);
  });

  it("merges duplicate intelligence by superseding the duplicate and preserving the primary", async () => {
    const primary = makeInsight({ id: "intel_insight_primary" });
    const duplicate = makeInsight({ id: "intel_insight_duplicate", title: "Same proof-led pattern" });
    const { store, insights } = makeStore({ insights: [primary, duplicate] });
    const audit: AuditEventInput[] = [];

    const result = await mergeIntelligenceRecords(
      {
        recordType: "insight",
        primaryId: primary.id,
        duplicateId: duplicate.id,
        mergedBy: "Ibrahim",
        reason: "Same pattern extracted from the same reel.",
      },
      {
        store,
        recordAudit: async (event) => {
          audit.push(event);
        },
        now,
      },
    );

    expect(result.duplicate.approvalStatus).toBe("superseded");
    expect(insights.get(primary.id)?.approvalStatus).toBe("pending");
    expect(insights.get(duplicate.id)?.metadata.merge).toMatchObject({
      mergedIntoId: primary.id,
      mergedBy: "Ibrahim",
      reason: "Same pattern extracted from the same reel.",
    });
    expect(audit.map((event) => event.eventType)).toEqual(["intelligence.review.merged"]);
  });
});
