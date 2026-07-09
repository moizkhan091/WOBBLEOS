import { describe, expect, it } from "vitest";
import { buildSeoPlanRow, seoPlanOutputSchema, type SeoPlanRow } from "@/lib/domain/seo";
import { addSeoPlan, generateSeoPlan, listSeoPlans, archiveSeoPlan, type SeoStore } from "@/lib/seo";

const now = new Date("2026-07-10T12:00:00Z");

describe("seo domain", () => {
  it("builds a draft plan", () => {
    const p = buildSeoPlanRow({ topic: "AI receptionists" }, { now, id: "seo_1" });
    expect(p).toMatchObject({ id: "seo_1", status: "draft", topic: "AI receptionists", targetKeywords: [], blogIdeas: [] });
  });
  it("parses LLM plan output", () => {
    const parsed = seoPlanOutputSchema.parse({ pillar: "AI front desk", targetKeywords: [{ keyword: "ai receptionist", intent: "commercial" }], blogIdeas: [{ title: "X", outline: ["a", "b"] }] });
    expect(parsed.targetKeywords).toHaveLength(1);
    expect(parsed.blogIdeas[0].outline).toEqual(["a", "b"]);
  });
});

function store() {
  const m = new Map<string, SeoPlanRow>();
  const s: SeoStore = {
    insertPlan: async (r) => void m.set(r.id, r),
    listPlans: async (q) => [...m.values()].filter((p) => (!q.status || p.status === q.status) && (q.includeArchived || !p.archivedAt)).slice(0, q.limit),
    getPlan: async (id) => m.get(id) ?? null,
    updatePlan: async (id, f) => { const p = m.get(id); if (p) m.set(id, { ...p, ...f }); },
  };
  return s;
}

describe("seo service", () => {
  it("generates a plan via the LLM and stores keywords + ideas", async () => {
    const s = store();
    const plan = await addSeoPlan({ topic: "AI voice agents for clinics" }, { store: s, now, recordAudit: async () => {} });
    const gen = await generateSeoPlan(plan.id, {}, {
      store: s, now, recordAudit: async () => {},
      runProvider: async () => ({ text: JSON.stringify({ pillar: "AI front desk", targetKeywords: [{ keyword: "ai receptionist for clinics", intent: "commercial", priority: "high" }], blogIdeas: [{ title: "Never miss a patient call", angle: "speed to lead", targetKeyword: "ai receptionist", outline: ["problem", "solution", "cta"] }] }), run: { id: "run_1" } }),
    });
    expect(gen?.targetKeywords).toHaveLength(1);
    expect(gen?.blogIdeas[0].title).toContain("patient call");
    expect(gen?.status).toBe("planned");
    const archived = await archiveSeoPlan(plan.id, {}, { store: s, now, recordAudit: async () => {} });
    expect(archived?.status).toBe("archived");
    expect(await listSeoPlans({}, { store: s })).toHaveLength(0); // archived hidden
  });
});
