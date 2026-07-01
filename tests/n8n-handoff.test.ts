import { describe, expect, it } from "vitest";
import {
  receiveN8nCallback,
  sendApprovedContentToN8n,
  type N8nHandoffStore,
  type WebhookEndpointRow,
} from "@/lib/n8n";
import type { ContentPacketRow } from "@/lib/domain/content-command";
import { signWebhookPayload, verifyWebhookSignature } from "@/lib/security/webhooks";

const now = new Date("2026-07-01T10:00:00.000Z");

function packet(overrides: Partial<ContentPacketRow> = {}): ContentPacketRow {
  return {
    id: "content_1",
    contentTrackId: "track_wobble_company",
    platform: "linkedin",
    format: "text",
    objective: "Teach operators what AI employees actually do",
    targetAudience: "SaaS founders",
    angle: "AI workforce beats random automations",
    hook: "Most AI automations fail because nobody gave them a job description.",
    mainCopy: "Build AI employees around outcomes, tools, context, permissions, and feedback.",
    carouselSlides: [],
    caption: "AI employees need operating context, not just prompts.",
    cta: "Build the operating system first.",
    designDirection: "Premium black and electric lime WOBBLE editorial style.",
    sourceIdsUsed: ["source_1"],
    insightIdsUsed: ["insight_1"],
    memoryChunksUsed: ["memory_1"],
    evidenceSummary: "Based on approved AI OS transcript lessons.",
    claimRiskLevel: "medium",
    proofRequired: true,
    qualityStatus: "passed",
    approvalStatus: "approved",
    n8nHandoffStatus: "not_sent",
    createdBy: "Scribe-01",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function endpoint(overrides: Partial<WebhookEndpointRow> = {}): WebhookEndpointRow {
  return {
    id: "endpoint_1",
    name: "Approved content scheduler",
    module: "content_command",
    url: "https://n8n.example.test/webhook/content",
    secretRefName: "N8N_CONTENT_WEBHOOK_SECRET",
    enabled: true,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function memoryStore(options: { packet?: ContentPacketRow; endpoint?: WebhookEndpointRow; eventIdempotencyKey?: string } = {}) {
  const events: Array<Record<string, unknown>> = options.eventIdempotencyKey
    ? [{ id: "webhook_existing", idempotencyKey: options.eventIdempotencyKey, status: "success" }]
    : [];
  const deadLetters: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; fields: Partial<ContentPacketRow> }> = [];

  const store: N8nHandoffStore = {
    async getEndpointById(id) {
      return options.endpoint?.id === id ? options.endpoint : endpoint({ id });
    },
    async getContentPacketById(id) {
      return options.packet?.id === id ? options.packet : packet({ id });
    },
    async findWebhookEventByIdempotencyKey(idempotencyKey) {
      return (events.find((event) => event.idempotencyKey === idempotencyKey) as never) ?? null;
    },
    async insertWebhookEvent(row) {
      events.push(row as unknown as Record<string, unknown>);
    },
    async insertDeadLetter(row) {
      deadLetters.push(row as unknown as Record<string, unknown>);
    },
    async updateContentPacket(id, fields) {
      updates.push({ id, fields });
    },
  };

  return { store, events, deadLetters, updates };
}

describe("n8n signed handoff", () => {
  it("sends approved content with replay-safe signed headers and logs the handoff", async () => {
    const { store, events, updates } = memoryStore();
    const audits: Array<Record<string, unknown>> = [];
    const transportCalls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];

    const result = await sendApprovedContentToN8n(
      {
        endpointId: "endpoint_1",
        contentPacketId: "content_1",
        idempotencyKey: "handoff_content_1_v1",
        requestedBy: "Moiz",
        approvedBy: "Moiz",
      },
      {
        store,
        now,
        getSecret: (name) => (name === "N8N_CONTENT_WEBHOOK_SECRET" ? "super-secret" : undefined),
        recordAudit: async (event) => {
          audits.push(event);
        },
        transport: async (url, request) => {
          transportCalls.push({ url, body: request.body, headers: request.headers });
          return { ok: true, status: 202, body: { accepted: true } };
        },
      },
    );

    expect(result.status).toBe("sent");
    expect(transportCalls).toHaveLength(1);
    expect(transportCalls[0].headers["X-Wobble-Idempotency-Key"]).toBe("handoff_content_1_v1");
    expect(transportCalls[0].headers["X-Wobble-Timestamp"]).toBe("1782900000");
    expect(transportCalls[0].body).not.toContain("super-secret");

    const signatureResult = await verifyWebhookSignature({
      payload: transportCalls[0].body,
      timestamp: transportCalls[0].headers["X-Wobble-Timestamp"],
      signature: transportCalls[0].headers["X-Wobble-Signature"],
      secret: "super-secret",
      nowEpochSeconds: 1782900000,
    });
    expect(signatureResult.valid).toBe(true);

    expect(events.at(-1)).toMatchObject({
      direction: "outbound",
      eventType: "content.packet.approved",
      status: "success",
      idempotencyKey: "handoff_content_1_v1",
      signatureVerified: true,
      replayProtected: true,
    });
    expect(updates.at(-1)).toMatchObject({ id: "content_1", fields: { n8nHandoffStatus: "sent" } });
    expect(audits.at(-1)).toMatchObject({ eventType: "n8n_handoff.sent", module: "n8n_handoff" });
  });

  it("blocks unapproved content before any outbound request", async () => {
    const { store } = memoryStore({ packet: packet({ approvalStatus: "pending" }) });
    const audits: Array<Record<string, unknown>> = [];
    const calls: string[] = [];

    await expect(
      sendApprovedContentToN8n(
        {
          endpointId: "endpoint_1",
          contentPacketId: "content_1",
          idempotencyKey: "handoff_content_1_v1",
          requestedBy: "Moiz",
          approvedBy: "Moiz",
        },
        {
          store,
          now,
          getSecret: () => "super-secret",
          recordAudit: async (event) => {
            audits.push(event);
          },
          transport: async () => {
            calls.push("sent");
            return { ok: true, status: 200, body: {} };
          },
        },
      ),
    ).rejects.toThrow("approved");

    expect(calls).toEqual([]);
    expect(audits.at(-1)).toMatchObject({ eventType: "n8n_handoff.blocked" });
  });

  it("does not send a duplicate idempotency key twice", async () => {
    const { store } = memoryStore({ eventIdempotencyKey: "handoff_content_1_v1" });
    const calls: string[] = [];

    const result = await sendApprovedContentToN8n(
      {
        endpointId: "endpoint_1",
        contentPacketId: "content_1",
        idempotencyKey: "handoff_content_1_v1",
        requestedBy: "Moiz",
        approvedBy: "Moiz",
      },
      {
        store,
        now,
        getSecret: () => "super-secret",
        recordAudit: async () => {},
        transport: async () => {
          calls.push("sent");
          return { ok: true, status: 200, body: {} };
        },
      },
    );

    expect(result.status).toBe("duplicate");
    expect(calls).toEqual([]);
  });

  it("records failed handoffs as dead letters and marks the packet failed", async () => {
    const { store, events, deadLetters, updates } = memoryStore();

    const result = await sendApprovedContentToN8n(
      {
        endpointId: "endpoint_1",
        contentPacketId: "content_1",
        idempotencyKey: "handoff_content_1_v1",
        requestedBy: "Moiz",
        approvedBy: "Moiz",
      },
      {
        store,
        now,
        getSecret: () => "super-secret",
        recordAudit: async () => {},
        transport: async () => ({ ok: false, status: 503, body: { error: "n8n unavailable" } }),
      },
    );

    expect(result.status).toBe("failed");
    expect(events.at(-1)).toMatchObject({ status: "failed", failureReason: "n8n returned HTTP 503" });
    expect(deadLetters.at(-1)).toMatchObject({
      sourceType: "webhook_event",
      module: "n8n_handoff",
      reason: "n8n returned HTTP 503",
      status: "open",
    });
    expect(updates.at(-1)).toMatchObject({ id: "content_1", fields: { n8nHandoffStatus: "failed" } });
  });

  it("accepts signed callbacks from n8n after a workflow completes", async () => {
    const { store, events } = memoryStore();
    const payloadText = JSON.stringify({ contentPacketId: "content_1", schedulerStatus: "queued" });
    const timestamp = "1782900000";
    const signature = await signWebhookPayload({ payload: payloadText, timestamp, secret: "callback-secret" });

    const result = await receiveN8nCallback(
      {
        payloadText,
        timestamp,
        signature,
        idempotencyKey: "callback_content_1_v1",
        eventType: "n8n.content.scheduler.updated",
      },
      {
        store,
        now,
        getSecret: (name) => (name === "N8N_WEBHOOK_SECRET" ? "callback-secret" : undefined),
        recordAudit: async () => {},
      },
    );

    expect(result.status).toBe("accepted");
    expect(events.at(-1)).toMatchObject({
      direction: "inbound",
      status: "success",
      eventType: "n8n.content.scheduler.updated",
      idempotencyKey: "callback_content_1_v1",
      signatureVerified: true,
      replayProtected: true,
    });
  });

  it("rejects callbacks with invalid signatures before trusting payload data", async () => {
    const { store, events } = memoryStore();

    const result = await receiveN8nCallback(
      {
        payloadText: JSON.stringify({ contentPacketId: "content_1", schedulerStatus: "queued" }),
        timestamp: "1782900000",
        signature: "00",
        idempotencyKey: "callback_content_1_bad",
        eventType: "n8n.content.scheduler.updated",
      },
      {
        store,
        now,
        getSecret: () => "callback-secret",
        recordAudit: async () => {},
      },
    );

    expect(result.status).toBe("rejected");
    expect(events.at(-1)).toMatchObject({
      direction: "inbound",
      status: "rejected",
      signatureVerified: false,
    });
  });
});
