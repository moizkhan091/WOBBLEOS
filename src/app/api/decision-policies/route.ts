import { NextResponse } from "next/server";
import { z } from "zod";
import { listDecisionPolicies, proposeDecisionPolicies } from "@/lib/decision-learning";
import { POLICY_SCOPES, POLICY_STATUSES, type PolicyScope, type PolicyStatus } from "@/lib/domain/decision-learning";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List derived Decision-Learning policies (proposed/active/…), optionally filtered by scope/status. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const u = new URL(request.url);
  const scope = u.searchParams.get("scope") as PolicyScope | null;
  const status = u.searchParams.get("status") as PolicyStatus | null;
  try {
    let policies = await listDecisionPolicies({
      scope: scope && POLICY_SCOPES.includes(scope) ? scope : undefined,
      scopeId: u.searchParams.get("scopeId") ?? undefined,
      category: u.searchParams.get("category") ?? undefined,
    });
    if (status && POLICY_STATUSES.includes(status)) policies = policies.filter((p) => p.status === status);
    return NextResponse.json({ ok: true, policies });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

const proposeSchema = z.object({ action: z.literal("propose"), minRepetitions: z.number().int().min(2).max(50).optional() });

/** Derive fresh policy PROPOSALS from committed decisions on demand (never auto-applied). Founder-gated. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = proposeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const inserted = await proposeDecisionPolicies({ minRepetitions: parsed.data.minRepetitions });
    return NextResponse.json({ ok: true, proposed: inserted.length, policies: inserted }, { status: inserted.length ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
