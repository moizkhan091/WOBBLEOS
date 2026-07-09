import { NextResponse } from "next/server";
import { z } from "zod";
import { pinMemory } from "@/lib/memory";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

const schema = z.object({ pinned: z.boolean().default(true), importance: z.number().int().min(0).max(10).optional(), actor: z.string().trim().min(1).optional() });

/** POST /api/memory/records/[id]/pin — pin/unpin a memory (weighs more in recall). */
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
    await pinMemory({ id, pinned: parsed.data.pinned, importance: parsed.data.importance, actor: auth });
    return NextResponse.json({ ok: true, status: parsed.data.pinned ? "pinned" : "unpinned" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = /personal memory bank/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
