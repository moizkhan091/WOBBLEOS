import { NextResponse } from "next/server";
import { serveLibraryMedia } from "@/lib/library/media-serve";
import { verifyMediaToken } from "@/lib/library/media-token";

/**
 * GET /api/public/media/[id]?i=0&t=<token>
 *
 * PUBLIC (no session) signed media endpoint so external publishers like Zernio — which have no
 * session cookie — can fetch a library asset's local media. The HMAC token binds assetId+index,
 * so it can't be tampered to read a different asset. This is the ONLY public media path.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const rawIndex = Number(url.searchParams.get("i") ?? "0");
  const index = Number.isFinite(rawIndex) && rawIndex >= 0 ? Math.floor(rawIndex) : 0;
  if (!verifyMediaToken(id, index, url.searchParams.get("t"))) {
    return NextResponse.json({ ok: false, error: "invalid or missing media token" }, { status: 403 });
  }
  return serveLibraryMedia(request, id, index, false);
}
