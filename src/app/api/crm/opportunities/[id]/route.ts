import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { crmOpportunities } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { sanitizeHouseStyle } from "@/lib/domain/house-style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/opportunities/[id] — edit a deal's commercial fields from wherever you are.
 *
 * The pipeline read USD 0 because nothing could ever set a deal's value: it was written once at
 * creation and never again. A forecast built on zeroes is worse than no forecast, because it looks
 * like a number.
 */
const patchSchema = z
  .object({
    valueCents: z.number().int().min(0).optional(),
    currency: z.string().trim().min(1).max(8).optional(),
    probability: z.number().int().min(0).max(100).optional(),
    expectedCloseAt: z.string().datetime().optional().nullable(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    name: z.string().trim().min(1).max(300).optional(),
    painPoints: z.string().trim().max(4000).optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "nothing to change" });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "validation failed" }, { status: 422 });

  const { expectedCloseAt, painPoints, ...rest } = parsed.data;
  const fields: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (expectedCloseAt !== undefined) fields.expectedCloseAt = expectedCloseAt ? new Date(expectedCloseAt) : null;
  if (painPoints !== undefined) fields.painPoints = painPoints === null ? null : sanitizeHouseStyle(painPoints);

  try {
    const updated = await getDb()
      .update(crmOpportunities)
      .set(fields)
      .where(and(eq(crmOpportunities.id, id), isNull(crmOpportunities.archivedAt)))
      .returning({ id: crmOpportunities.id, companyId: crmOpportunities.companyId, valueCents: crmOpportunities.valueCents, currency: crmOpportunities.currency });
    if (!updated.length) return NextResponse.json({ ok: false, error: "opportunity not found" }, { status: 404 });

    await writeAuditEvent({
      eventType: "crm.opportunity.updated",
      module: "crm",
      entityType: "crm_opportunity",
      entityId: id,
      actor: auth,
      metadata: { fields: Object.keys(fields).filter((k) => k !== "updatedAt"), companyId: updated[0].companyId },
    });

    return NextResponse.json({ ok: true, opportunity: updated[0] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
