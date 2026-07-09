import { NextResponse } from "next/server";
import { z } from "zod";
import { cancelScheduledPost, markPostPublished } from "@/lib/library";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["cancel", "publish"]), publisherRef: z.string().trim().min(1).optional() });

/** POST /api/library/scheduled/[id]/action — cancel a scheduled post, or mark a manual one published. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const ok =
      parsed.data.action === "cancel"
        ? await cancelScheduledPost(id)
        : await markPostPublished(id, { publisherRef: parsed.data.publisherRef, actor: auth });
    if (!ok) return NextResponse.json({ ok: false, error: "post not found or not in a valid state for this action" }, { status: 409 });
    return NextResponse.json({ ok: true, status: parsed.data.action === "cancel" ? "canceled" : "published" });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
