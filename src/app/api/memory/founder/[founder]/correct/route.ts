import { NextResponse } from "next/server";
import { z } from "zod";
import { correctFounderMemory } from "@/lib/memory";
import { prepareCommunication } from "@/lib/comms";
import { requireSuperAdmin, isSessionError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

const correctSchema = z
  .object({
    recordId: z.string().trim().min(1, "recordId is required"),
    title: z.string().trim().min(1).optional(),
    content: z.string().trim().min(1).optional(),
    reason: z.string().trim().min(1, "a reason is required for a governed correction"),
    confirm: z.literal(true, { message: "confirm must be true to apply a governed correction" }),
    // A body-supplied founder is REJECTED — the target is the path, so a request can never silently
    // retarget who gets corrected. We accept the key only to reject a mismatch loudly.
    targetFounder: z.string().trim().min(1).optional(),
  })
  .refine((b) => b.title !== undefined || b.content !== undefined, { message: "nothing to correct: provide title and/or content" });

/**
 * POST /api/memory/founder/[founder]/correct — GOVERNED super-admin correction of a founder's memory.
 *
 * requireSuperAdmin: one founder may not silently edit another's personal memory; this is the ONLY path that
 * can, and only for a super-admin. The TARGET is the path `[founder]` (authoritative); a `targetFounder` in
 * the body is refused if it disagrees, so a generic field can never redirect the correction. The domain
 * layer captures before/after, versions the prior state (restorable), audits with the super-admin as actor,
 * and notifies the affected founder via an internal-notification comm.
 */
export async function POST(request: Request, { params }: { params: Promise<{ founder: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireSuperAdmin(request);
  if (isSessionError(auth)) return auth;

  const { founder } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = correctSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });

  // A body `targetFounder` that disagrees with the path is a hard error — never silently ignored, so a
  // caller can't believe they targeted someone else.
  if (parsed.data.targetFounder && parsed.data.targetFounder.toLowerCase() !== founder.toLowerCase()) {
    return NextResponse.json({ ok: false, error: `targetFounder '${parsed.data.targetFounder}' does not match the path founder '${founder}'` }, { status: 422 });
  }

  try {
    const result = await correctFounderMemory(
      {
        recordId: parsed.data.recordId,
        targetFounder: founder,
        actor: auth.founder,
        title: parsed.data.title,
        content: parsed.data.content,
        reason: parsed.data.reason,
        confirm: parsed.data.confirm,
      },
      {
        // The affected founder gets a durable, founder-scoped internal notification (delivered by earned
        // autonomy for low-risk internal notices). Idempotent per correction.
        notifyFounder: async (n) => {
          await prepareCommunication(
            {
              channel: "internal_notification",
              kind: "memory_correction",
              subject: n.subject,
              body: n.body,
              scopeType: "founder",
              audience: n.founder,
              relatedEntityType: "memory_record",
              relatedEntityId: n.recordId,
              preparedBy: n.actor,
              dedupeKey: `memory_correction:${n.recordId}:${n.founder}`,
              metadata: { reason: n.reason, correctedBy: n.actor },
            },
            { enforceAutonomy: true },
          );
        },
      },
    );
    return NextResponse.json({ ok: true, record: result.record, before: result.before, after: result.after });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    // A target-mismatch / not-a-founder-memory / missing-reason is a client error, not a 500.
    const clientError = /requires|not a founder|belongs to|not found|nothing to/i.test(message);
    return NextResponse.json({ ok: false, error: message }, { status: clientError ? 422 : 500 });
  }
}
