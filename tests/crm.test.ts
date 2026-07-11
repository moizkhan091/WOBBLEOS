import { describe, expect, it } from "vitest";
import {
  buildCompanyRow,
  buildOpportunityRow,
  scoreLead,
  statusForStage,
  type CompanyRow,
  type ContactRow,
  type LeadRow,
  type OpportunityRow,
  type StageHistoryRow,
} from "@/lib/domain/crm";
import {
  addOpportunity,
  convertLead,
  moveOpportunityStage,
  addLead,
  getStageHistory,
  listOpportunities,
  type CrmStore,
} from "@/lib/crm";

const now = new Date("2026-07-09T12:00:00Z");

describe("crm domain", () => {
  it("scores a lead from its signal levels (0-100)", () => {
    expect(scoreLead({ intentLevel: "high", budgetLevel: "high", urgencyLevel: "high", fitLevel: "high", problemStated: "x" })).toBe(100);
    expect(scoreLead({})).toBe(0);
    expect(scoreLead({ intentLevel: "medium", problemStated: "x" })).toBeGreaterThan(0);
  });

  it("resolves opportunity status from the pipeline stage", () => {
    expect(statusForStage("won")).toBe("won");
    expect(statusForStage("lost")).toBe("lost");
    expect(statusForStage("proposal_sent")).toBe("open");
  });

  it("builds a company row with defaults", () => {
    const row = buildCompanyRow({ name: "Acme" }, { now, id: "co_1" });
    expect(row).toMatchObject({ id: "co_1", name: "Acme", status: "prospect", archivedAt: null });
  });

  it("builds an opportunity row on the default pipeline stage", () => {
    const row = buildOpportunityRow({ name: "Acme AI OS", companyId: "co_1", valueCents: 500000 }, { now, id: "opp_1" });
    expect(row).toMatchObject({ id: "opp_1", companyId: "co_1", stage: "new_lead", valueCents: 500000, status: "open" });
  });
});

function makeStore() {
  const companies = new Map<string, CompanyRow>();
  const contacts = new Map<string, ContactRow>();
  const leads = new Map<string, LeadRow>();
  const opps = new Map<string, OpportunityRow>();
  const history: StageHistoryRow[] = [];
  const store: CrmStore = {
    insertCompany: async (r) => void companies.set(r.id, r),
    listCompanies: async (q) => [...companies.values()].filter((c) => (!q.status || c.status === q.status) && (q.includeArchived || !c.archivedAt)).slice(0, q.limit),
    getCompany: async (id) => companies.get(id) ?? null,
    updateCompany: async (id, f) => { const c = companies.get(id); if (c) companies.set(id, { ...c, ...f }); },
    insertContact: async (r) => void contacts.set(r.id, r),
    listContacts: async (q) => [...contacts.values()].filter((c) => !q.companyId || c.companyId === q.companyId).slice(0, q.limit),
    insertLead: async (r) => void leads.set(r.id, r),
    listLeads: async (q) => [...leads.values()].filter((l) => !q.status || l.status === q.status).slice(0, q.limit),
    getLead: async (id) => leads.get(id) ?? null,
    updateLead: async (id, f) => { const l = leads.get(id); if (l) leads.set(id, { ...l, ...f }); },
    markLeadConverted: async (leadId, opportunityId, now) => {
      const l = leads.get(leadId);
      if (!l || l.status === "converted") return false; // already claimed by a concurrent converter
      leads.set(leadId, { ...l, status: "converted", convertedOpportunityId: opportunityId, updatedAt: now });
      return true;
    },
    insertOpportunity: async (r) => void opps.set(r.id, r),
    listOpportunities: async (q) => [...opps.values()].filter((o) => (!q.stage || o.stage === q.stage) && (!q.status || o.status === q.status) && (q.includeArchived || !o.archivedAt)).slice(0, q.limit),
    getOpportunity: async (id) => opps.get(id) ?? null,
    updateOpportunity: async (id, f) => { const o = opps.get(id); if (o) opps.set(id, { ...o, ...f }); },
    insertStageHistory: async (r) => void history.push(r),
    listStageHistory: async (oid) => history.filter((h) => h.opportunityId === oid),
    // Model real transaction semantics: snapshot the maps, run the chain, and on any throw restore
    // the snapshot so nothing partial survives (mirrors Postgres ROLLBACK).
    transaction: async (fn) => {
      const snap = { companies: new Map(companies), contacts: new Map(contacts), leads: new Map(leads), opps: new Map(opps), history: [...history] };
      try {
        return await fn(store);
      } catch (e) {
        const restore = <K, V>(live: Map<K, V>, saved: Map<K, V>) => { live.clear(); saved.forEach((v, k) => live.set(k, v)); };
        restore(companies, snap.companies);
        restore(contacts, snap.contacts);
        restore(leads, snap.leads);
        restore(opps, snap.opps);
        history.length = 0;
        history.push(...snap.history);
        throw e;
      }
    },
  };
  return { store, companies, contacts, leads, opps, history };
}

describe("crm service", () => {
  it("creating an opportunity logs an initial stage history entry", async () => {
    const { store } = makeStore();
    const opp = await addOpportunity({ name: "Deal", companyId: "co_1", stage: "qualified" }, { store, now, recordAudit: async () => {} });
    const hist = await getStageHistory(opp.id, { store });
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ oldStage: null, newStage: "qualified" });
  });

  it("moving a deal to won records history, audits, resolves status, and fires the delivery hook", async () => {
    const { store } = makeStore();
    const wonHookCalls: string[] = [];
    const opp = await addOpportunity({ name: "Deal", companyId: "co_1", stage: "proposal_sent" }, { store, now, recordAudit: async () => {} });
    const moved = await moveOpportunityStage(opp.id, "won", { actor: "Moiz", reason: "signed" }, { store, now, recordAudit: async () => {}, onOpportunityWon: async (o) => { wonHookCalls.push(o.id); } });
    expect(moved?.stage).toBe("won");
    expect(moved?.status).toBe("won");
    expect(moved?.probability).toBe(100);
    const hist = await getStageHistory(opp.id, { store });
    expect(hist.some((h) => h.oldStage === "proposal_sent" && h.newStage === "won")).toBe(true);
    // Won → delivery hook fires from the domain (every caller), exactly once for the won transition.
    expect(wonHookCalls).toEqual([opp.id]);
  });

  it("the delivery hook does NOT fire for a non-won stage move", async () => {
    const { store } = makeStore();
    let fired = false;
    const opp = await addOpportunity({ name: "Deal", companyId: "co_1", stage: "qualified" }, { store, now, recordAudit: async () => {} });
    await moveOpportunityStage(opp.id, "proposal_sent", { actor: "Moiz" }, { store, now, recordAudit: async () => {}, onOpportunityWon: async () => { fired = true; } });
    expect(fired).toBe(false);
  });

  it("converting a lead builds the whole connected chain", async () => {
    const { store, opps } = makeStore();
    const lead = await addLead({ name: "Inbound", source: "referral", intentLevel: "high", serviceInterest: ["ai-receptionist"], problemStated: "missing calls" }, { store, now, recordAudit: async () => {} });
    const result = await convertLead(lead.id, { companyName: "Acme Dental", contactName: "Dr. Smith", valueCents: 600000, actor: "Moiz" }, { store, now, recordAudit: async () => {} });
    expect(result).not.toBeNull();
    expect(result!.company.name).toBe("Acme Dental");
    expect(result!.contact!.fullName).toBe("Dr. Smith");
    expect(result!.opportunity.companyId).toBe(result!.company.id);
    expect(result!.opportunity.serviceInterest).toContain("ai-receptionist");
    // lead marked converted, linked to the opportunity
    const updatedLead = (await store.getLead(lead.id))!;
    expect(updatedLead.status).toBe("converted");
    expect(updatedLead.convertedOpportunityId).toBe(result!.opportunity.id);
    // converting again is a no-op
    expect(await convertLead(lead.id, { companyName: "Dup" }, { store, now, recordAudit: async () => {} })).toBeNull();
    expect((await listOpportunities({}, { store }))).toHaveLength(1);
    expect(opps.size).toBe(1);
  });

  it("convertLead is atomic: a mid-chain failure rolls back with no orphaned company or half-converted lead", async () => {
    const { store, companies, contacts, opps } = makeStore();
    const lead = await addLead({ name: "Inbound", source: "referral", intentLevel: "high", serviceInterest: ["ai-receptionist"], problemStated: "missing calls" }, { store, now, recordAudit: async () => {} });

    // The opportunity insert blows up partway through the conversion chain.
    store.insertOpportunity = async () => { throw new Error("db down"); };

    await expect(
      convertLead(lead.id, { companyName: "Acme Dental", contactName: "Dr. Smith", valueCents: 600000, actor: "Moiz" }, { store, now, recordAudit: async () => {} }),
    ).rejects.toThrow("db down");

    // Nothing partial survived: no company, no contact, no opportunity, lead still open.
    expect(companies.size).toBe(0);
    expect(contacts.size).toBe(0);
    expect(opps.size).toBe(0);
    const stillOpen = (await store.getLead(lead.id))!;
    expect(stillOpen.status).not.toBe("converted");
    expect(stillOpen.convertedOpportunityId ?? null).toBeNull();
  });

  it("convertLead loses a conversion race safely: rolls back and returns null (no duplicate deal)", async () => {
    const { store, companies, opps } = makeStore();
    const lead = await addLead({ name: "Inbound", source: "referral", intentLevel: "high", serviceInterest: ["ai-receptionist"] }, { store, now, recordAudit: async () => {} });
    // Simulate a concurrent converter that claimed the lead between our pre-tx read and our claim.
    store.markLeadConverted = async () => false;

    const result = await convertLead(lead.id, { companyName: "Acme", contactName: "Dr. Smith", actor: "Ali" }, { store, now, recordAudit: async () => {} });

    expect(result).toBeNull(); // we lost the race
    expect(companies.size).toBe(0); // and rolled back — no orphaned company/opportunity
    expect(opps.size).toBe(0);
  });
});
