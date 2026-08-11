import { desc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { crmCompanies, crmOpportunities, proposals } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { sanitizeHouseStyle } from "@/lib/domain/house-style";
import {
  appendNegotiation,
  buildVariants,
  negotiationSchema,
  objectionOpening,
  summariseNegotiation,
  variantsAreUseful,
  type Negotiation,
  type NegotiationEvent,
  type ProposalVariant,
  type StatedObjection,
} from "@/lib/domain/proposal-commercials";
import type { ObjectionBrief } from "@/lib/domain/deal-team";

/**
 * Variants, objections and negotiation, attached to a real proposal.
 *
 * All three live on the proposal's metadata rather than in new tables. That is deliberate: they are
 * facets of one document, they are always read with it, and a proposal that could disagree with its own
 * negotiation history would be worse than not recording it.
 */

export const PROPOSAL_COMMERCIALS_MODULE = "proposals";

export interface ProposalCommercials {
  variants: ProposalVariant[];
  negotiation: Negotiation;
  summary: ReturnType<typeof summariseNegotiation>;
  objectionOpening: string;
}

function readNegotiation(metadata: Record<string, unknown> | null | undefined): Negotiation {
  const parsed = negotiationSchema.safeParse(metadata?.negotiation ?? { events: [] });
  return parsed.success ? parsed.data : { events: [] };
}

/**
 * Everything commercial about one proposal, assembled.
 *
 * Variants are recomputed from the live services each time rather than stored, so editing the proposal
 * cannot leave a stale cheaper option lying around with a price nobody agreed to.
 */
export async function getProposalCommercials(proposalId: string, db: Db = getDb()): Promise<ProposalCommercials | null> {
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) return null;

  const metadata = (proposal.metadata ?? {}) as Record<string, unknown>;
  const negotiation = readNegotiation(metadata);
  const continuation = typeof metadata.continuationCents === "number" ? metadata.continuationCents : 0;

  // The objections the client actually stated, from whatever the objection handler last produced for
  // this client. Nothing is generated here: a document must not argue with a claim nobody approved.
  let objections: StatedObjection[] = [];
  if (proposal.companyId) {
    const [company] = await db.select({ name: crmCompanies.name, metadata: crmCompanies.metadata }).from(crmCompanies).where(eq(crmCompanies.id, proposal.companyId)).limit(1);
    const brief = (company?.metadata as Record<string, unknown> | undefined)?.objectionBrief as ObjectionBrief | undefined;
    objections = (brief?.objections ?? []).map((o) => ({ objection: o.objection, answer: o.answer }));
    return {
      variants: buildVariants(proposal.services ?? [], proposal.pricingCents, continuation),
      negotiation,
      summary: summariseNegotiation(negotiation),
      objectionOpening: objectionOpening(company?.name ?? "this client", objections),
    };
  }

  return {
    variants: buildVariants(proposal.services ?? [], proposal.pricingCents, continuation),
    negotiation,
    summary: summariseNegotiation(negotiation),
    objectionOpening: "",
  };
}

/** Record a move in the negotiation. Appends, never rewrites, and never changes the proposal's price. */
export async function recordNegotiationEvent(proposalId: string, event: NegotiationEvent, actor: string, db: Db = getDb()): Promise<Negotiation> {
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) throw new Error("proposal not found");

  const now = new Date();
  const metadata = (proposal.metadata ?? {}) as Record<string, unknown>;
  const negotiation = appendNegotiation(readNegotiation(metadata), { ...event, note: sanitizeHouseStyle(event.note), actor }, now);

  await db.update(proposals).set({ metadata: { ...metadata, negotiation }, updatedAt: now }).where(eq(proposals.id, proposalId));

  // A deal's value should follow the number actually on the table, otherwise the pipeline forecasts a
  // price nobody is still discussing.
  if (proposal.opportunityId && (event.kind === "agreed" || event.kind === "countered" || event.kind === "conceded")) {
    await db.update(crmOpportunities).set({ valueCents: event.amountCents, updatedAt: now }).where(eq(crmOpportunities.id, proposal.opportunityId));
  }

  await writeAuditEvent({
    eventType: "proposal.negotiation.recorded",
    module: PROPOSAL_COMMERCIALS_MODULE,
    entityType: "proposal",
    entityId: proposalId,
    actor,
    metadata: { kind: event.kind, amountCents: event.amountCents, by: event.by },
  });

  return negotiation;
}

/** Set the number below which this deal is not worth doing. Recorded once, referenced every time. */
export async function setWalkAway(proposalId: string, walkAwayCents: number, actor: string, db: Db = getDb()): Promise<Negotiation> {
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) throw new Error("proposal not found");
  const now = new Date();
  const metadata = (proposal.metadata ?? {}) as Record<string, unknown>;
  const negotiation: Negotiation = { ...readNegotiation(metadata), walkAwayCents };
  await db.update(proposals).set({ metadata: { ...metadata, negotiation }, updatedAt: now }).where(eq(proposals.id, proposalId));
  await writeAuditEvent({ eventType: "proposal.walk_away.set", module: PROPOSAL_COMMERCIALS_MODULE, entityType: "proposal", entityId: proposalId, actor, metadata: { walkAwayCents } });
  return negotiation;
}

/**
 * Set what a continuation (retainer, phase two) would cost, which is what makes a Complete tier
 * possible. Zero removes it, and two honest tiers beat three where one is padding.
 */
export async function setContinuationPrice(proposalId: string, continuationCents: number, actor: string, db: Db = getDb()): Promise<ProposalVariant[]> {
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) throw new Error("proposal not found");
  const now = new Date();
  const metadata = (proposal.metadata ?? {}) as Record<string, unknown>;
  await db.update(proposals).set({ metadata: { ...metadata, continuationCents }, updatedAt: now }).where(eq(proposals.id, proposalId));
  await writeAuditEvent({ eventType: "proposal.continuation.set", module: PROPOSAL_COMMERCIALS_MODULE, entityType: "proposal", entityId: proposalId, actor, metadata: { continuationCents } });
  const variants = buildVariants(proposal.services ?? [], proposal.pricingCents, continuationCents);
  return variantsAreUseful(variants) ? variants : [];
}

/** The newest proposal on a client, which is what the container's commercial panel reads. */
export async function latestProposalId(companyId: string, db: Db = getDb()): Promise<string | null> {
  const [row] = await db.select({ id: proposals.id }).from(proposals).where(eq(proposals.companyId, companyId)).orderBy(desc(proposals.createdAt)).limit(1);
  return row?.id ?? null;
}
