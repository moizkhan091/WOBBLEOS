import { NextResponse } from "next/server";
import { z } from "zod";
import { generateSocialStrategy, archiveSocialStrategy } from "@/lib/social";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["generate", "archive"]) });

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const strategy = parsed.data.action === "generate" ? await generateSocialStrategy(id, { actor: auth }) : await archiveSocialStrategy(id, { actor: auth });
    if (!strategy) return NextResponse.json({ ok: false, error: "strategy not found" }, { status: 404 });
    return NextResponse.json({ ok: true, strategy });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
