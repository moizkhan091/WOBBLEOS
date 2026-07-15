import { NextResponse } from "next/server";
import { listProviderConnections } from "@/lib/providers";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/**
 * GET /api/providers
 * List configured provider connections. Returns credential key names, never secret values.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  try {
    const providers = await listProviderConnections();
    return NextResponse.json({ ok: true, count: providers.length, providers });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
