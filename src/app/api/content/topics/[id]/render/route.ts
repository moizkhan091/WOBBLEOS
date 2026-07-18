import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { getTopic, markTopicPromoted } from "@/lib/content-topics";
import { renderTopicAsset } from "@/lib/content-render";
import { HERO_IMAGE_MODEL, VOLUME_IMAGE_MODEL } from "@/lib/domain/content-render";
import { addContentAsset } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Image generation is slow (GPT-Image-2 can take minutes); allow a long request.
export const maxDuration = 300;

/**
 * POST /api/content/topics/[id]/render — PRODUCE the actual on-brand asset for an approved/promoted topic:
 * the AI art director designs a concept, GPT-Image-2 / gemini renders it, and it's stored as a Library asset
 * that displays in-app. `?hero=1` uses GPT-Image-2 (best, slower); default uses gemini (fast, reliable).
 * Founder-gated.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;
  const hero = new URL(request.url).searchParams.get("hero") === "1";

  try {
    const topic = await getTopic(id);
    if (!topic) return NextResponse.json({ ok: false, error: "topic not found" }, { status: 404 });
    if (topic.status !== "approved" && topic.status !== "promoted") {
      return NextResponse.json({ ok: false, error: "approve the topic before producing its asset" }, { status: 409 });
    }

    const kind = topic.suggestedFormat === "carousel" ? "carousel" : "static";
    const result = await renderTopicAsset(
      { kind, hook: topic.title, teachingJob: topic.teachingJob, pillar: topic.pillar, platform: topic.suggestedPlatform, topicId: id, requestedBy: auth, model: hero ? HERO_IMAGE_MODEL : VOLUME_IMAGE_MODEL },
      {},
    );
    const outputRefs = result.assets.flatMap((a) => a.outputRefs);
    if (!outputRefs.length) return NextResponse.json({ ok: false, error: "render produced no image" }, { status: 502 });

    const asset = await addContentAsset({
      title: topic.title,
      kind: kind === "carousel" ? "carousel" : "image",
      mediaRefs: outputRefs.map((path, order) => ({ path, kind: "image", order })),
      tags: [topic.pillar],
      ownerScope: "company",
      sourceType: "content_pack",
      metadata: { topicId: id, concept: result.concept, model: result.model, treatment: result.concept.treatment },
    });

    // Link the produced asset back to the topic (approved → promoted; already-promoted is a no-op).
    await markTopicPromoted(id, { packetId: asset.id, actor: auth }, {}).catch(() => {});

    return NextResponse.json({
      ok: true,
      assetId: asset.id,
      mediaUrl: `/api/library/assets/${asset.id}/media`,
      images: outputRefs.length,
      concept: result.concept,
      costCents: result.totalCostCents,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = /not configured/.test(message) ? 503 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
