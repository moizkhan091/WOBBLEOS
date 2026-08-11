import { isNull } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { crmCompanies, crmContacts } from "@/db/schema";
import { domainOf } from "@/lib/domain/client-merge";
import { routeTranscript, type RoutingCandidate, type RoutingDecision } from "@/lib/domain/transcript-routing";

/**
 * Loading the candidates a transcript could belong to, and deciding.
 *
 * One query pass over live containers. The decision itself is pure, so it can be tested without a
 * database and cannot quietly change because a query changed shape.
 */
export async function routeTranscriptToClient(input: { attendeeEmails: string[]; title?: string }, db: Db = getDb()): Promise<RoutingDecision & { candidateCount: number }> {
  const [companies, contacts] = await Promise.all([
    db.select({ id: crmCompanies.id, name: crmCompanies.name, email: crmCompanies.email, website: crmCompanies.website }).from(crmCompanies).where(isNull(crmCompanies.archivedAt)).limit(500),
    db.select({ companyId: crmContacts.companyId, email: crmContacts.email }).from(crmContacts).where(isNull(crmContacts.archivedAt)).limit(2000),
  ]);

  const candidates: RoutingCandidate[] = companies.map((c) => ({
    companyId: c.id,
    companyName: c.name,
    contactEmails: contacts.filter((x) => x.companyId === c.id && x.email).map((x) => (x.email as string).toLowerCase()),
    companyEmail: c.email ?? null,
    companyDomain: domainOf(c.website),
  }));

  return { ...routeTranscript(input, candidates), candidateCount: candidates.length };
}
