import { describe, expect, it } from "vitest";
import { getCommercialJourney, computeJourneyStage, getArtifactLineage, type CommercialJourneyStore, type CommercialJourney, type LineageStore } from "@/lib/commercial-journey";

const EMPTY: Omit<CommercialJourney, "stage"> = {
  company: { id: "co_1", name: "Nova Dental", industry: "dental", status: "prospect", clientType: null },
  qualification: null, opportunities: [], meetings: [], discoveryFactCount: 0,
  paidTransformationAudits: [], freeAudits: 0, proposals: [], projects: [],
};

function storeFor(partial: Partial<Omit<CommercialJourney, "stage" | "company">> & { company?: CommercialJourney["company"] | null }): CommercialJourneyStore {
  return {
    async getCompany() { return partial.company === undefined ? EMPTY.company : partial.company; },
    async latestQualification() { return partial.qualification ?? null; },
    async opportunities() { return partial.opportunities ?? []; },
    async meetings() { return partial.meetings ?? []; },
    async audits() { return { paid: partial.paidTransformationAudits ?? [], freeCount: partial.freeAudits ?? 0 }; },
    async proposals() { return partial.proposals ?? []; },
    async projects() { return partial.projects ?? []; },
  };
}

describe("Commercial journey — stage computation (furthest reached wins)", () => {
  it("org → qualified → opportunity → discovery → paid_audit → proposal → won → project", () => {
    expect(computeJourneyStage(EMPTY)).toBe("org");
    expect(computeJourneyStage({ ...EMPTY, qualification: { grade: "B", overallScore: 79, recommendation: "x", version: 1 } })).toBe("qualified");
    expect(computeJourneyStage({ ...EMPTY, opportunities: [{ id: "o", name: "n", stage: "new", status: "open", valueCents: 0, serviceInterest: [], nextAction: null, linkedProposalId: null, linkedAuditIds: [], linkedProjectIds: [] }] })).toBe("opportunity");
    expect(computeJourneyStage({ ...EMPTY, discoveryFactCount: 3 })).toBe("discovery");
    expect(computeJourneyStage({ ...EMPTY, paidTransformationAudits: [{ id: "a", status: "complete", businessName: "n" }] })).toBe("paid_audit");
    expect(computeJourneyStage({ ...EMPTY, proposals: [{ id: "p", title: "t", status: "sent", version: 1 }] })).toBe("proposal");
    expect(computeJourneyStage({ ...EMPTY, proposals: [{ id: "p", title: "t", status: "accepted", version: 1 }] })).toBe("won");
    expect(computeJourneyStage({ ...EMPTY, projects: [{ id: "pr", name: "n", status: "active", healthScore: 80 }] })).toBe("project");
  });
});

describe("Commercial journey — assembly", () => {
  it("assembles org + qualification + opps + meetings + artifacts and sums discovery facts", async () => {
    const store = storeFor({
      qualification: { grade: "B", overallScore: 79, recommendation: "Pursue", version: 1 },
      opportunities: [{ id: "o1", name: "AI OS Audit", stage: "audit_booked", status: "open", valueCents: 500000, serviceInterest: ["audit"], nextAction: "book", linkedProposalId: null, linkedAuditIds: ["a1"], linkedProjectIds: [] }],
      meetings: [{ id: "m1", title: "Readiness", meetingType: "ai_readiness_call", status: "completed", discoveryFactCount: 7, approvedDiscoveryFacts: 1 }],
      paidTransformationAudits: [{ id: "a1", status: "complete", businessName: "Nova Dental" }],
    });
    const j = await getCommercialJourney("co_1", { store });
    expect(j.company.name).toBe("Nova Dental");
    expect(j.qualification?.grade).toBe("B");
    expect(j.opportunities[0].linkedAuditIds).toEqual(["a1"]);
    expect(j.discoveryFactCount).toBe(7);
    expect(j.stage).toBe("paid_audit"); // furthest reached
  });

  it("throws when the company does not exist", async () => {
    await expect(getCommercialJourney("nope", { store: storeFor({ company: null }) })).rejects.toThrow(/not found/);
  });
});

describe("Artifact lineage — derivation edges (never invented)", () => {
  const lineageStore: LineageStore = {
    async opportunities() { return [{ id: "opp1", name: "AI OS Audit" }]; },
    async meetings() { return [{ id: "m1", title: "Readiness", opportunityId: "opp1" }, { id: "m2", title: "Orphan", opportunityId: null }]; },
    async audits() { return [{ id: "a1", businessName: "Nova", opportunityId: "opp1" }]; },
    async proposals() { return [{ id: "p1", title: "Proposal", opportunityId: "opp1", auditId: "a1" }]; },
    async projects() { return [{ id: "pr1", name: "Buildout", opportunityId: "opp1", proposalId: "p1" }]; },
  };

  it("builds the provenance graph from real FKs only", async () => {
    const l = await getArtifactLineage("co_1", { store: lineageStore });
    expect(l.nodes).toHaveLength(6); // 1 opp + 2 meetings + 1 audit + 1 proposal + 1 project
    // edges: m1→opp1, a1←opp1, p1←opp1, p1←a1, pr1←opp1, pr1←p1
    const rels = l.edges.map((e) => e.relation).sort();
    expect(rels).toEqual(["audit_proposal", "meeting_opp", "opp_audit", "opp_project", "opp_proposal", "proposal_project"]);
    // the orphan meeting (no opportunityId) produces NO edge — provenance is never invented
    expect(l.edges.some((e) => e.from === "m2" || e.to === "m2")).toBe(false);
    // the full derivation chain is present: audit → proposal → project
    expect(l.edges.some((e) => e.relation === "audit_proposal" && e.from === "a1" && e.to === "p1")).toBe(true);
    expect(l.edges.some((e) => e.relation === "proposal_project" && e.from === "p1" && e.to === "pr1")).toBe(true);
  });

  it("drops edges whose FK points outside this company's node set", async () => {
    const store: LineageStore = { ...lineageStore, async proposals() { return [{ id: "p1", title: "x", opportunityId: "opp_elsewhere", auditId: "a_elsewhere" }]; } };
    const l = await getArtifactLineage("co_1", { store });
    expect(l.edges.some((e) => e.to === "p1")).toBe(false); // both FKs point at foreign ids → no edge
  });
});
