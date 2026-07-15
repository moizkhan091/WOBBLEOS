import { NextResponse } from "next/server";
import { receiveN8nCallback } from "@/lib/n8n";
import { readCappedRawBody } from "@/lib/security/webhooks";
import {
  N8N_EVENT_TYPE_HEADER,
  N8N_IDEMPOTENCY_HEADER,
  N8N_SIGNATURE_HEADER,
  N8N_TIMESTAMP_HEADER,
} from "@/lib/domain/n8n-handoff";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  // Pre-parse body-size cap (WOB-AUD-011). n8n callback already has timestamped-HMAC + idempotency.
  const body = await readCappedRawBody(request);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  const payloadText = body.raw;
  let result;
  try {
    result = await receiveN8nCallback({
      payloadText,
      timestamp: request.headers.get(N8N_TIMESTAMP_HEADER),
      signature: request.headers.get(N8N_SIGNATURE_HEADER),
      idempotencyKey: request.headers.get(N8N_IDEMPOTENCY_HEADER),
      eventType: request.headers.get(N8N_EVENT_TYPE_HEADER),
      endpointId: request.headers.get("X-Wobble-Endpoint-Id"),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }

  const statusCode = result.status === "rejected" ? 401 : 200;
  return NextResponse.json({ ok: result.status !== "rejected", ...result }, { status: statusCode });
}
