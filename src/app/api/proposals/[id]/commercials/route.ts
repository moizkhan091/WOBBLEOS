import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { getProposalCommercials, recordNegotiationEvent, setContinuationPrice, setWalkAway } from "@/lib/proposal-commercials";
import { negotiationEventSchema } from "@/lib/domain/proposal-commercials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/proposals/[id]/commercials — the cheaper and fuller options, what the client already
 *      objected to, and the negotiation so far.
 * POST — record a move in the negotiation, set the walk-away, or price a continuation.
 *
 * Nothing here changes the proposal's own price. A negotiated number moves the DEAL's value, because
 * that is what a forecast reads; replacing the quoted price would erase what was originally asked.
 */

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;
  try {
    const commercials = await getProposalCommercials(id);
    if (!commercials) return NextResponse.json({ ok: false, error: "proposal not found" }, { status: 404 });
    return NextResponse.json({ ok: true, ...commercials });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

const postSchema = z.union([
  z.object({ action: z.literal("negotiate"), event: negotiationEventSchema }),
  z.object({ action: z.literal("walk_away"), walkAwayCents: z.number().int().min(0) }),
  z.object({ action: z.literal("continuation"), continuationCents: z.number().int().min(0) }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "validation failed" }, { status: 422 });

  try {
    if (parsed.data.action === "negotiate") await recordNegotiationEvent(id, parsed.data.event, auth);
    else if (parsed.data.action === "walk_away") await setWalkAway(id, parsed.data.walkAwayCents, auth);
    else await setContinuationPrice(id, parsed.data.continuationCents, auth);
    return NextResponse.json({ ok: true, ...(await getProposalCommercials(id)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: /not found/.test(message) ? 404 : 500 });
  }
}
