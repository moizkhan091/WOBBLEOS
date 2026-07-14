import { NextResponse } from "next/server";
import { getReadiness } from "@/lib/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Aggregate READINESS gate (WOB-AUD-013). Distinct from shallow liveness (`/api/health`): 200 only when
 * every CRITICAL subsystem (DB + storage + general worker/scheduler heartbeat) is healthy; 503 otherwise.
 * The orchestrator/deploy gate should poll THIS so "web is up" is never mistaken for "the OS is working".
 * No auth (a readiness probe must be reachable by the orchestrator); exposes no business data.
 */
export async function GET() {
  const readiness = await getReadiness();
  return NextResponse.json(readiness, { status: readiness.ok ? 200 : 503 });
}
