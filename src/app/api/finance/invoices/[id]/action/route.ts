import { NextResponse } from "next/server";
import { z } from "zod";
import { invoiceAction } from "@/lib/finance";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["approve", "send", "mark_paid", "cancel"]),
  paymentReference: z.string().trim().min(1).optional(),
  amountPaidCents: z.number().int().min(0).optional(),
});

/** POST /api/finance/invoices/[id]/action — founder-gated invoice lifecycle (approve/send/mark_paid/cancel). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const invoice = await invoiceAction(id, parsed.data.action, { actor: auth, paymentReference: parsed.data.paymentReference, amountPaidCents: parsed.data.amountPaidCents });
    if (!invoice) return NextResponse.json({ ok: false, error: "invoice not found or invalid transition" }, { status: 409 });
    return NextResponse.json({ ok: true, invoice });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
