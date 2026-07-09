import { NextResponse } from "next/server";
import { z } from "zod";
import { runAuditRoadmap } from "@/lib/audit-roadmap";
import { listAudits } from "@/lib/free-audit";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  businessName: z.string().trim().min(1),
  industry: z.string().trim().min(1).optional(),
  companyId: z.string().trim().min(1).optional(),
  pitchAuditId: z.string().trim().min(1).optional(),
  stakeholders: z.array(z.object({ name: z.string().trim().min(1).optional(), role: z.string().trim().min(1) })).default([]),
  freeCallNotes: z.string().trim().min(1).optional(),
});

/** GET /api/audit/roadmap — list Doc-2 internal roadmaps. */
export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const audits = await listAudits({ kind: "roadmap", limit: 100 });
    return NextResponse.json({ ok: true, audits });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/**
 * POST /api/audit/roadmap — Doc 2 (INTERNAL): the interview roadmap for how we run the paid audit.
 * Reads only this client's Doc 1 pitch. Works without a model key (deterministic fallback).
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
    const result = await runAuditRoadmap({ ...parsed.data, createdBy: auth });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
