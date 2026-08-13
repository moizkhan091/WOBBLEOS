/**
 * Re-split the phases of already-priced proposals across the price a founder actually decided.
 *
 * The phase money is computed when a proposal is built, from the audit's implementation guess. The
 * pricing gate then makes a founder decide the real number, and nothing was recomputing the phases,
 * so a proposal priced at PKR 45,000 kept displaying phases adding up to PKR 4.5M. New decisions
 * recompute themselves now; the rows already sitting in the database do not.
 *
 * Only proposals with BOTH a recorded decision and stored phases are touched. Undecided proposals are
 * left exactly as they are: their phases still show the audit's estimate, which is the correct thing
 * to show while nobody has chosen a price.
 *
 * Usage: npx tsx src/scripts/backfill-phase-prices.ts [--apply]
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { crmCompanies, proposals } from "@/db/schema";
import { phaseOneWithinAuthority, rephasePrice } from "@/lib/domain/proposal-phasing";
import type { PricingState } from "@/lib/domain/pricing-gate";

const APPLY = process.argv.includes("--apply");

type StoredPhase = { number: number; name: string; rationale: string; items: string[]; valueShare?: number; priceCents: number };

async function main() {
  const db = getDb();
  const rows = await db.select().from(proposals);
  const authorityByCompany = new Map<string, number | null>();
  let changed = 0;

  for (const p of rows) {
    const metadata = (p.metadata ?? {}) as Record<string, unknown>;
    const state = (metadata.pricing ?? null) as PricingState | null;
    const phases = Array.isArray(metadata.phases) ? (metadata.phases as StoredPhase[]) : null;
    if (!state?.decision || !phases?.length) continue;

    const decided = state.decision.oneOffCents;
    const current = phases.reduce((n, ph) => n + ph.priceCents, 0);
    if (current === decided) continue;

    const money = (c: number) => `${p.currency} ${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    changed++;
    process.stdout.write(`${p.id} ${p.title.slice(0, 44)}\n  phases said ${money(current)}, founder priced it at ${money(decided)}\n`);

    const next = rephasePrice(phases, decided);
    for (const ph of next) process.stdout.write(`    ${ph.name}: ${money(ph.priceCents)}\n`);

    if (!authorityByCompany.has(p.companyId ?? "")) {
      const [c] = p.companyId ? await db.select({ metadata: crmCompanies.metadata }).from(crmCompanies).where(eq(crmCompanies.id, p.companyId)).limit(1) : [undefined];
      const raw = ((c?.metadata ?? {}) as Record<string, unknown>).soloAuthorityCents;
      authorityByCompany.set(p.companyId ?? "", typeof raw === "number" && raw > 0 ? raw : null);
    }
    const authority = phaseOneWithinAuthority(next[0]?.priceCents ?? 0, authorityByCompany.get(p.companyId ?? "") ?? null);
    process.stdout.write(`    ${authority.because}\n`);

    if (APPLY) {
      await db
        .update(proposals)
        .set({ metadata: { ...metadata, phases: next, phaseOneAuthority: authority }, updatedAt: new Date() })
        .where(eq(proposals.id, p.id));
    }
  }

  process.stdout.write(`\n${changed} proposal(s) ${APPLY ? "re-split" : "would be re-split, run with --apply"}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
