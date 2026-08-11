import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { applyModelChangeSchema } from "@/lib/domain/model-control";
import { applyModelChange, getModelControlView } from "@/lib/model-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Model Control.
 *
 * GET  - every model decision in the OS, what it is running, what it has cost, how busy it is, and
 *        today's spend against the cap.
 * POST - change one role, a whole department, or everything via a preset.
 *
 * A change is picked up on the NEXT provider call with no restart, because runTextProvider reads the
 * role map live. That is the whole point: switching a model here cannot silently fail to take effect.
 */

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    return NextResponse.json({ ok: true, ...(await getModelControlView()) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = applyModelChangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await applyModelChange(parsed.data, auth);
    // Report the fresh view back so the page cannot drift from what is actually stored.
    return NextResponse.json({ ok: true, ...result, view: await getModelControlView() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
