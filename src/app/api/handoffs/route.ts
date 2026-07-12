import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { listHandoffs, handoffStateCounts } from "@/lib/handoff";
import { HANDOFF_DELIVERY_STATES, type HandoffDeliveryState } from "@/lib/domain/handoff-delivery";

export const dynamic = "force-dynamic";

/**
 * GET /api/handoffs — Command Centre handoff feed. Founder-only. Filter by workflow / client /
 * department / source / destination / delivery state; includes live state counts for the dashboard.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const url = new URL(request.url);
  const p = url.searchParams;
  const stateParam = p.get("deliveryState");
  if (stateParam && !HANDOFF_DELIVERY_STATES.includes(stateParam as HandoffDeliveryState)) {
    return NextResponse.json({ ok: false, error: `invalid deliveryState '${stateParam}'` }, { status: 422 });
  }
  const limitRaw = Number(p.get("limit"));

  try {
    const [handoffs, counts] = await Promise.all([
      listHandoffs({
        workflowId: p.get("workflowId") ?? undefined,
        deliveryState: (stateParam as HandoffDeliveryState) ?? undefined,
        clientWorkspaceId: p.get("clientWorkspaceId") ?? undefined,
        department: p.get("department") ?? undefined,
        sourceAgent: p.get("sourceAgent") ?? undefined,
        destinationAgent: p.get("destinationAgent") ?? undefined,
        limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
      }),
      handoffStateCounts(),
    ]);
    return NextResponse.json({ ok: true, counts, handoffs });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
