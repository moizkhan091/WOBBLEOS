import { NextResponse } from "next/server";
import { z } from "zod";
import { runPaidAuditGraph } from "@/lib/paid-audit-graph";
import { listAudits } from "@/lib/free-audit";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  businessName: z.string().trim().min(1),
  industry: z.string().trim().min(1).optional(),
  intakeNotes: z.string().trim().min(1),
  freeAuditSummary: z.string().trim().min(1).optional(),
  companyId: z.string().trim().min(1).optional(),
  opportunityId: z.string().trim().min(1).optional(),
});

/** GET /api/audit/paid — list paid audits. */
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
 * POST /api/audit/paid — run the McKinsey-depth paid-audit agent team over stakeholder intake.
 * Runs live only when OPENROUTER_API_KEY is set (the LLM provider throws otherwise) — returned as a
 * clear 502 so the UI can prompt to configure it. No stub, no silent spend.
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
    const result = await runPaidAuditGraph({ ...parsed.data, requestedBy: auth });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const isConfig = /not configured|OPENROUTER|provider connection/i.test(message);
    return NextResponse.json({ ok: false, error: message, needsModelKey: isConfig }, { status: isConfig ? 502 : 500 });
  }
}
