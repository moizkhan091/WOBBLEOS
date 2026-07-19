import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { getTopic } from "@/lib/content-topics";
import { generateLeadMagnet } from "@/lib/lead-magnets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/content/topics/[id]/lead-magnet — build a deeply-educational, usable lead magnet from a topic. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;
  try {
    const topic = await getTopic(id);
    if (!topic) return NextResponse.json({ ok: false, error: "topic not found" }, { status: 404 });
    const magnet = await generateLeadMagnet({ topicTitle: topic.title, teachingJob: topic.teachingJob, pillar: topic.pillar, audience: topic.targetAudience, topicId: id, requestedBy: auth }, {});
    if (!magnet) return NextResponse.json({ ok: false, error: "could not generate a usable magnet" }, { status: 502 });
    return NextResponse.json({ ok: true, magnet }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
