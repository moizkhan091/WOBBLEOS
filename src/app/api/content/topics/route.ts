import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { listTopics } from "@/lib/content-topics";
import { CONTENT_TOPIC_STATUSES, CONTENT_TOPIC_PILLARS } from "@/lib/domain/content-topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/content/topics — the topic bank (default: highest-scored first). Founder-gated (founder-only data),
 * so a founder reviews the stats before selecting. Filter by ?status=, ?pillar=, ?limit.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const pillar = searchParams.get("pillar");
  const limitParam = searchParams.get("limit");
  try {
    const topics = await listTopics({
      status: CONTENT_TOPIC_STATUSES.includes(status as never) ? (status as never) : undefined,
      pillar: CONTENT_TOPIC_PILLARS.includes(pillar as never) ? (pillar as never) : undefined,
      limit: limitParam !== null ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ ok: true, count: topics.length, topics });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
