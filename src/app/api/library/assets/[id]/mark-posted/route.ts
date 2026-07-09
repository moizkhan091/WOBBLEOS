import { NextResponse } from "next/server";
import { markAssetPostedOnPlatform } from "@/lib/library";
import { POST_PLATFORMS, type PostPlatform } from "@/lib/domain/library";
import { requireFounder, isAuthError } from "@/lib/auth/route";

/**
 * POST /api/library/assets/[id]/mark-posted  { platform, publisherRef? }
 *
 * Records that the founder manually posted this asset to a SPECIFIC platform. Per-platform:
 * marking Instagram leaves LinkedIn untouched. Used for content posted by hand (e.g. reels with
 * trending audio) and for backfilling posts made before the OS existed.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await ctx.params;
  let body: { platform?: string; publisherRef?: string };
  try {
    body = (await request.json()) as { platform?: string; publisherRef?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const platform = String(body.platform ?? "");
  if (!(POST_PLATFORMS as readonly string[]).includes(platform)) {
    return NextResponse.json({ ok: false, error: `platform must be one of: ${POST_PLATFORMS.join(", ")}` }, { status: 422 });
  }
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const post = await markAssetPostedOnPlatform(id, platform as PostPlatform, { actor: auth, publisherRef: body.publisherRef }, {});
    return NextResponse.json({ ok: true, post }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
