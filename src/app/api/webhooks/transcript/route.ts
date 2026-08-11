import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { meetings } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { readCappedRawBody, verifyWebhookSignature } from "@/lib/security/webhooks";
import { N8N_SIGNATURE_HEADER, N8N_TIMESTAMP_HEADER } from "@/lib/domain/n8n-handoff";
import { routeTranscriptToClient } from "@/lib/transcript-routing";
import { sanitizeHouseStyle } from "@/lib/domain/house-style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/transcript — a call transcript from Fathom, Read.ai, or anything else, filed
 * against the right client by its attendees.
 *
 * The routing rule is deliberately strict: match an attendee to a contact, a client address, or a
 * client's own web domain, or REFUSE. A misfiled transcript puts one client's private call into
 * another client's container, and the audit and proposal are then built from it. An unrouted transcript
 * waiting in a tray is a mild annoyance by comparison, so an unroutable one is stored unattached with
 * the reason, and a founder points it at the right client.
 *
 * Extraction is NOT run here. A transcript lands as a meeting; a founder still presses the button that
 * turns it into findings, and still approves each finding. Nothing about that gate changes.
 */

const bodySchema = z.object({
  title: z.string().trim().min(1).max(300),
  transcript: z.string().trim().min(20).max(200_000),
  /** Every address on the invite. This is the only thing that decides where it lands. */
  attendeeEmails: z.array(z.string().trim().min(3).max(320)).min(1).max(50),
  /** ISO. When the call actually happened, which is rarely when the transcript arrives. */
  startAt: z.string().datetime().optional(),
  source: z.string().trim().max(60).optional(),
  meetingType: z.string().trim().max(40).optional(),
});

const MAX_BODY_BYTES = 1_000_000;

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed. An unauthenticated transcript endpoint would accept anybody's call recording.
    return NextResponse.json({ ok: false, error: "webhook secret is not configured" }, { status: 503 });
  }

  const body = await readCappedRawBody(request, MAX_BODY_BYTES);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  const raw = body.raw;

  const timestamp = request.headers.get(N8N_TIMESTAMP_HEADER);
  const signature = request.headers.get(N8N_SIGNATURE_HEADER);
  if (!timestamp || !signature) {
    return NextResponse.json({ ok: false, error: "missing webhook signature headers" }, { status: 401 });
  }
  const verification = await verifyWebhookSignature({ payload: raw, timestamp, signature, secret });
  if (!verification.valid) return NextResponse.json({ ok: false, error: verification.reason }, { status: 401 });

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 422 });
  }
  const parsed = bodySchema.safeParse(parsedBody);
  if (!parsed.success) {
    // 422, not 500: a malformed transcript will never become valid on a retry.
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "validation failed" }, { status: 422 });
  }

  try {
    const decision = await routeTranscriptToClient({ attendeeEmails: parsed.data.attendeeEmails, title: parsed.data.title });
    const db = getDb();
    const now = new Date();
    const id = newId("mtg");

    await db.insert(meetings).values({
      id,
      title: parsed.data.title,
      meetingType: parsed.data.meetingType ?? "ai_readiness_call",
      startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : now,
      attendees: parsed.data.attendeeEmails,
      companyId: decision.companyId,
      status: "completed",
      notes: sanitizeHouseStyle(parsed.data.transcript),
      createdBy: parsed.data.source ?? "transcript_webhook",
      // The routing decision travels with the meeting, so an unrouted one carries its own explanation
      // and a "likely" one can be double-checked rather than silently trusted.
      metadata: { routing: { confidence: decision.confidence, reason: decision.reason, ambiguousCompanyIds: decision.ambiguousCompanyIds ?? [] }, source: parsed.data.source ?? null },
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditEvent({
      eventType: "meeting.transcript_received",
      module: "meeting_intelligence",
      entityType: "meeting",
      entityId: id,
      actor: parsed.data.source ?? "transcript_webhook",
      metadata: { routedTo: decision.companyId, confidence: decision.confidence, reason: decision.reason, attendees: parsed.data.attendeeEmails.length },
    });

    return NextResponse.json({ ok: true, meetingId: id, routedTo: decision.companyId, confidence: decision.confidence, reason: decision.reason }, { status: 201 });
  } catch (error) {
    // 500 so the sender retries: losing a call recording is not recoverable by hand.
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
