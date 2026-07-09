import { NextResponse } from "next/server";
import { z } from "zod";
import { createProposalFromAudit } from "@/lib/proposals";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ auditId: z.string().trim().min(1) });

/** POST /api/proposals/from-audit — assemble a proposal from an audit's findings. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const proposal = await createProposalFromAudit(parsed.data.auditId, { createdBy: auth });
    if (!proposal) return NextResponse.json({ ok: false, error: "audit not found" }, { status: 404 });
    return NextResponse.json({ ok: true, proposal }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
