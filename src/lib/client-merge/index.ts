import { eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import {
  audits,
  crmCompanies,
  crmContacts,
  crmLeads,
  crmOpportunities,
  invoices,
  meetings,
  meetingIntelligence,
  projects,
  proposals,
  qualificationAssessments,
} from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { findDuplicates, type DuplicatePair } from "@/lib/domain/client-merge";

/**
 * Finding and merging duplicate client containers.
 *
 * Merging moves every child row onto the surviving container and ARCHIVES the loser with a pointer to
 * the winner. Nothing is deleted: a merge a founder regrets can be unpicked by hand, and a client's
 * history is the one thing in this system that cannot be regenerated.
 */

/** Every table that hangs off a company, so a merge cannot silently leave a row behind. */
const CHILD_TABLES = [
  { table: crmContacts, column: crmContacts.companyId, label: "contacts" },
  { table: crmLeads, column: crmLeads.companyId, label: "leads" },
  { table: crmOpportunities, column: crmOpportunities.companyId, label: "deals" },
  { table: meetings, column: meetings.companyId, label: "meetings" },
  { table: meetingIntelligence, column: meetingIntelligence.companyId, label: "findings" },
  { table: audits, column: audits.companyId, label: "audits" },
  { table: proposals, column: proposals.companyId, label: "proposals" },
  { table: invoices, column: invoices.companyId, label: "invoices" },
  { table: projects, column: projects.companyId, label: "projects" },
] as const;

export interface DuplicateSuggestion extends DuplicatePair {
  keep: { id: string; name: string; website: string | null; weight: number };
  merge: { id: string; name: string; website: string | null; weight: number };
}

/** How much history a container holds. The heavier side survives a merge. */
async function weights(ids: string[], db: Db): Promise<Map<string, number>> {
  const out = new Map<string, number>(ids.map((id) => [id, 0]));
  if (!ids.length) return out;
  for (const child of CHILD_TABLES) {
    const rows = await db
      .select({ companyId: child.column, n: sql<number>`count(*)` })
      .from(child.table)
      .where(inArray(child.column, ids))
      .groupBy(child.column);
    for (const r of rows) {
      const key = r.companyId ?? "";
      out.set(key, (out.get(key) ?? 0) + Number(r.n));
    }
  }
  return out;
}

export async function suggestDuplicates(db: Db = getDb()): Promise<DuplicateSuggestion[]> {
  const companies = await db
    .select({ id: crmCompanies.id, name: crmCompanies.name, website: crmCompanies.website, email: crmCompanies.email, phone: crmCompanies.phone, createdAt: crmCompanies.createdAt })
    .from(crmCompanies)
    .where(isNull(crmCompanies.archivedAt))
    .limit(500);
  if (companies.length < 2) return [];

  const weightById = await weights(companies.map((c) => c.id), db);
  const byId = new Map(companies.map((c) => [c.id, c]));
  const pairs = findDuplicates(companies.map((c) => ({ ...c, weight: weightById.get(c.id) ?? 0 })));

  return pairs.map((p) => {
    const keep = byId.get(p.keepId)!;
    const merge = byId.get(p.mergeId)!;
    return {
      ...p,
      keep: { id: keep.id, name: keep.name, website: keep.website, weight: weightById.get(keep.id) ?? 0 },
      merge: { id: merge.id, name: merge.name, website: merge.website, weight: weightById.get(merge.id) ?? 0 },
    };
  });
}

export interface MergeResult {
  keepId: string;
  mergeId: string;
  moved: Record<string, number>;
}

/**
 * Move everything from one container onto another and archive the empty one.
 *
 * Runs in a single transaction: a half-merged client, with its calls on one record and its proposals on
 * another, is worse than either duplicate.
 */
export async function mergeCompanies(input: { keepId: string; mergeId: string; actor: string }, db: Db = getDb()): Promise<MergeResult> {
  const rows = await db.select().from(crmCompanies).where(inArray(crmCompanies.id, [input.keepId, input.mergeId]));
  const keep = rows.find((r) => r.id === input.keepId);
  const loser = rows.find((r) => r.id === input.mergeId);
  if (!keep) throw new Error(`company '${input.keepId}' not found`);
  if (!loser) throw new Error(`company '${input.mergeId}' not found`);
  if (loser.archivedAt) throw new Error("that container has already been merged or archived");

  const now = new Date();
  const moved: Record<string, number> = {};

  await db.transaction(async (tx) => {
    for (const child of CHILD_TABLES) {
      const updated = await tx
        .update(child.table)
        .set({ companyId: input.keepId } as never)
        .where(eq(child.column, input.mergeId))
        .returning({ id: sql<string>`1` });
      if (updated.length) moved[child.label] = updated.length;
    }

    // Qualification is keyed by subjectId rather than companyId, so it needs its own move.
    const quals = await tx
      .update(qualificationAssessments)
      .set({ subjectId: input.keepId })
      .where(eq(qualificationAssessments.subjectId, input.mergeId))
      .returning({ id: qualificationAssessments.id });
    if (quals.length) moved.qualifications = quals.length;

    // Fill blanks on the survivor from the loser, never overwrite: the survivor was chosen because it
    // holds more, and a merge must not cost the founder a field they had.
    const fill = <T,>(current: T | null, incoming: T | null): T | null =>
      current === null || current === undefined || (typeof current === "string" && current.trim() === "") ? incoming : current;

    await tx
      .update(crmCompanies)
      .set({
        website: fill(keep.website, loser.website),
        email: fill(keep.email, loser.email),
        phone: fill(keep.phone, loser.phone),
        whatsapp: fill(keep.whatsapp, loser.whatsapp),
        city: fill(keep.city, loser.city),
        industry: fill(keep.industry, loser.industry),
        companySize: fill(keep.companySize, loser.companySize),
        notes: keep.notes && loser.notes && keep.notes !== loser.notes ? `${keep.notes}\n\nMerged from ${loser.name}:\n${loser.notes}` : fill(keep.notes, loser.notes),
        socialLinks: { ...(loser.socialLinks ?? {}), ...(keep.socialLinks ?? {}) },
        tags: Array.from(new Set([...(keep.tags ?? []), ...(loser.tags ?? []), "merged"])),
        metadata: { ...(loser.metadata ?? {}), ...(keep.metadata ?? {}) },
        updatedAt: now,
      })
      .where(eq(crmCompanies.id, input.keepId));

    // Archived, not deleted, with a pointer back so the merge can be unpicked by hand.
    await tx
      .update(crmCompanies)
      .set({
        archivedAt: now,
        updatedAt: now,
        metadata: { ...((loser.metadata ?? {}) as Record<string, unknown>), mergedIntoCompanyId: input.keepId, mergedAt: now.toISOString(), mergedBy: input.actor },
      })
      .where(eq(crmCompanies.id, input.mergeId));
  });

  await writeAuditEvent({
    eventType: "crm.company.merged",
    module: "crm",
    entityType: "crm_company",
    entityId: input.keepId,
    actor: input.actor,
    metadata: { mergedFrom: input.mergeId, mergedFromName: loser.name, moved },
  });

  return { keepId: input.keepId, mergeId: input.mergeId, moved };
}
