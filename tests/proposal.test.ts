import { describe, expect, it } from "vitest";
import { buildProposalRow, canTransitionProposal, proposalInputFromAudit, type ProposalRow } from "@/lib/domain/proposal";
import { createProposalFromAudit, proposalAction, type ProposalStore } from "@/lib/proposals";

const now = new Date("2026-07-09T12:00:00Z");

describe("proposal domain", () => {
  it("sums service prices into the total when no explicit price", () => {
    const row = buildProposalRow({ title: "P", services: [{ name: "A", priceCents: 300000 }, { name: "B", priceCents: 200000 }] }, { now, id: "prop_1" });
    expect(row.pricingCents).toBe(500000);
    expect(row.status).toBe("draft");
  });

  it("assembles a proposal input from a paid-audit report", () => {
    const input = proposalInputFromAudit({
      id: "audit_1",
      businessName: "Acme Dental",
      companyId: "co_1",
      opportunityId: "opp_1",
      report: {
        executiveSummary: "Acme leaks leads at the front desk.",
        opportunities: [{ title: "Missed-call text-back", description: "auto text", service: "missed-call-text-back-system" }, { title: "AI receptionist", description: "24/7" }],
        roadmap: [{ title: "Phase 1", months: "Month 1-3", focus: "quick wins" }],
        roi: { estimatedImplementationCents: 900000 },
      },
    });
    expect(input.title).toContain("Acme Dental");
    expect(input.services).toHaveLength(2);
    expect(input.services?.[0].name).toBe("Missed-call text-back");
    expect(input.timeline).toHaveLength(1);
    expect(input.pricingCents).toBe(900000);
    expect(input.auditId).toBe("audit_1");
    expect(input.scope).toContain("front desk");
  });

  it("enforces the proposal status machine", () => {
    expect(canTransitionProposal("draft", "approved")).toBe(true);
    expect(canTransitionProposal("approved", "sent")).toBe(true);
    expect(canTransitionProposal("sent", "accepted")).toBe(true);
    expect(canTransitionProposal("accepted", "sent")).toBe(false);
    expect(canTransitionProposal("draft", "accepted")).toBe(false);
  });
});

function makeStore() {
  const rows = new Map<string, ProposalRow>();
  const store: ProposalStore = {
    insertProposal: async (r) => void rows.set(r.id, r),
    listProposals: async (q) => [...rows.values()].filter((p) => !q.status || p.status === q.status).slice(0, q.limit),
    getProposal: async (id) => rows.get(id) ?? null,
    updateProposal: async (id, f) => { const p = rows.get(id); if (p) rows.set(id, { ...p, ...f }); },
  };
  return { store, rows };
}

describe("proposal service", () => {
  it("builds a proposal from an audit (injected audit row)", async () => {
    const { store } = makeStore();
    const prop = await createProposalFromAudit("audit_1", { createdBy: "Moiz" }, {
      store,
      now,
      recordAudit: async () => {},
      getAuditRow: async () => ({ id: "audit_1", businessName: "Acme", companyId: "co_1", opportunityId: "opp_1", report: { opportunities: [{ title: "X" }], roi: { estimatedImplementationCents: 600000 } } }),
    });
    expect(prop?.title).toContain("Acme");
    expect(prop?.pricingCents).toBe(600000);
    expect(prop?.auditId).toBe("audit_1");
  });

  it("accepting a proposal auto-drafts an invoice for the total", async () => {
    const { store } = makeStore();
    const prop = await createProposalFromAudit("audit_1", { createdBy: "Moiz" }, {
      store, now, recordAudit: async () => {},
      getAuditRow: async () => ({ id: "audit_1", businessName: "Acme", companyId: "co_1", opportunityId: "opp_1", report: { opportunities: [{ title: "X" }], roi: { estimatedImplementationCents: 600000 } } }),
    });
    // approve -> send -> accept
    let invoiced: { totalCents: number; proposalId: string } | null = null;
    const deps = { store, now, recordAudit: async () => {}, draftInvoice: async (i: { totalCents: number; proposalId: string }) => { invoiced = { totalCents: i.totalCents, proposalId: i.proposalId }; return { id: "inv_1" }; } };
    await proposalAction(prop!.id, "approve", { actor: "Moiz" }, deps);
    await proposalAction(prop!.id, "send", { actor: "Moiz" }, deps);
    const res = await proposalAction(prop!.id, "accept", { actor: "Moiz" }, deps);
    expect(res?.proposal.status).toBe("accepted");
    expect(res?.invoiceId).toBe("inv_1");
    expect(invoiced!.totalCents).toBe(600000);
    expect(invoiced!.proposalId).toBe(prop!.id);
  });
});
