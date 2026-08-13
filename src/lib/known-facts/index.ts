import { and, desc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { qualificationAssessments, qualificationRoles } from "@/db/schema";
import { knownFactsFrom, type KnownFacts } from "@/lib/domain/known-facts";

/**
 * Facts about a client that already exist in the OS, read back so a founder is not asked to retype them.
 *
 * Reads the latest qualification's per-role rationales, which is where the council writes things like
 * "Sara having unilateral authority for expenditures up to PKR 500,000" and then nothing ever uses it.
 */
export async function knownFactsForCompany(companyId: string, db: Db = getDb()): Promise<KnownFacts> {
  const [assessment] = await db
    .select({ id: qualificationAssessments.id })
    .from(qualificationAssessments)
    .where(and(eq(qualificationAssessments.subjectType, "company"), eq(qualificationAssessments.subjectId, companyId)))
    .orderBy(desc(qualificationAssessments.version))
    .limit(1);
  if (!assessment) return { signingAuthority: null, previousSpend: null };

  const roles = await db
    .select({ role: qualificationRoles.role, rationale: qualificationRoles.rationale })
    .from(qualificationRoles)
    .where(eq(qualificationRoles.assessmentId, assessment.id))
    .limit(20);

  // Budget-shaped checks first: that is where money sentences live, and reading the first match from
  // an unrelated check would surface a number from the wrong context.
  const ordered = [...roles].sort((a, b) => Number(/budget|authority|access/.test(b.role)) - Number(/budget|authority|access/.test(a.role)));
  return knownFactsFrom(ordered.map((r) => ({ role: r.role, rationale: r.rationale ?? "" })));
}
