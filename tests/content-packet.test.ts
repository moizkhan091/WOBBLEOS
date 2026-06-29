import { describe, expect, it } from "vitest";
import { contentPacketSchema, passesQualityGate } from "@/lib/domain/content-packet";

describe("content packets", () => {
  it("requires source, insight, memory, evidence, and claim-risk metadata", () => {
    const packet = contentPacketSchema.parse({
      id: "packet_1",
      platform: "linkedin",
      format: "text",
      objective: "teach",
      audience: "Pakistani owner-led businesses",
      angle: "Agencies keep the process. Your business should own the system.",
      hook: "Your agency is not your advantage. Your operating system is.",
      mainCopy: "Most businesses are still renting output instead of building capability.",
      caption: "Build the machine, not another dependency.",
      cta: "Book an AI Readiness Call.",
      designDirection: "Liquid glass black/lime WOBBLE system card.",
      sourceIdsUsed: ["source_1"],
      insightIdsUsed: ["insight_1"],
      memoryChunksUsed: ["memory_1"],
      evidenceSummary: "Based on WOBBLE Company OS anti-agency positioning.",
      claimRiskLevel: "low",
      proofRequired: false,
      selfReview: {
        usefulness: 8,
        originality: 8,
        brandFit: 9,
        clarity: 8,
        aggressionControl: 7,
        proofStrength: 7,
        postWorthiness: "pass",
      },
      approvalState: "pending",
      n8nHandoffState: "not_sent",
    });

    expect(packet.sourceIdsUsed).toEqual(["source_1"]);
  });

  it("does not pass quality gate when post-worthiness fails", () => {
    expect(
      passesQualityGate({
        usefulness: 8,
        originality: 8,
        brandFit: 9,
        clarity: 8,
        aggressionControl: 7,
        proofStrength: 7,
        postWorthiness: "fail",
      }),
    ).toBe(false);
  });
});
