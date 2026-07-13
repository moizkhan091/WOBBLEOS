/**
 * Real-DB proof (Postgres) that Earned Autonomy is enforced at the THREE remaining action points, each with its
 * confirm-capped counterpart, plus every required scenario (no-grant / active-grant-changes-behaviour / expired /
 * revoked / wrong-tenant / audited / idempotent-retries):
 *
 *   1) notification.internal (low-risk, reversible)  → an earned grant RELEASES delivery (prepared → SENT).
 *   2) comms.external.prepare (reversible draft)      → an earned grant RELEASES preparation (prepared → READY, NOT sent).
 *   3) proposal.send.prepare (reversible)             → an earned grant RELEASES the send-package (prepared → READY).
 *   CAPS: comms.external.send + proposal.send are IRREVERSIBLE → confirm-capped: even an `autonomous` grant resolves
 *         to `confirm` (never auto-sent); the actual send only runs through the founder-gated call.
 *
 * ISOLATED + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-comms-autonomy-db.ts
 */
import { inArray, eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { communications as commsTable, autonomyPolicies, auditLogs } from "@/db/schema";
import { prepareCommunication, sendCommunication, cancelCommunication, defaultStore as commsStore } from "@/lib/comms";
import { sendAction } from "@/lib/domain/comms";
import { createAutonomyPolicy, revokeAutonomyPolicy, resolveActionAutonomy } from "@/lib/autonomy";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const clientA = `commclient_a_${uniq}`, clientB = `commclient_b_${uniq}`;
  const store = commsStore(db);
  const commIds: string[] = [];
  const policyIds: string[] = [];

  const track = <T extends { communication: { id: string } }>(r: T): T => { commIds.push(r.communication.id); return r; };
  const grant = async (category: string, clientId: string, opts: { expired?: boolean } = {}) => {
    const p = await createAutonomyPolicy({ category, grantedLevel: "autonomous", approvedBy: "Moiz", clientId, maxRiskLevel: "medium", ...(opts.expired ? { effectiveFrom: new Date(Date.now() - 2 * 86400_000), expiresAt: new Date(Date.now() - 86400_000) } : {}) }, { db });
    policyIds.push(p.id);
    return p;
  };
  const auditCount = async (entityId: string, eventType: string) =>
    (await db.select({ e: auditLogs.eventType }).from(auditLogs).where(eq(auditLogs.entityId, entityId))).filter((r) => r.e === eventType).length;

  try {
    // ---- 1) INTERNAL NOTIFICATION ----
    // NO grant → HELD prepared (baseline recommend, never silently delivered).
    const n1 = track(await prepareCommunication({ channel: "internal_notification", kind: "alert", subject: `n1 ${uniq}`, body: "b", scopeType: "client", clientId: clientA, preparedBy: "Moiz" }, { enforceAutonomy: true }));
    assert(!n1.released && n1.communication.status === "prepared" && n1.communication.autonomyLevel === "recommend", "internal notification, NO grant → HELD `prepared` (baseline recommend, never auto-delivered)");
    assert(await auditCount(n1.communication.id, "communication.prepared") === 1 && await auditCount(n1.communication.id, "communication.delivered_autonomously") === 0, "no-grant prepare is AUDITED as prepared, NOT delivered_autonomously");

    // ACTIVE grant (client A) → RELEASED: delivered autonomously (status sent).
    await grant("notification.internal", clientA);
    const n2 = track(await prepareCommunication({ channel: "internal_notification", kind: "alert", subject: `n2 ${uniq}`, body: "b", scopeType: "client", clientId: clientA, preparedBy: "Moiz" }, { enforceAutonomy: true }));
    assert(n2.released && n2.communication.status === "sent" && n2.communication.actedAutonomously && n2.communication.autonomyLevel === "autonomous", "internal notification, ACTIVE grant → RELEASED (delivered autonomously, status `sent`) — a policy changes production behaviour");
    assert(await auditCount(n2.communication.id, "communication.delivered_autonomously") === 1, "autonomous delivery is AUDITED (communication.delivered_autonomously)");

    // WRONG TENANT: client A's grant does NOT release client B's notification.
    const n3 = track(await prepareCommunication({ channel: "internal_notification", kind: "alert", subject: `n3 ${uniq}`, body: "b", scopeType: "client", clientId: clientB, preparedBy: "Moiz" }, { enforceAutonomy: true }));
    assert(!n3.released && n3.communication.status === "prepared", "TENANT isolation: client A's grant does NOT release client B's notification (stays prepared)");

    // ---- 2) EXTERNAL COMM PREPARATION + the confirm-capped SEND ----
    // NO grant → prepared. WITH grant → RELEASED to `ready` (staged) but NOT sent.
    const e1 = track(await prepareCommunication({ channel: "external_email", kind: "outreach", subject: `e1 ${uniq}`, body: "b", scopeType: "client", clientId: clientA, preparedBy: "Moiz" }, { enforceAutonomy: true }));
    assert(!e1.released && e1.communication.status === "prepared", "external comm, NO grant → HELD prepared");
    await grant("comms.external.prepare", clientA);
    const e2 = track(await prepareCommunication({ channel: "external_email", kind: "outreach", subject: `e2 ${uniq}`, body: "b", scopeType: "client", clientId: clientA, preparedBy: "Moiz" }, { enforceAutonomy: true }));
    assert(e2.released && e2.communication.status === "ready", "external comm PREPARATION, grant → RELEASED to `ready` (staged) — but NOT auto-SENT (preparation is reversible; the send is not)");

    // The external SEND is CONFIRM-CAPPED — even an `autonomous` grant for the send category resolves to confirm.
    await grant("comms.external.send", clientA);
    const sendDec = await resolveActionAutonomy({ ...sendAction("external_email"), clientId: clientA } as never, { db });
    assert(sendDec.level === "confirm" && sendDec.capped, "comms.external.SEND is CONFIRM-CAPPED: an autonomous grant still resolves to `confirm` (irreversible → founder in the loop)");
    // The founder-gated send then dispatches the staged comm.
    const sent = await sendCommunication(e2.communication.id, { sentBy: "Moiz" }, { enforceAutonomy: true });
    assert(!!sent && sent.communication.status === "sent" && sent.sendDecision?.level === "confirm", "founder send dispatches the staged external comm (status sent), recording the confirm-capped send level");

    // ---- 3) PROPOSAL-SEND PREPARATION + the confirm-capped proposal.send ----
    const p1 = track(await prepareCommunication({ channel: "proposal_send", kind: "proposal_delivery", subject: `p1 ${uniq}`, body: "b", scopeType: "client", clientId: clientA, preparedBy: "Moiz" }, { enforceAutonomy: true }));
    assert(!p1.released && p1.communication.status === "prepared", "proposal-send prep, NO grant → HELD prepared");
    await grant("proposal.send.prepare", clientA);
    const p2 = track(await prepareCommunication({ channel: "proposal_send", kind: "proposal_delivery", subject: `p2 ${uniq}`, body: "b", scopeType: "client", clientId: clientA, preparedBy: "Moiz" }, { enforceAutonomy: true }));
    assert(p2.released && p2.communication.status === "ready", "proposal-send PREPARATION, grant → RELEASED to `ready` (staged package)");
    await grant("proposal.send", clientA);
    const propSendDec = await resolveActionAutonomy({ ...sendAction("proposal_send"), clientId: clientA } as never, { db });
    assert(propSendDec.level === "confirm" && propSendDec.capped, "proposal.SEND is CONFIRM-CAPPED: an autonomous grant still resolves to `confirm` (never auto-sent)");

    // ---- EXPIRED + REVOKED grants → back to HELD ----
    await grant("notification.internal", clientB, { expired: true });
    const x1 = track(await prepareCommunication({ channel: "internal_notification", kind: "alert", subject: `x1 ${uniq}`, body: "b", scopeType: "client", clientId: clientB, preparedBy: "Moiz" }, { enforceAutonomy: true }));
    assert(!x1.released && x1.communication.status === "prepared", "EXPIRED grant → HELD prepared (an out-of-window policy never releases)");
    const rev = await grant("notification.internal", clientB);
    assert(await revokeAutonomyPolicy(rev.id, "Moiz", { db }), "the fresh client-B grant was revoked");
    const x2 = track(await prepareCommunication({ channel: "internal_notification", kind: "alert", subject: `x2 ${uniq}`, body: "b", scopeType: "client", clientId: clientB, preparedBy: "Moiz" }, { enforceAutonomy: true }));
    assert(!x2.released && x2.communication.status === "prepared", "REVOKED grant → HELD prepared (a revoked policy never releases)");

    // ---- IDEMPOTENT RETRIES (dedupeKey) ----
    const key = `comm_idem_${uniq}`;
    const i1 = track(await prepareCommunication({ channel: "internal_notification", kind: "alert", subject: `i ${uniq}`, body: "b", scopeType: "client", clientId: clientA, preparedBy: "Moiz", dedupeKey: key }, { enforceAutonomy: true }));
    const i2 = await prepareCommunication({ channel: "internal_notification", kind: "alert", subject: `i ${uniq}`, body: "b", scopeType: "client", clientId: clientA, preparedBy: "Moiz", dedupeKey: key }, { enforceAutonomy: true });
    assert(i2.deduped && i2.communication.id === i1.communication.id, "IDEMPOTENT retry: a repeated prepare with the same dedupeKey returns the SAME row (deduped), never double-creates");
    const rowsForKey = await db.select({ id: commsTable.id }).from(commsTable).where(eq(commsTable.dedupeKey, key));
    assert(rowsForKey.length === 1, "IDEMPOTENT retry: exactly ONE row exists for the dedupeKey (no duplicate delivery)");

    // ---- CANCEL (rollback of a reversible draft) ----
    const cancelled = await cancelCommunication(e1.communication.id, { cancelledBy: "Moiz", reason: "obsolete" }, {});
    assert(!!cancelled && cancelled.status === "cancelled", "a prepared draft can be CANCELLED (reversible rollback)");
    const noCancelSent = await cancelCommunication(n2.communication.id, { cancelledBy: "Moiz" }, {});
    assert(noCancelSent === null, "a SENT communication cannot be cancelled (guard)");

    console.log("\n✅ comms-autonomy DB proof passed");
  } finally {
    if (commIds.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, commIds));
      await db.delete(commsTable).where(inArray(commsTable.id, commIds));
    }
    if (policyIds.length) await db.delete(autonomyPolicies).where(inArray(autonomyPolicies.id, policyIds));
    await closeDb();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
