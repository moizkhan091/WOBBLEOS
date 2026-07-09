import { NextResponse } from "next/server";
import { listScheduledPosts } from "@/lib/library";

export const dynamic = "force-dynamic";

/** GET /api/library/scheduled?status=&platform=&limit= — the post queue / calendar. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const url = new URL(request.url);
  try {
    const posts = await listScheduledPosts({
      status: url.searchParams.get("status") ?? undefined,
      platform: url.searchParams.get("platform") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 100),
    });
    return NextResponse.json({ ok: true, posts });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
