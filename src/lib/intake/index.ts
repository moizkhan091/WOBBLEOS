import { and, isNull, or, sql } from "drizzle-orm";
import { crmCompanies } from "@/db/schema";
import { getDb } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { defaultStore, type CrmStore } from "@/lib/crm";
import {
  buildCompanyRow,
  buildContactRow,
  buildLeadRow,
  buildOpportunityRow,
  type CompanyRow,
  type ContactRow,
  type LeadRow,
  type OpportunityRow,
} from "@/lib/domain/crm";
import {
  INTAKE_MODULE,
  mapSubmissionToCrm,
  readinessSubmissionSchema,
  tierForScore,
  validateSubmission,
  type ReadinessSubmission,
} from "@/lib/domain/intake";
import { newId } from "@/lib/ids";

/**
 * Inbound form intake — service layer (IO).
 *
 * Turns a signed website-form submission into the CLIENT CONTAINER: company + contact + lead +
 * pipeline opportunity, written in ONE transaction so a half-created client can never exist.
 *
 * This composes the existing CRM primitives (buildCompanyRow/…, CrmStore, its real Postgres
 * transaction) rather than re-implementing them — the CRM stays the single owner of those rules.
 *
 * DEDUPE is the reason this isn't just four inserts. The founder SOP makes the website form the only
 * door, so the SAME company will submit twice (a second person, a follow-up months later). A second
 * submission must ENRICH the existing container, never fork a twin — a fragmented client is the one
 * thing that breaks "all their info in one place".
 */

/** Raised when a submission cannot become a client at all (no identity / no way to reach them). */
export class IntakeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntakeValidationError";
  }
}

export interface IntakeDeps {
  store?: CrmStore;
  /** Find the container this submission belongs to, if it already exists. Injectable for tests. */
  findExistingCompany?: (input: { domain: string | null; name: string; email?: string }) => Promise<CompanyRow | null>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

export interface IntakeResult {
  company: CompanyRow;
  contact: ContactRow | null;
  lead: LeadRow;
  opportunity: OpportunityRow;
  /** True when the submission joined an EXISTING company container instead of creating one. */
  deduped: boolean;
  /** True when the contact already existed on that company (same email). */
  contactExisted: boolean;
  score: number;
  tier: ReturnType<typeof tierForScore>;
  displayName: string;
}

/**
 * Default container lookup: domain wins, then email, then an exact name match.
 *
 * Domain is the strongest identity signal we have — two businesses can share a name, but not a
 * website. Name is matched exactly (lowercased) rather than fuzzily on purpose: merging "Wobble" into
 * "Wobble Media" because they look similar is far more damaging than creating a second container the
 * founder can merge by hand.
 */
export async function findExistingCompanyContainer(input: { domain: string | null; name: string; email?: string }): Promise<CompanyRow | null> {
  if (!process.env.DATABASE_URL) return null;
  const db = getDb();
  const name = input.name.trim().toLowerCase();
  const email = input.email?.trim().toLowerCase();

  const matchers = [
    input.domain ? sql`lower(${crmCompanies.website}) like ${`%${input.domain}%`}` : null,
    email ? sql`lower(${crmCompanies.email}) = ${email}` : null,
    name ? sql`lower(${crmCompanies.name}) = ${name}` : null,
  ].filter(Boolean) as ReturnType<typeof sql>[];
  if (!matchers.length) return null;

  const rows = (await db
    .select()
    .from(crmCompanies)
    .where(and(isNull(crmCompanies.archivedAt), or(...matchers)))
    .limit(10)) as CompanyRow[];
  if (!rows.length) return null;

  // Rank by identity strength rather than trusting SQL's row order.
  const byDomain = input.domain ? rows.find((r) => (r.website ?? "").toLowerCase().includes(input.domain!)) : undefined;
  const byEmail = email ? rows.find((r) => (r.email ?? "").toLowerCase() === email) : undefined;
  const byName = rows.find((r) => r.name.trim().toLowerCase() === name);
  return byDomain ?? byEmail ?? byName ?? null;
}

/** Only overwrite a stored value when it is empty — a resubmission must never blank out known data. */
function fillIfEmpty<T>(current: T | null | undefined, incoming: T | null | undefined): T | null | undefined {
  const isEmpty = current === null || current === undefined || (typeof current === "string" && current.trim() === "");
  return isEmpty && incoming ? incoming : current;
}

export async function intakeReadinessSubmission(raw: unknown, deps: IntakeDeps = {}): Promise<IntakeResult> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const audit = deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i));

  const parsed = readinessSubmissionSchema.safeParse(raw);
  if (!parsed.success) throw new IntakeValidationError(`invalid submission: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`);
  const submission: ReadinessSubmission = parsed.data;
  const invalid = validateSubmission(submission);
  if (invalid) throw new IntakeValidationError(invalid);

  const mapped = mapSubmissionToCrm(submission, { now });

  const existing = await (deps.findExistingCompany ?? findExistingCompanyContainer)({
    domain: mapped.domain,
    name: mapped.displayName,
    email: submission.contact?.email || undefined,
  });

  // ---- company: reuse + enrich, or create
  let company: CompanyRow;
  let companyIsNew = false;
  let companyUpdate: Partial<CompanyRow> | null = null;
  if (existing) {
    const incoming = buildCompanyRow(mapped.company, { now });
    companyUpdate = {
      website: fillIfEmpty(existing.website, incoming.website) ?? null,
      email: fillIfEmpty(existing.email, incoming.email) ?? null,
      phone: fillIfEmpty(existing.phone, incoming.phone) ?? null,
      whatsapp: fillIfEmpty(existing.whatsapp, incoming.whatsapp) ?? null,
      city: fillIfEmpty(existing.city, incoming.city) ?? null,
      companySize: fillIfEmpty(existing.companySize, incoming.companySize) ?? null,
      notes: fillIfEmpty(existing.notes, incoming.notes) ?? null,
      // Union both sides: a resubmission that adds a LinkedIn must not drop the known Instagram.
      socialLinks: { ...incoming.socialLinks, ...existing.socialLinks },
      tags: Array.from(new Set([...existing.tags, ...incoming.tags, "resubmitted"])),
      // Keep the full history of submissions — the question engine reads how their answers changed.
      metadata: {
        ...existing.metadata,
        ...incoming.metadata,
        intakeHistory: [
          ...(Array.isArray((existing.metadata as Record<string, unknown>)?.intakeHistory)
            ? ((existing.metadata as Record<string, unknown>).intakeHistory as unknown[])
            : []),
          (incoming.metadata as Record<string, unknown>).intake,
        ].slice(-10),
      },
      updatedAt: now,
    };
    // Status only ever moves FORWARD — a casual resubmission can't demote a live client to "prospect".
    if (existing.status === "prospect" && incoming.status === "qualified_prospect") companyUpdate.status = "qualified_prospect";
    company = { ...existing, ...companyUpdate } as CompanyRow;
  } else {
    company = buildCompanyRow(mapped.company, { now });
    companyIsNew = true;
  }

  // ---- contact: reuse when the same human already exists on this company
  let contact: ContactRow | null = null;
  let contactExisted = false;
  if (mapped.contact) {
    const email = (submission.contact?.email ?? "").trim().toLowerCase();
    if (!companyIsNew && email) {
      const known = await store.listContacts({ companyId: company.id, limit: 200 });
      const match = known.find((c) => (c.email ?? "").trim().toLowerCase() === email);
      if (match) {
        contact = match;
        contactExisted = true;
      }
    }
    if (!contact) contact = buildContactRow({ ...mapped.contact, companyId: company.id }, { now });
  }

  // ---- lead + opportunity: always new. Each submission is its own event in the client's history.
  const lead = buildLeadRow({ ...mapped.lead, companyId: company.id, contactId: contact?.id }, { now });
  const opportunity = buildOpportunityRow({ ...mapped.opportunity, companyId: company.id, contactId: contact?.id }, { now });

  await (store.transaction ?? ((fn: (s: CrmStore) => Promise<void>) => fn(store)))(async (tx: CrmStore) => {
    if (companyIsNew) await tx.insertCompany(company);
    else if (companyUpdate) await tx.updateCompany(company.id, companyUpdate);
    if (contact && !contactExisted) await tx.insertContact(contact);
    await tx.insertLead(lead);
    await tx.insertOpportunity(opportunity);
    await tx.insertStageHistory({
      id: newId("hist"),
      opportunityId: opportunity.id,
      oldStage: null,
      newStage: opportunity.stage,
      movedBy: "n8n_readiness_form",
      reason: "inbound readiness form submission",
      createdAt: now,
    });
  });

  const tier = tierForScore(lead.score);
  await audit({
    eventType: "intake.readiness_form_received",
    module: INTAKE_MODULE,
    entityType: "crm_company",
    entityId: company.id,
    actor: "n8n_readiness_form",
    metadata: {
      leadId: lead.id,
      opportunityId: opportunity.id,
      contactId: contact?.id ?? null,
      deduped: !companyIsNew,
      contactExisted,
      score: lead.score,
      tier,
      stage: opportunity.stage,
      qualification: mapped.qualification,
    },
  });

  return { company, contact, lead, opportunity, deduped: !companyIsNew, contactExisted, score: lead.score, tier, displayName: mapped.displayName };
}
