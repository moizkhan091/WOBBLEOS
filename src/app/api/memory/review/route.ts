import { NextResponse } from "next/server";
import { listMemoriesDueForReview } from "@/lib/memory";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

/** GET /api/memory/review — memories whose freshness window has elapsed (re-confirm or archive). */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  try {
    const records = await listMemoriesDueForReview({ limit });
    return NextResponse.json({ ok: true, records });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
