import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueKnowledgeCompileJob } from "@/lib/knowledge";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ sourceId: z.string().trim().min(1) });

/** POST /api/knowledge/compile — compile an approved source into knowledge notes (async job). */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
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
    const job = await enqueueKnowledgeCompileJob({ sourceId: parsed.data.sourceId, triggeredBy: auth });
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
