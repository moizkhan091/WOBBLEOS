import { NextResponse } from "next/server";
import { auditEventInputSchema } from "@/lib/domain/audit";
import { listAuditEvents, writeAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json(
    { ok: false, error: "DATABASE_URL is not configured" },
    { status: 503 },
  );
}

/**
 * GET /api/audit
 * Read recent audit events. Optional filters: module, entityType, entityId, limit.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");

  try {
    const events = await listAuditEvents({
      module: searchParams.get("module") ?? undefined,
      entityType: searchParams.get("entityType") ?? undefined,
      entityId: searchParams.get("entityId") ?? undefined,
      limit: limitParam !== null ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ ok: true, count: events.length, events });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/audit
 * Write a single audit event. Used by internal modules/dev tooling.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = auditEventInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const event = await writeAuditEvent(parsed.data);
    return NextResponse.json({ ok: true, event }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
