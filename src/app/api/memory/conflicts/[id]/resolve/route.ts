import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveMemoryConflict } from "@/lib/memory";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

const schema = z.object({
  resolution: z.enum(["keep_new", "keep_existing", "keep_both", "merged"]),
  resolvedBy: z.string().trim().min(1).optional(),
});

/** POST /api/memory/conflicts/[id]/resolve — resolve a flagged conflict. */
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
    await resolveMemoryConflict({ conflictId: id, resolution: parsed.data.resolution, resolvedBy: auth });
    return NextResponse.json({ ok: true, status: "resolved", resolution: parsed.data.resolution });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = /not found/i.test(message) ? 404 : /already/i.test(message) ? 409 : /personal memory bank/i.test(message) ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
