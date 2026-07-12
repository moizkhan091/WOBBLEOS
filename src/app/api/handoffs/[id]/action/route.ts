import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { getHandoff, redriveHandoff, cancelHandoff } from "@/lib/handoff";

export const dynamic = "force-dynamic";

// "retry" is the founder-facing alias for redrive (put a failed/dead-lettered handoff back into delivery).
const actionSchema = z.object({ action: z.enum(["redrive", "retry", "cancel"]) });

/**
 * POST /api/handoffs/[id]/action — operate one handoff from the Command Centre. Founder-only, audited by
 * the runtime (handoff.redriven / handoff.cancelled). Conditional: a state that can't take the action
 * (e.g. cancel an already-completed handoff) returns 409, not a silent no-op.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });

  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const { id } = await context.params;
  try {
    const existing = await getHandoff(id);
    if (!existing) return NextResponse.json({ ok: false, error: `handoff '${id}' not found` }, { status: 404 });

    const action = parsed.data.action === "retry" ? "redrive" : parsed.data.action;
    const ok = action === "redrive" ? await redriveHandoff(id, auth) : await cancelHandoff(id, auth);
    if (!ok) {
      return NextResponse.json({ ok: false, error: `cannot ${action} a handoff in state '${existing.deliveryState}'` }, { status: 409 });
    }
    return NextResponse.json({ ok: true, handoff: await getHandoff(id) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
