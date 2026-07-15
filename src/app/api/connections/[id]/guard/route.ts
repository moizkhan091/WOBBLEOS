import { NextResponse } from "next/server";
import { z } from "zod";
import { guardConnection } from "@/lib/connections";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

const guardBodySchema = z.object({
  module: z.string().trim().min(1),
  action: z.string().trim().min(1).optional(),
});

/** POST /api/connections/[id]/guard - verify if a module/action may use this connection. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = guardBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const decision = await guardConnection({ slug: id, ...parsed.data });
    return NextResponse.json({ ok: true, decision }, { status: decision.allowed ? 200 : 423 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
