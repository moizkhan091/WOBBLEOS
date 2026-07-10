import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/media — Media Studio status. Honest connect-state: video/image generation
 * runs on fal.ai and is compute-isolated in the video worker; it stays inert (never
 * fabricates media) until FAL_KEY is set. Reports what's needed + what it can do.
 */
export async function GET() {
  const configured = Boolean((process.env.FAL_KEY ?? "").trim());
  return NextResponse.json({
    ok: true,
    configured,
    needs: configured ? [] : ["FAL_KEY"],
    capabilities: [
      { key: "image", label: "Image generation", note: "Product shots, thumbnails, ad creative" },
      { key: "video", label: "Short video / reels", note: "Rendered via the isolated video worker (npm run worker:video)" },
    ],
    worker: "worker:video",
  });
}
