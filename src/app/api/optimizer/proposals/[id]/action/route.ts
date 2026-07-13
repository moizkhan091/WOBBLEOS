import { NextResponse } from "next/server";
import { z } from "zod";
import { approveProposal, rejectProposal, activateProposal, rollbackProposal, recordMonitoring } from "@/lib/optimizer";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(1).optional() }),
  z.object({ action: z.literal("activate"), config: z.record(z.string(), z.unknown()).optional() }),
  z.object({ action: z.literal("rollback"), reason: z.string().trim().min(1) }),
  z.object({ action: z.literal("monitor"), measuredMetric: z.number(), sampleSize: z.number().int().nonnegative().optional(), autoRollback: z.boolean().optional() }),
]);

/**
 * POST /api/optimizer/proposals/[id]/action — the governed improvement lifecycle (founder-gated). The ONLY path to
 * an `active` improvement is approve → activate; approval requires a passing historical test; rollback reverts a
 * degrading (or founder-flagged) active improvement; monitor records an outcome vs baseline (auto-rolls-back if degraded).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await ctx.params;
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  try {
    const d = parsed.data;
    const result =
      d.action === "approve" ? await approveProposal(id, { approvedBy: auth })
      : d.action === "reject" ? await rejectProposal(id, { rejectedBy: auth, reason: d.reason })
      : d.action === "activate" ? await activateProposal(id, { activatedBy: auth, config: d.config })
      : d.action === "rollback" ? await rollbackProposal(id, { rolledBackBy: auth, reason: d.reason })
      : await recordMonitoring(id, { measuredMetric: d.measuredMetric, sampleSize: d.sampleSize, autoRollback: d.autoRollback });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    const { ok: _ok, ...rest } = result;
    return NextResponse.json({ ok: true, ...rest });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
