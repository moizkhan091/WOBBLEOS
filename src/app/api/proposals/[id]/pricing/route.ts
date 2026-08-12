import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { proposals } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { sanitizeHouseStyle } from "@/lib/domain/house-style";
import { marginAt } from "@/lib/domain/delivery-cost";
import { decidePricing, pricingChecklist, pricingDecisionSchema, pricingPrompt, type PricingState } from "@/lib/domain/pricing-gate";

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
    const [proposal] = await getDb().select().from(proposals).where(eq(proposals.id, id)).limit(1);
    if (!proposal) return NextResponse.json({ ok: false, error: "proposal not found" }, { status: 404 });
    const state = (((proposal.metadata ?? {}) as Record<string, unknown>).pricing ?? null) as PricingState | null;
    return NextResponse.json({
      ok: true,
      status: state?.status ?? "awaiting_decision",
      cost: state?.cost ?? null,
      decision: state?.decision ?? null,
      auditEstimateCents: state?.auditEstimateCents ?? null,
      prompt: state ? pricingPrompt(state, proposal.currency) : "This proposal predates the pricing gate. Set a price before sending it.",
      checklist: pricingChecklist(state?.cost ?? null),
      currency: proposal.currency,
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
    const decided = decidePricing(existing, { ...parsed.data, reasoning: sanitizeHouseStyle(parsed.data.reasoning) }, now);

    // The decision is the source of truth for the row's own price, so the document and the record can
    // never disagree about what the client was told.
    await db
      .update(proposals)
      .set({ metadata: { ...metadata, pricing: decided }, pricingCents: parsed.data.oneOffCents, currency: parsed.data.currency, updatedAt: now })
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
