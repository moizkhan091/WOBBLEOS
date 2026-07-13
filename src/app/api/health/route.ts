import { NextResponse } from "next/server";
import { getHealthStatus } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness + readiness for the isolated deploy (load balancer / docker healthcheck). NO auth (a
 * probe must be reachable by the orchestrator); exposes only up/down, never business data. 200 when healthy (DB
 * reachable), 503 when degraded (DB down) so the orchestrator can pull the instance out of rotation.
 */
export async function GET() {
  const health = await getHealthStatus();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
