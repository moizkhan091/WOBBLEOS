import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { getEscalation, acknowledgeEscalation, resolveEscalation, dismissEscalation } from "@/lib/departments/escalation";
import { ESCALATION_RESOLUTION_ACTIONS } from "@/lib/domain/escalation";

export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("acknowledge") }),
  z.object({ action: z.literal("resolve"), resolutionAction: z.enum(ESCALATION_RESOLUTION_ACTIONS), resolution: z.string().trim().min(1) }),
  z.object({ action: z.literal("dismiss"), reason: z.string().trim().min(1) }),
]);

/**
 * POST /api/escalations/[id]/action — a founder acts on an escalation: acknowledge, resolve (with a
 * resume / reroute / blocked / terminate decision the workflow reads), or dismiss. Founder-only, audited.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });

  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const { id } = await context.params;
  try {
    const existing = await getEscalation(id);
    if (!existing) return NextResponse.json({ ok: false, error: `escalation '${id}' not found` }, { status: 404 });

    let ok = false;
    if (parsed.data.action === "acknowledge") ok = await acknowledgeEscalation(id, auth);
    else if (parsed.data.action === "resolve") ok = await resolveEscalation(id, { action: parsed.data.resolutionAction, resolution: parsed.data.resolution, resolvedBy: auth });
    else ok = await dismissEscalation(id, auth, parsed.data.reason);

    if (!ok) return NextResponse.json({ ok: false, error: `cannot ${parsed.data.action} an escalation in state '${existing.status}'` }, { status: 409 });
    return NextResponse.json({ ok: true, escalation: await getEscalation(id) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
