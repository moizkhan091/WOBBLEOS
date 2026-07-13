import { NextResponse } from "next/server";
import { z } from "zod";
import { revokeAutonomyPolicy } from "@/lib/autonomy";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.literal("revoke") });

/** POST /api/autonomy/policies/[id]/action — revoke a durable autonomy grant (the action falls back to baseline). Founder-gated. */
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
    const ok = await revokeAutonomyPolicy(id, auth);
    if (!ok) return NextResponse.json({ ok: false, error: "policy not found or already revoked" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
