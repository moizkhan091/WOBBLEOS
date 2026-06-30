import { describe, expect, it, vi } from "vitest";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { ApprovalStore } from "@/lib/approvals";
import {
  INTELLIGENCE_AGENT_REGISTRY,
  buildIntelligenceContextPlan,
  buildIntelligenceInsightRow,
  buildIntelligenceItemRow,
  buildIntelligenceSuggestionRow,
  buildResearchTargetRow,
  calculateFreshnessStatus,
  selectApprovedIntelligenceForTask,
  type IntelligenceInsightRow,
  type IntelligenceItemRow,
  type ResearchTargetRow,
} from "@/lib/domain/intelligence";
import {
  buildApprovedIntelligenceContext,
  createIntelligenceSuggestion,
  createResearchTarget,
  recordIntelligenceItem,
  type IntelligenceStore,
} from "@/lib/intelligence";

const now = new Date("2026-06-30T12:00:00.000Z");

describe("intelligence domain", () => {
  it("builds research targets as pending approval watchlist config, not trusted data", () => {
    const row = buildResearchTargetRow(
      {
        targetType: "competitor_account",
        name: "Competitor Instagram",
        platform: "instagram",
        handleOrUrl: "https://instagram.com/example",
        scope: "wobble",
        addedBy: "Moiz",
        cadence: "daily",
        tags: ["ai-agency", "content"],
      },
      { id: "target_1", now },
    );

    expect(row).toMatchObject({
      id: "target_1",
      targetType: "competitor_account",
      name: "Competitor Instagram",
      platform: "instagram",
      handleOrUrl: "https://instagram.com/example",
      scope: "wobble",
      approvalStatus: "pending",
      status: "active",
      trustLevel: "tier_4_experimental",
      cadence: "daily",
      addedBy: "Moiz",
      approvedBy: null,
      tags: ["ai-agency", "content"],
      createdAt: now,
      updatedAt: now,
    });
  });

  it("normalizes competitor reel data without inventing missing metrics or analysis", () => {
    const item = buildIntelligenceItemRow(
      {
        itemType: "competitor_reel",
        scope: "wobble",
        platform: "instagram",
        actorName: "Competitor X",
        title: "AI employee reel",
        summary: "Competitor explains AI employees for lead follow-up.",
        rawText: "Transcript: Most businesses lose leads because follow-up is slow.",
        sourceUrl: "https://instagram.com/reel/123",
        observedAt: "2026-06-16T10:00:00.000Z",
        collectedAt: "2026-06-30T12:00:00.000Z",
        createdByAgent: "competitor_scout",
        metrics: { views: 12000, saves: 240 },
        extracted: { hook: "Your CRM is leaking leads", cta: "DM automate" },
        tags: ["lead-follow-up"],
      },
      { id: "intel_item_1", now },
    );

    expect(item).toMatchObject({
      id: "intel_item_1",
      itemType: "competitor_reel",
      approvalStatus: "pending",
      freshnessStatus: "current",
      confidence: "0.6",
      metrics: { views: 12000, saves: 240 },
      extracted: { hook: "Your CRM is leaking leads", cta: "DM automate" },
    });
    expect(item.metrics).not.toHaveProperty("likes");
  });

  it("calculates freshness from observed dates and marks old fast-moving data stale", () => {
    expect(calculateFreshnessStatus({ observedAt: new Date("2026-06-29T12:00:00.000Z"), now, staleAfterDays: 14 })).toBe(
      "fresh",
    );
    expect(calculateFreshnessStatus({ observedAt: new Date("2026-06-01T12:00:00.000Z"), now, staleAfterDays: 14 })).toBe(
      "stale",
    );
    expect(calculateFreshnessStatus({ observedAt: new Date("2026-03-01T12:00:00.000Z"), now, staleAfterDays: 14 })).toBe(
      "expired",
    );
  });

  it("builds task-specific retrieval plans instead of relying on static prompts", () => {
    const social = buildIntelligenceContextPlan({ task: "social_content", scope: "wobble" });
    expect(social.requiredItemTypes).toEqual(
      expect.arrayContaining(["competitor_post", "competitor_reel", "social_performance", "audience_comment"]),
    );
    expect(social.requiredInsightTypes).toEqual(expect.arrayContaining(["content_pattern", "performance_learning"]));

    const decision = buildIntelligenceContextPlan({ task: "decision", scope: "wobble" });
    expect(decision.requiredItemTypes).toEqual(expect.arrayContaining(["campaign_result", "sales_objection"]));
    expect(decision.requiredInsightTypes).toEqual(expect.arrayContaining(["risk", "opportunity", "strategy_recommendation"]));
  });

  it("selects only approved intelligence for production context and reports empty-state gaps", () => {
    const approved = buildIntelligenceItemRow(
      {
        itemType: "competitor_reel",
        scope: "wobble",
        title: "Approved reel",
        summary: "Approved pattern",
        approvalStatus: "approved",
        observedAt: now,
      },
      { id: "item_approved", now },
    );
    const pending = buildIntelligenceItemRow(
      {
        itemType: "competitor_post",
        scope: "wobble",
        title: "Pending post",
        summary: "Pending pattern",
        approvalStatus: "pending",
        observedAt: now,
      },
      { id: "item_pending", now },
    );
    const insight = buildIntelligenceInsightRow(
      {
        insightType: "content_pattern",
        scope: "wobble",
        title: "Approved insight",
        summary: "Teach-first proof hooks are working.",
        evidenceItemIds: ["item_approved"],
        approvalStatus: "approved",
        confidence: 0.8,
      },
      { id: "insight_approved", now },
    );

    const context = selectApprovedIntelligenceForTask({
      plan: buildIntelligenceContextPlan({ task: "social_content", scope: "wobble" }),
      items: [approved, pending],
      insights: [insight],
      now,
    });

    expect(context.items.map((item) => item.id)).toEqual(["item_approved"]);
    expect(context.insights.map((item) => item.id)).toEqual(["insight_approved"]);
    expect(context.excluded.map((item) => item.id)).toContain("item_pending");
    expect(context.gaps).toEqual(expect.arrayContaining(["social_performance", "audience_comment"]));
  });

  it("creates Dreamer suggestions as pending, evidence-linked, approval-gated proposals", () => {
    const suggestion = buildIntelligenceSuggestionRow(
      {
        suggestionType: "content_experiment",
        scope: "wobble",
        title: "Test proof-led AI OS carousel",
        rationale: "Competitor proof hooks rose while our proof examples are thin.",
        proposedAction: "Create a LinkedIn carousel with proof-led hook and compare saves.",
        evidenceItemIds: ["item_approved"],
        evidenceInsightIds: ["insight_approved"],
        priority: "high",
        confidence: 0.76,
        createdByAgent: "dreamer",
      },
      { id: "suggestion_1", now },
    );

    expect(suggestion).toMatchObject({
      id: "suggestion_1",
      status: "pending",
      approvalStatus: "pending",
      priority: "high",
      confidence: "0.76",
      createdByAgent: "dreamer",
    });
  });

  it("ships a stable agent registry for all core intelligence jobs", () => {
    expect(INTELLIGENCE_AGENT_REGISTRY.map((agent) => agent.slug)).toEqual(
      expect.arrayContaining([
        "intelligence_orchestrator",
        "competitor_scout",
        "social_content_analyst",
        "transcript_analyst",
        "trend_radar",
        "market_researcher",
        "seo_blog_intelligence",
        "website_analytics_agent",
        "offer_intelligence",
        "brand_voice_guardian",
        "memory_curator",
        "performance_learning",
        "dreamer",
        "experiment_planner",
        "source_quality_fact_checker",
        "approval_manager",
      ]),
    );
  });
});

function makeApprovalStore() {
  const inserted: unknown[] = [];
  const store: ApprovalStore = {
    insert: vi.fn(async (row) => {
      inserted.push(row);
    }),
    getById: vi.fn(async () => null),
    update: vi.fn(async () => {}),
  };
  return { store, inserted };
}

function makeIntelligenceStore(seed?: {
  targets?: ResearchTargetRow[];
  items?: IntelligenceItemRow[];
  insights?: IntelligenceInsightRow[];
}): IntelligenceStore & {
  calls: { targets: ResearchTargetRow[]; items: IntelligenceItemRow[]; suggestions: unknown[] };
} {
  const targets = new Map((seed?.targets ?? []).map((row) => [row.id, row]));
  const items = new Map((seed?.items ?? []).map((row) => [row.id, row]));
  const insights = new Map((seed?.insights ?? []).map((row) => [row.id, row]));
  const calls = { targets: [] as ResearchTargetRow[], items: [] as IntelligenceItemRow[], suggestions: [] as unknown[] };

  return {
    calls,
    insertResearchTarget: async (row) => {
      calls.targets.push(row);
      targets.set(row.id, row);
    },
    listResearchTargets: async () => [...targets.values()],
    insertIntelligenceItem: async (row) => {
      calls.items.push(row);
      items.set(row.id, row);
    },
    listIntelligenceItems: async (query) =>
      [...items.values()]
        .filter((item) => (query.scope ? item.scope === query.scope : true))
        .filter((item) => (query.approvalStatus ? item.approvalStatus === query.approvalStatus : true))
        .slice(0, query.limit),
    listIntelligenceInsights: async (query) =>
      [...insights.values()]
        .filter((item) => (query.scope ? item.scope === query.scope : true))
        .filter((item) => (query.approvalStatus ? item.approvalStatus === query.approvalStatus : true))
        .slice(0, query.limit),
    insertIntelligenceSuggestion: async (row) => {
      calls.suggestions.push(row);
    },
  };
}

describe("intelligence service", () => {
  it("creates research targets with audit and approval requests", async () => {
    const store = makeIntelligenceStore();
    const approval = makeApprovalStore();
    const audit: AuditEventInput[] = [];

    const result = await createResearchTarget(
      {
        targetType: "competitor_account",
        name: "Competitor X",
        platform: "instagram",
        handleOrUrl: "https://instagram.com/competitor",
        scope: "wobble",
        addedBy: "Moiz",
      },
      {
        store,
        approvalStore: approval.store,
        recordAudit: async (event) => {
          audit.push(event);
        },
        now,
      },
    );

    expect(result.target.approvalStatus).toBe("pending");
    expect(result.approval).toMatchObject({ approvalType: "research_target", entityId: result.target.id });
    expect(audit.map((event) => event.eventType)).toContain("intelligence.research_target_created");
  });

  it("records raw intelligence items without auto-promoting them into trusted knowledge", async () => {
    const store = makeIntelligenceStore();
    const audit: AuditEventInput[] = [];

    const result = await recordIntelligenceItem(
      {
        itemType: "competitor_reel",
        scope: "wobble",
        title: "Competitor reel transcript",
        summary: "Competitor explains lead follow-up automation.",
        rawText: "Transcript text",
        approvalStatus: "pending",
      },
      {
        store,
        recordAudit: async (event) => {
          audit.push(event);
        },
        now,
      },
    );

    expect(result.item.approvalStatus).toBe("pending");
    expect(store.calls.items).toHaveLength(1);
    expect(audit.map((event) => event.eventType)).toContain("intelligence.item_recorded");
  });

  it("builds approved intelligence context from current data and excludes pending records", async () => {
    const approved = buildIntelligenceItemRow(
      { itemType: "social_performance", scope: "wobble", title: "Saves rose", summary: "Carousel saves rose.", approvalStatus: "approved" },
      { id: "item_social", now },
    );
    const pending = buildIntelligenceItemRow(
      { itemType: "competitor_reel", scope: "wobble", title: "Pending reel", summary: "Pending.", approvalStatus: "pending" },
      { id: "item_pending", now },
    );
    const insight = buildIntelligenceInsightRow(
      {
        insightType: "performance_learning",
        scope: "wobble",
        title: "Carousel saves rising",
        summary: "Teach-first carousel saves are rising.",
        approvalStatus: "approved",
        confidence: 0.9,
      },
      { id: "insight_social", now },
    );
    const store = makeIntelligenceStore({ items: [approved, pending], insights: [insight] });

    const context = await buildApprovedIntelligenceContext(
      { task: "social_content", scope: "wobble", limit: 10 },
      { store, now },
    );

    expect(context.items.map((item) => item.id)).toEqual(["item_social"]);
    expect(context.insights.map((item) => item.id)).toEqual(["insight_social"]);
    expect(context.excluded.map((item) => item.id)).not.toContain("item_pending");
  });

  it("creates Dreamer suggestions with approval and audit", async () => {
    const store = makeIntelligenceStore();
    const approval = makeApprovalStore();
    const audit: AuditEventInput[] = [];

    const result = await createIntelligenceSuggestion(
      {
        suggestionType: "campaign_idea",
        scope: "wobble",
        title: "Launch AI OS teardown series",
        rationale: "Approved content patterns show teardown posts drive saves.",
        proposedAction: "Create a 5-part LinkedIn teardown series.",
        priority: "medium",
        confidence: 0.7,
        createdByAgent: "dreamer",
      },
      {
        store,
        approvalStore: approval.store,
        recordAudit: async (event) => {
          audit.push(event);
        },
        now,
      },
    );

    expect(result.suggestion.status).toBe("pending");
    expect(result.approval).toMatchObject({ approvalType: "intelligence_suggestion", entityId: result.suggestion.id });
    expect(audit.map((event) => event.eventType)).toContain("intelligence.suggestion_created");
  });
});
