import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { addMeeting, listMeetings, transitionMeeting } from "@/lib/meetings";
import { extractMeetingIntelligence, listMeetingFacts, reviewMeetingFact } from "@/lib/meeting-intelligence";
import { readCappedRawBody } from "@/lib/security/webhooks";
import { listOpportunities } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The "give it back" step of the founder's sales loop.
 *
 * The loop is: form → questions → hold the call → HAND THE TRANSCRIPT BACK → audit → proposal. The
 * extraction engine (`extractMeetingIntelligence`) already existed but was reachable from no route at
 * all, so a founder had no way to feed a call back into the client's container and "Meetings &
 * discovery" could only ever read "No meetings yet".
 *
 * POST — paste a transcript. Creates a completed meeting ON THIS CLIENT (so it is filed against them,
 *        not floating), links it to their live deal, and extracts discovery facts as PENDING. Facts
 *        stay pending on purpose: an LLM reading a call is a proposal, not a source of truth, and the
 *        paid audit only ever consumes founder-APPROVED facts.
 * GET  — the facts already extracted for this client's meetings, for review.
 * PATCH — approve/reject one fact.
 */

const postSchema = z.object({
  transcript: z.string().trim().min(40, "paste the actual transcript — this is too short to extract anything from"),
  title: z.string().trim().min(1).max(200).optional(),
  meetingType: z.enum(["ai_readiness_call", "paid_audit", "proposal_review", "client_onboarding", "delivery_review", "strategy_session", "support_call"]).optional(),
});

const patchSchema = z.object({
  factId: z.string().trim().min(1),
  decision: z.enum(["approved", "rejected"]),
});

function dbGuard() {
  return process.env.DATABASE_URL ? null : NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const guard = dbGuard();
  if (guard) return guard;
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { companyId } = await context.params;

  // A pasted call transcript is long-form free text — cap it before parsing like every other body.
  const raw = await readCappedRawBody(request);
  if (!raw.ok) return NextResponse.json({ ok: false, error: raw.error }, { status: raw.status });
  let body: unknown;
  try {
    body = JSON.parse(raw.raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    // File the call against the client's live deal so the journey and the lineage both see it.
    const deals = await listOpportunities({ limit: 500 });
    const liveDeal = deals.find((o) => o.companyId === companyId && o.status === "open") ?? deals.find((o) => o.companyId === companyId);

    const meeting = await addMeeting({
      title: parsed.data.title?.trim() || "AI readiness call",
      meetingType: parsed.data.meetingType ?? "ai_readiness_call",
      companyId,
      opportunityId: liveDeal?.id,
      notes: parsed.data.transcript,
      organizer: auth,
      createdBy: auth,
    });

    // The call already happened — a transcript exists — so record it as completed rather than scheduled.
    await transitionMeeting(meeting.id, "completed", { actor: auth }).catch(() => {});

    const facts = await extractMeetingIntelligence(meeting.id, { actor: auth });
    return NextResponse.json(
      {
        ok: true,
        meetingId: meeting.id,
        opportunityId: liveDeal?.id ?? null,
        extracted: facts.length,
        facts: facts.map((f) => ({ id: f.id, kind: f.kind, content: f.content, confidence: f.confidence, sourceSnippet: f.sourceSnippet, status: f.status })),
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    // The meeting is saved even when extraction fails, so the transcript is never lost — say so plainly.
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const guard = dbGuard();
  if (guard) return guard;
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { companyId } = await context.params;

  try {
    const meetings = (await listMeetings({ companyId, limit: 100 })).filter((m) => !m.archivedAt);
    const perMeeting = await Promise.all(
      meetings.map(async (m) => ({
        meetingId: m.id,
        title: m.title,
        meetingType: m.meetingType,
        status: m.status,
        createdAt: m.createdAt,
        facts: (await listMeetingFacts(m.id)).map((f) => ({ id: f.id, kind: f.kind, content: f.content, confidence: f.confidence, sourceSnippet: f.sourceSnippet, status: f.status })),
      })),
    );
    const all = perMeeting.flatMap((m) => m.facts);
    return NextResponse.json({
      ok: true,
      meetings: perMeeting,
      counts: { meetings: meetings.length, pending: all.filter((f) => f.status === "pending_review").length, approved: all.filter((f) => f.status === "approved").length },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const guard = dbGuard();
  if (guard) return guard;
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  await context.params; // companyId is authorization scope only; the fact id identifies the row

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });

  try {
    const updated = await reviewMeetingFact({ factId: parsed.data.factId, decision: parsed.data.decision, reviewedBy: auth });
    if (!updated) return NextResponse.json({ ok: false, error: "fact not found" }, { status: 404 });
    return NextResponse.json({ ok: true, fact: { id: updated.id, status: updated.status } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
