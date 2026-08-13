import { z } from "zod";
import { reportTextOf, resolveReportCurrency } from "@/lib/domain/report-currency";
import { excludedFromQuote, phaseOneWithinAuthority, phaseOpportunities, splitPrice, type PhasingOpportunity } from "@/lib/domain/proposal-phasing";
import { awaitingPricing } from "@/lib/domain/pricing-gate";
import { stripQuotedPrices } from "@/lib/domain/quoted-price";
import { newId } from "@/lib/ids";

/**
 * Proposal builder (pure, testable). Turns an audit's findings into a client proposal — services,
 * scope, timeline, pricing — linked to the opportunity. Founder-approved before sending; an accepted
 * proposal triggers an invoice draft (ERP brief H). v1 assembles deterministically from the audit
 * report; an LLM narrative-polish layers on top later. The proposal is where Audit → Invoice connects.
 */

export const PROPOSAL_MODULE = "proposals";

export const PROPOSAL_STATUSES = ["draft", "needs_review", "approved", "sent", "viewed", "accepted", "rejected", "expired", "archived"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export interface ProposalServiceItem {
  name: string;
  description?: string;
  priceCents?: number;
}
export interface ProposalTimelineItem {
  phase: string;
  months?: string;
  focus?: string;
}

export interface ProposalRow {
  id: string;
  companyId: string | null;
  opportunityId: string | null;
  auditId: string | null;
  title: string;
  services: ProposalServiceItem[];
  scope: string | null;
  timeline: ProposalTimelineItem[];
  pricingCents: number;
  currency: string;
  terms: string | null;
  status: string;
  version: number;
  createdBy: string | null;
  approvedBy: string | null;
  sentAt: Date | null;
  acceptedAt: Date | null;
  rejectedReason: string | null;
  archivedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const serviceItemSchema = z.object({ name: z.string().trim().min(1), description: z.string().trim().optional(), priceCents: z.number().int().min(0).optional() });
const timelineItemSchema = z.object({ phase: z.string().trim().min(1), months: z.string().trim().optional(), focus: z.string().trim().optional() });

export const createProposalSchema = z.object({
  companyId: z.string().trim().min(1).optional(),
  opportunityId: z.string().trim().min(1).optional(),
  auditId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  services: z.array(serviceItemSchema).default([]),
  scope: z.string().trim().min(1).optional(),
  timeline: z.array(timelineItemSchema).default([]),
  pricingCents: z.number().int().min(0).default(0),
  currency: z.string().trim().min(1).default("USD"),
  terms: z.string().trim().min(1).optional(),
  createdBy: z.string().trim().min(1).optional(),
  /** Structured enrichment persisted on the artifact (e.g. the solution architect's synthesis). */
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateProposalInput = z.input<typeof createProposalSchema>;

export function buildProposalRow(input: CreateProposalInput, opts: { now?: Date; id?: string } = {}): ProposalRow {
  const p = createProposalSchema.parse(input);
  const now = opts.now ?? new Date();
  // If services carry prices but no explicit total, sum them.
  const summed = p.services.reduce((s, x) => s + (x.priceCents ?? 0), 0);
  return {
    id: opts.id ?? newId("prop"),
    companyId: p.companyId ?? null,
    opportunityId: p.opportunityId ?? null,
    auditId: p.auditId ?? null,
    title: p.title,
    services: p.services,
    scope: p.scope ?? null,
    timeline: p.timeline,
    pricingCents: p.pricingCents || summed,
    currency: p.currency,
    terms: p.terms ?? null,
    status: "draft",
    version: 1,
    createdBy: p.createdBy ?? null,
    approvedBy: null,
    sentAt: null,
    acceptedAt: null,
    rejectedReason: null,
    archivedAt: null,
    metadata: p.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------- assemble from an audit

interface AuditForProposal {
  id: string;
  businessName: string;
  companyId?: string | null;
  opportunityId?: string | null;
  report: Record<string, unknown>;
  /** Where the client is, so the audit's unit-less money figures can be given their real currency. */
  country?: string | null;
  city?: string | null;
  market?: string | null;
  /** What one person at the client can sign without asking anyone. Shapes how big phase one may be. */
  soloAuthorityCents?: number | null;
  /** What this build costs WOBBLE, computed from the tools and integrations it needs. Never a price. */
  deliveryCost?: import("@/lib/domain/delivery-cost").DeliveryCost | null;
  /** What the cost was computed from, and whether each input was guessed or given. */
  costInputs?: import("@/lib/domain/delivery-cost").CostInputsView | null;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Deterministically assemble a proposal input from an audit's report (free or paid). */
export function proposalInputFromAudit(audit: AuditForProposal): CreateProposalInput {
  const report = audit.report ?? {};
  const opps = asArray<{ title?: string; name?: string; description?: string; service?: string }>(report.opportunities);
  const roadmap = asArray<{ title?: string; months?: string; focus?: string }>(report.roadmap);
  const roi = (report.roi ?? {}) as { estimatedImplementationCents?: number };
  const rawScope = (typeof report.executiveSummary === "string" && report.executiveSummary) || (typeof report.summary === "string" && report.summary) || undefined;
  // The audit's summary writes its own implementation guess into prose ("With PKR 4.5M implementation
  // investment, payback occurs in 2.5 months"). Copied into the scope, that becomes a price on a
  // document nobody has priced, and the client reads the sentence, not the field. It comes out here,
  // and what came out is recorded rather than dropped silently.
  const scopeStrip = stripQuotedPrices(rawScope);
  const scope = scopeStrip.text || undefined;

  // Every opportunity used to become a line item. On a real proposal that was eighteen of them, quoted
  // as one number, to a client who had already abandoned one system after a single all-or-nothing
  // purchase. WOBBLE's own deal reviewer refused it for exactly that, and found three line items the
  // findings did not support. So: rank by what the audit says each is worth against how fast it lands,
  // phase it, and drop the tail out of the quote instead of padding it.
  const totalCents = roi.estimatedImplementationCents ?? 0;
  const phases = phaseOpportunities(opps as PhasingOpportunity[], { soloAuthorityCents: audit.soloAuthorityCents ?? null, totalCents });
  const quoted = phases.flatMap((ph) => ph.items);
  const excluded = excludedFromQuote(opps as PhasingOpportunity[]);
  const priceByPhase = splitPrice(totalCents, phases);

  const services: ProposalServiceItem[] = phases.flatMap((ph) =>
    ph.items.map((o) => ({
      // The phase is on the line item, so a client reading the document can see where it sits and what
      // they would be committing to first.
      name: `${ph.name.startsWith("Phase") ? `P${ph.number}` : ph.name}: ${o.title ?? "AI system"}`,
      description: o.description,
    })),
  );

  // The audit's own roadmap when it has one, otherwise the phases derived here, so a proposal is never
  // sent without a timeline. The reviewer flagged a missing one against a stated client deadline.
  const timeline: ProposalTimelineItem[] = roadmap.length
    ? roadmap.map((ph) => ({ phase: ph.title ?? "Phase", months: ph.months, focus: ph.focus }))
    : phases.map((ph) => ({ phase: ph.name, focus: ph.rationale }));

  // An audit's money fields carry no unit while its prose is written in the client's own currency. A
  // Karachi clinic's audit priced the build at 1,400,000 rupees and this builder stamped USD on it,
  // quoting roughly 280 times too much. Money without a currency is not money, so it is established
  // from evidence here and, when it cannot be, the proposal is marked rather than silently dollarised.
  const verdict = resolveReportCurrency({ reportText: reportTextOf(report), country: audit.country, city: audit.city, market: audit.market });

  return {
    companyId: audit.companyId ?? undefined,
    opportunityId: audit.opportunityId ?? undefined,
    auditId: audit.id,
    title: `${audit.businessName}, Wobble AI OS Proposal`,
    services,
    scope: scope || undefined,
    timeline,
    // ZERO on purpose. The audit's implementation figure is a model's guess at a number it has no
    // basis for, and letting it become the quote is exactly how a rupee cost went out as a dollar
    // price. It is kept below for reference; the price stays empty until a founder sets one.
    pricingCents: 0,
    currency: verdict.currency ?? undefined,
    metadata: {
      currencyEvidence: verdict.evidence,
      // The price sentences taken out of the audit summary, kept so a founder can see what was
      // removed and put it back in their own words once they have decided a number.
      priceSentencesRemoved: scopeStrip.removed,
      currencyNote: verdict.because,
      // What each phase carries, so a founder can quote phase one alone, and what was deliberately
      // left out, so nothing is dropped silently.
      // valueShare is stored, not just the money, so the split can be recomputed against the price a
      // founder actually decides. Without it the phases keep quoting the audit's guess forever.
      phases: phases.map((ph) => ({ number: ph.number, name: ph.name, rationale: ph.rationale, items: ph.items.map((o) => o.title), valueShare: ph.valueShare, priceCents: priceByPhase.find((x) => x.number === ph.number)?.priceCents ?? 0 })),
      excludedFromQuote: excluded.map((o) => o.title),
      quotedItemCount: quoted.length,
      totalOpportunityCount: opps.length,
      // The check a founder needs BEFORE sending: can the person they are talking to actually sign it?
      phaseOneAuthority: phaseOneWithinAuthority(priceByPhase[0]?.priceCents ?? 0, audit.soloAuthorityCents ?? null),
      // The gate. Nothing goes to a client until a founder types a number and signs their name to it.
      pricing: awaitingPricing(audit.deliveryCost ?? null, totalCents, audit.costInputs ?? null),
      // The flag the UI reads. A price nobody can name the unit of must not go out.
      currencyUnverified: verdict.currency === null,
    },
  };
}

// ---------------------------------------------------------------- status machine

const PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ["needs_review", "approved", "archived"],
  needs_review: ["approved", "draft", "archived"],
  approved: ["sent", "archived"],
  sent: ["viewed", "accepted", "rejected", "expired"],
  viewed: ["accepted", "rejected", "expired"],
  accepted: [],
  rejected: ["draft"],
  expired: ["draft"],
  archived: [],
};

export function canTransitionProposal(from: string, to: ProposalStatus): boolean {
  const allowed = PROPOSAL_TRANSITIONS[from as ProposalStatus];
  return Array.isArray(allowed) && allowed.includes(to);
}
