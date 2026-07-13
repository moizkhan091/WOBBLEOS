import { NextResponse } from "next/server";
import { z } from "zod";
import { sendCommunication, cancelCommunication } from "@/lib/comms";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send") }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(1).optional() }),
]);

/**
 * POST /api/comms/[id]/action — founder SEND or CANCEL a communication. Founder-gated.
 *   send   → dispatch a prepared/ready comm. For an external/proposal channel this is the confirm-capped action:
 *            it can ONLY run here (a founder is in the loop); the recorded send level proves the confirm cap.
 *   cancel → roll back a prepared/ready draft (a sent comm cannot be cancelled).
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
    if (parsed.data.action === "send") {
      const result = await sendCommunication(id, { sentBy: auth }, { enforceAutonomy: true });
      if (!result) return NextResponse.json({ ok: false, error: "communication not found or not in a sendable state" }, { status: 409 });
      return NextResponse.json({ ok: true, communication: result.communication, sendDecision: result.sendDecision });
    }
    const cancelled = await cancelCommunication(id, { cancelledBy: auth, reason: parsed.data.reason }, {});
    if (!cancelled) return NextResponse.json({ ok: false, error: "communication not found or not cancellable" }, { status: 409 });
    return NextResponse.json({ ok: true, communication: cancelled });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
