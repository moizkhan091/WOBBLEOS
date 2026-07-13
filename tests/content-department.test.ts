import { describe, expect, it } from "vitest";
import { buildDepartmentRow } from "@/lib/domain/department";
import { buildDepartmentMemberRow, type DepartmentMemberRow } from "@/lib/domain/department-membership";
import { CONTENT_GRAPH_AGENTS } from "@/lib/domain/content-graph";
import type { ContentTrackRow } from "@/lib/domain/content-command";
import type { HandoffStore } from "@/lib/handoff";
import type { HandoffRow } from "@/lib/domain/handoff-delivery";
import type { ContentGraphDeps, ContentPacketCreationResult } from "@/lib/content-graph";
import { runContentDepartment } from "@/lib/departments/verticals/content";

const now = new Date("2026-07-12T12:00:00.000Z");

const STRATEGY = JSON.stringify({ topic: "cold email", angle: "specificity beats volume", platform: "instagram", format: "carousel", targetAudience: "founders", objective: "book calls", rationale: "fresh angle" });
const EVIDENCE = JSON.stringify({ supportingPoints: [{ point: "specific observation earns attention", noteIndexes: [0], chunkIndexes: [0] }], evidenceSummary: "grounded", claimRiskLevel: "low", proofRequired: false });
const DRAFT = JSON.stringify({ hook: "H1", mainCopy: "M1", caption: "C1", cta: "CTA1", carouselSlides: [{ heading: "h", body: "b" }], designDirection: "D1" });
const REVISE = JSON.stringify({ issues: ["weak hook"], revised: { hook: "H2", mainCopy: "M2", caption: "C2", cta: "CTA2", carouselSlides: [], designDirection: "D2" } });
const SCORE = JSON.stringify({ selfReview: { usefulness: 8, originality: 8, brandFit: 8, clarity: 8, aggressionControl: 8, proofStrength: 8, postWorthiness: "pass" }, predictedImpact: 82, brandFit: 88, platformFit: 75, rationale: "strong" });

const track = { id: "ct1", label: "WOBBLE IG", slug: "wobble-ig", voiceProfile: { personaName: "WOBBLE" }, metadata: {}, bannedPhrases: ["synergy"] } as unknown as ContentTrackRow;

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

function memCheckpointStore() {
  const rows = new Map<string, import("@/lib/domain/graph-checkpoint").GraphCheckpointRow>();
  return {
    listCheckpoints: async (rid: string) => [...rows.values()].filter((r) => r.graphRunId === rid),
    upsertCheckpoint: async (row: import("@/lib/domain/graph-checkpoint").GraphCheckpointRow) => { rows.set(`${row.graphRunId}::${row.nodeSlug}`, row); },
    deleteCheckpoints: async (rid: string) => { let n = 0; for (const [k, r] of rows) if (r.graphRunId === rid) { rows.delete(k); n += 1; } return n; },
    deleteNodeCheckpoints: async (rid: string, slugs: string[]) => { let n = 0; for (const [k, r] of rows) if (r.graphRunId === rid && slugs.includes(r.nodeSlug)) { rows.delete(k); n += 1; } return n; },
    deleteExpiredCheckpoints: async () => 0,
  };
}

/** Canned content-graph deps (no LLM spend). `qualityPass` toggles the QA gate outcome. */
function makeGraphDeps(nodeResponses: string[], qualityPass = true): ContentGraphDeps {
  let call = 0;
  return {
    getTrack: async () => track,
    retrieveBrain: async () => [{ title: "Brand", content: "premium, specific, no fluff" }],
    retrieve: async () => ({ notes: [{ id: "know_1", title: "Hook", content: "Open with a verifiable observation.", noteType: "hook_pattern", sourceIds: ["s1"], sourceId: "s1" }], chunks: [{ id: "c1", sourceId: "s1", content: "raw text" }] }),
    runNode: async () => ({ text: nodeResponses[call++], runId: `mr_${call}` }),
    recordAgentRun: async () => ({}),
    recordAudit: async () => {},
    checkpointStore: memCheckpointStore(),
    createPacket: async (input): Promise<ContentPacketCreationResult> => {
      const requested = (input as { requestApproval?: boolean }).requestApproval === true;
      const passed = requested && qualityPass;
      return { packet: { id: "pk_1", qualityStatus: passed ? "passed" : "failed" }, approval: passed ? { id: "ap_1" } : null };
    },
  };
}

const contentDept = buildDepartmentRow(
  {
    slug: "content", name: "Content", purpose: "p", status: "active", orchestratorAgentSlug: "content_orchestrator",
    io: { acceptedHandoffSchemas: ["creative_brief"], inboundCapabilities: ["generate_content_pack"], outboundProducts: ["content_pack"], downstreamConsumers: ["publishing"] },
    permissions: { authorizedMemoryScopes: ["content", "brand", "research", "founder_taste"], permittedDataClassifications: ["internal", "client_confidential"], allowedTools: ["run_node"], deniedTools: [] },
  },
  { now },
);
const publishingDept = buildDepartmentRow(
  { slug: "publishing", name: "Publishing", purpose: "p", status: "draft", io: { acceptedHandoffSchemas: ["content_pack", "media_assets"], inboundCapabilities: ["publish"], outboundProducts: ["published_content"], downstreamConsumers: [] }, permissions: { authorizedMemoryScopes: ["content"], permittedDataClassifications: ["internal", "public", "client_confidential"], allowedTools: [], deniedTools: [] } },
  { now },
);
const members: DepartmentMemberRow[] = Object.values(CONTENT_GRAPH_AGENTS).map((slug, i) =>
  buildDepartmentMemberRow({ departmentSlug: "content", memberType: "agent", memberRef: slug, role: "specialist", responsibility: "work", priority: (i + 1) * 10, capabilities: [["strategy", "research", "copywriting", "scoring"][i]], toolGrants: ["run_node"], memoryGrants: ["content"] }, { now }),
);

const registry = {
  loadDepartment: async (slug: string) => (slug === "content" ? contentDept : slug === "publishing" ? publishingDept : null),
  loadMembers: async (slug: string) => (slug === "content" ? members : []),
};

describe("Content department vertical", () => {
  it("accepts → runs the graph via claimed handoffs → assembles a QA-gated pack → ROUTES to Publishing", async () => {
    const { store, rows } = makeHandoffStore();
    const audits: string[] = [];
    const res = await runContentDepartment(
      { contentTrackId: "ct1", requestedBy: "Moiz", objective: "book more calls", companyId: "clientA", graphRunId: "wf_content_1" },
      { ...registry, handoffStore: store, graph: makeGraphDeps([STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE]), recordAudit: async (e) => void audits.push(e.eventType), now },
    );

    expect(res.accepted).toBe(true);
    expect(res.product?.packetId).toBe("pk_1");
    expect(res.product?.qualityStatus).toBe("passed");
    expect(res.product?.approvalId).toBe("ap_1");
    expect(res.routedTo.map((r) => r.department)).toEqual(["publishing"]);

    // The 4 distinct creative agents each ran through a CLAIMED handoff and completed (dept=content).
    const contentHandoffs = [...rows.values()].filter((r) => r.department === "content");
    expect(contentHandoffs).toHaveLength(4);
    expect(contentHandoffs.every((h) => h.deliveryState === "completed")).toBe(true);

    // The QA-gated pack was routed downstream to Publishing as a real, durable handoff.
    const routed = [...rows.values()].filter((r) => r.department === "publishing");
    expect(routed).toHaveLength(1);
    expect(routed[0].deliveryState).toBe("delivered");
    expect(routed[0].envelope.expectedOutputSchema).toBe("content_pack");
    expect(audits).toEqual(expect.arrayContaining(["department.accepted", "department.routed", "department.completed"]));
  });

  it("escalates (not silently) when the department has no registered strategist", async () => {
    const { store } = makeHandoffStore();
    const audits: string[] = [];
    await runContentDepartment(
      { contentTrackId: "ct1", requestedBy: "Moiz", objective: "x", graphRunId: "wf_content_2" },
      { loadDepartment: registry.loadDepartment, loadMembers: async () => [], handoffStore: store, graph: makeGraphDeps([STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE]), recordAudit: async (e) => void audits.push(e.eventType), now },
    );
    expect(audits).toContain("department.escalated");
  });

  it("escalates on a failed quality gate (does not silently ship a weak pack to Publishing)", async () => {
    const { store } = makeHandoffStore();
    const audits: Array<{ type: string; meta: Record<string, unknown> }> = [];
    const res = await runContentDepartment(
      { contentTrackId: "ct1", requestedBy: "Moiz", objective: "x", graphRunId: "wf_content_3" },
      { ...registry, handoffStore: store, graph: makeGraphDeps([STRATEGY, EVIDENCE, DRAFT, REVISE, SCORE], /* qualityPass */ false), recordAudit: async (e) => void audits.push({ type: e.eventType, meta: (e.metadata ?? {}) as Record<string, unknown> }), now },
    );
    expect(res.product?.qualityStatus).toBe("failed");
    expect(audits.some((a) => a.type === "department.escalated" && String(a.meta.raw ?? "").includes("quality gate"))).toBe(true);
  });

  it("propagates a required-node failure (department run throws, not a silent pass)", async () => {
    const { store } = makeHandoffStore();
    await expect(
      runContentDepartment(
        { contentTrackId: "ct1", requestedBy: "Moiz", objective: "x", graphRunId: "wf_content_4" },
        { ...registry, handoffStore: store, graph: makeGraphDeps(["garbage brief", EVIDENCE, DRAFT, REVISE, SCORE]), recordAudit: async () => {}, now },
      ),
    ).rejects.toThrow(/unparseable brief/);
  });
});
