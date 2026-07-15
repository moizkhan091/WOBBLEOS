import { NextResponse } from "next/server";
import { getConnection, updateConnection } from "@/lib/connections";
import { updateConnectionSchema } from "@/lib/domain/connections";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/** GET /api/connections/[id] - connection detail by id or slug, with no secrets exposed. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const { id } = await context.params;
  try {
    const connection = await getConnection(id);
    if (!connection) return NextResponse.json({ ok: false, error: "connection not found" }, { status: 404 });
    return NextResponse.json({ ok: true, connection });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** PATCH /api/connections/[id] - update enablement, permissions, health metadata, docs path. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = updateConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const connection = await updateConnection(id, parsed.data);
    return NextResponse.json({ ok: true, connection });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: message.includes("not found") ? 404 : 500 });
  }
}
