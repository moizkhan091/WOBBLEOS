import { NextResponse } from "next/server";
import { ingestIntelligencePayload } from "@/lib/intelligence/ingest";
import { readCappedRawBody, verifyWebhookSignature } from "@/lib/security/webhooks";

/**
 * POST /api/webhooks/intelligence — the ingestion pipe for external intelligence.
 *
 * Our own producers (Apify scout, n8n transcript flow, a manual pusher) send normalized
 * competitor/social/market records here; they become `intelligence_items` PENDING approval.
 * Public route (caller has no session) but hardened (WOB-AUD-011): capped body + TIMESTAMPED raw-body
 * HMAC (X-Wobble-Timestamp + X-Wobble-Signature over `timestamp.body`) with a ±5-min replay window, when
 * INTELLIGENCE_WEBHOOK_SECRET is set. Nothing becomes trusted until a founder approves it.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const body = await readCappedRawBody(request);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  const raw = body.raw;
  const secret = process.env.INTELLIGENCE_WEBHOOK_SECRET;
  // Fail CLOSED: this is a public route, so with no secret set anyone could inject intelligence.
  if (!secret) return NextResponse.json({ ok: false, error: "ingestion webhook disabled — set INTELLIGENCE_WEBHOOK_SECRET" }, { status: 503 });
  const verification = await verifyWebhookSignature({
    payload: raw,
    timestamp: request.headers.get("X-Wobble-Timestamp") ?? "",
    signature: request.headers.get("X-Wobble-Signature") ?? "",
    secret,
  });
  if (!verification.valid) {
    return NextResponse.json({ ok: false, error: `invalid signature — ${verification.reason}` }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }

  try {
    const result = await ingestIntelligencePayload(payload);
    return NextResponse.json({ ok: true, ...result, note: "ingested as pending — review in the Intelligence Inbox" });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 422 });
  }
}
