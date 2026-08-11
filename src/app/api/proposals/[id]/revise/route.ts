import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { revisionRequestSchema } from "@/lib/domain/founder-revision";
import { reviseProposalFromInstruction } from "@/lib/proposals/founder-revision";
import { killSwitchResponse } from "@/lib/security-governance/enforcement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/proposals/[id]/revise - change a proposal by saying what you want changed.
 *
 * The selective-revision engine could only be triggered by a QA failure, so there was no path for the
 * thing a founder does constantly: "take out the reporting module and move the retainer to monthly".
 * This opens a real revision cycle from the instruction, which means the previous proposal is retained,
 * the round is versioned and snapshotted, and it can be rolled back.
 *
 * A NEW proposal version is produced. Nothing replaces the live one and nothing is sent.
 */
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
  const parsed = revisionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await reviseProposalFromInstruction(id, parsed.data, auth);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    // A revision costs a model call, so it respects the global kill switch like every other spend path.
    const blocked = killSwitchResponse(error);
    if (blocked) return NextResponse.json(blocked.body, { status: blocked.status });
    const message = error instanceof Error ? error.message : "unknown error";
    const status = /not found/i.test(message) ? 404 : /not built from an audit/i.test(message) ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
