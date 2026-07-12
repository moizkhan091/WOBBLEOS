import { z } from "zod";
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
  const scope = (typeof report.executiveSummary === "string" && report.executiveSummary) || (typeof report.summary === "string" && report.summary) || undefined;

  const services: ProposalServiceItem[] = opps.map((o) => ({ name: o.title ?? o.name ?? "AI system", description: o.description }));
  const timeline: ProposalTimelineItem[] = roadmap.map((ph) => ({ phase: ph.title ?? "Phase", months: ph.months, focus: ph.focus }));

  return {
    companyId: audit.companyId ?? undefined,
    opportunityId: audit.opportunityId ?? undefined,
    auditId: audit.id,
    title: `${audit.businessName} — Wobble AI OS Proposal`,
    services,
    scope: scope || undefined,
    timeline,
    pricingCents: roi.estimatedImplementationCents ?? 0,
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
