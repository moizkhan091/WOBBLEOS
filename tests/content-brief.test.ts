import { describe, expect, it } from "vitest";
import {
  buildContentBrief,
  assessDataReadiness,
  suggestCtaForGoal,
  type ContentBriefInput,
} from "@/lib/domain/content-brief";

const base: ContentBriefInput = {
  goal: "leads",
  platform: "linkedin",
  format: "carousel",
  audience: "founders drowning in manual work",
  topic: "AI operating systems",
  knowledge: [
    { id: "k1", kind: "framework", content: "Teach-first: prove value before any ask." },
    { id: "k2", kind: "hook", content: "Open with a specific number or contrarian claim." },
  ],
  performance: [{ id: "p1", metric: "saves", value: "3x", note: "teach-first carousels save 3x" }],
  competitors: [{ id: "c1", competitor: "AcmeAI", observation: "posts rage-bait, low saves" }],
};

describe("suggestCtaForGoal", () => {
  it("matches CTA intent to the goal", () => {
    expect(suggestCtaForGoal("leads")).toMatch(/direct-response/i);
    expect(suggestCtaForGoal("awareness")).toMatch(/share/i);
    expect(suggestCtaForGoal("engagement")).toMatch(/reply/i);
  });
  it("honors a founder CTA preference", () => {
    expect(suggestCtaForGoal("leads", "Book a teardown call")).toBe("Book a teardown call");
  });
});

describe("assessDataReadiness", () => {
  it("scores grounding from the data present", () => {
    expect(assessDataReadiness(base).score).toBe(100);
    const lean = assessDataReadiness({ ...base, performance: [], competitors: [] });
    expect(lean.score).toBe(50);
    expect(lean.missing).toEqual(expect.arrayContaining(["our own performance stats", "competitor signals"]));
  });
});

describe("buildContentBrief", () => {
  it("grounds the prompt in approved data and bakes in the no-hallucination rule", () => {
    const brief = buildContentBrief(base);
    expect(brief.goal).toBe("leads");
    expect(brief.suggestedCtaType).toMatch(/direct-response/i);
    expect(brief.knowledgeUsed).toEqual(["k1", "k2"]);
    expect(brief.systemPrompt).toContain("Teach-first");
    expect(brief.systemPrompt).toContain("DO NOT fabricate");
    expect(brief.dataReadiness.score).toBe(100);
    expect(brief.messages[0].role).toBe("system");
  });

  it("warns and tells the model not to invent when data is missing", () => {
    const brief = buildContentBrief({ ...base, knowledge: [], performance: [], competitors: [] });
    expect(brief.warnings.length).toBeGreaterThan(0);
    expect(brief.systemPrompt).toContain("(none provided - do not invent any)");
    expect(brief.dataReadiness.hasKnowledge).toBe(false);
  });
});
