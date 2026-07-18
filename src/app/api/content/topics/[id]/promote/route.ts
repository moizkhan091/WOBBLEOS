import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { promoteTopicToProduction } from "@/lib/content-topics";
import { listContentTracks } from "@/lib/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const promoteSchema = z.object({ contentTrackId: z.string().trim().min(1).optional() });

/**
 * POST /api/content/topics/[id]/promote — send an APPROVED topic into production. Enqueues the content graph
 * with the topic's teaching context; only an approved topic produces. If no track is given, the first content
 * track is used. Founder-gated.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = promoteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });

  try {
    let contentTrackId = parsed.data.contentTrackId;
    if (!contentTrackId) {
      const tracks = await listContentTracks({ limit: 1 });
      contentTrackId = tracks[0]?.id;
      if (!contentTrackId) return NextResponse.json({ ok: false, error: "no content track exists — create one in Content Command first" }, { status: 422 });
    }
    const result = await promoteTopicToProduction({ topicId: id, contentTrackId, requestedBy: auth }, {});
    if (!result.topic) return NextResponse.json({ ok: false, error: "topic not found" }, { status: 404 });
    if (result.topic.status !== "promoted") return NextResponse.json({ ok: false, error: "topic must be approved before it can be produced" }, { status: 409 });
    return NextResponse.json({ ok: true, topic: result.topic, jobId: result.jobId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
