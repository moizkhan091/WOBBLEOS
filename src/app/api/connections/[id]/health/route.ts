import { NextResponse } from "next/server";
import { checkConnectionHealth } from "@/lib/connections";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/** POST /api/connections/[id]/health - check env credential presence and write health status. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const auth = await requireFounder(_request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;
  try {
    const result = await checkConnectionHealth(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: message.includes("not found") ? 404 : 500 });
  }
}
