import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { draftFollowUp, generateObjectionBrief, getDealTeamOutputs } from "@/lib/deal-team";
import { FOLLOW_UP_CHANNELS } from "@/lib/domain/deal-team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The deal team, on one client.
 *
 * GET  — whatever they have already produced, without spending anything.
 * POST — run one of them: the objection handler, or the follow-up writer.
 *
 * Both are advisory. The follow-up writer drafts; it never sends. Sending is a founder action in the
 * founder's own inbox, deliberately outside this system.
 */

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { companyId } = await context.params;
  try {
    return NextResponse.json({ ok: true, ...(await getDealTeamOutputs(companyId)) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

const runSchema = z.discriminatedUnion("agent", [
  z.object({ agent: z.literal("objection_handler") }),
  z.object({
    agent: z.literal("follow_up_writer"),
    channel: z.enum(FOLLOW_UP_CHANNELS),
    tone: z.string().trim().max(200).optional(),
    purpose: z.string().trim().max(400).optional(),
  }),
]);

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { companyId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = runSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "validation failed" }, { status: 422 });

  try {
    if (parsed.data.agent === "objection_handler") {
      return NextResponse.json({ ok: true, objections: await generateObjectionBrief(companyId, { actor: auth }) });
    }
    const draft = await draftFollowUp(companyId, { channel: parsed.data.channel, tone: parsed.data.tone, purpose: parsed.data.purpose }, { actor: auth });
    return NextResponse.json({ ok: true, followUp: draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    // "nothing to reason from" is a state of the client, not a server fault: say so without a 500.
    const status = message.includes("nothing to reason from") || message.includes("not found") ? 422 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
