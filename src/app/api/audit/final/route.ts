import { NextResponse } from "next/server";
import { z } from "zod";
import { runFinalAudit } from "@/lib/audit-final";
import { listAudits } from "@/lib/free-audit";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  businessName: z.string().trim().min(1),
  industry: z.string().trim().min(1).optional(),
  companyId: z.string().trim().min(1).optional(),
  pitchAuditId: z.string().trim().min(1).optional(),
  roadmapAuditId: z.string().trim().min(1).optional(),
  findings: z.array(z.object({ stakeholder: z.string().trim().min(1), notes: z.string().trim().min(1) })).default([]),
  extraNotes: z.string().trim().min(1).optional(),
});

/** GET /api/audit/final — the final decks are persisted as kind="paid". */
export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  try {
    const audits = await listAudits({ kind: "paid", limit: 100 });
    return NextResponse.json({ ok: true, audits });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/**
 * POST /api/audit/final — Doc 3: the final client deck. Gathers this client's Doc 1 + Doc 2 + the
 * recorded interview findings and runs the deep paid-audit graph. Runs live on OPENROUTER_API_KEY.
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
    const result = await runFinalAudit({ ...parsed.data, requestedBy: auth });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const isConfig = /not configured|OPENROUTER|provider connection/i.test(message);
    return NextResponse.json({ ok: false, error: message, needsModelKey: isConfig }, { status: isConfig ? 502 : 500 });
  }
}
