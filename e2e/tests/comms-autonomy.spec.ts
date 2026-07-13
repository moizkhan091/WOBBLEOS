import { test, expect } from "@playwright/test";

/**
 * Earned Autonomy at the communications action points (real DB effects, founder-gated API):
 *   - NO grant → an internal notification is HELD `prepared` (baseline; never auto-delivered).
 *   - an earned `notification.internal` grant (scoped) → the notification is RELEASED (delivered, status `sent`).
 *   - an external comm is PREPARED, then the founder SEND dispatches it — the send is confirm-capped (recorded).
 */
test.describe("Earned Autonomy — communications action points (real effects)", () => {
  test("internal notification: held without a grant, released with one; external send is confirm-capped", async ({ request }) => {
    const stamp = Date.now();
    const client = `e2e_comm_${stamp}`;

    // NO grant → HELD prepared.
    const held = await request.post("/api/comms", { data: { channel: "internal_notification", kind: "alert", subject: `held ${stamp}`, body: "b", scopeType: "client", clientId: client } });
    expect(held.status()).toBe(201);
    const heldBody = (await held.json()) as { released: boolean; communication: { status: string; autonomyLevel: string } };
    expect(heldBody.released).toBe(false);
    expect(heldBody.communication.status).toBe("prepared");
    expect(heldBody.communication.autonomyLevel).toBe("recommend");

    // Founder grants an earned `notification.internal` policy scoped to this client.
    const grant = await request.post("/api/autonomy/policies", { data: { category: "notification.internal", grantedLevel: "autonomous", clientId: client, maxRiskLevel: "low" } });
    expect(grant.ok()).toBe(true);

    // WITH the grant → RELEASED (delivered autonomously, status sent).
    const released = await request.post("/api/comms", { data: { channel: "internal_notification", kind: "alert", subject: `released ${stamp}`, body: "b", scopeType: "client", clientId: client } });
    const relBody = (await released.json()) as { released: boolean; communication: { status: string; actedAutonomously: boolean } };
    expect(relBody.released).toBe(true);
    expect(relBody.communication.status).toBe("sent");
    expect(relBody.communication.actedAutonomously).toBe(true);

    // An EXTERNAL comm is prepared (held), then the founder send dispatches it — the send is confirm-capped.
    const ext = await request.post("/api/comms", { data: { channel: "external_email", kind: "outreach", subject: `ext ${stamp}`, body: "b", scopeType: "client", clientId: client } });
    const extBody = (await ext.json()) as { communication: { id: string; status: string } };
    expect(extBody.communication.status).toBe("prepared"); // no external.prepare grant → held

    // Even with a FULL autonomous grant for the external SEND, the send resolves to `confirm` (irreversible → capped).
    const sendGrant = await request.post("/api/autonomy/policies", { data: { category: "comms.external.send", grantedLevel: "autonomous", clientId: client, maxRiskLevel: "high" } });
    expect(sendGrant.ok()).toBe(true);
    const send = await request.post(`/api/comms/${extBody.communication.id}/action`, { data: { action: "send" } });
    expect(send.ok()).toBe(true);
    const sendBody = (await send.json()) as { communication: { status: string }; sendDecision: { level: string; capped: boolean } };
    expect(sendBody.communication.status).toBe("sent"); // the founder-gated call dispatches it
    expect(sendBody.sendDecision.level).toBe("confirm"); // …but the send is confirm-capped even under an autonomous grant
    expect(sendBody.sendDecision.capped).toBe(true);
  });
});
