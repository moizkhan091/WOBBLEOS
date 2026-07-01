import { NextResponse } from "next/server";
import { listAgents, registerAgent } from "@/lib/agents";
import { registerAgentSchema, AGENT_STATUSES } from "@/lib/domain/agents";

export const dynamic = "force-dynamic";
function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/** GET /api/agents - list registered agents. Filters: module, team, status, limit. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limitParam = searchParams.get("limit");
  try {
    const items = await listAgents({
      module: searchParams.get("module") ?? undefined,
      team: searchParams.get("team") ?? undefined,
      status: AGENT_STATUSES.includes(status as never) ? (status as never) : undefined,
      limit: limitParam !== null ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ ok: true, count: items.length, agents: items });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** POST /api/agents - register a new agent (idempotent by slug). */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = registerAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }
  try {
    const agent = await registerAgent(parsed.data);
    return NextResponse.json({ ok: true, agent }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
