import { describe, expect, it } from "vitest";
import { buildContentTrackRow, type CreateContentPacketInput } from "@/lib/domain/content-command";
import { runContentGenerationJob, type ContentGenerationDeps } from "@/lib/content-worker";

const now = new Date("2026-06-30T09:00:00.000Z");

const track = buildContentTrackRow(
  { slug: "wobble_company", label: "WOBBLE Company", ownerType: "company", approvalRequired: true },
  { id: "track_wobble_company", now },
);

const brain = [
  { slug: "brand-voice", title: "Brand Voice", area: "brand", content: "Bold, premium, teach-first, and direct." },
];
const memory = [
  { id: "memorychunk_content_strategy", content: "Teach-first content is the center.", trustLevel: "founder_core", tags: ["content"] },
];
const sources = [
  {
    id: "source_aios_course",
    title: "AI OS course transcript",
    sourceType: "transcript",
    trustLevel: "tier_2_approved_expert",
    chunks: [{ id: "sourcechunk_1", content: "AI operating systems need context, data, skills, permissions, and cadence." }],
  },
];

const providerJson = JSON.stringify({
  packets: [
    {
      platform: "linkedin",
      format: "text",
      objective: "teach business owners why an AI OS beats random automation",
      targetAudience: "owner-led growth businesses",
      angle: "Owning the operating system beats renting scattered outputs",
      hook: "Your AI stack is not the advantage. Your operating system is.",
      mainCopy: "Most companies collect tools. The winners wire context, data, skills, routines, permissions, APIs, and cadence into one operating layer.",
      caption: "Build the system that learns with you.",
      cta: "Reply OS and we will show you where your workflow is leaking time.",
      designDirection: "Black liquid-glass WOBBLE card with electric lime evidence callouts.",
      sourceIdsUsed: ["source_aios_course"],
      insightIdsUsed: ["insight_aios_primitives"],
      memoryChunksUsed: ["memorychunk_content_strategy"],
      evidenceSummary: "Uses approved AI OS transcript plus WOBBLE Brain content strategy.",
      claimRiskLevel: "medium",
      proofRequired: true,
      selfReview: { usefulness: 9, originality: 8, brandFit: 9, clarity: 8, aggressionControl: 8, proofStrength: 8, postWorthiness: "pass" },
    },
  ],
});

function makeDeps(
  over: Partial<ContentGenerationDeps>,
  created: Array<CreateContentPacketInput & { requestApproval?: boolean }>,
): ContentGenerationDeps {
  return {
    getContentTrack: async () => track,
    retrieveBrain: async () => brain,
    retrieveMemory: async () => memory,
    retrieveSources: async () => sources,
    runProvider: async () => ({ text: providerJson, run: { id: "modelrun_1" } }),
    createPacket: async (input) => {
      created.push(input);
      return {
        packet: { id: "packet_1", qualityStatus: input.requestApproval ? "passed" : "failed" },
        approval: input.requestApproval ? { id: "approval_1" } : null,
      };
    },
    recordAudit: async () => {},
    now,
    ...over,
  };
}

describe("content worker x Content Excellence Gate", () => {
  it("BLOCKS approval when the gate fails the draft (stored, not enqueued)", async () => {
    const created: Array<CreateContentPacketInput & { requestApproval?: boolean }> = [];
    const result = await runContentGenerationJob(
      { contentTrackId: "track_wobble_company", requestedBy: "Moiz", objective: "weekly" },
      makeDeps({ excellenceGate: () => ({ passed: false }) }, created),
    );
    expect(created.every((i) => i.requestApproval === false)).toBe(true);
    expect(result.approvalsCreated).toBe(0);
    expect(result.createdPackets).toBe(1);
  });

  it("allows approval when the gate passes the draft", async () => {
    const created: Array<CreateContentPacketInput & { requestApproval?: boolean }> = [];
    const result = await runContentGenerationJob(
      { contentTrackId: "track_wobble_company", requestedBy: "Moiz", objective: "weekly" },
      makeDeps({ excellenceGate: () => ({ passed: true }) }, created),
    );
    expect(created.every((i) => i.requestApproval === true)).toBe(true);
    expect(result.approvalsCreated).toBe(1);
  });

  it("preserves prior behavior when no gate dep is provided (backwards compatible)", async () => {
    const created: Array<CreateContentPacketInput & { requestApproval?: boolean }> = [];
    const result = await runContentGenerationJob(
      { contentTrackId: "track_wobble_company", requestedBy: "Moiz", objective: "weekly" },
      makeDeps({}, created),
    );
    expect(created.every((i) => i.requestApproval === true)).toBe(true);
    expect(result.approvalsCreated).toBe(1);
  });
});
