import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { crmCompanies, proposals } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { sanitizeHouseStyle } from "@/lib/domain/house-style";
import { computeDeliveryCost, costCorrectionSchema, costQuestions, marginAt, INTEGRATION_COSTS, type CostInputsView } from "@/lib/domain/delivery-cost";
import { decidePricing, pricingChecklist, pricingDecisionSchema, pricingPrompt, type PricingState } from "@/lib/domain/pricing-gate";
import { phaseOneWithinAuthority, rephasePrice } from "@/lib/domain/proposal-phasing";
import { proseAgreesWithPrice } from "@/lib/domain/quoted-price";
import { historyFor } from "@/lib/pricing-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/proposals/[id]/pricing — what this build costs us, and what a founder still has to decide.
 * POST — record the founder's price. This is the only way a priced document becomes sendable.
 *
 * The OS computes cost. Only a founder sets price. Nothing here suggests an amount, because a
 * suggestion becomes the decision, which is the failure this gate exists to prevent.
 */

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;

  try {
    const db = getDb();
    const [proposal] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
    if (!proposal) return NextResponse.json({ ok: false, error: "proposal not found" }, { status: 404 });
    const [company] = proposal.companyId
      ? await db.select({ industry: crmCompanies.industry }).from(crmCompanies).where(eq(crmCompanies.id, proposal.companyId)).limit(1)
      : [undefined];
    const state = (((proposal.metadata ?? {}) as Record<string, unknown>).pricing ?? null) as PricingState | null;
    return NextResponse.json({
      ok: true,
      status: state?.status ?? "awaiting_decision",
      cost: state?.cost ?? null,
      decision: state?.decision ?? null,
      auditEstimateCents: state?.auditEstimateCents ?? null,
      prompt: state ? pricingPrompt(state, proposal.currency) : "This proposal predates the pricing gate. Set a price before sending it.",
      checklist: pricingChecklist(state?.cost ?? null),
      // What the cost was computed FROM, and where each input came from, so a founder can correct a
      // guess rather than argue with a total they cannot see the basis of.
      inputs: state?.inputs ?? null,
      questions: state?.inputs ? costQuestions(state.inputs) : [],
      integrationOptions: INTEGRATION_COSTS.map((i) => ({ key: i.key, label: i.label, because: i.because })),
      // What you have charged for work like this. Reported, never recommended: below two comparables it
      // says so rather than inventing a benchmark from a single deal.
      history: await historyFor({ industry: company?.industry ?? null, itemCount: (proposal.services ?? []).length, currency: proposal.currency }, id).catch(() => null),
      currency: proposal.currency,
      // Prices the document quotes in its own sentences. Shown here rather than only thrown at the
      // moment of approval, because a founder who finds out at the click has already lost the thread.
      prose: proseAgreesWithPrice(
        [proposal.title, proposal.scope, proposal.terms, ...(proposal.services ?? []).map((s: { description?: string }) => s.description ?? null)],
        state?.decision ?? null,
        [proposal.pricingCents, ...(proposal.services ?? []).map((s: { priceCents?: number }) => s.priceCents ?? 0)].filter((c) => c > 0),
      ),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/**
 * PATCH — correct what the cost was computed from, and recompute.
 *
 * Volume and integrations are read out of the audit's prose, which means they are guesses. When a guess
 * is wrong the cost is wrong, and a wrong cost survives into a price. A founder who has been on the call
 * knows the real numbers, so they can say so once and have it stick.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = costCorrectionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "validation failed" }, { status: 422 });

  try {
    const db = getDb();
    const [proposal] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
    if (!proposal) return NextResponse.json({ ok: false, error: "proposal not found" }, { status: 404 });

    const metadata = (proposal.metadata ?? {}) as Record<string, unknown>;
    const state = (metadata.pricing ?? null) as PricingState | null;
    const previous = state?.inputs;
    if (!previous) return NextResponse.json({ ok: false, error: "this proposal has no recorded cost inputs to correct" }, { status: 422 });

    // A founder's correction outranks a guess, and stays marked as theirs so it is never re-guessed.
    const inputs: CostInputsView = {
      ...previous,
      monthlyVolume: parsed.data.monthlyVolume ?? previous.monthlyVolume,
      integrations: parsed.data.integrations ?? previous.integrations,
      volumeSource: parsed.data.monthlyVolume !== undefined ? "founder" : previous.volumeSource,
      integrationsSource: parsed.data.integrations !== undefined ? "founder" : previous.integrationsSource,
    };
    const cost = computeDeliveryCost({ categories: inputs.categories, integrations: inputs.integrations, monthlyVolume: inputs.monthlyVolume, currency: proposal.currency });
    const now = new Date();
    // The price decision, if one exists, is left alone. Correcting a cost changes the margin a founder
    // sees, not the number they told a client.
    const next: PricingState = { ...(state as PricingState), cost, inputs };

    await db.update(proposals).set({ metadata: { ...metadata, pricing: next }, updatedAt: now }).where(eq(proposals.id, id));
    await writeAuditEvent({
      eventType: "proposal.cost_corrected",
      module: "proposals",
      entityType: "proposal",
      entityId: id,
      actor: auth,
      metadata: { monthlyVolume: inputs.monthlyVolume, integrations: inputs.integrations, oneOffCents: cost.oneOffCents, monthlyCents: cost.monthlyCents },
    });

    return NextResponse.json({
      ok: true,
      cost,
      inputs,
      questions: costQuestions(inputs),
      margin: next.decision ? marginAt({ oneOffCents: next.decision.oneOffCents, monthlyCents: next.decision.monthlyCents }, cost) : null,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  // decidedBy is taken from the session, never from the body: the name on a price must be the person
  // who actually typed it.
  const parsed = pricingDecisionSchema.safeParse({ ...(body as Record<string, unknown>), decidedBy: auth });
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "validation failed" }, { status: 422 });

  try {
    const db = getDb();
    const [proposal] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
    if (!proposal) return NextResponse.json({ ok: false, error: "proposal not found" }, { status: 404 });

    const metadata = (proposal.metadata ?? {}) as Record<string, unknown>;
    const existing = (metadata.pricing ?? { status: "awaiting_decision", cost: null, decision: null }) as PricingState;
    const now = new Date();
    // What the contact can sign alone lives on the company, and the authority check has to be redone
    // against the new phase one or it keeps answering about the old number.
    const [company2] = proposal.companyId
      ? await db.select({ metadata: crmCompanies.metadata }).from(crmCompanies).where(eq(crmCompanies.id, proposal.companyId)).limit(1)
      : [undefined];
    const rawAuthority = ((company2?.metadata ?? {}) as Record<string, unknown>).soloAuthorityCents;
    const soloAuthorityCents = typeof rawAuthority === "number" && rawAuthority > 0 ? rawAuthority : null;
    const decided = decidePricing(existing, { ...parsed.data, reasoning: sanitizeHouseStyle(parsed.data.reasoning) }, now);

    // The phase money was worked out at build time from the audit's implementation guess. The moment a
    // founder decides the real price, that guess is stale, and a proposal priced at PKR 45,000 was
    // still showing phases adding up to PKR 4.5M. The shares survive; the money is redone.
    const storedPhases = Array.isArray(metadata.phases) ? (metadata.phases as Array<{ number: number; name: string; rationale: string; items: string[]; valueShare?: number; priceCents: number }>) : null;
    const rephased = storedPhases?.length ? rephasePrice(storedPhases, parsed.data.oneOffCents) : null;

    // The decision is the source of truth for the row's own price, so the document and the record can
    // never disagree about what the client was told.
    await db
      .update(proposals)
      .set({
        metadata: {
          ...metadata,
          pricing: decided,
          ...(rephased ? { phases: rephased, phaseOneAuthority: phaseOneWithinAuthority(rephased[0]?.priceCents ?? 0, soloAuthorityCents) } : {}),
        },
        pricingCents: parsed.data.oneOffCents,
        currency: parsed.data.currency,
        updatedAt: now,
      })
      .where(eq(proposals.id, id));

    await writeAuditEvent({
      eventType: "proposal.priced",
      module: "proposals",
      entityType: "proposal",
      entityId: id,
      actor: auth,
      metadata: { oneOffCents: parsed.data.oneOffCents, monthlyCents: parsed.data.monthlyCents, currency: parsed.data.currency, hadCost: Boolean(existing.cost) },
    });

    return NextResponse.json({
      ok: true,
      status: decided.status,
      decision: decided.decision,
      margin: existing.cost ? marginAt({ oneOffCents: parsed.data.oneOffCents, monthlyCents: parsed.data.monthlyCents }, existing.cost) : null,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
