import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { getQualificationDetail, listQualifications, runQualification } from "@/lib/qualification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The 8-agent qualification council, finally reachable.
 *
 * `runQualification` has existed for a long time and was callable from exactly two CLI scripts, so in
 * normal use every client in the OS showed "qualification: -" and eight specialist agents (real
 * problem, budget, urgency, access, willingness to learn, phased implementation, high-value first
 * workflow, operational complexity) produced nothing. This route is the missing door.
 *
 * GET  - past assessments, newest first, with the per-role breakdown of the latest.
 * POST - run the council now. Costs 8 cheap model calls, so it is an explicit action.
 */

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { companyId } = await context.params;
  try {
    const assessments = await listQualifications(companyId, 10);
    const latest = assessments[0];
    const roles = latest ? await getQualificationDetail(latest.id) : [];
    return NextResponse.json({ ok: true, assessments, latest: latest ?? null, roles });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { companyId } = await context.params;
  try {
    // Each run is a new VERSION rather than an overwrite, so a re-qualification after a call can be
    // compared against the one taken off the form alone.
    const { assessment, roles } = await runQualification(companyId, { actor: auth });
    return NextResponse.json({ ok: true, assessment, roles }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
