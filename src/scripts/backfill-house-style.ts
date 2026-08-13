/**
 * Clean the dashes out of prose that was written before the sanitiser reached it.
 *
 * Fixing the source stops NEW documents carrying banned punctuation. It does nothing for the ones
 * already sitting in the database, and those are the ones a founder is about to send. Eight proposals
 * on the live system carried an em dash into their scope from the paid audit's executive summary.
 *
 * Only client-facing prose is touched, only the banned dashes change, and every row is reported so a
 * founder can see exactly what moved. Nothing is deleted.
 *
 * Usage: npx tsx src/scripts/backfill-house-style.ts [--apply]
 * Without --apply it lists what it would change and writes nothing.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { audits, proposals } from "@/db/schema";
import { containsBannedDash, sanitizeDeep, sanitizeHouseStyle } from "@/lib/domain/house-style";

const APPLY = process.argv.includes("--apply");

function show(label: string, before: string, after: string) {
  const at = [...before].findIndex((c) => c === "—" || c === "–");
  const window = before.slice(Math.max(0, at - 60), at + 60);
  process.stdout.write(`  ${label}\n    was: ...${window}...\n    now: ...${after.slice(Math.max(0, at - 60), at + 62)}...\n`);
}

async function main() {
  const db = getDb();
  let changed = 0;

  const props = await db.select().from(proposals);
  for (const p of props) {
    const fields: Array<["title" | "scope" | "terms", string | null]> = [
      ["title", p.title],
      ["scope", p.scope],
      ["terms", p.terms],
    ];
    const dirty = fields.filter(([, v]) => v && containsBannedDash(v));
    const servicesDirty = JSON.stringify(p.services ?? []).includes("—") || JSON.stringify(p.services ?? []).includes("–");
    if (!dirty.length && !servicesDirty) continue;

    changed++;
    process.stdout.write(`PROPOSAL ${p.id} ${p.title.slice(0, 50)}\n`);
    const patch: Record<string, unknown> = {};
    for (const [name, value] of dirty) {
      const after = sanitizeHouseStyle(value as string);
      show(name, value as string, after);
      patch[name] = after;
    }
    if (servicesDirty) {
      patch.services = sanitizeDeep(p.services ?? []);
      process.stdout.write("    services: line item text cleaned\n");
    }
    if (APPLY) await db.update(proposals).set({ ...patch, updatedAt: new Date() }).where(eq(proposals.id, p.id));
  }

  // The audit report is where the dashes came from, and it is read back into proposals and shown to
  // clients, so leaving it dirty would reintroduce them the next time a proposal is built from it.
  const auditRows = await db.select().from(audits);
  for (const a of auditRows) {
    const raw = JSON.stringify(a.report ?? {});
    if (!raw.includes("—") && !raw.includes("–")) continue;
    changed++;
    process.stdout.write(`AUDIT ${a.id}: report prose cleaned\n`);
    if (APPLY) await db.update(audits).set({ report: sanitizeDeep(a.report), updatedAt: new Date() }).where(eq(audits.id, a.id));
  }

  process.stdout.write(`\n${changed} row(s) ${APPLY ? "cleaned" : "would be cleaned, run with --apply"}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
