import { desc, isNull } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { crmCompanies, proposals } from "@/db/schema";
import { pricingHistory, type ComparableQuery, type PastPrice, type PricingHistory } from "@/lib/domain/pricing-memory";
import type { PricingState } from "@/lib/domain/pricing-gate";

/**
 * Reading every price a founder has actually decided, out of the proposals that carry them.
 *
 * No new table: a priced decision already lives on its proposal with the reasoning and the name
 * attached, and a separate ledger would be one more thing to drift. One query, then pure ranking.
 */
export async function loadPastPrices(db: Db = getDb()): Promise<PastPrice[]> {
  const rows = await db
    .select({
      id: proposals.id,
      companyId: proposals.companyId,
      currency: proposals.currency,
      status: proposals.status,
      services: proposals.services,
      metadata: proposals.metadata,
    })
    .from(proposals)
    .where(isNull(proposals.archivedAt))
    .orderBy(desc(proposals.createdAt))
    .limit(300);

  const companyIds = [...new Set(rows.map((r) => r.companyId).filter((x): x is string => Boolean(x)))];
  const companies = companyIds.length
    ? await db.select({ id: crmCompanies.id, name: crmCompanies.name, industry: crmCompanies.industry }).from(crmCompanies).where(isNull(crmCompanies.archivedAt)).limit(500)
    : [];
  const byId = new Map(companies.map((c) => [c.id, c]));

  const out: PastPrice[] = [];
  for (const r of rows) {
    const state = ((r.metadata ?? {}) as Record<string, unknown>).pricing as PricingState | undefined;
    // Only DECIDED prices count. An unpriced draft says nothing about what we charge.
    if (!state?.decision) continue;
    const co = r.companyId ? byId.get(r.companyId) : undefined;
    out.push({
      proposalId: r.id,
      companyId: r.companyId,
      clientName: co?.name ?? "a client",
      industry: co?.industry ?? null,
      oneOffCents: state.decision.oneOffCents,
      monthlyCents: state.decision.monthlyCents,
      currency: state.decision.currency || r.currency,
      costOneOffCents: state.cost?.oneOffCents ?? null,
      costMonthlyCents: state.cost?.monthlyCents ?? null,
      reasoning: state.decision.reasoning,
      decidedBy: state.decision.decidedBy,
      decidedAt: state.decision.decidedAt ?? "",
      itemCount: (r.services ?? []).length,
      outcome: r.status === "accepted" ? "accepted" : r.status === "rejected" ? "rejected" : r.status === "expired" ? "expired" : "open",
    });
  }
  return out;
}

/** What we have charged for work like this, excluding the proposal being priced. */
export async function historyFor(query: ComparableQuery, excludeProposalId?: string, db: Db = getDb()): Promise<PricingHistory> {
  const past = (await loadPastPrices(db)).filter((p) => p.proposalId !== excludeProposalId);
  return pricingHistory(past, query);
}
