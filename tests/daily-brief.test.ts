import { describe, expect, it } from "vitest";
import {
  assembleFounderBrief,
  buildBriefSignal,
  rankSignals,
  type BriefScope,
  type BriefSignal,
  type BriefSignalDraft,
} from "@/lib/domain/daily-brief";
import { buildDailyFounderBrief, type SignalFetcher } from "@/lib/daily-brief";

const now = new Date("2026-07-12T12:00:00.000Z");
const companyScope: BriefScope = { type: "company", cadence: "daily", label: "WOBBLE" };

function draft(over: Partial<BriefSignalDraft> & Pick<BriefSignalDraft, "category">): BriefSignalDraft {
  return {
    title: `${over.category} signal`,
    summary: "…",
    severity: "medium",
    confidence: { label: "medium", score: 0.6 },
    freshnessAt: now,
    evidence: [{ kind: over.category, ref: `${over.category}_1`, label: "src" }],
    scope: companyScope,
    ...over,
  };
}

function sig(over: Partial<BriefSignalDraft> & Pick<BriefSignalDraft, "category">, id: string): BriefSignal {
  return buildBriefSignal(draft(over), { id });
}

describe("daily-brief domain — ranking", () => {
  it("ranks a critical escalation above an info intelligence item", () => {
    const escalation = sig({ category: "escalation", severity: "critical", confidence: { label: "high", score: 0.9 } }, "signal_a");
    const intel = sig({ category: "intelligence", severity: "info", confidence: { label: "low", score: 0.2 } }, "signal_b");
    const ranked = rankSignals([intel, escalation], { now });
    expect(ranked[0].signal.id).toBe("signal_a");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("is deterministic and floats action-required signals with equal footing up", () => {
    const a = sig({ category: "approval_due", severity: "high", actionRequired: true }, "signal_x");
    const b = sig({ category: "delivery_risk", severity: "high" }, "signal_y");
    const first = rankSignals([a, b], { now });
    const second = rankSignals([b, a], { now });
    expect(first.map((r) => r.signal.id)).toEqual(second.map((r) => r.signal.id));
    expect(first[0].signal.id).toBe("signal_x");
  });
});

describe("daily-brief domain — assembly", () => {
  it("progressive disclosure: top-N headline, sections carry the full ranked list", () => {
    const signals = [
      sig({ category: "escalation", severity: "critical" }, "signal_1"),
      sig({ category: "finance_alert", severity: "high" }, "signal_2"),
      sig({ category: "kpi", severity: "medium" }, "signal_3"),
      sig({ category: "kpi", severity: "low" }, "signal_4"),
      sig({ category: "intelligence", severity: "info" }, "signal_5"),
    ];
    const brief = assembleFounderBrief(companyScope, signals, { now, topN: 3 });
    expect(brief.headline).toHaveLength(3);
    expect(brief.headline[0].signal.category).toBe("escalation");
    expect(brief.totalSignals).toBe(5);
    const kpiSection = brief.sections.find((s) => s.category === "kpi");
    expect(kpiSection?.count).toBe(2); // full list retained for expand, not just the headline slice
    expect(kpiSection?.items.map((i) => i.signal.id)).toEqual(["signal_3", "signal_4"]);
  });

  it("carries confidence + freshness through to headline and computes freshness window", () => {
    const older = new Date("2026-07-10T12:00:00.000Z");
    const s = sig({ category: "escalation", severity: "high", confidence: { label: "low", score: 0.3 }, freshnessAt: older }, "signal_c");
    const brief = assembleFounderBrief(companyScope, [s], { now });
    expect(brief.headline[0].signal.confidence.label).toBe("low");
    expect(brief.headline[0].signal.freshnessAt).toEqual(older);
    expect(brief.lowestConfidence).toBe("low");
    expect(brief.freshnessWindow.newest).toEqual(older);
  });

  it("empty signals → honest empty brief, not fabricated content", () => {
    const brief = assembleFounderBrief(companyScope, [], { now });
    expect(brief.isEmpty).toBe(true);
    expect(brief.headline).toEqual([]);
    expect(brief.sections).toEqual([]);
    expect(brief.lowestConfidence).toBeNull();
    expect(brief.note).toMatch(/No founder-relevant signals/i);
  });
});

describe("daily-brief service — provider orchestration", () => {
  const deptScope: BriefScope = { type: "department", id: "content", cadence: "daily", label: "Content" };

  it("assembles scoped signals from wired providers and carries the requested scope", async () => {
    const escalations: SignalFetcher = async (scope) => [
      draft({ category: "escalation", severity: "critical", scope }),
    ];
    const kpis: SignalFetcher = async (scope) => [draft({ category: "kpi", severity: "medium", scope })];
    const brief = await buildDailyFounderBrief(deptScope, { providers: { escalations, kpis }, now });
    expect(brief.scope).toEqual(deptScope);
    expect(brief.totalSignals).toBe(2);
    expect(brief.headline[0].signal.category).toBe("escalation");
    expect(brief.headline.every((r) => r.signal.scope.type === "department")).toBe(true);
  });

  it("omits unevidenced drafts (anti-fabrication) and records provider failures as degraded coverage", async () => {
    const financeAlerts: SignalFetcher = async () => {
      throw new Error("finance store unavailable");
    };
    const escalations: SignalFetcher = async (scope) => [
      draft({ category: "escalation", severity: "high", scope }),
      { ...draft({ category: "escalation", severity: "high", scope }), evidence: [] }, // no evidence → must be dropped
    ];
    const brief = await buildDailyFounderBrief(deptScope, { providers: { escalations, financeAlerts }, now });
    expect(brief.totalSignals).toBe(1);
    expect(brief.omittedSignals).toBe(1);
    expect(brief.degradedCategories).toContain("finance_alert");
    expect(brief.note).toMatch(/degraded/i);
  });

  it("no providers wired → honest empty", async () => {
    const brief = await buildDailyFounderBrief(companyScope, { now });
    expect(brief.isEmpty).toBe(true);
    expect(brief.totalSignals).toBe(0);
  });
});
