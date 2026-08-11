import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, inArray, isNull, and } from "drizzle-orm";
import { getDb } from "@/db";
import { crmCompanies } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { sanitizeHouseStyle } from "@/lib/domain/house-style";
import { locationsSchema, referralSchema, describeLocations } from "@/lib/domain/client-relationships";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/org/[companyId]/relationships — who referred them, the sites they run, and who they have
 *      referred to us in turn.
 * POST — record a referral or replace the site list.
 *
 * A container assumed one business at one address. A three-clinic client with one shared front desk is
 * a different job from three independent branches, and the audit needs to know which.
 */

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { companyId } = await context.params;

  try {
    const db = getDb();
    const [company] = await db.select({ id: crmCompanies.id, name: crmCompanies.name, metadata: crmCompanies.metadata }).from(crmCompanies).where(eq(crmCompanies.id, companyId)).limit(1);
    if (!company) return NextResponse.json({ ok: false, error: "company not found" }, { status: 404 });

    const metadata = (company.metadata ?? {}) as Record<string, unknown>;
    const referral = referralSchema.safeParse(metadata.referral);
    const locations = locationsSchema.safeParse(metadata.locations ?? []);

    // Who this client has sent to us. Worth seeing on their container: it is the strongest argument for
    // spending time on them, and nothing else in the OS records it.
    const all = await db.select({ id: crmCompanies.id, name: crmCompanies.name, metadata: crmCompanies.metadata }).from(crmCompanies).where(isNull(crmCompanies.archivedAt)).limit(500);
    const referredHere = all
      .filter((c) => ((c.metadata ?? {}) as Record<string, unknown>).referral && (((c.metadata as Record<string, unknown>).referral as Record<string, unknown>).referredByCompanyId === companyId))
      .map((c) => ({ id: c.id, name: c.name }));

    let referrerName: string | null = referral.success ? referral.data.referredByName : null;
    if (referral.success && referral.data.referredByCompanyId) {
      const [r] = await db.select({ name: crmCompanies.name }).from(crmCompanies).where(eq(crmCompanies.id, referral.data.referredByCompanyId)).limit(1);
      if (r) referrerName = r.name;
    }

    const sites = locations.success ? locations.data : [];
    return NextResponse.json({
      ok: true,
      referral: referral.success ? { ...referral.data, referredByName: referrerName ?? referral.data.referredByName } : null,
      referredHere,
      locations: sites,
      locationSummary: describeLocations(sites),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

const postSchema = z.union([
  z.object({ action: z.literal("referral"), referral: referralSchema }),
  z.object({ action: z.literal("locations"), locations: locationsSchema }),
]);

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { companyId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "validation failed" }, { status: 422 });

  try {
    const db = getDb();
    const [company] = await db.select({ metadata: crmCompanies.metadata }).from(crmCompanies).where(eq(crmCompanies.id, companyId)).limit(1);
    if (!company) return NextResponse.json({ ok: false, error: "company not found" }, { status: 404 });

    const now = new Date();
    const metadata = { ...((company.metadata ?? {}) as Record<string, unknown>) };

    if (parsed.data.action === "referral") {
      const r = parsed.data.referral;
      if (r.referredByCompanyId === companyId) return NextResponse.json({ ok: false, error: "a client cannot have referred themselves" }, { status: 422 });
      if (r.referredByCompanyId) {
        const found = await db.select({ id: crmCompanies.id }).from(crmCompanies).where(and(inArray(crmCompanies.id, [r.referredByCompanyId]), isNull(crmCompanies.archivedAt)));
        if (!found.length) return NextResponse.json({ ok: false, error: "the referring client does not exist" }, { status: 422 });
      }
      metadata.referral = { ...r, note: r.note ? sanitizeHouseStyle(r.note) : undefined, at: r.at ?? now.toISOString() };
    } else {
      metadata.locations = parsed.data.locations.map((l) => ({ ...l, note: l.note ? sanitizeHouseStyle(l.note) : undefined }));
    }

    await db.update(crmCompanies).set({ metadata, updatedAt: now }).where(eq(crmCompanies.id, companyId));
    await writeAuditEvent({ eventType: `crm.company.${parsed.data.action}_set`, module: "crm", entityType: "crm_company", entityId: companyId, actor: auth, metadata: { action: parsed.data.action } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
