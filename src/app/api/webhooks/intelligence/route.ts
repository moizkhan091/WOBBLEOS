import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ingestIntelligencePayload } from "@/lib/intelligence/ingest";

/**
 * POST /api/webhooks/intelligence — the ingestion pipe for external intelligence.
 *
 * Any source (Apify scout, n8n transcript flow, a manual pusher) sends normalized
 * competitor/social/market records here; they become `intelligence_items` PENDING approval.
 * Public route (external caller has no session) but HMAC-verified via X-Wobble-Signature when
 * INTELLIGENCE_WEBHOOK_SECRET is set. Nothing becomes trusted until a founder approves it.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verify(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const computed = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(computed);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 4_000_000) return NextResponse.json({ ok: false, error: "payload too large (max 4MB)" }, { status: 413 });
  const secret = process.env.INTELLIGENCE_WEBHOOK_SECRET;
  // Fail CLOSED: this is a public route, so with no secret set anyone could inject intelligence.
  if (!secret) return NextResponse.json({ ok: false, error: "ingestion webhook disabled — set INTELLIGENCE_WEBHOOK_SECRET" }, { status: 503 });
  if (!verify(raw, request.headers.get("X-Wobble-Signature"), secret)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
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
