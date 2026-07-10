import { NextResponse } from "next/server";
import { z } from "zod";
import { runDreamer } from "@/lib/intelligence/dreamer";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  scope: z.enum(["wobble", "client", "global"]).optional(),
  clientId: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/** POST /api/intelligence/dream — the Dreamer proposes proactive moves (pending approval). */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const result = await runDreamer(parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
