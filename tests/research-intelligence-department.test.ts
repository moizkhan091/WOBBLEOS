import { describe, expect, it } from "vitest";
import { buildDepartmentRow } from "@/lib/domain/department";
import { buildDepartmentMemberRow, type DepartmentMemberRow } from "@/lib/domain/department-membership";
import type { HandoffStore } from "@/lib/handoff";
import type { HandoffRow } from "@/lib/domain/handoff-delivery";
import type { AnalystResult } from "@/lib/intelligence/analyst";
import type { DreamerResult } from "@/lib/intelligence/dreamer";
import type { ScoutResult } from "@/lib/intelligence/scout";
import { runResearchIntelligenceDepartment } from "@/lib/departments/verticals/research-intelligence";

const now = new Date("2026-07-12T12:00:00.000Z");

const ANALYSIS: AnalystResult = { analyzedItems: 5, proposedInsights: 2, insightIds: ["intel_insight_a", "intel_insight_b"], note: "ok" };
const SUGGESTIONS: DreamerResult = { proposed: 3, suggestionIds: ["intel_suggestion_x", "intel_suggestion_y", "intel_suggestion_z"], note: "ok" };

function makeHandoffStore() {
  const rows = new Map<string, HandoffRow>();
  const key = (r: { workflowId: string; idempotencyKey: string }) => `${r.workflowId}::${r.idempotencyKey}`;
  const store: HandoffStore = {
    findByIdempotency: async (wf, k) => [...rows.values()].find((r) => r.workflowId === wf && r.idempotencyKey === k) ?? null,
    insert: async (row) => { if ([...rows.values()].some((r) => key(r) === key(row))) throw new Error("duplicate key value violates unique constraint"); rows.set(row.id, row); },
    getById: async (id) => rows.get(id) ?? null,
    claimNext: async () => null,
    claimNextForDepartment: async () => null,
    transition: async (id, from, fields) => { const r = rows.get(id); if (!r || r.deliveryState !== from) return false; rows.set(id, { ...r, ...fields }); return true; },
    reclaimExpiredLeases: async () => 0,
    list: async () => [...rows.values()],
    countByState: async () => ({}),
    deleteExpired: async () => 0,
  };
  return { store, rows };
}

const researchDept = buildDepartmentRow(
  {
    slug: "research_intelligence", name: "Research & Intelligence", purpose: "p", status: "active", orchestratorAgentSlug: "research_intelligence_orchestrator",
    io: { acceptedHandoffSchemas: [], inboundCapabilities: ["scout", "analyse", "dream"], outboundProducts: ["validated_intelligence"], downstreamConsumers: ["content", "proposal", "founder_command_centre"] },
    permissions: { authorizedMemoryScopes: ["research", "competitor", "market", "company"], permittedDataClassifications: ["internal"], allowedTools: ["run_node"], deniedTools: [] },
    governance: { requiredApprovals: ["intelligence_suggestion"], escalationRules: [{ condition: "stale_intelligence", escalateTo: "founder_command_centre" }] },
  },
  { now },
);
const commandCentre = buildDepartmentRow(
  { slug: "founder_command_centre", name: "Founder Command Centre", purpose: "p", status: "active", io: { acceptedHandoffSchemas: [], inboundCapabilities: ["approve", "escalate", "intervene"], outboundProducts: [], downstreamConsumers: [] }, permissions: { authorizedMemoryScopes: ["company", "research", "competitor", "market"], permittedDataClassifications: ["internal", "client_confidential", "restricted"], allowedTools: [], deniedTools: [] } },
  { now },
);
const members: DepartmentMemberRow[] = [
  buildDepartmentMemberRow({ departmentSlug: "research_intelligence", memberType: "agent", memberRef: "competitor_scout", role: "scout", responsibility: "ingest", priority: 10, capabilities: ["scout"], toolGrants: ["run_node"], memoryGrants: ["research"] }, { now }),
  buildDepartmentMemberRow({ departmentSlug: "research_intelligence", memberType: "agent", memberRef: "intelligence_analyst", role: "analyst", responsibility: "analyse", priority: 20, capabilities: ["analyse"], toolGrants: ["run_node"], memoryGrants: ["research"] }, { now }),
  buildDepartmentMemberRow({ departmentSlug: "research_intelligence", memberType: "agent", memberRef: "dreamer", role: "strategist", responsibility: "dream", priority: 30, capabilities: ["dream"], toolGrants: ["run_node"], memoryGrants: ["research"] }, { now }),
];

const registry = {
  loadDepartment: async (slug: string) => (slug === "research_intelligence" ? researchDept : slug === "founder_command_centre" ? commandCentre : null),
  loadMembers: async (slug: string) => (slug === "research_intelligence" ? members : []),
};

describe("Research & Intelligence department vertical", () => {
  it("accepts → analyses → dreams → ROUTES validated intelligence to the Founder Command Centre", async () => {
    const { store, rows } = makeHandoffStore();
    const audits: string[] = [];
    const res = await runResearchIntelligenceDepartment(
      { scope: "wobble", requestedBy: "Moiz", workflowId: "wf_ri_1" },
      { ...registry, handoffStore: store, analyze: async () => ANALYSIS, dream: async () => SUGGESTIONS, recordAudit: async (e) => void audits.push(e.eventType), now },
    );

    expect(res.accepted).toBe(true);
    expect(res.product?.analysis.proposedInsights).toBe(2);
    expect(res.product?.suggestions.proposed).toBe(3);
    expect(res.routedTo.map((r) => r.department)).toEqual(["founder_command_centre"]);

    const routed = [...rows.values()].filter((r) => r.department === "founder_command_centre");
    expect(routed).toHaveLength(1);
    expect(routed[0].deliveryState).toBe("delivered");
    expect(routed[0].envelope.expectedOutputSchema).toBe("validated_intelligence");
    expect(audits).toEqual(expect.arrayContaining(["department.accepted", "department.routed", "department.completed"]));
  });

  it("runs the scout first when a target is given, and escalates when the scout is unconfigured", async () => {
    const { store } = makeHandoffStore();
    const audits: Array<{ type: string; meta: Record<string, unknown> }> = [];
    const unconfiguredScout: ScoutResult = { configured: false, note: "APIFY_API_KEY missing" };
    let scoutRan = false;
    await runResearchIntelligenceDepartment(
      { scope: "wobble", requestedBy: "Moiz", workflowId: "wf_ri_2", scoutTarget: { handleOrUrl: "@rival" } },
      { ...registry, handoffStore: store, scout: async () => { scoutRan = true; return unconfiguredScout; }, analyze: async () => ANALYSIS, dream: async () => SUGGESTIONS, recordAudit: async (e) => void audits.push({ type: e.eventType, meta: (e.metadata ?? {}) as Record<string, unknown> }), now },
    );
    expect(scoutRan).toBe(true);
    expect(audits.some((a) => a.type === "department.escalated" && String(a.meta.raw ?? "").includes("scout is not configured"))).toBe(true);
  });

  it("escalates (not silently) when the department has no registered analyst", async () => {
    const { store } = makeHandoffStore();
    const audits: string[] = [];
    await runResearchIntelligenceDepartment(
      { scope: "wobble", requestedBy: "Moiz", workflowId: "wf_ri_3" },
      { loadDepartment: registry.loadDepartment, loadMembers: async () => [], handoffStore: store, analyze: async () => ANALYSIS, dream: async () => SUGGESTIONS, recordAudit: async (e) => void audits.push(e.eventType), now },
    );
    expect(audits).toContain("department.escalated");
  });

  it("escalates on stale intelligence (no new insights AND no new suggestions)", async () => {
    const { store } = makeHandoffStore();
    const audits: Array<{ type: string; meta: Record<string, unknown> }> = [];
    const res = await runResearchIntelligenceDepartment(
      { scope: "wobble", requestedBy: "Moiz", workflowId: "wf_ri_4" },
      { ...registry, handoffStore: store, analyze: async () => ({ analyzedItems: 0, proposedInsights: 0, insightIds: [] }), dream: async () => ({ proposed: 0, suggestionIds: [] }), recordAudit: async (e) => void audits.push({ type: e.eventType, meta: (e.metadata ?? {}) as Record<string, unknown> }), now },
    );
    expect(res.accepted).toBe(true);
    expect(audits.some((a) => a.type === "department.escalated" && String(a.meta.raw ?? "").includes("stale intelligence"))).toBe(true);
  });
});
