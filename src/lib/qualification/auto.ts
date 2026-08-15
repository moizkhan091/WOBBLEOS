import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { crmCompanies, crmLeads, meetingIntelligence, qualificationAssessments } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { READINESS_FORM_SOURCE } from "@/lib/domain/intake";
import { DEFAULT_QUALIFY_CAP, planQualification, type QualifyCandidate, type QualifyPlan } from "@/lib/domain/qualification-triage";
import { QUALIFICATION_MODULE, runQualification } from "@/lib/qualification";

/**
 * Score new clients without being asked.
 *
 * Runs from the scheduler tick, so a client added now is graded within a minute or two rather than
 * waiting for a founder to remember. Everything expensive happens after the triage: a pass with nothing
 * eligible makes no model call at all and costs four queries.
 *
 * Failures are per client, because one company with a broken subject must not stop the next one being
 * scored, and the reason is recorded rather than swallowed.
 */
export interface AutoQualifyResult {
  plan: QualifyPlan;
  qualified: string[];
  failed: Array<{ companyId: string; error: string }>;
}

export interface AutoQualifyDeps {
  /** Injectable so a test can plan without touching a provider. */
  runCouncil?: (companyId: string) => Promise<unknown>;
  now?: Date;
  cap?: number;
}

/** Everything the triage needs, in four grouped queries rather than one set per company. */
export async function qualifyCandidates(db: Db = getDb()): Promise<QualifyCandidate[]> {
  const [companies, assessments, intakes, findings] = await Promise.all([
    db
      .select({ id: crmCompanies.id, name: crmCompanies.name, industry: crmCompanies.industry, website: crmCompanies.website, createdAt: crmCompanies.createdAt })
      .from(crmCompanies)
      .where(isNull(crmCompanies.archivedAt))
      .limit(500),
    db
      .select({ subjectId: qualificationAssessments.subjectId, count: sql<number>`count(*)` })
      .from(qualificationAssessments)
      .where(eq(qualificationAssessments.subjectType, "company"))
      .groupBy(qualificationAssessments.subjectId),
    // The readiness form's answers live on the lead row, keyed by source. A hand-typed lead has no
    // answers on it, which is exactly the distinction the triage needs.
    db.select({ companyId: crmLeads.companyId }).from(crmLeads).where(eq(crmLeads.source, READINESS_FORM_SOURCE)),
    db
      .select({ companyId: meetingIntelligence.companyId, count: sql<number>`count(*)` })
      .from(meetingIntelligence)
      .where(eq(meetingIntelligence.status, "approved"))
      .groupBy(meetingIntelligence.companyId),
  ]);

  const scored = new Map(assessments.filter((a) => a.subjectId).map((a) => [a.subjectId as string, Number(a.count)]));
  const withIntake = new Set(intakes.map((i) => i.companyId).filter((x): x is string => Boolean(x)));
  const findingCount = new Map(findings.filter((f) => f.companyId).map((f) => [f.companyId as string, Number(f.count)]));

  return companies.map((c) => ({
    companyId: c.id,
    name: c.name,
    assessmentCount: scored.get(c.id) ?? 0,
    hasIntake: withIntake.has(c.id),
    approvedFindingCount: findingCount.get(c.id) ?? 0,
    hasIndustry: Boolean(c.industry?.trim()),
    hasWebsite: Boolean(c.website?.trim()),
    createdAt: c.createdAt ?? new Date(0),
  }));
}

export async function autoQualifyNewClients(deps: AutoQualifyDeps = {}, db: Db = getDb()): Promise<AutoQualifyResult> {
  const candidates = await qualifyCandidates(db);
  const plan = planQualification(candidates, deps.cap ?? DEFAULT_QUALIFY_CAP);

  const qualified: string[] = [];
  const failed: AutoQualifyResult["failed"] = [];
  const run = deps.runCouncil ?? ((companyId: string) => runQualification(companyId, { actor: "auto_qualify" }));

  for (const d of plan.run) {
    try {
      await run(d.companyId);
      qualified.push(d.companyId);
      await writeAuditEvent({
        eventType: "qualification.auto_started",
        module: QUALIFICATION_MODULE,
        entityType: "crm_company",
        entityId: d.companyId,
        actor: "auto_qualify",
        metadata: { because: d.because },
      });
    } catch (e) {
      failed.push({ companyId: d.companyId, error: e instanceof Error ? e.message : "failed" });
    }
  }

  return { plan, qualified, failed };
}
