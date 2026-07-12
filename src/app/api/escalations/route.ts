import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { listEscalations, escalationStatusCounts } from "@/lib/departments/escalation";
import { ESCALATION_STATUSES, type EscalationStatus } from "@/lib/domain/escalation";

export const dynamic = "force-dynamic";

/**
 * GET /api/escalations — the Founder Command Centre escalation queue. Filter by department / status /
 * reason; includes live status counts. Founder-only.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const p = new URL(request.url).searchParams;
  const status = p.get("status");
  if (status && !ESCALATION_STATUSES.includes(status as EscalationStatus)) {
    return NextResponse.json({ ok: false, error: `invalid status '${status}'` }, { status: 422 });
  }
  const limitRaw = Number(p.get("limit"));
  try {
    const [escalations, counts] = await Promise.all([
      listEscalations({ departmentSlug: p.get("department") ?? undefined, status: (status as EscalationStatus) ?? undefined, reason: p.get("reason") ?? undefined, limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined }),
      escalationStatusCounts(),
    ]);
    return NextResponse.json({ ok: true, counts, escalations });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
