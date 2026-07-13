import { NextResponse } from "next/server";
import { z } from "zod";
import { approveContextAssertion, rejectContextAssertion } from "@/lib/context-os";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), supersedesId: z.string().trim().min(1).optional() }),
  z.object({ action: z.literal("reject") }),
]);

/** POST /api/context/assertions/[id]/action — approve (→ trusted, the ONLY path from raw) or reject. Founder-gated. */
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
    if (parsed.data.action === "approve") {
      const a = await approveContextAssertion(id, auth, { supersedesId: parsed.data.supersedesId });
      if (!a) return NextResponse.json({ ok: false, error: "assertion not found or not in an extracted state" }, { status: 409 });
      return NextResponse.json({ ok: true, assertion: a });
    }
    const ok = await rejectContextAssertion(id, auth);
    if (!ok) return NextResponse.json({ ok: false, error: "assertion not found or not in an extracted state" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
