import { describe, expect, it } from "vitest";
import { buildDecisionRow, canTransitionDecision, topOption, type DecisionRow } from "@/lib/domain/decision";
import { addDecision, addOption, scoreDecisionOptions, commitDecision, type DecisionStore } from "@/lib/decisions";
import { buildOfferRow, canTransitionOffer, type OfferRow } from "@/lib/domain/offer";
import { addOffer, addExperiment, transitionOffer, type OfferStore } from "@/lib/offers";

const now = new Date("2026-07-10T12:00:00Z");

describe("decision domain", () => {
  it("builds an open decision with a reasoning trail", () => {
    const d = buildDecisionRow({ title: "Ship pricing v2?", options: [{ label: "Yes" }, { label: "No" }] }, { now, id: "decision_1" });
    expect(d.status).toBe("open");
    expect(d.options).toHaveLength(2);
    expect(d.reasoningTrail).toHaveLength(1);
  });
  it("enforces transitions + picks top option", () => {
    expect(canTransitionDecision("open", "decided")).toBe(true);
    expect(canTransitionDecision("decided", "open")).toBe(false);
    expect(topOption([{ id: "a", label: "A", score: 40 }, { id: "b", label: "B", score: 82 }])?.id).toBe("b");
    expect(topOption([{ id: "a", label: "A" }])).toBeNull();
  });
});

function decisionStore() {
  const m = new Map<string, DecisionRow>();
  const store: DecisionStore = {
    insertDecision: async (r) => void m.set(r.id, r),
    listDecisions: async (q) => [...m.values()].filter((d) => (!q.status || d.status === q.status)).slice(0, q.limit),
    getDecision: async (id) => m.get(id) ?? null,
    updateDecision: async (id, f) => { const d = m.get(id); if (d) m.set(id, { ...d, ...f }); },
  };
  return store;
}

describe("decision service", () => {
  it("AI-scores options and commits", async () => {
    const store = decisionStore();
    const d = await addDecision({ title: "Pick a channel", options: [{ label: "LinkedIn" }] }, { store, now, recordAudit: async () => {} });
    await addOption(d.id, { label: "Cold email" }, {}, { store, now, recordAudit: async () => {} });
    const scored = await scoreDecisionOptions(d.id, {}, {
      store, now, recordAudit: async () => {},
      runProvider: async (i) => { const opts = i.messages[1].content as string; const ids = [...opts.matchAll(/id=(\S+)/g)].map((x) => x[1]); return { text: JSON.stringify(ids.map((id, k) => ({ id, score: 60 + k * 20, rationale: "r" }))), run: { id: "run_1" } }; },
    });
    expect(scored?.options.every((o) => typeof o.score === "number")).toBe(true);
    expect(scored?.status).toBe("scoring");
    const winner = scored!.options.reduce((a, b) => ((b.score ?? 0) > (a.score ?? 0) ? b : a));
    const committed = await commitDecision(d.id, { optionId: winner.id, rationale: "highest score" }, { store, now, recordAudit: async () => {} });
    expect(committed?.status).toBe("decided");
    expect(committed?.decidedOptionId).toBe(winner.id);
  });
});

describe("offer domain + service", () => {
  it("builds a draft offer and runs an experiment (auto -> testing)", async () => {
    const m = new Map<string, OfferRow>();
    const store: OfferStore = {
      insertOffer: async (r) => void m.set(r.id, r),
      listOffers: async (q) => [...m.values()].slice(0, q.limit),
      getOffer: async (id) => m.get(id) ?? null,
      updateOffer: async (id, f) => { const o = m.get(id); if (o) m.set(id, { ...o, ...f }); },
    };
    expect(buildOfferRow({ name: "AI Audit Sprint" }, { now }).status).toBe("draft");
    expect(canTransitionOffer("draft", "testing")).toBe(true);
    expect(canTransitionOffer("retired", "testing")).toBe(false);
    const o = await addOffer({ name: "AI Audit Sprint", priceCents: 250000 }, { store, now, recordAudit: async () => {} });
    const exp = await addExperiment(o.id, { name: "LinkedIn DM test" }, {}, { store, now, recordAudit: async () => {} });
    expect(exp?.status).toBe("testing");
    expect(exp?.experiments).toHaveLength(1);
    const won = await transitionOffer(o.id, "winning", { score: 88 }, { store, now, recordAudit: async () => {} });
    expect(won?.status).toBe("winning");
    expect(won?.score).toBe(88);
  });
});
