import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { askRevenueHead } from "@/lib/revenue-head";
import { killSwitchResponse } from "@/lib/security-governance/enforcement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * POST /api/revenue-head - talk to the Head of Revenue and CRM.
 *
 * Distinct from /api/ask on purpose. Ask WOBBLE is a generalist across every module; the head carries
 * one department's tools and judgment. Narrowness is the feature: tool-selection accuracy falls as the
 * count grows and every offered tool is re-billed on each call.
 *
 * `companyId` binds the client the founder currently has open, so "this client" resolves without
 * pasting ids. Gated actions come back as pendingConfirmations rather than executing.
 */
const schema = z.object({
  question: z.string().trim().min(2, "ask the head something").max(4000),
  companyId: z.string().trim().min(1).optional(),
  conversationId: z.string().trim().min(1).optional(),
  confirmActions: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await askRevenueHead({ ...parsed.data, founder: auth });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const blocked = killSwitchResponse(error);
    if (blocked) return NextResponse.json(blocked.body, { status: blocked.status });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
