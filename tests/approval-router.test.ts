import { describe, expect, it, vi } from "vitest";
import { resolveApproval } from "@/lib/approval-router";
import type { ApprovalRow } from "@/lib/approvals";

function makeApproval(over: Partial<ApprovalRow>): ApprovalRow {
  return { approvalType: "source", entityId: "source_1", metadata: {}, ...over } as unknown as ApprovalRow;
}

describe("approval router - completes the real entity action, not just the row", () => {
  it("routes source approve to approveSource with trust from approval metadata", async () => {
    const approveSource = vi.fn(async () => ({}));
    const res = await resolveApproval(
      { approvalId: "appr_1", action: "approve", approvedBy: "Moiz" },
      { loadApproval: async () => makeApproval({ approvalType: "source", entityId: "src_1", metadata: { requestedTrustLevel: "tier_2_approved_expert" } }), approveSource },
    );
    expect(approveSource).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "src_1", approvedBy: "Moiz", trustLevel: "tier_2_approved_expert" }));
    expect(res).toEqual({ approvalType: "source", entityId: "src_1", action: "approve" });
  });

  it("falls back to a default trust tier when metadata has none", async () => {
    const approveSource = vi.fn(async () => ({}));
    await resolveApproval(
      { approvalId: "a", action: "approve", approvedBy: "Ali" },
      { loadApproval: async () => makeApproval({ approvalType: "source", entityId: "s2", metadata: {} }), approveSource },
    );
    expect(approveSource).toHaveBeenCalledWith(expect.objectContaining({ trustLevel: "tier_3_monitored" }));
  });

  it("routes skill_update approve to approveSkillVersion", async () => {
    const approveSkillVersion = vi.fn(async () => ({}));
    await resolveApproval(
      { approvalId: "a", action: "approve", approvedBy: "Ali" },
      { loadApproval: async () => makeApproval({ approvalType: "skill_update", entityId: "skill_2" }), approveSkillVersion },
    );
    expect(approveSkillVersion).toHaveBeenCalledWith(expect.objectContaining({ skillId: "skill_2", approvedBy: "Ali" }));
  });

  it("routes content_packet reject to rejectContentPacket", async () => {
    const rejectContentPacket = vi.fn(async () => ({}));
    const recordFeedbackEvent = vi.fn(async () => ({}));
    await resolveApproval(
      { approvalId: "a", action: "reject", approvedBy: "Ibrahim", notes: "weak" },
      { loadApproval: async () => makeApproval({ approvalType: "content_packet", entityId: "pkt_3" }), rejectContentPacket, recordFeedbackEvent },
    );
    expect(rejectContentPacket).toHaveBeenCalledWith(expect.objectContaining({ packetId: "pkt_3", approvedBy: "Ibrahim", notes: "weak" }));
    expect(recordFeedbackEvent).toHaveBeenCalledWith(expect.objectContaining({
      targetType: "content_packet",
      targetId: "pkt_3",
      decision: "reject",
      actor: "Ibrahim",
      reason: "weak",
    }));
  });

  it("requires a rejection reason before routing approval feedback", async () => {
    await expect(
      resolveApproval(
        { approvalId: "a", action: "reject", approvedBy: "Ibrahim" },
        { loadApproval: async () => makeApproval({ approvalType: "content_packet", entityId: "pkt_3" }), rejectContentPacket: vi.fn(async () => ({})) },
      ),
    ).rejects.toThrow(/rejection reason/i);
  });

  it("routes generic types (n8n_handoff) to applyApprovalAction", async () => {
    const applyApprovalAction = vi.fn(async () => ({}));
    await resolveApproval(
      { approvalId: "a", action: "approve", approvedBy: "Haad" },
      { loadApproval: async () => makeApproval({ approvalType: "n8n_handoff", entityId: "e" }), applyApprovalAction },
    );
    expect(applyApprovalAction).toHaveBeenCalledWith(expect.objectContaining({ approvalId: "a", action: "approve", approvedBy: "Haad" }));
  });

  it("throws for memory_update (must use the memory approval form)", async () => {
    await expect(
      resolveApproval({ approvalId: "a", action: "approve", approvedBy: "Moiz" }, { loadApproval: async () => makeApproval({ approvalType: "memory_update", entityId: "m" }) }),
    ).rejects.toThrow(/memory_update/);
  });

  it("throws when the approval is not found", async () => {
    await expect(
      resolveApproval({ approvalId: "missing", action: "approve", approvedBy: "Moiz" }, { loadApproval: async () => null }),
    ).rejects.toThrow(/not found/);
  });
});
