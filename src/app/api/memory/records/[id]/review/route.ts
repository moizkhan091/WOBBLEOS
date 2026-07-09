import { NextResponse } from "next/server";
import { z } from "zod";
import { reviewMemory } from "@/lib/memory";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

const schema = z.object({ reviewedBy: z.string().trim().min(1).optional() });

/** POST /api/memory/records/[id]/review — mark a memory as re-confirmed (resets its freshness window). */
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
    await reviewMemory({ id, reviewedBy: auth });
    return NextResponse.json({ ok: true, status: "reviewed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: /not found/i.test(message) ? 404 : 500 });
  }
}
