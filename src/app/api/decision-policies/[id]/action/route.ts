import { NextResponse } from "next/server";
import { z } from "zod";
import { approveDecisionPolicy, rejectDecisionPolicy } from "@/lib/decision-learning";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Approve → `active` (the ONLY path to activation; nothing auto-applies). Reject → `rejected`. Founder-gated.
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject") }),
]);

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const policy = parsed.data.action === "approve"
      ? await approveDecisionPolicy(id, { approvedBy: auth })
      : await rejectDecisionPolicy(id, { rejectedBy: auth });
    if (!policy) return NextResponse.json({ ok: false, error: "policy not found or not in a proposed state" }, { status: 409 });
    return NextResponse.json({ ok: true, policy });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
