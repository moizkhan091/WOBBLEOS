import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getContentAsset } from "@/lib/library";

/**
 * GET /api/library/assets/[id]/media?i=0[&download=1]
 *
 * Streams the actual bytes of a library asset's media so the UI can SHOW the image/reel
 * (not just its title) and the founder can download the original. Auth is handled by the
 * edge proxy (a same-origin <img>/<video> carries the session cookie). Path is confined to
 * STORAGE_ROOT/media to prevent traversal. A remote-url MediaRef redirects instead of streaming.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
};

function storageRoot(): string {
  return process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const rawIndex = Number(url.searchParams.get("i") ?? "0");
  const index = Number.isFinite(rawIndex) && rawIndex >= 0 ? Math.floor(rawIndex) : 0;
  const download = url.searchParams.get("download") === "1";

  const asset = await getContentAsset(id);
  if (!asset) return NextResponse.json({ ok: false, error: "asset not found" }, { status: 404 });
  const ref = asset.mediaRefs?.[index];
  if (!ref) return NextResponse.json({ ok: false, error: "no media on this asset" }, { status: 404 });

  // A remote-hosted media ref: hand the browser straight to the source.
  if (ref.url && !ref.path) return NextResponse.redirect(ref.url);
  if (!ref.path) return NextResponse.json({ ok: false, error: "media has no local path" }, { status: 404 });

  const mediaDir = path.resolve(storageRoot(), "media");
  const full = path.resolve(storageRoot(), ref.path);
  if (full !== mediaDir && !full.startsWith(mediaDir + path.sep)) {
    return NextResponse.json({ ok: false, error: "forbidden path" }, { status: 403 });
  }

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(full);
  } catch {
    return NextResponse.json({ ok: false, error: "media file missing" }, { status: 404 });
  }

  const ext = path.extname(full).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const total = bytes.byteLength;
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
  };
  if (download) {
    const safeName = path.basename(full).replace(/["\\]/g, "");
    headers["Content-Disposition"] = `attachment; filename="${safeName}"`;
  }

  // Honor Range requests (video seeking / progressive playback) with a 206 partial response.
  const range = request.headers.get("range");
  const match = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;
  if (match && !download) {
    let start = match[1] ? Number.parseInt(match[1], 10) : 0;
    let end = match[2] ? Number.parseInt(match[2], 10) : total - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= total) end = total - 1;
    if (start > end) return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${total}` } });
    const chunk = bytes.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(chunk.byteLength) },
    });
  }

  return new NextResponse(new Uint8Array(bytes), { status: 200, headers: { ...headers, "Content-Length": String(total) } });
}
