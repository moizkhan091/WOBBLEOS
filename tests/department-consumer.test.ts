import { describe, expect, it } from "vitest";
import { buildDepartmentRow } from "@/lib/domain/department";
import { buildDepartmentMemberRow, type DepartmentMemberRow } from "@/lib/domain/department-membership";
import type { HandoffStore } from "@/lib/handoff";
import type { HandoffRow } from "@/lib/domain/handoff-delivery";
import type { ProposalRow } from "@/lib/domain/proposal";
import type { ProposalStore } from "@/lib/proposals";
import type { SolutionSynthesis } from "@/lib/departments/verticals/proposal";
import { dispatchBusinessAuditToProposal } from "@/lib/departments/verticals/paid-audit";
import { runDepartmentConsumerTick } from "@/lib/departments/consumer";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import { dispatchHandoff } from "@/lib/handoff";
import type { ContentPacketRow } from "@/lib/domain/content-command";

const now = new Date("2026-07-12T12:00:00.000Z");

const CANNED_SYNTHESIS: SolutionSynthesis = {
  technicalSolution: "Missed-call-text-back + AI intake concierge.",
  integrationDesign: "Twilio ↔ CRM webhook.",
  roiAssumptions: "Recover 18% of missed calls.",
  risks: ["Telephony rate limits"],
};

const AUDIT_REPORT: Record<string, unknown> = {
  executiveSummary: "Acme leaks acquisition at the phone.",
  opportunities: [{ title: "Missed-call text-back", description: "Auto-text every missed call" }],
  roadmap: [{ title: "Phase 1", months: "0-3", focus: "Recover missed calls" }],
  roi: { estimatedImplementationCents: 480000 },
};

/** In-memory handoff store that ACTUALLY implements department claiming + the delivery state machine. */
function makeClaimableHandoffStore() {
  const rows = new Map<string, HandoffRow>();
  const key = (r: { workflowId: string; idempotencyKey: string }) => `${r.workflowId}::${r.idempotencyKey}`;
  const store: HandoffStore = {
    findByIdempotency: async (wf, k) => [...rows.values()].find((r) => r.workflowId === wf && r.idempotencyKey === k) ?? null,
    insert: async (row) => { if ([...rows.values()].some((r) => key(r) === key(row))) throw new Error("duplicate key value violates unique constraint"); rows.set(row.id, row); },
    getById: async (id) => rows.get(id) ?? null,
    claimNext: async () => null,
    // Claim the next `delivered` handoff for the department: delivered → processing (atomic, lease held).
    claimNextForDepartment: async (department, lease, at) => {
      const r = [...rows.values()].find((x) => x.department === department && x.deliveryState === "delivered" && (!x.runAfter || x.runAfter.getTime() <= at.getTime()));
      if (!r) return null;
      const claimed = { ...r, deliveryState: "processing" as const, leaseOwner: lease.owner, leaseExpiresAt: lease.expiresAt, updatedAt: at };
      rows.set(r.id, claimed);
      return claimed;
    },
    transition: async (id, from, fields) => { const r = rows.get(id); if (!r || r.deliveryState !== from) return false; rows.set(id, { ...r, ...fields }); return true; },
    reclaimExpiredLeases: async () => 0,
    list: async () => [...rows.values()],
    countByState: async () => ({}),
    deleteExpired: async () => 0,
  };
  return { store, rows };
}

function makeProposalStore() {
  const rows = new Map<string, ProposalRow>();
  const store: ProposalStore = {
    insertProposal: async (row) => { rows.set(row.id, row); },
    listProposals: async () => [...rows.values()],
    getProposal: async (id) => rows.get(id) ?? null,
    updateProposal: async (id, fields) => { const r = rows.get(id); if (r) rows.set(id, { ...r, ...fields }); },
  };
  return { store, rows };
}

const proposalDept = buildDepartmentRow(
  {
    slug: "proposal", name: "Proposal & Solution Design", purpose: "p", status: "active", orchestratorAgentSlug: "proposal_orchestrator",
    io: { acceptedHandoffSchemas: ["business_audit", "audit_report"], inboundCapabilities: ["design_solution"], outboundProducts: ["proposal_artifact"], downstreamConsumers: [] },
    permissions: { authorizedMemoryScopes: ["company", "offer", "research"], permittedDataClassifications: ["internal", "client_confidential"], allowedTools: ["run_node"], deniedTools: [] },
  },
  { now },
);

const architect: DepartmentMemberRow = buildDepartmentMemberRow(
  { departmentSlug: "proposal", memberType: "agent", memberRef: "proposal_solution_architect", role: "solution_architect", responsibility: "design", priority: 10, capabilities: ["solution_design"], toolGrants: ["run_node"], memoryGrants: ["company", "offer", "research"] },
  { now },
);

const registry = {
  loadDepartments: async () => [proposalDept],
  loadDepartment: async (slug: string) => (slug === "proposal" ? proposalDept : null),
  loadMembers: async (slug: string) => (slug === "proposal" ? [architect] : []),
};

function auditRow(id: string, companyId: string | null) {
  return { id, businessName: "Acme", companyId, opportunityId: "opp_1", report: AUDIT_REPORT };
}

describe("Department consumer loop (autonomous inter-department chain)", () => {
  it("autonomously CLAIMS a routed business_audit handoff and RUNS the Proposal department — no manual claim", async () => {
    const { store, rows } = makeClaimableHandoffStore();
    const { store: proposalStore, rows: proposalRows } = makeProposalStore();

    // Origination: a completed paid audit routes a business_audit handoff to proposal (delivered).
    const routed = await dispatchBusinessAuditToProposal({ auditId: "aud_x", businessName: "Acme", companyId: "clientA" }, { store, recordAudit: async () => {}, now });
    expect(rows.get(routed.handoffId)?.deliveryState).toBe("delivered");

    // The consumer tick claims + runs + completes it with NOBODY hand-claiming the handoff.
    const res = await runDepartmentConsumerTick({
      ...registry,
      handoffStore: store,
      proposal: { synthesize: async () => CANNED_SYNTHESIS, proposalDeps: { store: proposalStore, getAuditRow: async (id) => auditRow(id, "clientA"), recordAudit: async () => {} } },
      recordAudit: async () => {},
      now,
    });

    expect(res.claimed).toBe(1);
    expect(res.completed).toBe(1);
    expect(res.failed).toBe(0);
    // The Proposal department really ran: a proposal was created from the audit carried on the handoff.
    const proposal = [...proposalRows.values()][0];
    expect(proposal).toBeTruthy();
    expect(proposal.auditId).toBe("aud_x");
    // FIX-2: the architect's synthesis is PERSISTED onto the artifact (not discarded).
    expect((proposal.metadata as { solutionDesign?: SolutionSynthesis }).solutionDesign?.technicalSolution).toContain("Missed-call");
    // The handoff is durably completed (exactly-once).
    expect(rows.get(routed.handoffId)?.deliveryState).toBe("completed");
  });

  it("FAILS (retries/dead-letters) a handoff whose department run throws — never silently completes", async () => {
    const { store, rows } = makeClaimableHandoffStore();
    const { store: proposalStore } = makeProposalStore();
    const routed = await dispatchBusinessAuditToProposal({ auditId: "missing", businessName: "Acme", companyId: null }, { store, recordAudit: async () => {}, now });

    const res = await runDepartmentConsumerTick({
      ...registry,
      handoffStore: store,
      // getAuditRow returns null → runProposalDepartment throws "audit 'missing' not found".
      proposal: { synthesize: async () => CANNED_SYNTHESIS, proposalDeps: { store: proposalStore, getAuditRow: async () => null, recordAudit: async () => {} } },
      recordAudit: async () => {},
      now,
    });

    expect(res.claimed).toBe(1);
    expect(res.completed).toBe(0);
    expect(res.failed).toBe(1);
    // The handoff is NOT completed — it was requeued (delivered, retry) or dead-lettered for the founder.
    expect(["delivered", "dead_lettered"]).toContain(rows.get(routed.handoffId)?.deliveryState);
  });

  it("skips departments with no registered consumer (no decorative claiming)", async () => {
    const { store } = makeClaimableHandoffStore();
    const otherDept = buildDepartmentRow({ slug: "security_governance", name: "Sec", purpose: "p", status: "active" }, { now });
    const res = await runDepartmentConsumerTick({
      loadDepartments: async () => [otherDept],
      handoffStore: store,
      recordAudit: async () => {},
      now,
    });
    expect(res.claimed).toBe(0);
    expect(res.completed).toBe(0);
  });

  /**
   * WOB-UAT-023 — the Design Intelligence consumer GROUNDS its brief in the real content packet (reloaded
   * by id), not a stale handoff copy. A carousel pack must yield a CAROUSEL asset carrying the pack's REAL
   * design direction — the exact behavior proven live, pinned here so it cannot silently regress to the old
   * `static` + generic-fallback path.
   */
  it("grounds the brief in the RELOADED packet: a carousel pack → carousel asset + the pack's real design direction", async () => {
    const { store, rows } = makeClaimableHandoffStore();
    const designDept = buildDepartmentRow(
      { slug: "design_intelligence", name: "Design Intelligence", purpose: "p", status: "active", orchestratorAgentSlug: "design_intelligence_orchestrator", io: { acceptedHandoffSchemas: ["content_pack"], inboundCapabilities: ["produce_visual_direction"], outboundProducts: ["design_briefs"], downstreamConsumers: ["media_production"] }, permissions: { authorizedMemoryScopes: ["design", "brand", "content", "visual_reference"], permittedDataClassifications: ["internal", "client_confidential"], allowedTools: [], deniedTools: [] } },
      { now },
    );
    const mediaDept = buildDepartmentRow(
      { slug: "media_production", name: "Media Production", purpose: "p", status: "active", operatingModel: "service_department", io: { acceptedHandoffSchemas: ["design_briefs"], inboundCapabilities: ["produce_media"], outboundProducts: ["media_assets"], downstreamConsumers: [] }, permissions: { authorizedMemoryScopes: ["design"], permittedDataClassifications: ["internal", "client_confidential"], allowedTools: [], deniedTools: [] } },
      { now },
    );
    const designMembers: DepartmentMemberRow[] = [
      buildDepartmentMemberRow({ departmentSlug: "design_intelligence", memberType: "agent", memberRef: "visual_reference_analyst", role: "specialist", responsibility: "describe", priority: 10, capabilities: ["visual_analysis"], toolGrants: ["vision_model"], memoryGrants: ["design"] }, { now }),
      buildDepartmentMemberRow({ departmentSlug: "design_intelligence", memberType: "agent", memberRef: "brand_voice_guardian", role: "evaluator", responsibility: "critique", priority: 20, capabilities: ["brand_critique"], toolGrants: [], memoryGrants: ["brand"] }, { now }),
    ];

    // The real pack the consumer must reload — carousel, with a distinctive design direction.
    const packet = { id: "pk_carousel", format: "carousel", platform: "instagram", designDirection: "WOBBLE dark, heavy type, one idea per slide", carouselSlides: [{}, {}, {}] } as unknown as ContentPacketRow;

    // Content routes a content_pack handoff to design_intelligence, carrying ONLY the packetId (the reload
    // pattern). No designDirection/assets on the envelope — so a wrong brief would prove the reload failed.
    const inbound = buildHandoffEnvelope(
      { workflowId: "wf_design_1", department: "design_intelligence", sourceAgent: "content_orchestrator", destinationAgent: "design_intelligence_orchestrator", destinationCapability: "produce_visual_direction", objective: "Turn the content pack into a design brief", requestedAction: "consume content_pack", expectedOutputSchema: "content_pack", dataClassification: "client_confidential", authorizedMemoryScopes: ["design", "brand", "content"], companyId: "clientA", clientWorkspaceId: "clientA", previousAgentOutputs: { packetId: "pk_carousel" }, idempotencyKey: "wf_design_1:route:content->design_intelligence" },
      { now },
    );
    await dispatchHandoff(inbound, { clientWorkspaceId: "clientA", grantedMemoryScopes: ["design", "brand", "content", "visual_reference"], permittedDataClassifications: ["internal", "client_confidential"] }, { store, recordAudit: async () => {}, now });

    const res = await runDepartmentConsumerTick({
      loadDepartments: async () => [designDept],
      loadDepartment: async (slug: string) => (slug === "design_intelligence" ? designDept : slug === "media_production" ? mediaDept : null),
      loadMembers: async (slug: string) => (slug === "design_intelligence" ? designMembers : []),
      handoffStore: store,
      loadPacket: async (id) => (id === "pk_carousel" ? packet : null),
      // Advisory model deps stubbed → no provider call; the brief is still deterministic + grounded.
      design: { describeReferences: async () => [], critiqueBrand: async () => ({ passed: true, notes: [] }) },
      recordAudit: async () => {},
      now,
    });

    expect(res.claimed).toBe(1);
    expect(res.completed).toBe(1);
    expect(res.failed).toBe(0);

    // The design_briefs handoff routed to media_production carries a GROUNDED media request.
    const toMedia = [...rows.values()].find((r) => r.department === "media_production");
    expect(toMedia).toBeTruthy();
    const requests = (toMedia!.envelope.previousAgentOutputs as { mediaRequests?: { kind: string; prompt: string; params: Record<string, unknown> }[] }).mediaRequests ?? [];
    expect(requests).toHaveLength(1);
    expect(requests[0].params.assetType).toBe("carousel"); // derived from the pack's format — NOT the old static default
    expect(requests[0].prompt).toContain("WOBBLE dark, heavy type"); // the pack's REAL design direction, not the generic fallback
  });

  /**
   * WOB-UAT-025 — the Publishing consumer closes the content→publishing dead-end (the handoff used to sit
   * `delivered` forever). It PROMOTES an approved pack into the publishable library, and TRUTHFULLY HOLDS an
   * unapproved one — the founder-approval gate must never be bypassed into a fake "published".
   */
  describe("Publishing consumer (approval-gated promotion, no fake publish)", () => {
    const publishingDept = buildDepartmentRow(
      { slug: "publishing", name: "Publishing", purpose: "p", status: "active", operatingModel: "service_department", io: { acceptedHandoffSchemas: ["content_pack", "media_assets"], inboundCapabilities: ["publish"], outboundProducts: ["published_content"], downstreamConsumers: ["founder_command_centre"] }, permissions: { authorizedMemoryScopes: ["content"], permittedDataClassifications: ["internal", "public", "client_confidential"], allowedTools: [], deniedTools: [] } },
      { now },
    );
    function makeLibraryStore() {
      const assets = new Map<string, { id: string; contentPacketId?: string }>();
      return {
        assets,
        store: {
          findAssetByPacketId: async (pid: string) => [...assets.values()].find((a) => a.contentPacketId === pid) ?? null,
          insertAsset: async (row: { id: string; contentPacketId?: string }) => void assets.set(row.id, row),
          getAssetById: async (id: string) => assets.get(id) ?? null,
        } as never,
      };
    }
    async function routePackToPublishing(store: HandoffStore, packetId: string, wf: string) {
      const env = buildHandoffEnvelope(
        { workflowId: wf, department: "publishing", sourceAgent: "content_orchestrator", destinationAgent: "publishing_orchestrator", destinationCapability: "publish", objective: "Publish the pack", requestedAction: "consume content_pack", expectedOutputSchema: "content_pack", dataClassification: "internal", authorizedMemoryScopes: ["content"], previousAgentOutputs: { packetId }, idempotencyKey: `${wf}:route:content->publishing` },
        { now },
      );
      await dispatchHandoff(env, { clientWorkspaceId: null, grantedMemoryScopes: ["content"], permittedDataClassifications: ["internal", "public"] }, { store, recordAudit: async () => {}, now });
    }

    it("promotes an APPROVED pack into the library (publishable asset created + audited)", async () => {
      const { store, rows } = makeClaimableHandoffStore();
      const lib = makeLibraryStore();
      const audits: string[] = [];
      await routePackToPublishing(store, "pk_approved", "wf_pub_ok");
      const res = await runDepartmentConsumerTick({
        loadDepartments: async () => [publishingDept],
        loadDepartment: async (slug: string) => (slug === "publishing" ? publishingDept : null),
        loadMembers: async () => [],
        handoffStore: store,
        library: { store: lib.store, recordAudit: async () => {}, getPacketForImport: async () => ({ id: "pk_approved", platform: "instagram", format: "static", hook: "h", caption: "c", carouselSlides: null, createdBy: "Moiz", approvalStatus: "approved", ownerScope: "content_track", ownerId: "ct_1" }) as never },
        recordAudit: async (e) => void audits.push(e.eventType),
        now,
      });
      expect(res.claimed).toBe(1);
      expect(res.completed).toBe(1);
      expect(lib.assets.size).toBe(1); // a real publishable asset now exists
      expect(audits).toContain("publishing.pack_imported");
      expect([...rows.values()].find((r) => r.department === "publishing")?.deliveryState).toBe("completed");
    });

    it("HOLDS an UNAPPROVED pack — no asset, a founder-visible held audit, never a fake publish", async () => {
      const { store } = makeClaimableHandoffStore();
      const lib = makeLibraryStore();
      const audits: string[] = [];
      await routePackToPublishing(store, "pk_draft", "wf_pub_hold");
      const res = await runDepartmentConsumerTick({
        loadDepartments: async () => [publishingDept],
        loadDepartment: async (slug: string) => (slug === "publishing" ? publishingDept : null),
        loadMembers: async () => [],
        handoffStore: store,
        library: { store: lib.store, recordAudit: async () => {}, getPacketForImport: async () => ({ id: "pk_draft", platform: "instagram", format: "static", hook: "h", caption: "c", carouselSlides: null, createdBy: "Moiz", approvalStatus: "draft", ownerScope: "content_track", ownerId: "ct_1" }) as never },
        recordAudit: async (e) => void audits.push(e.eventType),
        now,
      });
      expect(res.claimed).toBe(1);
      expect(res.completed).toBe(1); // the handoff is consumed (held is a valid terminal outcome), not failed
      expect(lib.assets.size).toBe(0); // NOT imported — the approval gate held it
      expect(audits).toContain("publishing.held_for_approval"); // truthful, founder-visible
    });
  });
});
