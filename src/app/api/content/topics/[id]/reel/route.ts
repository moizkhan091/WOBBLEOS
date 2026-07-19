import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { getTopic, markTopicPromoted } from "@/lib/content-topics";
import { produceReel } from "@/lib/reel";
import { resolveReelVoice } from "@/lib/domain/reel-voice";
import { addContentAsset } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Reel rendering (VO + hundreds of chromium frames + ffmpeg) is slow; allow the maximum request window.
export const maxDuration = 300;

/**
 * POST /api/content/topics/[id]/reel — PRODUCE a finished vertical reel (1080x1920 MP4) for an approved topic:
 * the writer LLM drafts WOBBLE-style narration (or the founder supplies it), the chosen voice speaks it with
 * timestamps, and the HyperFrames kinetic-typography composition renders + muxes the VO (speed-up + loudnorm).
 * Stored as a Library `reel` asset that plays in-app and posts via the scheduler. Founder-gated.
 *
 * Body/query: `voice` = moiz | hale | female (default moiz). Body `narration` optionally supplies the script
 * verbatim (skips the writer LLM — use this while OpenRouter credit is exhausted; expressive [tags] allowed
 * only for hale/female).
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;

  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as { voice?: string; narration?: string };
  const voiceKey = (body.voice ?? url.searchParams.get("voice") ?? "moiz").toLowerCase();
  const voice = resolveReelVoice(voiceKey);

  try {
    const topic = await getTopic(id);
    if (!topic) return NextResponse.json({ ok: false, error: "topic not found" }, { status: 404 });
    if (topic.status !== "approved" && topic.status !== "promoted") {
      return NextResponse.json({ ok: false, error: "approve the topic before producing its reel" }, { status: 409 });
    }

    const result = await produceReel({
      narration: body.narration?.trim() || undefined,
      topic: topic.title,
      angle: topic.teachingJob,
      voiceKey: voice.key,
      item: `reel:${id}`,
    });
    if (!result.mediaRef) return NextResponse.json({ ok: false, error: "reel render produced no file" }, { status: 502 });

    const asset = await addContentAsset({
      title: topic.title,
      kind: "reel",
      mediaRefs: [{ path: result.mediaRef, kind: "video", order: 0 }],
      tags: [topic.pillar],
      ownerScope: "company",
      sourceType: "content_pack",
      metadata: {
        topicId: id,
        voice: result.voiceKey,
        durationSec: Number(result.finalDurationSec.toFixed(2)),
        words: result.words,
        scenes: result.scenes,
        narration: result.narration,
        captionsSrt: result.captionsSrt,
      },
    });

    await markTopicPromoted(id, { packetId: asset.id, actor: auth }, {}).catch(() => {});

    return NextResponse.json({
      ok: true,
      assetId: asset.id,
      mediaUrl: `/api/library/assets/${asset.id}/media`,
      voice: result.voiceKey,
      durationSec: Number(result.finalDurationSec.toFixed(2)),
      words: result.words,
      scenes: result.scenes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "reel production failed";
    // Surface the two known blockers plainly so the founder knows the action, not a stack trace.
    const status = /ELEVENLABS_API_KEY|not configured/.test(message) ? 503 : /credit|402|budget|exceeded/i.test(message) ? 402 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
