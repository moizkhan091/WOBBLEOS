import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { crmCompanies } from "@/db/schema";
import { recordIntelligenceItem } from "@/lib/intelligence";
import type { MeetingIntelligenceRow } from "@/lib/domain/meeting-intelligence";
import type { IntelligenceItemType } from "@/lib/domain/intelligence";

/**
 * What a founder learns on a sales call is market intelligence, and it was being thrown away.
 *
 * Every approved discovery fact is a first-hand observation about a real business in WOBBLE's market:
 * what they push back on, what they already run, what they are willing to pay for. The Intelligence
 * module exists to collect exactly this and was only ever fed by scrapers.
 *
 * Rules that keep it useful rather than noisy:
 *   - only APPROVED findings travel. A founder has already judged them true.
 *   - only the kinds that generalise. One client's timeline is about that client; their objection and
 *     their stack are about the market.
 *   - it lands `pending` in the review inbox like every other source, never straight into memory.
 */

export const DISCOVERY_INTEL_AGENT = "meeting_intelligence_analyst";

/** Which finding kinds say something about the market rather than only about one client. */
const ROUTABLE: Record<string, { itemType: IntelligenceItemType; title: (name: string) => string; why: string }> = {
  objection: {
    itemType: "sales_objection",
    title: (name) => `Objection raised by ${name}`,
    why: "An objection heard first-hand is the most reliable objection data there is, and it should shape the next proposal rather than being forgotten after the call.",
  },
  current_stack: {
    itemType: "market_trend",
    title: (name) => `What ${name} runs on today`,
    why: "What this market actually uses decides what an integration has to speak to. Scraped pages never say this honestly.",
  },
  budget: {
    itemType: "lead_quality",
    title: (name) => `Budget signal from ${name}`,
    why: "Real budget signals from real conversations are what stop two similar clients being quoted wildly different numbers.",
  },
};

export function isRoutableKind(kind: string): boolean {
  return kind in ROUTABLE;
}

export interface RouteResult {
  routed: boolean;
  itemType?: string;
  reason?: string;
}

/**
 * Send one approved finding to the intelligence inbox.
 *
 * Never throws into the caller's path: a discovery fact that could not be filed as market intel must
 * not fail the founder's approval of that fact.
 */
export async function routeApprovedFinding(fact: MeetingIntelligenceRow, deps: { db?: Db; now?: Date } = {}): Promise<RouteResult> {
  if (fact.status !== "approved") return { routed: false, reason: "only approved findings become intelligence" };
  const rule = ROUTABLE[fact.kind];
  if (!rule) return { routed: false, reason: `'${fact.kind}' is about this client, not the market` };

  const db = deps.db ?? getDb();
  let clientName = "a client";
  let industry: string | null = null;
  if (fact.companyId) {
    const [company] = await db.select({ name: crmCompanies.name, industry: crmCompanies.industry }).from(crmCompanies).where(eq(crmCompanies.id, fact.companyId)).limit(1);
    if (company) {
      clientName = company.name;
      industry = company.industry ?? null;
    }
  }

  try {
    await recordIntelligenceItem({
      itemType: rule.itemType,
      // Scoped to the market, not to the client: the point is that it generalises. The client is still
      // recorded, so a founder reading it can go back to where it came from.
      scope: "market",
      clientId: fact.companyId ?? undefined,
      title: rule.title(clientName),
      summary: fact.content,
      rawText: fact.sourceSnippet ?? undefined,
      // Heard directly from the business, and already approved by a founder. That is a stronger source
      // than anything scraped, and the trust level should say so.
      trustLevel: "tier_2_verified",
      approvalStatus: "pending",
      confidence: String(fact.confidence),
      observedAt: fact.createdAt,
      tags: ["discovery_call", fact.kind, ...(industry ? [industry] : [])],
      metadata: { meetingId: fact.meetingId, discoveryFactId: fact.id, why: rule.why },
      createdByAgent: DISCOVERY_INTEL_AGENT,
    });
    return { routed: true, itemType: rule.itemType };
  } catch (error) {
    return { routed: false, reason: error instanceof Error ? error.message : "failed to file" };
  }
}
