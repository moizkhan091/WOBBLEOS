import { NextResponse } from "next/server";
import { prepareCommunication, listCommunications } from "@/lib/comms";
import { prepareCommunicationSchema } from "@/lib/domain/comms";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/comms — founder view of the communications outbox (prepared/ready/sent/cancelled). */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  try {
    const items = await listCommunications({ status: searchParams.get("status") ?? undefined, channel: searchParams.get("channel") ?? undefined, limit: limitParam !== null ? Number(limitParam) : undefined });
    return NextResponse.json({ ok: true, count: items.length, communications: items });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/**
 * POST /api/comms — PREPARE a communication. Founder-gated. Earned Autonomy is enforced: an earned, scope-matched
 * grant RELEASES the reversible step (internal notification delivered / external+proposal staged ready); otherwise
 * the draft is HELD `prepared` for a founder to send. The actual send of an external/proposal comm stays confirm-capped.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const parsed = prepareCommunicationSchema.safeParse({ ...(body as Record<string, unknown>), preparedBy: (body as Record<string, unknown>)?.preparedBy ?? auth });
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  try {
    const result = await prepareCommunication({ ...parsed.data, preparedBy: auth }, { enforceAutonomy: true });
    return NextResponse.json({ ok: true, released: result.released, deduped: result.deduped, decision: result.decision, communication: result.communication }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
