import { NextResponse } from "next/server";
import { getAgent, listAgentRuns, recordAgentRun } from "@/lib/agents";
import { recordAgentRunSchema } from "@/lib/domain/agents";

export const dynamic = "force-dynamic";
function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/** GET /api/agents/[id]/runs - run history for an agent. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const { id } = await context.params;
  try {
    const agent = await getAgent(id);
    if (!agent) return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 });
    const runs = await listAgentRuns({ agentId: agent.id, limit: 100 });
    return NextResponse.json({ ok: true, count: runs.length, runs });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** POST /api/agents/[id]/runs - record an agent run (internal/integration). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const agent = await getAgent(id);
  if (!agent) return NextResponse.json({ ok: false, error: "agent not found" }, { status: 404 });
  const parsed = recordAgentRunSchema.safeParse({ ...(body as object), agentSlug: agent.slug });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }
  try {
    const result = await recordAgentRun(parsed.data);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
