import { NextResponse } from "next/server";
import { z } from "zod";
import { gateContentPacket } from "@/lib/quality";
import type { ExcellenceRules } from "@/lib/domain/content-excellence";

export const dynamic = "force-dynamic";

const draftSchema = z.object({
  hook: z.string().trim().min(1, "hook is required"),
  mainCopy: z.string().optional(),
  caption: z.string().optional(),
  cta: z.string().optional(),
  slides: z.array(z.string()).optional(),
  platform: z.string().optional(),
  format: z.string().optional(),
  claimRiskLevel: z.enum(["low", "medium", "high"]).optional(),
  proofRequired: z.boolean().optional(),
  hasSources: z.boolean().optional(),
  hasEvidence: z.boolean().optional(),
});

const bodySchema = z.object({
  entityId: z.string().trim().min(1).optional(),
  draft: draftSchema,
  rules: z.record(z.string(), z.array(z.string())).optional(),
  record: z.boolean().optional(),
});

/**
 * POST /api/content/quality
 * Score a draft against the Content Excellence Gate. On-demand scoring by
 * default; if `entityId` is supplied and `record` isn't false, it persists a
 * quality_reviews row and updates the packet's qualityStatus.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  const wantsRecord = parsed.data.record !== false && Boolean(parsed.data.entityId);
  if (wantsRecord && !process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured (cannot record review)" }, { status: 503 });
  }

  try {
    const result = await gateContentPacket({
      entityId: parsed.data.entityId ?? "draft_adhoc",
      draft: parsed.data.draft,
      rules: parsed.data.rules as Partial<ExcellenceRules> | undefined,
      record: wantsRecord,
    });
    return NextResponse.json({
      ok: true,
      passed: result.grade.passed,
      eligibleForApproval: result.eligibleForApproval,
      scores: result.grade.scores,
      blocked: result.grade.blocked,
      blockReasons: result.grade.blockReasons,
      rewriteInstructions: result.grade.rewriteInstructions,
      summary: result.grade.summary,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
