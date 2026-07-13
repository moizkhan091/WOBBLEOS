import { NextResponse } from "next/server";
import { z } from "zod";
import { recordContextSource, extractAssertions } from "@/lib/context-os";
import { CONTEXT_SCOPES } from "@/lib/domain/context-os";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  kind: z.string().trim().min(1),
  content: z.string().trim().min(1),
  scope: z.object({ type: z.enum(CONTEXT_SCOPES), id: z.string().trim().min(1) }),
  classification: z.string().trim().min(1).optional(),
  // Optional extractor output — structured assertions land PENDING (raw is never auto-trusted).
  assertions: z.array(z.object({ statement: z.string().trim().min(1), entities: z.array(z.string().trim().min(1)).default([]), classification: z.string().trim().optional(), trust: z.number().min(0).max(1).optional() })).optional(),
});

/** POST /api/context/sources — record an IMMUTABLE raw intake source (+ optionally extract pending assertions). Founder-gated. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const source = await recordContextSource({ kind: parsed.data.kind, content: parsed.data.content, scope: parsed.data.scope, classification: parsed.data.classification, importedBy: auth });
    const assertions = parsed.data.assertions?.length ? await extractAssertions(source.id, parsed.data.assertions) : [];
    return NextResponse.json({ ok: true, source, assertions }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
