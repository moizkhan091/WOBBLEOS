import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { crmContacts } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { sanitizeHouseStyle } from "@/lib/domain/house-style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/crm/contacts/[id] — edit a contact, and log that you spoke to them.
 *
 * `touched: true` is the important one. Every silence signal in the OS (health score, the worklist
 * ranking, the quiet-client nudge) is measured from `lastContactedAt`, and until now nothing in the UI
 * could set it: a founder could call a client every day and the OS would still report them as cold.
 */

const patchSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200).optional(),
    role: z.string().trim().max(120).optional().nullable(),
    email: z.string().trim().email().optional().nullable(),
    phone: z.string().trim().max(60).optional().nullable(),
    whatsapp: z.string().trim().max(60).optional().nullable(),
    linkedin: z.string().trim().max(500).optional().nullable(),
    relationshipType: z.enum(["decision_maker", "influencer", "champion", "gatekeeper", "user", "other"]).optional(),
    preferredChannel: z.enum(["whatsapp", "email", "phone", "linkedin"]).optional().nullable(),
    notes: z.string().trim().max(4000).optional().nullable(),
    /** Mark that contact happened just now. */
    touched: z.boolean().optional(),
    /** Or state when it happened, for a call you are logging after the fact. */
    lastContactedAt: z.string().datetime().optional().nullable(),
    nextFollowUpAt: z.string().datetime().optional().nullable(),
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

  const { touched, lastContactedAt, nextFollowUpAt, notes, ...rest } = parsed.data;
  const now = new Date();
  const fields: Record<string, unknown> = { ...rest, updatedAt: now };
  if (notes !== undefined) fields.notes = notes === null ? null : sanitizeHouseStyle(notes);
  // An explicit date wins over "just now", so logging a call from Tuesday is not recorded as today.
  if (lastContactedAt !== undefined) fields.lastContactedAt = lastContactedAt ? new Date(lastContactedAt) : null;
  else if (touched) fields.lastContactedAt = now;
  if (nextFollowUpAt !== undefined) fields.nextFollowUpAt = nextFollowUpAt ? new Date(nextFollowUpAt) : null;

  try {
    const updated = await getDb().update(crmContacts).set(fields).where(eq(crmContacts.id, id)).returning({ id: crmContacts.id, companyId: crmContacts.companyId, lastContactedAt: crmContacts.lastContactedAt });
    if (!updated.length) return NextResponse.json({ ok: false, error: "contact not found" }, { status: 404 });

    await writeAuditEvent({
      eventType: touched || lastContactedAt !== undefined ? "crm.contact.touched" : "crm.contact.updated",
      module: "crm",
      entityType: "crm_contact",
      entityId: id,
      actor: auth,
      metadata: { companyId: updated[0].companyId, fields: Object.keys(fields).filter((k) => k !== "updatedAt") },
    });

    return NextResponse.json({ ok: true, contact: updated[0] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
