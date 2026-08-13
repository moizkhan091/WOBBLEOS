/**
 * Archive named proposals, keeping every byte of them.
 *
 * My own proof runs left thirteen proposals on one real client while the pricing gate, the currency
 * resolver and the phasing were being built. They are a useful record of what each fix changed and a
 * terrible thing to open a client container onto.
 *
 * Archiving sets `archived_at`, which every listing and the deal-team context already filter on. It
 * deletes nothing: the row, its metadata, its pre-send review and its pricing decision all stay exactly
 * where they are, and clearing the column brings it straight back.
 *
 * Usage: npx tsx src/scripts/archive-proposals.ts <id> [<id>...] [--apply]
 */
import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { proposals } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";

const APPLY = process.argv.includes("--apply");
const IDS = process.argv.slice(2).filter((a) => !a.startsWith("--"));

async function main() {
  if (!IDS.length) {
    process.stdout.write("Give at least one proposal id.\n");
    process.exit(1);
  }
  const db = getDb();
  const rows = await db.select().from(proposals).where(inArray(proposals.id, IDS));

  const missing = IDS.filter((id) => !rows.some((r) => r.id === id));
  if (missing.length) process.stdout.write(`NOT FOUND, skipped: ${missing.join(", ")}\n`);

  const already = rows.filter((r) => r.archivedAt);
  const todo = rows.filter((r) => !r.archivedAt);
  if (already.length) process.stdout.write(`Already archived, left alone: ${already.length}\n`);

  for (const r of todo) {
    process.stdout.write(`${r.id}  ${r.status.padEnd(9)} ${r.currency} ${(r.pricingCents / 100).toLocaleString()}  ${r.createdAt.toISOString().slice(0, 16)}\n`);
  }

  if (APPLY && todo.length) {
    const now = new Date();
    await db.update(proposals).set({ archivedAt: now, updatedAt: now }).where(inArray(proposals.id, todo.map((r) => r.id)));
    for (const r of todo) {
      await writeAuditEvent({
        eventType: "proposal.archived",
        module: "proposals",
        entityType: "proposal",
        entityId: r.id,
        actor: "moiz",
        metadata: { reason: "superseded test artifact from build-time proof runs", status: r.status, pricingCents: r.pricingCents },
      });
    }
  }

  process.stdout.write(`\n${todo.length} proposal(s) ${APPLY ? "archived, nothing deleted" : "would be archived, run with --apply"}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
