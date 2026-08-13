import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { crmCompanies, crmOpportunities } from "@/db/schema";
import { lossPattern, type LossPattern, type LostDeal } from "@/lib/domain/loss-patterns";

/**
 * Read every lost deal's reason and group them.
 *
 * One query for the deals and one for the company names, never one per deal: this runs inside the
 * daily brief, and a per-row lookup in a brief provider is how a nightly job turns into a timeout.
 */
export async function getLossPattern(opts: { limit?: number } = {}, db: Db = getDb()): Promise<LossPattern> {
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 500);

  const [lostRows, wonRows] = await Promise.all([
    db
      .select({
        id: crmOpportunities.id,
        companyId: crmOpportunities.companyId,
        lostReason: crmOpportunities.lostReason,
        valueCents: crmOpportunities.valueCents,
        currency: crmOpportunities.currency,
        updatedAt: crmOpportunities.updatedAt,
      })
      .from(crmOpportunities)
      .where(and(eq(crmOpportunities.status, "lost"), isNull(crmOpportunities.archivedAt)))
      .orderBy(desc(crmOpportunities.updatedAt))
      .limit(limit),
    db
      .select({ id: crmOpportunities.id })
      .from(crmOpportunities)
      .where(and(eq(crmOpportunities.status, "won"), isNull(crmOpportunities.archivedAt)))
      .limit(limit),
  ]);

  const companyIds = [...new Set(lostRows.map((r) => r.companyId).filter((x): x is string => Boolean(x)))];
  const nameById = new Map<string, { name: string; industry: string | null }>();
  if (companyIds.length) {
    const companies = await db
      .select({ id: crmCompanies.id, name: crmCompanies.name, industry: crmCompanies.industry })
      .from(crmCompanies)
      .where(inArray(crmCompanies.id, companyIds));
    for (const c of companies) nameById.set(c.id, { name: c.name, industry: c.industry ?? null });
  }

  const lost: LostDeal[] = lostRows.map((r) => ({
    opportunityId: r.id,
    companyId: r.companyId ?? null,
    companyName: (r.companyId ? nameById.get(r.companyId)?.name : null) ?? "a client",
    reason: r.lostReason ?? "",
    valueCents: r.valueCents ?? 0,
    currency: r.currency ?? "USD",
    lostAt: r.updatedAt ?? null,
    industry: (r.companyId ? nameById.get(r.companyId)?.industry : null) ?? null,
  }));

  return lossPattern(lost, wonRows.length);
}
