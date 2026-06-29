import { NextResponse } from "next/server";
import { listProviderConnections } from "@/lib/providers";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/**
 * GET /api/providers
 * List configured provider connections. Returns credential key names, never secret values.
 */
export async function GET() {
  if (!process.env.DATABASE_URL) return dbUnavailable();

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
