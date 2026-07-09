import { NextResponse } from "next/server";
import { z } from "zod";
import { runPitch } from "@/lib/pitch";
import { listAudits } from "@/lib/free-audit";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  businessName: z.string().trim().min(1),
  industry: z.string().trim().min(1).optional(),
  companyId: z.string().trim().min(1).optional(),
  website: z.string().trim().min(1).optional(),
  instagram: z.string().trim().min(1).optional(),
  problems: z.array(z.string().trim().min(1)).default([]),
  signals: z.array(z.string().trim().min(1)).default([]),
});

/** GET /api/audit/pitch — list Doc-1 pitches. */
export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const audits = await listAudits({ kind: "pitch", limit: 100 });
    return NextResponse.json({ ok: true, audits });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/**
 * POST /api/audit/pitch — Doc 1: build the niche-customized "what Wobble can do" pitch (free-audit
 * diagnosis + scraped signals + an LLM). Works without a model key (deterministic fallback).
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const result = await runPitch({ ...parsed.data, createdBy: auth });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
