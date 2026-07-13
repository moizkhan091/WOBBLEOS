/**
 * Real-DB proof (Postgres) that AIOS Value REVENUE is now a MEASURED ACTUAL from real paid invoices (not honest-null):
 *   real paid invoices for a client → the AIOS snapshot's revenue is the sum of amounts PAID IN THE PERIOD, tier
 *   `verified-financial`; invoices paid OUTSIDE the period are excluded; a client with NO ever-paid invoice keeps
 *   revenue NULL (no financial actual yet — never a fabricated 0). Headcount/rate stay honestly null (HR not wired).
 *
 * ISOLATED + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-aios-org-metrics-db.ts
 */
import { inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { invoices as invoicesTable } from "@/db/schema";
import { getAiosValueSnapshot, makeFinanceOrgMetrics } from "@/lib/aios-value";
import type { AiosValueScope } from "@/lib/domain/aios-value";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const now = new Date();
  const clientX = `aiosX_${uniq}`, clientY = `aiosY_${uniq}`;
  const inPeriod = new Date(now.getTime() - 5 * 86_400_000);
  const outPeriod = new Date(now.getTime() - 60 * 86_400_000);
  const ids = [`inv_a_${uniq}`, `inv_b_${uniq}`, `inv_c_${uniq}`, `inv_d_${uniq}`];

  const mkInvoice = (id: string, companyId: string, num: string, amountPaidCents: number, paidAt: Date | null, status: string) => ({
    id, invoiceNumber: num, companyId, billingDetails: {}, lineItems: [], currency: "USD", subtotalCents: amountPaidCents, taxCents: 0, discountCents: 0, totalCents: amountPaidCents, amountPaidCents, status, paidAt, metadata: {}, createdAt: outPeriod, updatedAt: now,
  });

  try {
    await db.insert(invoicesTable).values([
      mkInvoice(ids[0], clientX, `INV-A-${uniq}`, 100_000, inPeriod, "paid"),   // in period
      mkInvoice(ids[1], clientX, `INV-B-${uniq}`, 50_000, inPeriod, "paid"),    // in period
      mkInvoice(ids[2], clientX, `INV-C-${uniq}`, 99_999, outPeriod, "paid"),   // OUT of period
      mkInvoice(ids[3], clientY, `INV-D-${uniq}`, 0, null, "sent"),             // client Y — never paid
    ] as never);

    // 4 founders → headcount 4, so revenue/employee is computable from the real revenue.
    const orgMetrics = makeFinanceOrgMetrics({ now, founders: ["Moiz", "Ali", "Ibrahim", "Haad"] });
    const scopeX: AiosValueScope = { type: "client", id: clientX };
    const scopeY: AiosValueScope = { type: "client", id: clientY };
    const revPerEmp = (s: Awaited<ReturnType<typeof getAiosValueSnapshot>>) => s.kpis.find((k) => k.key === "revenue_per_employee");

    const snapX = await getAiosValueSnapshot(scopeX, { orgMetrics });
    const kX = revPerEmp(snapX)!;
    // revenue = 100k + 50k = 150k (in period); the out-of-period invoice is excluded. /1 month /4 headcount = 37,500.
    assert(kX.value === Math.round(150_000 / 1 / 4), "REVENUE is a measured actual: revenue/employee = 150k (paid IN PERIOD) ÷ 4 = 37,500¢ — the out-of-period invoice is excluded");
    assert(kX.evidenceTier === "verified-financial" && kX.isEstimate === false, "the revenue KPI is `verified-financial` (real paid invoices) — a MEASURED actual, not an estimate");

    // A client with NO ever-paid invoice → the revenue KPI is honestly NULL (no fabricated 0).
    const snapY = await getAiosValueSnapshot(scopeY, { orgMetrics });
    assert(revPerEmp(snapY)!.value === null, "a client with NO ever-paid invoice → revenue/employee is NULL (no financial actual yet — never a fabricated 0)");

    console.log("\n✅ aios-org-metrics DB proof passed");
  } finally {
    await db.delete(invoicesTable).where(inArray(invoicesTable.id, ids));
    await closeDb();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
