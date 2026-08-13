import { and, eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { crmCompanies, meetingIntelligence } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { getWorklist } from "@/lib/client-worklist";
import { DEAL_TEAM_MODULE } from "@/lib/domain/deal-team";
import { DEFAULT_PREP_CAP, planDealTeamPrep, type PrepCandidate, type PrepPlan } from "@/lib/domain/deal-team-prep";
import { generateObjectionBrief } from "@/lib/deal-team";

/**
 * Prepare the deal team's work for the clients a founder is about to speak to.
 *
 * Runs from the daily maintenance block. Everything expensive happens after the triage, so a night on
 * which nothing qualifies costs nothing at all: no model call is made, and the function returns having
 * only read three tables.
 *
 * Failures are per client. One client whose context is too thin must not stop the brief for the next
 * one, and the reason is recorded rather than swallowed.
 */
export interface PrepResult {
  plan: PrepPlan;
  prepared: string[];
  failed: Array<{ companyId: string; error: string }>;
}

export interface PrepareDeps {
  /** Injectable so a test can plan without touching a provider. */
  runBrief?: (companyId: string) => Promise<unknown>;
  now?: Date;
  cap?: number;
}

/** What the triage needs, in two queries rather than one per client. */
export async function prepCandidates(db: Db = getDb(), now = new Date()): Promise<PrepCandidate[]> {
  const worklist = await getWorklist({ now }, db);
  if (!worklist.entries.length) return [];

  // Newest approved finding per company, in one grouped query.
  const findingRows = await db
    .select({
      companyId: meetingIntelligence.companyId,
      latest: sql<string | null>`max(${meetingIntelligence.createdAt})`,
      count: sql<number>`count(*)`,
    })
    .from(meetingIntelligence)
    .where(eq(meetingIntelligence.status, "approved"))
    .groupBy(meetingIntelligence.companyId);
  const findingByCompany = new Map(findingRows.filter((r) => r.companyId).map((r) => [r.companyId as string, r]));

  const companies = await db.select({ id: crmCompanies.id, metadata: crmCompanies.metadata }).from(crmCompanies);
  const briefAtByCompany = new Map<string, Date | null>();
  for (const c of companies) {
    const brief = ((c.metadata ?? {}) as Record<string, unknown>).objectionBrief as { generatedAt?: string } | undefined;
    briefAtByCompany.set(c.id, brief?.generatedAt ? new Date(brief.generatedAt) : null);
  }

  return worklist.entries.map((e) => {
    const f = findingByCompany.get(e.companyId);
    return {
      companyId: e.companyId,
      name: e.name,
      nextKind: e.next.kind,
      urgency: e.next.urgency,
      approvedFindingCount: Number(f?.count ?? 0),
      latestFindingAt: f?.latest ? new Date(f.latest) : null,
      briefGeneratedAt: briefAtByCompany.get(e.companyId) ?? null,
    };
  });
}

export async function prepareDealTeam(deps: PrepareDeps = {}, db: Db = getDb()): Promise<PrepResult> {
  const now = deps.now ?? new Date();
  const candidates = await prepCandidates(db, now);
  const plan = planDealTeamPrep(candidates, deps.cap ?? DEFAULT_PREP_CAP);

  const prepared: string[] = [];
  const failed: PrepResult["failed"] = [];
  const run = deps.runBrief ?? ((companyId: string) => generateObjectionBrief(companyId, { actor: "deal_team_prep" }));

  for (const d of plan.run) {
    try {
      await run(d.companyId);
      prepared.push(d.companyId);
      await writeAuditEvent({
        eventType: "deal_team.prepared",
        module: DEAL_TEAM_MODULE,
        entityType: "crm_company",
        entityId: d.companyId,
        actor: "deal_team_prep",
        metadata: { because: d.because, urgency: d.urgency },
      });
    } catch (e) {
      // A thin client is not an emergency, and it must not stop the next founder's prep.
      failed.push({ companyId: d.companyId, error: e instanceof Error ? e.message : "failed" });
    }
  }

  return { plan, prepared, failed };
}
