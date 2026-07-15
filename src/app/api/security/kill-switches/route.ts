import { NextResponse } from "next/server";
import { z } from "zod";
import { setKillSwitch, clearKillSwitch, listKillSwitches } from "@/lib/security-governance";
import { KILL_SWITCH_TARGETS } from "@/lib/domain/security-governance";
import { requireFounder, isAuthError, requireSuperAdmin, isSessionError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/security/kill-switches — every switch and its live state. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  return NextResponse.json({ ok: true, killSwitches: await listKillSwitches() });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("engage"), targetType: z.enum(KILL_SWITCH_TARGETS), targetRef: z.string().trim().min(1), reason: z.string().trim().min(1, "a kill switch requires a stated reason") }),
  z.object({ action: z.literal("release"), id: z.string().trim().min(1), reason: z.string().trim().min(1, "reactivation requires a stated reason") }),
]);

/**
 * POST /api/security/kill-switches — engage or release a TARGETED kill switch.
 *
 * SUPER-ADMIN gated, not merely founder-gated. Disabling a capability stops the company from doing
 * work, and re-enabling one is the moment a control stops protecting anything — both are account-level
 * authority decisions of the same standing as disabling a founder, so they need the same gate.
 *
 * A reason is REQUIRED in both directions. A switch with no reason is unauditable: the next founder
 * cannot tell a deliberate containment from an accident, and turning it back ON is itself a decision
 * someone must own.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireSuperAdmin(request);
  if (isSessionError(auth)) return auth;
  const actor = auth.founder;

  if (parsed.data.action === "engage") {
    const r = await setKillSwitch({ targetType: parsed.data.targetType, targetRef: parsed.data.targetRef, reason: parsed.data.reason, actor });
    // `created: false` means it was ALREADY engaged — idempotent, not an error. Re-disabling must not
    // create a second row, or "is this off?" stops having one answer.
    return NextResponse.json({ ok: true, id: r.id, created: r.created, alreadyEngaged: !r.created }, { status: r.created ? 201 : 200 });
  }
  const r = await clearKillSwitch({ id: parsed.data.id, actor, reason: parsed.data.reason });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
