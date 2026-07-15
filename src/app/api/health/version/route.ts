import { NextResponse } from "next/server";
import { getServiceVersions } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health/version — build identity + service version parity (WOB-UAT-026).
 *
 * 200 when the app, general worker and media worker all report the SAME build id; 503 when they do not,
 * naming the exact stale service so an operator knows what to rebuild rather than guessing.
 *
 * Public like the other health probes: an orchestrator must reach it without a session, and it exposes
 * only build ids — no business data, no secrets.
 */
export async function GET() {
  const versions = await getServiceVersions();
  return NextResponse.json(versions, { status: versions.parity.ok ? 200 : 503 });
}
