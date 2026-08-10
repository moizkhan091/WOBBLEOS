import { and, desc, eq } from "drizzle-orm";
import { crmCompanies, crmLeads } from "@/db/schema";
import { getDb, type Db } from "@/db";
import {
  READINESS_FORM_SOURCE,
  formatIntakeForAudit,
  snapshotFromLead,
  type IntakeSnapshot,
} from "@/lib/domain/intake";

/**
 * Reading the readiness form back OUT of a client's container.
 *
 * The form is the richest thing we ever learn about a prospect before the call — their own words on
 * what is slow, what they run on, how fast they want to move. It is stored on the lead rows the intake
 * created. This is the single place that turns those rows back into usable context, so the audit, the
 * pre-call question engine and the container UI all read the SAME thing rather than each re-deriving
 * it from raw metadata.
 */

export interface ClientIntakeContext {
  /** Newest submission first. Empty when the client never came through the form. */
  snapshots: IntakeSnapshot[];
  /** Ready-to-paste block for an agent's intake notes; "" when there is nothing to say. */
  auditBlock: string;
}

export interface IntakeContextDeps {
  /** Injectable so callers/tests can supply rows without a database. */
  loadLeads?: (companyId: string) => Promise<{
    company: { notes: string | null; companySize: string | null; city: string | null } | null;
    leads: Array<Parameters<typeof snapshotFromLead>[0]>;
  }>;
}

async function defaultLoadLeads(companyId: string, db: Db = getDb()) {
  const [companyRow] = await db
    .select({ notes: crmCompanies.notes, companySize: crmCompanies.companySize, city: crmCompanies.city })
    .from(crmCompanies)
    .where(eq(crmCompanies.id, companyId))
    .limit(1);

  const leads = await db
    .select({
      contactName: crmLeads.contactName,
      problemStated: crmLeads.problemStated,
      serviceInterest: crmLeads.serviceInterest,
      score: crmLeads.score,
      createdAt: crmLeads.createdAt,
      metadata: crmLeads.metadata,
    })
    .from(crmLeads)
    // Only form submissions — a hand-typed lead has no readiness answers to report.
    .where(and(eq(crmLeads.companyId, companyId), eq(crmLeads.source, READINESS_FORM_SOURCE)))
    .orderBy(desc(crmLeads.createdAt))
    .limit(10);

  return { company: companyRow ?? null, leads: leads as Array<Parameters<typeof snapshotFromLead>[0]> };
}

/** Every readiness submission this company has made, newest first, plus the agent-ready block. */
export async function getClientIntakeContext(companyId: string, deps: IntakeContextDeps = {}): Promise<ClientIntakeContext> {
  const load = deps.loadLeads ?? ((id: string) => defaultLoadLeads(id));
  const { company, leads } = await load(companyId);
  const snapshots = leads.map((lead) => snapshotFromLead(lead, company ?? undefined));
  return { snapshots, auditBlock: formatIntakeForAudit(snapshots) };
}
