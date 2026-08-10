import { z } from "zod";
import type { CreateCompanyInput, CreateContactInput, CreateLeadInput, CreateOpportunityInput, PipelineStage } from "@/lib/domain/crm";

/**
 * Inbound form intake — the SINGLE front door into the OS (pure, DB-free).
 *
 * Founder SOP: a lead may only enter WOBBLE through the website readiness form. That form POSTs to n8n,
 * n8n signs the payload and hands it to us, and THIS file turns that raw submission into the client
 * container: company + contact + lead + pipeline opportunity, all linked.
 *
 * Everything here is pure so the mapping (which decides how a human's dropdown answer becomes a
 * qualification level, a pipeline stage, and a score) is unit-testable without a database or a webhook.
 *
 * The payload shape is taken from a REAL production submission (n8n execution 204120), not guessed.
 */

export const INTAKE_MODULE = "intake";

/** Lead source recorded on every record created from the readiness form. */
export const READINESS_FORM_SOURCE = "website_readiness_form";

// ---------------------------------------------------------------- payload schema
//
// Deliberately permissive: the website form is owned by the marketing site and WILL gain fields over
// time. We validate the few things we genuinely need (a contact email or a company name) and passthrough
// the rest into metadata, so a new field on the form can never 400 a real lead into the void.

const looseString = z.string().trim().optional();

export const readinessSubmissionSchema = z.object({
  form: looseString,
  submitted_at: looseString,
  contact: z
    .object({
      name: looseString,
      email: looseString,
      phone: looseString,
      whatsapp_is_same_number: looseString,
      whatsapp_number: looseString,
    })
    .partial()
    .default({}),
  business: z
    .object({
      company_name: looseString,
      online_presence: z.array(z.string()).default([]),
      city_market: looseString,
      role: looseString,
      team_size: looseString,
    })
    .partial()
    .default({}),
  context: z
    .object({
      business_description: looseString,
      focus_areas: z.array(z.string()).default([]),
      pain_points: looseString,
    })
    .partial()
    .default({}),
  readiness: z
    .object({
      ai_workflow_stage: looseString,
      current_tools: looseString,
      urgency: looseString,
      open_to_paid_audit: looseString,
      can_share_workflow_context: looseString,
      what_makes_call_useful: looseString,
      lower_readiness_flag: z.boolean().optional(),
      future_lead_flag: z.boolean().optional(),
    })
    .partial()
    .default({}),
  meta: z
    .object({
      source_page: looseString,
      cta_clicked: looseString,
      utm_source: looseString,
      utm_medium: looseString,
      utm_campaign: looseString,
      page_url: looseString,
      user_agent: looseString,
    })
    .partial()
    .default({}),
});

export type ReadinessSubmission = z.infer<typeof readinessSubmissionSchema>;

/** A submission is only useful if we can name the business or reach the human. */
export function validateSubmission(s: ReadinessSubmission): string | null {
  const hasIdentity = Boolean(s.business?.company_name || s.contact?.name);
  const hasReach = Boolean(s.contact?.email || s.contact?.phone);
  if (!hasIdentity) return "submission has neither a company name nor a contact name";
  if (!hasReach) return "submission has neither an email nor a phone number";
  return null;
}

// ---------------------------------------------------------------- link classification

export type LinkKind = "website" | "instagram" | "linkedin" | "facebook" | "tiktok" | "twitter" | "youtube";

const SOCIAL_PATTERNS: Array<[LinkKind, RegExp]> = [
  ["instagram", /instagram\.com|instagr\.am/i],
  ["linkedin", /linkedin\.com|lnkd\.in/i],
  ["facebook", /facebook\.com|fb\.com|fb\.me/i],
  ["tiktok", /tiktok\.com/i],
  ["twitter", /twitter\.com|(^|\/\/)(www\.)?x\.com/i],
  ["youtube", /youtube\.com|youtu\.be/i],
];

/** Normalise a user-typed link ("wobblepk.com", "https://x/y") into an absolute URL, or null if junk. */
export function normalizeUrl(raw: string): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Bare registrable host, lowercased, no www — the key we dedupe companies on. */
export function extractDomain(raw: string): string | null {
  const url = normalizeUrl(raw);
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Split the form's free-form `online_presence` array into ONE canonical website plus a social map.
 * The founder's form lets a lead paste "as many as you have" in any order, and plenty of businesses
 * have an Instagram but no site — so the first NON-social link wins the website slot and the rest are
 * filed by platform. Both feed the enrichment agent later.
 */
export function classifyLinks(links: string[] = []): { website: string | null; socialLinks: Record<string, string> } {
  let website: string | null = null;
  const socialLinks: Record<string, string> = {};
  for (const raw of links) {
    const url = normalizeUrl(raw);
    if (!url) continue;
    const match = SOCIAL_PATTERNS.find(([, re]) => re.test(url));
    if (match) {
      // Keep the first link per platform; a lead pasting two Instagram URLs shouldn't clobber.
      if (!socialLinks[match[0]]) socialLinks[match[0]] = url;
    } else if (!website) {
      website = url;
    }
  }
  return { website, socialLinks };
}

// ---------------------------------------------------------------- answer → level mapping
//
// The form's dropdowns are human sentences ("Some context, depends what is needed"), and marketing may
// reword them at any time. Matching on REGEX INTENT rather than exact strings means a copy tweak on the
// website degrades to "unknown" instead of silently mis-scoring every lead that follows.

export type Level = "unknown" | "low" | "medium" | "high";

/** How soon they want to improve → urgency. */
export function mapUrgency(answer?: string): Level {
  const v = (answer ?? "").toLowerCase();
  if (!v) return "unknown";
  if (/immediat|asap|urgent|right away|this week|now/.test(v)) return "high";
  if (/month|30 day|quarter|soon|next/.test(v)) return "medium";
  if (/explor|browsing|no rush|later|someday|6\+|year/.test(v)) return "low";
  return "unknown";
}

/** Openness to a PAID audit is our best available proxy for real budget — the form asks no money question. */
export function mapPaidAuditOpenness(answer?: string): Level {
  const v = (answer ?? "").toLowerCase();
  if (!v) return "unknown";
  if (/^yes|definitely|absolutely|open to it/.test(v)) return "high";
  if (/maybe|depend|perhaps|possibly|not sure|unsure/.test(v)) return "medium";
  if (/^no|not interested|can't|cannot/.test(v)) return "low";
  return "unknown";
}

/** Willingness to share workflow context → whether an audit is even DELIVERABLE. Drives fit. */
export function mapContextSharing(answer?: string): Level {
  const v = (answer ?? "").toLowerCase();
  if (!v) return "unknown";
  if (/^yes|full|everything|happy to|all of it|complete/.test(v)) return "high";
  if (/some|depend|partial|most|within reason|limited/.test(v)) return "medium";
  if (/^no|can't|cannot|confidential|not able/.test(v)) return "low";
  return "unknown";
}

/** Where they are with AI today → how ready they are to actually adopt. */
export function mapAiStage(answer?: string): Level {
  const v = (answer ?? "").toLowerCase();
  if (!v) return "unknown";
  if (/using|production|deployed|built|integrated|already/.test(v)) return "high";
  if (/experiment|testing|trying|piloting|explor|personally/.test(v)) return "medium";
  if (/nothing|none|haven't|not yet|no experience|manual/.test(v)) return "low";
  return "unknown";
}

/** Team size → rough company weight. Parses the leading number of "2–10", "11-25", "50+". */
export function mapTeamSize(answer?: string): Level {
  const v = (answer ?? "").replace(/[–—]/g, "-").toLowerCase();
  if (!v) return "unknown";
  const nums = v.match(/\d+/g)?.map(Number) ?? [];
  const top = nums.length ? Math.max(...nums) : 0;
  if (/\b(50|100|200|500)\s*\+/.test(v) || top >= 50) return "high";
  if (top >= 11) return "medium";
  if (top >= 1) return "low";
  return "unknown";
}

/** Founder/owner in the room means the decision-maker is on the call — the single biggest sales signal. */
export function isDecisionMaker(role?: string): boolean {
  return /founder|owner|ceo|director|partner|principal|managing/i.test(role ?? "");
}

/** Map the form's role wording onto the CRM's contact-relationship enum. */
export function mapRelationship(role?: string): CreateContactInput["relationshipType"] {
  const v = (role ?? "").toLowerCase();
  if (/founder|owner/.test(v)) return "founder";
  if (/ceo|managing director/.test(v)) return "ceo";
  if (/market/.test(v)) return "marketing_head";
  if (/sales|revenue/.test(v)) return "sales_head";
  if (/ops|operation/.test(v)) return "operations_head";
  if (/financ|account/.test(v)) return "finance_contact";
  if (/manager|director|head|lead/.test(v)) return "decision_maker";
  return "other";
}

// ---------------------------------------------------------------- qualification

export interface Qualification {
  intentLevel: Level;
  budgetLevel: Level;
  urgencyLevel: Level;
  fitLevel: Level;
}

/**
 * Turn the readiness answers into the CRM's four qualification levels.
 *
 * Intent  = do they actually want to buy (paid-audit openness, sharpened by urgency + a real pain).
 * Budget  = paid-audit openness weighted by company size (no budget question exists on the form).
 * Urgency = straight from the timing answer.
 * Fit     = can we DELIVER for them (context sharing + AI maturity).
 *
 * `isDecisionMaker` deliberately feeds NONE of these. Having the founder in the room is a
 * CLOSEABILITY signal, not a wanting-to-buy or a can-we-deliver one — averaging it in made a founder
 * who explicitly declined a paid audit score "medium" fit. It is kept on the contact + drives deal
 * priority instead, where it actually means something.
 */
export function qualify(s: ReadinessSubmission): Qualification {
  const openness = mapPaidAuditOpenness(s.readiness?.open_to_paid_audit);
  const urgency = mapUrgency(s.readiness?.urgency);
  const sharing = mapContextSharing(s.readiness?.can_share_workflow_context);
  const stage = mapAiStage(s.readiness?.ai_workflow_stage);
  const size = mapTeamSize(s.business?.team_size);
  const painDescribed = (s.context?.pain_points ?? "").trim().length >= 20;

  const rank: Record<Level, number> = { unknown: 0, low: 1, medium: 2, high: 3 };
  const toLevel = (n: number): Level => (n >= 3 ? "high" : n === 2 ? "medium" : n === 1 ? "low" : "unknown");
  const avg = (...ls: Level[]) => {
    const known = ls.filter((l) => l !== "unknown");
    if (!known.length) return 0;
    return Math.round(known.reduce((a, l) => a + rank[l], 0) / known.length);
  };

  // A described pain nudges intent up — someone who typed out their bottleneck is further along than
  // someone who ticked a box, even if they picked the same dropdown answers.
  const intentBase = avg(openness, urgency);
  const intent = toLevel(painDescribed && intentBase > 0 ? Math.min(3, intentBase + 1) : intentBase);

  return {
    intentLevel: intent,
    budgetLevel: toLevel(avg(openness, size)),
    urgencyLevel: urgency,
    fitLevel: toLevel(avg(sharing, stage)),
  };
}

export type Tier = "Hot" | "Warm" | "Cold";

/** Same thresholds the Lead Magnet pipeline already uses, so both front doors speak one language. */
export function tierForScore(score: number): Tier {
  return score >= 70 ? "Hot" : score >= 45 ? "Warm" : "Cold";
}

/**
 * Which pipeline stage a brand-new submission lands on.
 *
 * The form is a REQUEST for a readiness call, not a booked one — so we never claim `ai_readiness_call_booked`
 * (that stage means a slot exists in the calendar). A qualified inbound starts at `qualified`; the form's own
 * flags demote it. Founders move it forward from there.
 */
export function stageForSubmission(s: ReadinessSubmission, q: Qualification): PipelineStage {
  if (s.readiness?.future_lead_flag) return "nurture";
  if (s.readiness?.lower_readiness_flag) return "new_lead";
  if (q.intentLevel === "high" || q.fitLevel === "high") return "qualified";
  return "new_lead";
}

// ---------------------------------------------------------------- mapping to CRM inputs

// ---------------------------------------------------------------- reading the intake back out
//
// Capturing the form is only half the job. Everything below turns a stored submission back into
// context the rest of the OS can consume — today the client-centric paid audit, next the pre-call
// question engine. Without this the answers sit in a metadata blob and no agent ever reads them,
// which is exactly the "info doesn't get passed along" the founder complained about.

/** One past form submission, flattened out of the lead row it was stored on. */
export interface IntakeSnapshot {
  submittedAt: string | null;
  contactName: string | null;
  role: string | null;
  teamSize: string | null;
  cityMarket: string | null;
  businessDescription: string | null;
  focusAreas: string[];
  painPoints: string | null;
  aiWorkflowStage: string | null;
  currentTools: string | null;
  urgency: string | null;
  openToPaidAudit: string | null;
  canShareWorkflowContext: string | null;
  whatMakesCallUseful: string | null;
  score: number | null;
  tier: Tier | null;
}

/** Narrow shape of the stored lead row this reads — keeps the function DB-free and testable. */
export interface StoredLeadLike {
  contactName?: string | null;
  problemStated?: string | null;
  serviceInterest?: string[] | null;
  score?: number | null;
  createdAt?: Date | string | null;
  metadata?: Record<string, unknown> | null;
}

function str(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

/** Rebuild a snapshot from a lead captured by the readiness form. */
export function snapshotFromLead(lead: StoredLeadLike, company?: { notes?: string | null; companySize?: string | null; city?: string | null }): IntakeSnapshot {
  const meta = (lead.metadata ?? {}) as Record<string, unknown>;
  const readiness = (meta.readiness ?? {}) as Record<string, unknown>;
  const score = typeof lead.score === "number" ? lead.score : null;
  return {
    submittedAt: str(meta.submittedAt) ?? (lead.createdAt ? new Date(lead.createdAt).toISOString() : null),
    contactName: str(lead.contactName),
    role: str((meta.role as string) ?? null),
    teamSize: str(company?.companySize),
    cityMarket: str(meta.cityMarket) ?? str(company?.city),
    businessDescription: str(company?.notes),
    focusAreas: Array.isArray(lead.serviceInterest) ? lead.serviceInterest.filter(Boolean) : [],
    painPoints: str(lead.problemStated),
    aiWorkflowStage: str(readiness.aiWorkflowStage),
    currentTools: str(readiness.currentTools),
    urgency: str(readiness.urgency),
    openToPaidAudit: str(readiness.openToPaidAudit),
    canShareWorkflowContext: str(readiness.canShareWorkflowContext),
    whatMakesCallUseful: str(readiness.whatMakesCallUseful),
    score,
    tier: score === null ? null : tierForScore(score),
  };
}

/**
 * Render stored submissions as an intake block for the paid-audit graph.
 *
 * The audit team is told these are the CLIENT'S OWN WORDS, because a self-reported bottleneck is
 * evidence to investigate rather than a conclusion to repeat back — a report that just parrots the
 * form adds nothing the founder didn't already have. Newest submission first; older ones are kept
 * (trimmed) because a change of answer over time is itself a signal.
 */
export function formatIntakeForAudit(snapshots: IntakeSnapshot[]): string {
  if (!snapshots.length) return "";
  const line = (label: string, v: string | null | undefined) => (v ? `- ${label}: ${v}` : null);
  const render = (s: IntakeSnapshot, index: number) =>
    [
      index === 0 ? "MOST RECENT SUBMISSION" : `EARLIER SUBMISSION (${s.submittedAt ?? "date unknown"})`,
      line("Who filled it in", [s.contactName, s.role].filter(Boolean).join(", ") || null),
      line("Team size", s.teamSize),
      line("City / market", s.cityMarket),
      line("What the business does", s.businessDescription),
      s.focusAreas.length ? `- Where they asked us to look first: ${s.focusAreas.join(", ")}` : null,
      line("What they say is slow, manual or person-dependent", s.painPoints),
      line("Where they are with AI today", s.aiWorkflowStage),
      line("Tools they use now", s.currentTools),
      line("How soon they want to move", s.urgency),
      line("Open to a paid audit", s.openToPaidAudit),
      line("Willing to share workflow context", s.canShareWorkflowContext),
      line("What would make the call useful to them", s.whatMakesCallUseful),
      s.score !== null ? `- Inbound qualification score: ${s.score}/100 (${s.tier})` : null,
    ]
      .filter(Boolean)
      .join("\n");

  return [
    "WHAT THE CLIENT TOLD US ON THE WEBSITE READINESS FORM (their own words — treat as claims to verify, not findings):",
    ...snapshots.slice(0, 3).map(render),
  ].join("\n\n");
}

export interface MappedIntake {
  company: CreateCompanyInput;
  contact: CreateContactInput | null;
  lead: CreateLeadInput;
  /** companyId/contactId are filled in by the service once the rows exist. */
  opportunity: Omit<CreateOpportunityInput, "companyId">;
  qualification: Qualification;
  stage: PipelineStage;
  /** Domain we deduped on (null when the lead gave no links). */
  domain: string | null;
  displayName: string;
}

/** The WhatsApp number, resolving the form's "same as phone?" toggle. */
export function resolveWhatsapp(c: ReadinessSubmission["contact"]): string | undefined {
  const same = /^yes/i.test(c?.whatsapp_is_same_number ?? "");
  const value = same ? c?.phone : c?.whatsapp_number || c?.phone;
  return value?.trim() || undefined;
}

/**
 * The whole translation: one raw form submission → every CRM record it should become.
 *
 * Nothing is thrown away. Every answer that has no first-class CRM column (AI stage, current tools,
 * what would make the call useful, UTMs, the raw submission itself) is preserved in metadata, because
 * the pre-call question engine and the audit both read it later.
 */
export function mapSubmissionToCrm(s: ReadinessSubmission, opts: { now?: Date } = {}): MappedIntake {
  const now = opts.now ?? new Date();
  const { website, socialLinks } = classifyLinks(s.business?.online_presence ?? []);
  const q = qualify(s);
  const stage = stageForSubmission(s, q);

  const companyName = (s.business?.company_name ?? "").trim();
  const contactName = (s.contact?.name ?? "").trim();
  const displayName = companyName || contactName || (s.contact?.email ?? "Unknown lead");
  const domain = website ? extractDomain(website) : null;
  const whatsapp = resolveWhatsapp(s.contact);
  const focusAreas = (s.context?.focus_areas ?? []).map((f) => f.trim()).filter(Boolean);
  const cityMarket = (s.business?.city_market ?? "").trim() || undefined;

  // Everything the CRM has no column for, kept verbatim for the question engine + audit.
  const readinessMeta = {
    aiWorkflowStage: s.readiness?.ai_workflow_stage ?? null,
    currentTools: s.readiness?.current_tools ?? null,
    urgency: s.readiness?.urgency ?? null,
    openToPaidAudit: s.readiness?.open_to_paid_audit ?? null,
    canShareWorkflowContext: s.readiness?.can_share_workflow_context ?? null,
    whatMakesCallUseful: s.readiness?.what_makes_call_useful ?? null,
    lowerReadinessFlag: s.readiness?.lower_readiness_flag ?? false,
    futureLeadFlag: s.readiness?.future_lead_flag ?? false,
  };
  const sourceMeta = {
    form: s.form ?? "AI Readiness Call Request",
    submittedAt: s.submitted_at ?? now.toISOString(),
    sourcePage: s.meta?.source_page ?? null,
    ctaClicked: s.meta?.cta_clicked ?? null,
    pageUrl: s.meta?.page_url ?? null,
    utmSource: s.meta?.utm_source || null,
    utmMedium: s.meta?.utm_medium || null,
    utmCampaign: s.meta?.utm_campaign || null,
  };
  const campaign = [s.meta?.utm_campaign, s.meta?.cta_clicked].map((v) => (v ?? "").trim()).find(Boolean);

  const company: CreateCompanyInput = {
    name: displayName,
    website: website ?? undefined,
    city: cityMarket,
    email: s.contact?.email || undefined,
    phone: s.contact?.phone || undefined,
    whatsapp,
    socialLinks,
    leadSource: READINESS_FORM_SOURCE,
    // Openness to a paid audit is what separates a browser from a real prospect.
    status: q.intentLevel === "high" ? "qualified_prospect" : "prospect",
    companySize: s.business?.team_size || undefined,
    notes: s.context?.business_description || undefined,
    tags: ["inbound", "readiness_form"],
    metadata: { intake: { ...sourceMeta, readiness: readinessMeta, domain }, focusAreas },
    createdBy: "n8n_readiness_form",
  };

  const contact: CreateContactInput | null = contactName
    ? {
        fullName: contactName,
        role: s.business?.role || undefined,
        email: s.contact?.email || undefined,
        phone: s.contact?.phone || undefined,
        whatsapp,
        linkedin: socialLinks.linkedin,
        relationshipType: mapRelationship(s.business?.role),
        leadSource: READINESS_FORM_SOURCE,
        // The form's own toggle tells us how this human prefers to be reached.
        preferredChannel: whatsapp ? "whatsapp" : s.contact?.email ? "email" : undefined,
        tags: ["inbound"],
        metadata: { isDecisionMaker: isDecisionMaker(s.business?.role) },
      }
    : null;

  const lead: CreateLeadInput = {
    name: displayName,
    contactName: contactName || undefined,
    email: s.contact?.email || undefined,
    phone: s.contact?.phone || undefined,
    whatsapp,
    companyName: companyName || undefined,
    website: website ?? undefined,
    source: READINESS_FORM_SOURCE,
    campaign,
    ...q,
    problemStated: s.context?.pain_points || undefined,
    serviceInterest: focusAreas,
    status: "new",
    metadata: { ...sourceMeta, readiness: readinessMeta, socialLinks, cityMarket: cityMarket ?? null },
  };

  const opportunity: Omit<CreateOpportunityInput, "companyId"> = {
    name: `${displayName} — AI Readiness`,
    stage,
    source: READINESS_FORM_SOURCE,
    // Where the decision-maker signal EARNS its keep: a merely-warm lead whose founder filled the form
    // himself is worth chasing before a warm one routed through an assistant.
    priority:
      q.intentLevel === "high" ? "high" : q.intentLevel === "low" ? "low" : isDecisionMaker(s.business?.role) ? "high" : "medium",
    serviceInterest: focusAreas,
    painPoints: s.context?.pain_points || undefined,
    nextAction: "Run the AI readiness call",
    metadata: { ...sourceMeta, readiness: readinessMeta },
    createdBy: "n8n_readiness_form",
  };

  return { company, contact, lead, opportunity, qualification: q, stage, domain, displayName };
}
