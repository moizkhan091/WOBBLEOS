import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Wobble ERP Control Layer — CRM spine (pure, testable).
 *
 * The connected business backbone from the founder's ERP brief: Company is the parent object;
 * Contacts, Leads, and Opportunities hang off it; every stage move is audited + history-logged.
 * "No orphan records, no silent deletion" — archive (soft delete) instead of hard delete.
 * All IO lives in src/lib/crm.
 */

export const CRM_MODULE = "crm";

// ---------------------------------------------------------------- enums

export const COMPANY_STATUSES = [
  "prospect", "qualified_prospect", "audit_booked", "audit_completed", "proposal_sent",
  "client_active", "client_paused", "client_lost", "former_client", "partner", "vendor", "internal",
] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const CONTACT_RELATIONSHIPS = [
  "founder", "ceo", "marketing_head", "sales_head", "operations_head", "finance_contact",
  "decision_maker", "influencer", "vendor", "partner", "client_team_member", "other",
] as const;
export type ContactRelationship = (typeof CONTACT_RELATIONSHIPS)[number];

export const LEAD_STATUSES = ["new", "contacted", "no_response", "qualified", "disqualified", "converted", "duplicate", "nurture", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

// The default Wobble sales pipeline (ERP brief section D). The audit flow is baked into the stages.
export const PIPELINE_STAGES = [
  "new_lead", "contacted", "qualified", "ai_readiness_call_booked", "call_completed",
  "paid_audit_offered", "paid_audit_sold", "audit_in_progress", "audit_delivered",
  "proposal_sent", "negotiation", "won", "lost", "nurture",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const OPPORTUNITY_STATUSES = ["open", "won", "lost", "archived"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const LEVELS = ["unknown", "low", "medium", "high"] as const;

// ---------------------------------------------------------------- rows

export interface CompanyRow {
  id: string;
  name: string;
  legalName: string | null;
  industry: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  socialLinks: Record<string, string>;
  leadSource: string | null;
  status: string;
  clientType: string | null;
  companySize: string | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdBy: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactRow {
  id: string;
  companyId: string | null;
  fullName: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  relationshipType: string;
  leadSource: string | null;
  preferredChannel: string | null;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  assignedOwner: string | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadRow {
  id: string;
  name: string;
  companyId: string | null;
  contactId: string | null;
  source: string | null;
  campaign: string | null;
  score: number;
  intentLevel: string;
  budgetLevel: string;
  urgencyLevel: string;
  fitLevel: string;
  problemStated: string | null;
  serviceInterest: string[];
  assignedOwner: string | null;
  status: string;
  convertedOpportunityId: string | null;
  metadata: Record<string, unknown>;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpportunityRow {
  id: string;
  name: string;
  companyId: string;
  contactId: string | null;
  stage: string;
  valueCents: number;
  currency: string;
  probability: number;
  expectedCloseAt: Date | null;
  source: string | null;
  assignedOwner: string | null;
  priority: string;
  serviceInterest: string[];
  painPoints: string | null;
  nextAction: string | null;
  nextActionAt: Date | null;
  status: string;
  lostReason: string | null;
  winReason: string | null;
  proposalId: string | null;
  invoiceId: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StageHistoryRow {
  id: string;
  opportunityId: string;
  oldStage: string | null;
  newStage: string;
  movedBy: string | null;
  reason: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------- builders

export const createCompanySchema = z.object({
  name: z.string().trim().min(1),
  legalName: z.string().trim().min(1).optional(),
  industry: z.string().trim().min(1).optional(),
  website: z.string().trim().min(1).optional(),
  country: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  whatsapp: z.string().trim().min(1).optional(),
  socialLinks: z.record(z.string(), z.string()).default({}),
  leadSource: z.string().trim().min(1).optional(),
  status: z.enum(COMPANY_STATUSES).default("prospect"),
  clientType: z.string().trim().min(1).optional(),
  companySize: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdBy: z.string().trim().min(1).optional(),
});
export type CreateCompanyInput = z.input<typeof createCompanySchema>;

export function buildCompanyRow(input: CreateCompanyInput, opts: { now?: Date; id?: string } = {}): CompanyRow {
  const p = createCompanySchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("co"),
    name: p.name,
    legalName: p.legalName ?? null,
    industry: p.industry ?? null,
    website: p.website ?? null,
    country: p.country ?? null,
    city: p.city ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    whatsapp: p.whatsapp ?? null,
    socialLinks: p.socialLinks,
    leadSource: p.leadSource ?? null,
    status: p.status,
    clientType: p.clientType ?? null,
    companySize: p.companySize ?? null,
    notes: p.notes ?? null,
    tags: p.tags,
    metadata: p.metadata,
    createdBy: p.createdBy ?? null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export const createContactSchema = z.object({
  companyId: z.string().trim().min(1).optional(),
  fullName: z.string().trim().min(1),
  role: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  whatsapp: z.string().trim().min(1).optional(),
  linkedin: z.string().trim().min(1).optional(),
  relationshipType: z.enum(CONTACT_RELATIONSHIPS).default("other"),
  leadSource: z.string().trim().min(1).optional(),
  preferredChannel: z.string().trim().min(1).optional(),
  assignedOwner: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CreateContactInput = z.input<typeof createContactSchema>;

export function buildContactRow(input: CreateContactInput, opts: { now?: Date; id?: string } = {}): ContactRow {
  const p = createContactSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("ct"),
    companyId: p.companyId ?? null,
    fullName: p.fullName,
    role: p.role ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    whatsapp: p.whatsapp ?? null,
    linkedin: p.linkedin ?? null,
    relationshipType: p.relationshipType,
    leadSource: p.leadSource ?? null,
    preferredChannel: p.preferredChannel ?? null,
    lastContactedAt: null,
    nextFollowUpAt: null,
    assignedOwner: p.assignedOwner ?? null,
    notes: p.notes ?? null,
    tags: p.tags,
    metadata: p.metadata,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export const createLeadSchema = z.object({
  name: z.string().trim().min(1),
  companyId: z.string().trim().min(1).optional(),
  contactId: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  campaign: z.string().trim().min(1).optional(),
  intentLevel: z.enum(LEVELS).default("unknown"),
  budgetLevel: z.enum(LEVELS).default("unknown"),
  urgencyLevel: z.enum(LEVELS).default("unknown"),
  fitLevel: z.enum(LEVELS).default("unknown"),
  problemStated: z.string().trim().min(1).optional(),
  serviceInterest: z.array(z.string().trim().min(1)).default([]),
  assignedOwner: z.string().trim().min(1).optional(),
  status: z.enum(LEAD_STATUSES).default("new"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CreateLeadInput = z.input<typeof createLeadSchema>;

/** Rule-based lead score (0-100), AI-assisted later — from the ERP brief's score logic. */
export function scoreLead(input: { intentLevel?: string; budgetLevel?: string; urgencyLevel?: string; fitLevel?: string; problemStated?: string | null }): number {
  const w = (v?: string) => (v === "high" ? 3 : v === "medium" ? 2 : v === "low" ? 1 : 0);
  const raw = w(input.intentLevel) + w(input.budgetLevel) + w(input.urgencyLevel) + w(input.fitLevel) + (input.problemStated ? 2 : 0);
  return Math.round((raw / 14) * 100); // max = 3*4 + 2
}

export function buildLeadRow(input: CreateLeadInput, opts: { now?: Date; id?: string } = {}): LeadRow {
  const p = createLeadSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("ld"),
    name: p.name,
    companyId: p.companyId ?? null,
    contactId: p.contactId ?? null,
    source: p.source ?? null,
    campaign: p.campaign ?? null,
    score: scoreLead(p),
    intentLevel: p.intentLevel,
    budgetLevel: p.budgetLevel,
    urgencyLevel: p.urgencyLevel,
    fitLevel: p.fitLevel,
    problemStated: p.problemStated ?? null,
    serviceInterest: p.serviceInterest,
    assignedOwner: p.assignedOwner ?? null,
    status: p.status,
    convertedOpportunityId: null,
    metadata: p.metadata,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export const createOpportunitySchema = z.object({
  name: z.string().trim().min(1),
  companyId: z.string().trim().min(1),
  contactId: z.string().trim().min(1).optional(),
  stage: z.enum(PIPELINE_STAGES).default("new_lead"),
  valueCents: z.number().int().min(0).default(0),
  currency: z.string().trim().min(1).default("USD"),
  probability: z.number().int().min(0).max(100).default(0),
  expectedCloseAt: z.coerce.date().optional(),
  source: z.string().trim().min(1).optional(),
  assignedOwner: z.string().trim().min(1).optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  serviceInterest: z.array(z.string().trim().min(1)).default([]),
  painPoints: z.string().trim().min(1).optional(),
  nextAction: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdBy: z.string().trim().min(1).optional(),
});
export type CreateOpportunityInput = z.input<typeof createOpportunitySchema>;

export function buildOpportunityRow(input: CreateOpportunityInput, opts: { now?: Date; id?: string } = {}): OpportunityRow {
  const p = createOpportunitySchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("opp"),
    name: p.name,
    companyId: p.companyId,
    contactId: p.contactId ?? null,
    stage: p.stage,
    valueCents: p.valueCents,
    currency: p.currency,
    probability: p.probability,
    expectedCloseAt: p.expectedCloseAt ?? null,
    source: p.source ?? null,
    assignedOwner: p.assignedOwner ?? null,
    priority: p.priority,
    serviceInterest: p.serviceInterest,
    painPoints: p.painPoints ?? null,
    nextAction: p.nextAction ?? null,
    nextActionAt: null,
    status: "open",
    lostReason: null,
    winReason: null,
    proposalId: null,
    invoiceId: null,
    metadata: p.metadata,
    createdBy: p.createdBy ?? null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Terminal stages resolve the opportunity's open/won/lost status. */
export function statusForStage(stage: PipelineStage): OpportunityStatus {
  if (stage === "won") return "won";
  if (stage === "lost") return "lost";
  return "open";
}
