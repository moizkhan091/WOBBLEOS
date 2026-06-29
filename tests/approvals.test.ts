import { describe, expect, it } from "vitest";
import { createApprovalRecord } from "@/lib/domain/approvals";

describe("createApprovalRecord", () => {
  it("captures explicit founder attribution and confirmation metadata", () => {
    const record = createApprovalRecord({
      entityType: "content_packet",
      entityId: "packet_1",
      action: "approve",
      approvedBy: "Moiz",
      riskLevel: "high",
      confirmationRequired: true,
      confirmationCompleted: true,
      notes: "Ready for n8n handoff",
      now: new Date("2026-06-26T01:00:00.000Z"),
    });

    expect(record).toMatchObject({
      entityType: "content_packet",
      entityId: "packet_1",
      action: "approve",
      approvedBy: "Moiz",
      approvedAt: "2026-06-26T01:00:00.000Z",
      riskLevel: "high",
      confirmationRequired: true,
      confirmationCompleted: true,
      notes: "Ready for n8n handoff",
    });
  });
});
