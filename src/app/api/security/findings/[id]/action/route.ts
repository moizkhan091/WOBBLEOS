import { NextResponse } from "next/server";
import { z } from "zod";
import { actOnFinding, FINDING_ACTIONS } from "@/lib/security-governance";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(FINDING_ACTIONS),
  note: z.string().trim().min(1).optional(),
  /** What re-verified the fix. Required to resolve — see below. */
  closureProof: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/security/findings/[id]/action — a founder decision on a security finding.
 *
 * The actor comes from the SESSION and is never trusted from the body (WOB-UAT-030). `resolve` requires
 * closure proof or an explicit note: a finding merely marked done proves nothing, and "we fixed it"
 * without evidence is exactly the unverified claim this whole system exists to eliminate.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const result = await actOnFinding({ id, action: parsed.data.action, actor: auth, note: parsed.data.note, closureProof: parsed.data.closureProof });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, status: result.status });
}
