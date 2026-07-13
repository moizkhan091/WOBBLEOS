/**
 * Real-DB proof (Postgres) that AIOS Value REVENUE is an HONEST measured actual from the PAYMENTS LEDGER:
 *   - revenue = payments RECEIVED IN PERIOD against NON-VOID invoices (tier `verified-financial`);
 *   - a payment against a CANCELLED/refunded/written-off invoice is EXCLUDED (never fabricated revenue) [HIGH fix];
 *   - an installment paid PARTLY last period counts only the in-period payment, not the cumulative total [MEDIUM fix];
 *   - a client with NO non-void payment ever → revenue NULL (no financial actual yet).
 *
 * ISOLATED + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-aios-org-metrics-db.ts
 */
import { inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { invoices as invoicesTable, payments as paymentsTable } from "@/db/schema";
import { getAiosValueSnapshot, makeFinanceOrgMetrics } from "@/lib/aios-value";
import type { AiosValueScope } from "@/lib/domain/aios-value";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const now = new Date();
  const inPeriod = new Date(now.getTime() - 5 * 86_400_000);
  const outPeriod = new Date(now.getTime() - 60 * 86_400_000);
  const clientX = `aiosX_${uniq}`, clientY = `aiosY_${uniq}`, clientZ = `aiosZ_${uniq}`;
  const invIds = [`inv_a_${uniq}`, `inv_b_${uniq}`, `inv_c_${uniq}`, `inv_d_${uniq}`, `inv_e_${uniq}`, `inv_g_${uniq}`];
  const payIds = [`pay_a_${uniq}`, `pay_b_${uniq}`, `pay_c_${uniq}`, `pay_d_${uniq}`, `pay_g1_${uniq}`, `pay_g2_${uniq}`];

  const mkInvoice = (id: string, companyId: string, num: string, total: number, amountPaidCents: number, status: string) => ({
    id, invoiceNumber: num, companyId, billingDetails: {}, lineItems: [], currency: "USD", subtotalCents: total, taxCents: 0, discountCents: 0, totalCents: total, amountPaidCents, status, metadata: {}, createdAt: outPeriod, updatedAt: now,
  });
  const mkPayment = (id: string, invoiceId: string, amountCents: number, createdAt: Date) => ({ id, invoiceId, amountCents, method: "bank_transfer", metadata: {}, createdAt });

  try {
    await db.insert(invoicesTable).values([
      mkInvoice(invIds[0], clientX, `INV-A-${uniq}`, 100_000, 100_000, "paid"),            // paid, in-period payment
      mkInvoice(invIds[1], clientX, `INV-B-${uniq}`, 80_000, 50_000, "partially_paid"),    // partial, in-period payment
      mkInvoice(invIds[2], clientX, `INV-C-${uniq}`, 99_999, 99_999, "paid"),              // paid, OUT-of-period payment
      mkInvoice(invIds[3], clientX, `INV-D-${uniq}`, 30_000, 30_000, "cancelled"),         // VOID — payment must be excluded
      mkInvoice(invIds[4], clientY, `INV-E-${uniq}`, 40_000, 0, "sent"),                   // client Y — never paid
      mkInvoice(invIds[5], clientZ, `INV-G-${uniq}`, 100_000, 100_000, "paid"),            // installment: 40k out + 60k in
    ] as never);
    await db.insert(paymentsTable).values([
      mkPayment(payIds[0], invIds[0], 100_000, inPeriod),
      mkPayment(payIds[1], invIds[1], 50_000, inPeriod),
      mkPayment(payIds[2], invIds[2], 99_999, outPeriod),
      mkPayment(payIds[3], invIds[3], 30_000, inPeriod),   // against the CANCELLED invoice
      mkPayment(payIds[4], invIds[5], 40_000, outPeriod),  // installment 1 (out of period)
      mkPayment(payIds[5], invIds[5], 60_000, inPeriod),   // installment 2 (in period)
    ] as never);

    const orgMetrics = makeFinanceOrgMetrics({ now, founders: ["Moiz", "Ali", "Ibrahim", "Haad"] });
    const revPerEmp = (s: Awaited<ReturnType<typeof getAiosValueSnapshot>>) => s.kpis.find((k) => k.key === "revenue_per_employee")!;

    const kX = revPerEmp(await getAiosValueSnapshot({ type: "client", id: clientX }, { orgMetrics }));
    // Non-void, in-period payments for X: 100k (A) + 50k (B) = 150k. C is out-of-period; D is against a CANCELLED invoice.
    assert(kX.value === Math.round(150_000 / 1 / 4), "HIGH fix: revenue = non-void payments received IN PERIOD (100k + 50k = 150k) ÷ 4 = 37,500¢ — the CANCELLED invoice's payment + the out-of-period payment are EXCLUDED");
    assert(kX.evidenceTier === "verified-financial" && kX.isEstimate === false, "the revenue KPI is `verified-financial` (real received payments) — a MEASURED actual, not an estimate");

    const kZ = revPerEmp(await getAiosValueSnapshot({ type: "client", id: clientZ }, { orgMetrics }));
    // Installment invoice G: only the in-period payment (60k) counts — NOT the cumulative 100k.
    assert(kZ.value === Math.round(60_000 / 1 / 4), "MEDIUM fix: an installment counts only the IN-PERIOD payment (60k) — NOT the cumulative amountPaidCents (100k)");

    const kY = revPerEmp(await getAiosValueSnapshot({ type: "client", id: clientY } as AiosValueScope, { orgMetrics }));
    assert(kY.value === null, "a client with NO non-void payment ever → revenue/employee is NULL (no financial actual yet — never a fabricated 0)");

    console.log("\n✅ aios-org-metrics DB proof passed");
  } finally {
    await db.delete(paymentsTable).where(inArray(paymentsTable.id, payIds));
    await db.delete(invoicesTable).where(inArray(invoicesTable.id, invIds));
    await closeDb();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
