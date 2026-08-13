/**
 * Collapse escalations that are all the same unresolved problem.
 *
 * The dedup key included the task id, which is the RUN that noticed a blockage rather than the
 * blockage itself, so a nightly job that stayed blocked opened a fresh escalation every night. On the
 * live system that produced 52 identical open rows in three days, which filled the founder brief's
 * headline with one repeated sentence and buried everything else, including the Revenue signals.
 *
 * Raising is fixed at the source. This deals with the rows already there.
 *
 * The OLDEST row of each group is kept open, because it carries the true first-seen date, and it gets
 * a note saying how many times this has now happened. The rest are marked resolved with the action
 * `dismissed` and a resolution that names the row they were folded into. Nothing is deleted, and any
 * of them can be reopened by setting the status back.
 *
 * Usage: npx tsx src/scripts/collapse-duplicate-escalations.ts [--apply]
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { escalations } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { noteRecurrence } from "@/lib/departments/escalation";

const APPLY = process.argv.includes("--apply");

async function main() {
  const db = getDb();
  const rows = await db
    .select()
    .from(escalations)
    .where(inArray(escalations.status, ["open", "acknowledged"]))
    .orderBy(asc(escalations.createdAt));

  const groups = new Map<string, typeof rows>();
  for (const e of rows) {
    const key = `${e.departmentSlug}|${e.reason}|${e.requiredDecision}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  let collapsed = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = group[0];
    const fold = group.slice(1);
    collapsed += fold.length;

    process.stdout.write(`${keep.departmentSlug} / ${keep.reason}\n`);
    process.stdout.write(`  ${group.length} open rows, first seen ${keep.createdAt.toISOString().slice(0, 10)}\n`);
    process.stdout.write(`  keeping ${keep.id}, folding ${fold.length} into it\n`);

    if (!APPLY) continue;
    const now = new Date();
    // Replay the recurrences onto the kept row so its note tells the true story.
    let notes = keep.attemptedRecoveries ?? [];
    for (let i = 0; i < fold.length; i++) notes = noteRecurrence(notes, now).notes;

    await db.update(escalations).set({ attemptedRecoveries: notes, updatedAt: now }).where(eq(escalations.id, keep.id));
    await db
      .update(escalations)
      .set({
        status: "resolved",
        resolutionAction: "dismissed",
        resolution: `Duplicate of ${keep.id}, the same unresolved blockage re-raised by a later run. Folded into that escalation, which is still open.`,
        resolvedBy: "system",
        resolvedAt: now,
        updatedAt: now,
      })
      .where(and(inArray(escalations.id, fold.map((f) => f.id)), inArray(escalations.status, ["open", "acknowledged"])));

    await writeAuditEvent({
      eventType: "escalation.duplicates_collapsed",
      module: "departments",
      entityType: "escalation",
      entityId: keep.id,
      actor: "system",
      metadata: { departmentSlug: keep.departmentSlug, reason: keep.reason, folded: fold.length, foldedIds: fold.map((f) => f.id).slice(0, 60) },
    });
  }

  process.stdout.write(`\n${collapsed} duplicate escalation(s) ${APPLY ? "folded, none deleted" : "would be folded, run with --apply"}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
