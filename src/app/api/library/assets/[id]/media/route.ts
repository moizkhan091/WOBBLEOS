import { NextResponse } from "next/server";
import { serveLibraryMedia } from "@/lib/library/media-serve";
import { requireFounder, isAuthError } from "@/lib/auth/route";

/**
 * GET /api/library/assets/[id]/media?i=0[&download=1]
 *
 * Streams a library asset's media so the in-app UI can SHOW the image/reel and the founder can
 * download the original. Auth is the edge proxy session (a same-origin <img>/<video> carries the
 * cookie). External publishers use the signed /api/public/media route instead.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const rawIndex = Number(url.searchParams.get("i") ?? "0");
  const index = Number.isFinite(rawIndex) && rawIndex >= 0 ? Math.floor(rawIndex) : 0;
  return serveLibraryMedia(request, id, index, url.searchParams.get("download") === "1");
}
