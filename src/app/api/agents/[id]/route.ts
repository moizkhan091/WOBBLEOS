import { NextResponse } from "next/server";
import { getAgent, listAgentRuns } from "@/lib/agents";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

/** GET /api/agents/[id] - agent detail (by id or slug) + recent runs. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;
  try {
    const agent = await getAgent(id);
    if (!agent) return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 });
    const runs = await listAgentRuns({ agentId: agent.id, limit: 20 });
    return NextResponse.json({ ok: true, agent, runs });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
