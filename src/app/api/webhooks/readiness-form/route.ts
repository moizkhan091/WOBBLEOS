import { NextResponse } from "next/server";
import { intakeReadinessSubmission, IntakeValidationError } from "@/lib/intake";
import { defaultStore } from "@/lib/n8n";
import { buildWebhookEventRow, type WebhookEventRow } from "@/lib/domain/n8n-handoff";
import { readCappedRawBody, verifyWebhookSignature } from "@/lib/security/webhooks";
import {
  N8N_IDEMPOTENCY_HEADER,
  N8N_SIGNATURE_HEADER,
  N8N_TIMESTAMP_HEADER,
} from "@/lib/domain/n8n-handoff";
import { writeAuditEvent } from "@/lib/audit";
import { INTAKE_MODULE } from "@/lib/domain/intake";

/**
 * POST /api/webhooks/readiness-form — the ONLY door a lead enters WOBBLE through.
 *
 * The marketing site posts the AI Readiness Call form to n8n; n8n signs it and forwards it here, and we
 * create the whole client container (company + contact + lead + pipeline deal).
 *
 * Security is the same envelope the n8n callback already uses — timestamped HMAC (5-min replay window)
 * over `${timestamp}.${rawBody}` with N8N_WEBHOOK_SECRET, plus a pre-parse body cap. It is a separate
 * route from /api/n8n/callback on purpose: that endpoint reports on work WOBBLE dispatched and is
 * best-effort by design, whereas a lead MUST NOT be silently swallowed — so here a failed intake
 * answers 5xx so n8n retries, and only a genuinely unusable submission answers 4xx.
 *
 * EVENT_TYPE is fixed rather than caller-supplied: this endpoint does exactly one thing.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_TYPE = "crm.readiness_form.received";

/** Derived, not re-declared — the webhook_events status union stays owned by the domain. */
type WebhookEventStatus = WebhookEventRow["status"];

/** Record the attempt on webhook_events so every inbound lead is auditable, successful or not. */
async function logEvent(input: {
  status: WebhookEventStatus;
  payload: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  failureReason: string | null;
  signatureVerified: boolean;
  idempotencyKey: string | null;
}): Promise<string | null> {
  try {
    const row = buildWebhookEventRow({
      endpointId: null,
      direction: "inbound",
      eventType: EVENT_TYPE,
      status: input.status,
      idempotencyKey: input.idempotencyKey,
      signatureVerified: input.signatureVerified,
      replayProtected: input.signatureVerified,
      // An unparseable body still gets a row (with the reason) — the column itself is non-nullable.
      payload: input.payload ?? {},
      response: input.response,
      failureReason: input.failureReason,
    });
    await defaultStore().insertWebhookEvent(row);
    return row.id;
  } catch {
    // Observability must never be the reason a real lead is rejected.
    return null;
  }
}

function safeParse(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const body = await readCappedRawBody(request);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  const raw = body.raw;

  // Fail CLOSED: a public route that creates CRM records must never accept unsigned traffic.
  const secret = (process.env.N8N_WEBHOOK_SECRET ?? "").trim();
  if (!secret) return NextResponse.json({ ok: false, error: "intake disabled, set N8N_WEBHOOK_SECRET" }, { status: 503 });

  const timestamp = request.headers.get(N8N_TIMESTAMP_HEADER);
  const signature = request.headers.get(N8N_SIGNATURE_HEADER);
  const idempotencyKey = request.headers.get(N8N_IDEMPOTENCY_HEADER);

  if (!timestamp || !signature) {
    await logEvent({ status: "rejected", payload: safeParse(raw), response: null, failureReason: "missing signature or timestamp", signatureVerified: false, idempotencyKey });
    return NextResponse.json({ ok: false, error: "missing signature or timestamp" }, { status: 401 });
  }

  const verification = await verifyWebhookSignature({ payload: raw, timestamp, signature, secret });
  if (!verification.valid) {
    await logEvent({ status: "rejected", payload: safeParse(raw), response: null, failureReason: verification.reason, signatureVerified: false, idempotencyKey });
    return NextResponse.json({ ok: false, error: verification.reason }, { status: 401 });
  }

  const payload = safeParse(raw);
  if (!payload) {
    await logEvent({ status: "rejected", payload: null, response: null, failureReason: "invalid JSON body", signatureVerified: true, idempotencyKey });
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  // Replay of an already-APPLIED delivery is a no-op. Only a recorded success counts: a previous attempt
  // that failed left no success row, so n8n's retry is free to run the intake for real.
  if (idempotencyKey) {
    try {
      const prior = await defaultStore().findWebhookEventByIdempotencyKey(idempotencyKey);
      if (prior && prior.status === "success") {
        return NextResponse.json({ ok: true, duplicate: true, webhookEventId: prior.id });
      }
    } catch {
      // A lookup failure must not block the lead; worst case we dedupe at the company level below.
    }
  }

  // n8n may forward either the bare form object or n8n's own `{ body: … }` envelope — accept both.
  const submission = (payload.body && typeof payload.body === "object" ? payload.body : payload) as Record<string, unknown>;

  try {
    const result = await intakeReadinessSubmission(submission);
    const response = {
      companyId: result.company.id,
      contactId: result.contact?.id ?? null,
      leadId: result.lead.id,
      opportunityId: result.opportunity.id,
      stage: result.opportunity.stage,
      score: result.score,
      tier: result.tier,
      deduped: result.deduped,
      displayName: result.displayName,
    };
    await logEvent({ status: "success", payload: submission, response, failureReason: null, signatureVerified: true, idempotencyKey });
    return NextResponse.json({ ok: true, ...response });
  } catch (error) {
    const message = error instanceof Error ? error.message : "intake failed";

    // An unusable submission (no name, no way to reach them) will never succeed on retry — 422 so n8n
    // stops and the founders still get told, rather than a retry loop hammering a doomed payload.
    if (error instanceof IntakeValidationError) {
      await logEvent({ status: "rejected", payload: submission, response: null, failureReason: message, signatureVerified: true, idempotencyKey });
      await writeAuditEvent({ eventType: "intake.readiness_form_rejected", module: INTAKE_MODULE, entityType: "webhook_event", entityId: "unusable", actor: "n8n_readiness_form", metadata: { reason: message } }).catch(() => {});
      return NextResponse.json({ ok: false, error: message, retryable: false }, { status: 422 });
    }

    // Anything else (DB blip, transient failure) is retryable — 500 makes n8n try again, and the
    // company-level dedupe keeps a successful retry from forking the container.
    await logEvent({ status: "failed", payload: submission, response: null, failureReason: message, signatureVerified: true, idempotencyKey });
    return NextResponse.json({ ok: false, error: message, retryable: true }, { status: 500 });
  }
}
