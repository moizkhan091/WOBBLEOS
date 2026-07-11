import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/media — Media Studio status. HONEST: the generation pipeline (fal.ai client, a
 * media_jobs queue, and a real video worker) is NOT built yet — this is the planned surface.
 * Setting FAL_KEY alone does not yet produce media. We never fabricate media or pretend it works.
 */
export async function GET() {
  const keySet = Boolean((process.env.FAL_KEY ?? "").trim());
  return NextResponse.json({
    ok: true,
    generationBuilt: false, // the fal.ai pipeline + video worker are on the roadmap, not implemented
    keySet,
    roadmap: [
      { key: "image", label: "Image generation", note: "Product shots, thumbnails, ad creative — planned" },
      { key: "video", label: "Short video / reels", note: "Rendered in an isolated video worker — planned" },
    ],
    note: "Media generation is on the roadmap. The pipeline (fal.ai + a media-jobs queue + the video worker) has not been built yet, so no media is produced — even with FAL_KEY set.",
  });
}
