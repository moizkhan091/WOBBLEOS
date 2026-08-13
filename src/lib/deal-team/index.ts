import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { crmCompanies, crmContacts, meetingIntelligence, proposals, qualificationAssessments } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { getClientIntakeContext } from "@/lib/intake/context";
import { sanitizeDeep } from "@/lib/domain/house-style";
import { WOBBLE_SERVICES } from "@/lib/domain/free-audit";
import { parseStructuredWithRepair, repairInstruction } from "@/lib/providers/structured";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import {
  DEAL_REVIEWER_AGENT,
  DEAL_TEAM_MODULE,
  FOLLOW_UP_WRITER_AGENT,
  OBJECTION_HANDLER_AGENT,
  PRICING_ANALYST_AGENT,
  contextIsEmpty,
  dealCritiqueSchema,
  dealReviewSystemPrompt,
  followUpDraftSchema,
  followUpSystemPrompt,
  objectionBriefSchema,
  objectionSystemPrompt,
  pricingOpinionSchema,
  pricingSystemPrompt,
  renderContext,
  unverifiableClaims,
  type DealCritique,
  type DealTeamContext,
  type FollowUpChannel,
  type FollowUpDraft,
  type ObjectionBrief,
  type PricingOpinion,
} from "@/lib/domain/deal-team";

/**
 * The deal team's execution paths.
 *
 * Four agents that were registered and paused because nothing ran them. Each now has one entry point,
 * reads the SAME assembled client context, and writes its result where the client container can read it
 * back. Nothing here sends a message, changes a price, or moves a deal.
 *
 * Results live on the company's (or proposal's) metadata, the same place the generated question set
 * already lives, so a founder's own notes and an agent's output survive together and get backed up
 * together.
 */

export interface DealTeamDeps {
  runProvider?: (input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number; temperature?: number; agentSlug: string }) => Promise<{ text: string }>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  loadContext?: (companyId: string, proposalId?: string) => Promise<DealTeamContext | null>;
  now?: Date;
  actor?: string;
}

function provider(deps: DealTeamDeps) {
  return (
    deps.runProvider ??
    (async (input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number; temperature?: number; agentSlug: string }) => {
      const { agentSlug, ...rest } = input;
      const r = await runTextProvider({ ...rest, usageContext: { agentSlug, module: DEAL_TEAM_MODULE } });
      return { text: r.text };
    })
  );
}

async function audit(deps: DealTeamDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

/**
 * Everything the deal team is allowed to know about a client, assembled once.
 *
 * `pastQuotes` deliberately excludes this client's own proposals: an analyst comparing a quote against
 * itself would report "consistent" every time.
 */
export async function loadDealTeamContext(companyId: string, proposalId?: string, db: Db = getDb()): Promise<DealTeamContext | null> {
  const [company] = await db.select().from(crmCompanies).where(eq(crmCompanies.id, companyId)).limit(1);
  if (!company) return null;
  // The reviewer reasoned about this unprompted on a real proposal ("778 times her signing authority"),
  // which is a strong sign it belongs in the context rather than being rediscovered each time.
  const rawAuthority = ((company.metadata ?? {}) as Record<string, unknown>).soloAuthorityCents;
  const soloAuthorityCents = typeof rawAuthority === "number" && rawAuthority > 0 ? rawAuthority : null;

  const [{ auditBlock }, facts, quals, companyProposals, otherProposals, contacts] = await Promise.all([
    getClientIntakeContext(companyId).catch(() => ({ auditBlock: "" })),
    db.select().from(meetingIntelligence).where(and(eq(meetingIntelligence.companyId, companyId), eq(meetingIntelligence.status, "approved"))).limit(60),
    db
      .select({ grade: qualificationAssessments.grade, overallScore: qualificationAssessments.overallScore, recommendation: qualificationAssessments.recommendation, version: qualificationAssessments.version })
      .from(qualificationAssessments)
      .where(and(eq(qualificationAssessments.subjectType, "company"), eq(qualificationAssessments.subjectId, companyId)))
      .orderBy(desc(qualificationAssessments.version))
      .limit(1),
    db.select().from(proposals).where(and(eq(proposals.companyId, companyId), isNull(proposals.archivedAt))).orderBy(desc(proposals.createdAt)).limit(10),
    db
      .select({ title: proposals.title, pricingCents: proposals.pricingCents, currency: proposals.currency, status: proposals.status, companyId: proposals.companyId, metadata: proposals.metadata })
      .from(proposals)
      .where(and(ne(proposals.companyId, companyId), isNull(proposals.archivedAt)))
      .orderBy(desc(proposals.createdAt))
      .limit(25),
    db.select({ fullName: crmContacts.fullName, lastContactedAt: crmContacts.lastContactedAt, preferredChannel: crmContacts.preferredChannel }).from(crmContacts).where(eq(crmContacts.companyId, companyId)).limit(20),
  ]);

  const chosen = proposalId ? companyProposals.find((p) => p.id === proposalId) : companyProposals[0];
  const qual = quals[0];

  // Industry on a past quote is what makes the comparison arguable ("a clinic paid X, this is a clinic").
  // One query for all of them, never one per proposal.
  const otherCompanyIds = [...new Set(otherProposals.map((p) => p.companyId).filter((x): x is string => Boolean(x)))];
  const industryById = new Map<string, string | null>();
  if (otherCompanyIds.length) {
    const rows = await db.select({ id: crmCompanies.id, industry: crmCompanies.industry }).from(crmCompanies).where(inArray(crmCompanies.id, otherCompanyIds));
    for (const r of rows) industryById.set(r.id, r.industry ?? null);
  }

  return {
    companyName: company.name,
    industry: company.industry ?? null,
    intake: auditBlock,
    approvedFindings: facts.map((f) => `[${f.kind}] ${f.content}`),
    qualification: qual ? `grade ${qual.grade}, score ${qual.overallScore}. ${qual.recommendation}` : null,
    services: WOBBLE_SERVICES.map((s) => s.name),
    proposal: chosen
      ? (() => {
          // Since the pricing gate landed, an undecided proposal carries zero. Passing that through as
          // a price told the analyst the client was being charged nothing, and it judged accordingly.
          const meta = (chosen.metadata ?? {}) as Record<string, unknown>;
          const pricing = meta.pricing as { decision?: { oneOffCents?: number }; cost?: { oneOffCents?: number; monthlyCents?: number } } | undefined;
          const decided = pricing?.decision?.oneOffCents;
          return {
            title: chosen.title,
            totalCents: typeof decided === "number" && decided > 0 ? decided : chosen.pricingCents > 0 ? chosen.pricingCents : null,
            currency: chosen.currency,
            scope: chosen.scope ?? null,
            services: (chosen.services ?? []).map((s: { name: string; priceCents?: number }) => ({ name: s.name, priceCents: s.priceCents })),
            terms: chosen.terms ?? null,
            costOneOffCents: pricing?.cost?.oneOffCents ?? null,
            costMonthlyCents: pricing?.cost?.monthlyCents ?? null,
            soloAuthorityCents: soloAuthorityCents,
          };
        })()
      : null,
    // Only genuinely PRICED proposals count as history. A draft nobody decided on is not a benchmark,
    // and since the pricing gate landed an undecided proposal carries zero, so this filter is exact.
    pastQuotes: otherProposals
      .filter((p) => p.pricingCents > 0)
      .map((p) => {
        const pricing = ((p.metadata ?? {}) as Record<string, unknown>).pricing as { decision?: { reasoning?: string }; cost?: { oneOffCents?: number } } | undefined;
        return {
          title: p.title,
          totalCents: p.pricingCents,
          currency: p.currency,
          status: p.status,
          industry: p.companyId ? industryById.get(p.companyId) ?? null : null,
          reasoning: pricing?.decision?.reasoning,
          costCents: pricing?.cost?.oneOffCents,
        };
      }),
    lastMessages: contacts
      .filter((c) => c.lastContactedAt)
      .map((c) => `${c.fullName} last contacted ${new Date(c.lastContactedAt as Date).toISOString().slice(0, 10)}${c.preferredChannel ? ` on ${c.preferredChannel}` : ""}`),
  };
}

/** Run one deal-team agent: prompt, structured parse with one repair round, house style enforced. */
async function runAgent<T>(
  deps: DealTeamDeps,
  opts: { role: string; agentSlug: string; system: string; user: string; schema: Parameters<typeof parseStructuredWithRepair<T>>[1]; maxTokens: number; temperature: number; shortenHint?: string },
): Promise<T> {
  const run = provider(deps);
  const messages: ProviderChatMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  const first = await run({ role: opts.role, module: DEAL_TEAM_MODULE, messages, maxTokens: opts.maxTokens, temperature: opts.temperature, agentSlug: opts.agentSlug });
  const parsed = await parseStructuredWithRepair(first.text, opts.schema, {
    shortenHint: opts.shortenHint,
    repair: async (bad, instruction) => {
      const r = await run({
        role: opts.role,
        module: DEAL_TEAM_MODULE,
        messages: [...messages, { role: "assistant", content: bad }, { role: "user", content: instruction }],
        // Half again as much room. A repair at the SAME ceiling that truncated the first answer is a
        // call spent to fail identically, which is exactly what happened on the first real proposal.
        maxTokens: Math.round(opts.maxTokens * 1.5),
        temperature: 0.2,
        agentSlug: opts.agentSlug,
      });
      return r.text;
    },
  });
  if (!parsed.ok || !parsed.data) throw new Error(`${opts.agentSlug} returned unusable output, ${parsed.error}`);
  return sanitizeDeep(parsed.data);
}

/** Store an agent's result on the company, keyed by name, with when and by whom. */
async function storeOnCompany(companyId: string, key: string, value: unknown, now: Date, db: Db = getDb()): Promise<void> {
  const [row] = await db.select({ metadata: crmCompanies.metadata }).from(crmCompanies).where(eq(crmCompanies.id, companyId)).limit(1);
  const metadata = { ...((row?.metadata ?? {}) as Record<string, unknown>), [key]: { ...(value as object), generatedAt: now.toISOString() } };
  await db.update(crmCompanies).set({ metadata, updatedAt: now }).where(eq(crmCompanies.id, companyId));
}

// -------------------------------------------------------------------------- the four

export async function generateObjectionBrief(companyId: string, deps: DealTeamDeps = {}): Promise<ObjectionBrief> {
  const now = deps.now ?? new Date();
  const ctx = await (deps.loadContext ?? ((id: string) => loadDealTeamContext(id)))(companyId);
  if (!ctx) throw new Error("company not found");
  if (contextIsEmpty(ctx)) throw new Error("nothing to reason from yet: no form answers, no approved findings, no qualification and no proposal");

  const brief = await runAgent<ObjectionBrief>(deps, {
    role: "objection_handling",
    agentSlug: OBJECTION_HANDLER_AGENT,
    system: objectionSystemPrompt(),
    user: `${renderContext(ctx)}\n\nWrite the objections this client will raise, and the answer to each. STRICT JSON only.`,
    schema: objectionBriefSchema,
    maxTokens: 2600,
    temperature: 0.4,
  });

  await storeOnCompany(companyId, "objectionBrief", brief, now);
  await audit(deps, { eventType: "deal_team.objections.generated", module: DEAL_TEAM_MODULE, entityType: "crm_company", entityId: companyId, actor: deps.actor ?? OBJECTION_HANDLER_AGENT, metadata: { count: brief.objections.length } });
  return brief;
}

export async function draftFollowUp(companyId: string, opts: { channel: FollowUpChannel; tone?: string; purpose?: string }, deps: DealTeamDeps = {}): Promise<FollowUpDraft> {
  const now = deps.now ?? new Date();
  const ctx = await (deps.loadContext ?? ((id: string) => loadDealTeamContext(id)))(companyId);
  if (!ctx) throw new Error("company not found");
  if (contextIsEmpty(ctx)) throw new Error("nothing to reason from yet: a generic follow-up is worse than none");

  const tone = opts.tone?.trim() || "direct, warm, no filler, the way a founder writes to someone they respect";
  const draft = await runAgent<FollowUpDraft>(deps, {
    role: "follow_up_writing",
    agentSlug: FOLLOW_UP_WRITER_AGENT,
    system: followUpSystemPrompt(opts.channel, tone),
    user: `${renderContext(ctx)}\n\n${opts.purpose?.trim() ? `What this message is for: ${opts.purpose.trim()}` : "Write the natural next message given where this client is."}\n\nSTRICT JSON only.`,
    schema: followUpDraftSchema,
    maxTokens: 1200,
    temperature: 0.6,
  });

  // The prompt forbids inventing a case study and it invented one anyway on a live client, so the draft
  // is checked against the only thing the writer was given. A founder about to paste this into WhatsApp
  // needs the warning ON the draft, not in a log.
  const claims = unverifiableClaims(draft.body, renderContext(ctx));
  const checked: FollowUpDraft & { unverifiedClaims?: string[] } = claims.length ? { ...draft, unverifiedClaims: claims } : draft;

  await storeOnCompany(companyId, "followUpDraft", checked, now);
  await audit(deps, { eventType: "deal_team.follow_up.drafted", module: DEAL_TEAM_MODULE, entityType: "crm_company", entityId: companyId, actor: deps.actor ?? FOLLOW_UP_WRITER_AGENT, metadata: { channel: opts.channel, unverifiedClaims: claims.length } });
  return checked;
}

export interface ProposalReview {
  /** Null when that half failed. One half is worth far more than nothing. */
  critique: DealCritique | null;
  pricing: PricingOpinion | null;
  /** What failed, said plainly, so a founder is not left wondering which agent went quiet. */
  failures: string[];
}

/**
 * The pre-send review: the adversary and the analyst, on the same proposal.
 *
 * They run together because a founder about to send a proposal wants one answer, not two errands, and
 * because the two failure modes (a promise the findings do not support, and a price with no reason)
 * usually appear in the same document.
 */
export async function reviewProposalBeforeSending(proposalId: string, deps: DealTeamDeps = {}, db: Db = getDb()): Promise<ProposalReview> {
  const now = deps.now ?? new Date();
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) throw new Error("proposal not found");
  if (!proposal.companyId) throw new Error("this proposal is not attached to a client, so there is nothing to review it against");

  const ctx = await (deps.loadContext ?? ((id: string, pid?: string) => loadDealTeamContext(id, pid)))(proposal.companyId, proposalId);
  if (!ctx) throw new Error("company not found");
  if (!ctx.proposal) throw new Error("proposal could not be loaded into the review context");

  const rendered = renderContext(ctx);
  // allSettled, not all: two Sonnet calls that both succeed and are then thrown away because a third
  // thing failed is the worst possible outcome, and it is what happened on the first real proposal.
  // Whatever lands gets saved.
  const [critiqueResult, pricingResult] = await Promise.allSettled([
    runAgent<DealCritique>(deps, {
      role: "deal_review",
      agentSlug: DEAL_REVIEWER_AGENT,
      system: dealReviewSystemPrompt(),
      user: `${rendered}\n\nArgue this client's side of the proposal above. STRICT JSON only.`,
      schema: dealCritiqueSchema,
      maxTokens: 6000,
      temperature: 0.3,
      shortenHint: "Keep the four or five issues that would actually stop this client signing. Drop the rest.",
    }),
    runAgent<PricingOpinion>(deps, {
      role: "pricing_analysis",
      agentSlug: PRICING_ANALYST_AGENT,
      system: pricingSystemPrompt(),
      user: `${rendered}\n\nSanity-check the quote above. STRICT JSON only.`,
      schema: pricingOpinionSchema,
      maxTokens: 3000,
      temperature: 0.2,
      shortenHint: "Three notes at most, each with a number in it.",
    }),
  ]);

  const critique = critiqueResult.status === "fulfilled" ? critiqueResult.value : null;
  const pricing = pricingResult.status === "fulfilled" ? pricingResult.value : null;
  const failures = [
    critiqueResult.status === "rejected" ? `deal reviewer: ${critiqueResult.reason instanceof Error ? critiqueResult.reason.message : "failed"}` : null,
    pricingResult.status === "rejected" ? `pricing analyst: ${pricingResult.reason instanceof Error ? pricingResult.reason.message : "failed"}` : null,
  ].filter((x): x is string => Boolean(x));

  if (!critique && !pricing) throw new Error(`the pre-send review produced nothing: ${failures.join("; ")}`);

  const metadata = { ...((proposal.metadata ?? {}) as Record<string, unknown>), preSendReview: { critique, pricing, failures, reviewedAt: now.toISOString() } };
  await db.update(proposals).set({ metadata, updatedAt: now }).where(eq(proposals.id, proposalId));

  await audit(deps, {
    eventType: "deal_team.proposal.reviewed",
    module: DEAL_TEAM_MODULE,
    entityType: "proposal",
    entityId: proposalId,
    actor: deps.actor ?? DEAL_REVIEWER_AGENT,
    metadata: { verdict: critique?.verdict ?? null, blockers: critique?.items.filter((i) => i.severity === "blocker").length ?? 0, pricingVerdict: pricing?.verdict ?? null, failures },
  });

  return { critique, pricing, failures };
}

/** Read back whatever the deal team has already produced for a client, without running anything. */
export async function getDealTeamOutputs(companyId: string, db: Db = getDb()): Promise<{ objections: (ObjectionBrief & { generatedAt?: string }) | null; followUp: (FollowUpDraft & { generatedAt?: string }) | null }> {
  const [row] = await db.select({ metadata: crmCompanies.metadata }).from(crmCompanies).where(eq(crmCompanies.id, companyId)).limit(1);
  const metadata = (row?.metadata ?? {}) as Record<string, unknown>;
  return {
    objections: (metadata.objectionBrief as ObjectionBrief & { generatedAt?: string }) ?? null,
    followUp: (metadata.followUpDraft as FollowUpDraft & { generatedAt?: string }) ?? null,
  };
}
