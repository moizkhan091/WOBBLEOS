import { NextResponse } from "next/server";
import { schedulePost } from "@/lib/library";
import { schedulePostSchema } from "@/lib/domain/library";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/library/schedule — queue a library asset to a platform at a time. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = schedulePostSchema.omit({ createdBy: true }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const post = await schedulePost({ ...parsed.data, createdBy: auth });
    return NextResponse.json({ ok: true, post }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: /not found/.test(message) ? 404 : /archived/.test(message) ? 409 : 500 });
  }
}
