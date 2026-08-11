import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { pauseRetainer, setRetainer } from "@/lib/retainers";
import { RETAINER_CADENCES } from "@/lib/domain/retainers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/invoices/[id]/retainer — make an invoice recurring, reschedule it, or pause it.
 *
 * Setting a schedule never raises anything. The daily sweep does that, and every invoice it raises is a
 * DRAFT: nothing is sent and no money moves without a founder.
 */
const schema = z.union([
  z.object({
    action: z.literal("set"),
    cadence: z.enum(RETAINER_CADENCES),
    nextIssueAt: z.string().datetime(),
    endsAt: z.string().datetime().optional(),
    dueInDays: z.number().int().min(0).max(180).optional(),
  }),
  z.object({ action: z.literal("pause") }),
]);

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
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "validation failed" }, { status: 422 });

  try {
    const schedule = parsed.data.action === "pause"
      ? await pauseRetainer(id, auth)
      : await setRetainer({ invoiceId: id, cadence: parsed.data.cadence, nextIssueAt: parsed.data.nextIssueAt, endsAt: parsed.data.endsAt, dueInDays: parsed.data.dueInDays, actor: auth });
    return NextResponse.json({ ok: true, schedule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: /not found/.test(message) ? 404 : 500 });
  }
}
