import { describe, expect, it } from "vitest";
import { buildSocialRow, socialOutputSchema, type SocialStrategyRow } from "@/lib/domain/social";
import { addSocialStrategy, generateSocialStrategy, archiveSocialStrategy, listSocialStrategies, type SocialStore } from "@/lib/social";

const now = new Date("2026-07-10T12:00:00Z");

describe("social domain", () => {
  it("builds a draft strategy", () => {
    expect(buildSocialRow({ platform: "instagram", niche: "AI dental" }, { now, id: "social_1" }).status).toBe("draft");
  });
  it("parses LLM output", () => {
    const p = socialOutputSchema.parse({ positioning: "x", pillars: ["a"], hooks: ["h"], contentIdeas: [{ idea: "reel idea", format: "reel" }] });
    expect(p.contentIdeas[0].format).toBe("reel");
  });
});

function store() {
  const m = new Map<string, SocialStrategyRow>();
  const s: SocialStore = {
    insertRow: async (r) => void m.set(r.id, r),
    listRows: async (q) => [...m.values()].filter((r) => (!q.status || r.status === q.status) && (q.includeArchived || !r.archivedAt)).slice(0, q.limit),
    getRow: async (id) => m.get(id) ?? null,
    updateRow: async (id, f) => { const r = m.get(id); if (r) m.set(id, { ...r, ...f }); },
  };
  return s;
}

describe("social service", () => {
  it("generates a strategy then archive hides it", async () => {
    const s = store();
    const row = await addSocialStrategy({ platform: "linkedin", niche: "AI automation for SMBs" }, { store: s, now, recordAudit: async () => {} });
    const gen = await generateSocialStrategy(row.id, {}, {
      store: s, now, recordAudit: async () => {},
      runProvider: async () => ({ text: JSON.stringify({ positioning: "The AI ops layer for SMBs", cadence: "3x/week", pillars: ["proof", "education"], hooks: ["Your competitor just automated this"], competitorAngles: ["own not rent"], contentIdeas: [{ format: "carousel", idea: "5 tasks to automate first", hook: "Stop doing #3 by hand" }] }), run: { id: "run_1" } }),
    });
    expect(gen?.strategy.pillars).toHaveLength(2);
    expect(gen?.status).toBe("active");
    await archiveSocialStrategy(row.id, {}, { store: s, now, recordAudit: async () => {} });
    expect(await listSocialStrategies({}, { store: s })).toHaveLength(0);
  });
});
