import { z } from "zod";

export const selfReviewSchema = z.object({
  usefulness: z.number().min(0).max(10),
  originality: z.number().min(0).max(10),
  brandFit: z.number().min(0).max(10),
  clarity: z.number().min(0).max(10),
  aggressionControl: z.number().min(0).max(10),
  proofStrength: z.number().min(0).max(10),
  postWorthiness: z.enum(["pass", "fail"]),
});

export type SelfReview = z.infer<typeof selfReviewSchema>;

export const contentPacketSchema = z.object({
  id: z.string().min(1),
  platform: z.enum(["instagram", "linkedin", "x", "youtube", "multi"]),
  format: z.enum(["static", "carousel", "text", "thread", "reel_script", "youtube_script"]),
  objective: z.string().min(1),
  audience: z.string().min(1),
  angle: z.string().min(1),
  hook: z.string().min(1),
  mainCopy: z.string().min(1),
  slideCopy: z.array(z.string()).default([]),
  caption: z.string().min(1),
  cta: z.string().min(1),
  designDirection: z.string().min(1),
  sourceIdsUsed: z.array(z.string().min(1)).min(1),
  insightIdsUsed: z.array(z.string().min(1)).min(1),
  memoryChunksUsed: z.array(z.string().min(1)).min(1),
  evidenceSummary: z.string().min(1),
  claimRiskLevel: z.enum(["low", "medium", "high"]),
  proofRequired: z.boolean(),
  selfReview: selfReviewSchema,
  approvalState: z.enum(["draft", "pending", "approved", "rejected", "archived"]),
  n8nHandoffState: z.enum(["not_sent", "queued", "sent", "failed"]),
});

export type ContentPacket = z.infer<typeof contentPacketSchema>;

export function passesQualityGate(review: SelfReview): boolean {
  const minimums = [review.usefulness, review.originality, review.brandFit, review.clarity, review.aggressionControl, review.proofStrength];
  return review.postWorthiness === "pass" && minimums.every((score) => score >= 7);
}
