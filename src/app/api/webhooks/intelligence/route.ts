import { NextResponse } from "next/server";
import {
  INTELLIGENCE_DELIVERY_ID_HEADER,
  INTELLIGENCE_PRODUCER_HEADER,
  processIntelligenceWebhook,
} from "@/lib/intelligence/webhook";
import { readCappedRawBody } from "@/lib/security/webhooks";

/**
 * POST /api/webhooks/intelligence — authenticated external-intelligence ingestion.
 *
 * The HMAC binds timestamp + producer + idempotency key + raw body. A durable unique claim makes
 * each valid delivery single-use across app instances. Records remain pending until founder approval.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }
  const body = await readCappedRawBody(request);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: body.status });

  const secret = process.env.INTELLIGENCE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "ingestion webhook disabled — set INTELLIGENCE_WEBHOOK_SECRET" },
      { status: 503 },
    );
  }

  const result = await processIntelligenceWebhook({
    raw: body.raw,
    timestamp: request.headers.get("X-Wobble-Timestamp") ?? "",
    signature: request.headers.get("X-Wobble-Signature") ?? "",
    producer: request.headers.get(INTELLIGENCE_PRODUCER_HEADER) ?? "",
    deliveryId: request.headers.get(INTELLIGENCE_DELIVERY_ID_HEADER) ?? "",
    secret,
  });
  return NextResponse.json(result.body, { status: result.status });
}
