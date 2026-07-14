import { NextResponse } from "next/server";
import { applyZernioPostEvent, type ZernioPostEvent } from "@/lib/library";
import { readCappedRawBody, verifyRawBodySignature } from "@/lib/security/webhooks";

/**
 * POST /api/webhooks/zernio — Zernio delivery endpoint.
 *
 * This is how a scheduled post AUTO-MOVES to Posted: Zernio calls us on post.published/failed/
 * cancelled and we flip the matching local post (found by publisher_ref). Public route (Zernio has
 * no session), HMAC-verified via X-Zernio-Signature when ZERNIO_WEBHOOK_SECRET is set, now with a
 * pre-parse body-size cap (WOB-AUD-011). Zernio is an EXTERNAL provider, so the signing scheme is
 * Zernio's raw-body HMAC — we cannot impose our timestamp envelope on it; replay is bounded by
 * `applyZernioPostEvent` being idempotent (at-least-once delivery → safe re-apply).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const body = await readCappedRawBody(request);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  const raw = body.raw;
  const secret = process.env.ZERNIO_WEBHOOK_SECRET;
  // Fail CLOSED: public route — with no secret set, anyone could flip post status. Require it.
  if (!secret) return NextResponse.json({ ok: false, error: "webhook disabled — set ZERNIO_WEBHOOK_SECRET" }, { status: 503 });
  if (!verifyRawBodySignature(raw, request.headers.get("X-Zernio-Signature"), secret)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let payload: ZernioPostEvent;
  try {
    payload = JSON.parse(raw) as ZernioPostEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!payload?.event || !payload?.post?.id) {
    return NextResponse.json({ ok: true, ignored: "not a post event" });
  }

  try {
    const result = await applyZernioPostEvent(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    // Acknowledge with 200-family only on success; a 500 makes Zernio retry (which is fine — idempotent).
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
