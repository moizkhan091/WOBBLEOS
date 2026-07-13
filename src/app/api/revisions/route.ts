import { NextResponse } from "next/server";
import { listRevisionCycles } from "@/lib/selective-revision";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/revisions — founder inspection of selective-revision cycles (rerun/preserved plan + component versions). */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const url = new URL(request.url);
  try {
    const cycles = await listRevisionCycles({
      artifactKind: url.searchParams.get("artifactKind") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      clientId: url.searchParams.get("clientId") ?? undefined,
      limit: Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200),
    });
    return NextResponse.json({ ok: true, cycles });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
