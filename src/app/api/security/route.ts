import { NextResponse } from "next/server";
import { z } from "zod";
import { listFindings, listIncidents, listRisks, listKillSwitches, runGovernanceReview } from "@/lib/security-governance";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/security — the Security & Governance workspace state (WOB-UAT-024).
 *
 * Founder-gated (WOB-UAT-029: the edge proxy is JWT-signature-only, so without this a revoked session
 * would read the security posture of the company for the life of its token).
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const [findings, incidents, risks, switches] = await Promise.all([listFindings({ limit: 100 }), listIncidents({ limit: 50 }), listRisks({ limit: 50 }), listKillSwitches()]);
    const open = findings.filter((f) => !["resolved", "false_positive", "accepted_risk"].includes(f.status));
    return NextResponse.json({
      ok: true,
      summary: {
        openFindings: open.length,
        critical: open.filter((f) => f.severity === "critical").length,
        high: open.filter((f) => f.severity === "high").length,
        openIncidents: incidents.filter((i) => !["resolved", "closed"].includes(i.status)).length,
        openRisks: risks.filter((r) => r.status !== "closed").length,
        engagedKillSwitches: switches.filter((s) => s.state === "disabled").length,
      },
      findings,
      incidents,
      risks,
      killSwitches: switches,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

const runSchema = z.object({ action: z.literal("run_governance_review") });

/**
 * POST /api/security — run a governance review on demand.
 *
 * The review is DETERMINISTIC: it reads real accounts, sessions, budget caps, autonomy policies and
 * department grants, and applies pure rules. A founder can reproduce every finding from the evidence it
 * carries without a model call, and a check that could not run is reported as `skipped` rather than
 * silently counted as clean.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = runSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const run = await runGovernanceReview({ requestedBy: auth });
    return NextResponse.json({ ok: true, run }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
