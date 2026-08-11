import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { crmOpportunities } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { getWorklist } from "@/lib/client-worklist";
import { sanitizeHouseStyle } from "@/lib/domain/house-style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/crm/worklist — every client ranked by what needs a founder today.
 * POST /api/crm/worklist — commit the next action on a deal (what and when).
 *
 * The next action lives on the opportunity because that is where the pipeline already reads it. Writing
 * it here rather than on a separate reminders table means the worklist, the deal and the client
 * container can never disagree about what was promised.
 */

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    return NextResponse.json({ ok: true, ...(await getWorklist()) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

const setNextActionSchema = z.object({
  opportunityId: z.string().trim().min(1),
  nextAction: z.string().trim().min(3).max(400),
  /** ISO date. Omitted means "no date", which the worklist treats as uncommitted rather than overdue. */
  nextActionAt: z.string().trim().datetime().optional().nullable(),
});

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = setNextActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "validation failed" }, { status: 422 });

  try {
    const db = getDb();
    const nextAction = sanitizeHouseStyle(parsed.data.nextAction);
    const nextActionAt = parsed.data.nextActionAt ? new Date(parsed.data.nextActionAt) : null;
    const updated = await db
      .update(crmOpportunities)
      .set({ nextAction, nextActionAt, updatedAt: new Date() })
      .where(and(eq(crmOpportunities.id, parsed.data.opportunityId), isNull(crmOpportunities.archivedAt)))
      .returning({ id: crmOpportunities.id, companyId: crmOpportunities.companyId });

    if (!updated.length) return NextResponse.json({ ok: false, error: "opportunity not found" }, { status: 404 });

    await writeAuditEvent({
      eventType: "crm.next_action.set",
      module: "crm",
      entityType: "opportunity",
      entityId: parsed.data.opportunityId,
      actor: auth,
      metadata: { nextAction, nextActionAt: nextActionAt?.toISOString() ?? null, companyId: updated[0].companyId },
    });

    return NextResponse.json({ ok: true, opportunityId: updated[0].id, nextAction, nextActionAt: nextActionAt?.toISOString() ?? null });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
