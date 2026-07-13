import { describe, expect, it } from "vitest";
import {
  buildCommunicationRow,
  canTransitionCommunication,
  isExternalChannel,
  preparationAction,
  sendAction,
} from "@/lib/domain/comms";
import { resolveAutonomyLevel, type AutonomyPolicy } from "@/lib/domain/autonomy";
import {
  prepareCommunication,
  sendCommunication,
  cancelCommunication,
  type CommunicationStore,
} from "@/lib/comms";
import type { CommunicationRow } from "@/lib/domain/comms";
import type { AuditEventInput } from "@/lib/domain/audit";

const now = new Date("2026-07-13T12:00:00.000Z");

function makeStore(seed: CommunicationRow[] = []) {
  const rows = new Map<string, CommunicationRow>(seed.map((r) => [r.id, r]));
  const store: CommunicationStore = {
    insert: async (row) => { rows.set(row.id, row); },
    getById: async (id) => rows.get(id) ?? null,
    getByDedupeKey: async (key) => [...rows.values()].find((r) => r.dedupeKey === key) ?? null,
    list: async (q) => [...rows.values()].filter((r) => (q.status ? r.status === q.status : true)).filter((r) => (q.channel ? r.channel === q.channel : true)).slice(0, q.limit),
    update: async (id, fields) => { const c = rows.get(id); if (c) rows.set(id, { ...c, ...fields } as CommunicationRow); },
  };
  return { store, rows };
}

// A resolver stub driven by explicit policies (mirrors the DB-backed resolveActionAutonomy, minus IO).
function resolverFrom(policies: AutonomyPolicy[]): NonNullable<Parameters<typeof prepareCommunication>[1]>["resolveAutonomy"] {
  return async (action) => resolveAutonomyLevel(action as never, policies);
}
const autonomousGrant = (category: string, clientId: string | null = null): AutonomyPolicy => ({ id: `pol_${category}`, category, grantedLevel: "autonomous", status: "active", clientId, maxRiskLevel: "medium" });

describe("communications domain", () => {
  it("classifies channels + action shapes correctly", () => {
    expect(isExternalChannel("internal_notification")).toBe(false);
    expect(isExternalChannel("external_email")).toBe(true);
    expect(isExternalChannel("proposal_send")).toBe(true);
    // Preparation is always reversible (releasable); external/proposal SEND is irreversible (confirm-capped).
    expect(preparationAction("external_email")).toMatchObject({ category: "comms.external.prepare", reversible: true });
    expect(preparationAction("proposal_send")).toMatchObject({ category: "proposal.send.prepare", reversible: true });
    expect(preparationAction("internal_notification")).toMatchObject({ category: "notification.internal", reversible: true });
    expect(sendAction("external_email")).toMatchObject({ category: "comms.external.send", reversible: false });
    expect(sendAction("proposal_send")).toMatchObject({ category: "proposal.send", reversible: false });
    expect(sendAction("internal_notification")).toMatchObject({ reversible: true });
  });

  it("the SEND action is confirm-capped: even an autonomous grant resolves to confirm", () => {
    const dec = resolveAutonomyLevel({ ...sendAction("external_email"), clientId: "c1" } as never, [autonomousGrant("comms.external.send", "c1")]);
    expect(dec.level).toBe("confirm");
    expect(dec.capped).toBe(true);
    const pdec = resolveAutonomyLevel({ ...sendAction("proposal_send"), clientId: "c1" } as never, [autonomousGrant("proposal.send", "c1")]);
    expect(pdec.level).toBe("confirm");
  });

  it("enforces transitions", () => {
    expect(canTransitionCommunication("prepared", "ready")).toBe(true);
    expect(canTransitionCommunication("prepared", "sent")).toBe(true);
    expect(canTransitionCommunication("sent", "cancelled")).toBe(false);
    expect(canTransitionCommunication("cancelled", "sent")).toBe(false);
  });
});

describe("communications service — earned autonomy at prepare", () => {
  it("NO grant → internal notification is HELD prepared (baseline recommend, audited, not delivered)", async () => {
    const { store } = makeStore();
    const audit: AuditEventInput[] = [];
    const r = await prepareCommunication(
      { channel: "internal_notification", kind: "alert", subject: "s", body: "b", scopeType: "client", clientId: "acme", preparedBy: "Moiz" },
      { store, recordAudit: async (e) => { audit.push(e); }, resolveAutonomy: resolverFrom([]), enforceAutonomy: true, now },
    );
    expect(r.released).toBe(false);
    expect(r.communication.status).toBe("prepared");
    expect(r.communication.autonomyLevel).toBe("recommend");
    expect(audit.some((e) => e.eventType === "communication.prepared")).toBe(true);
    expect(audit.some((e) => e.eventType === "communication.delivered_autonomously")).toBe(false);
  });

  it("ACTIVE grant → internal notification is DELIVERED autonomously (status sent)", async () => {
    const { store } = makeStore();
    const audit: AuditEventInput[] = [];
    const r = await prepareCommunication(
      { channel: "internal_notification", kind: "alert", subject: "s", body: "b", scopeType: "client", clientId: "acme", preparedBy: "Moiz" },
      { store, recordAudit: async (e) => { audit.push(e); }, resolveAutonomy: resolverFrom([autonomousGrant("notification.internal", "acme")]), enforceAutonomy: true, now },
    );
    expect(r.released).toBe(true);
    expect(r.communication.status).toBe("sent");
    expect(r.communication.actedAutonomously).toBe(true);
    expect(audit.some((e) => e.eventType === "communication.delivered_autonomously")).toBe(true);
  });

  it("WRONG TENANT → a client-A grant does not release a client-B notification", async () => {
    const { store } = makeStore();
    const r = await prepareCommunication(
      { channel: "internal_notification", kind: "alert", subject: "s", body: "b", scopeType: "client", clientId: "clientB", preparedBy: "Moiz" },
      { store, recordAudit: async () => {}, resolveAutonomy: resolverFrom([autonomousGrant("notification.internal", "clientA")]), enforceAutonomy: true, now },
    );
    expect(r.released).toBe(false);
    expect(r.communication.status).toBe("prepared");
  });

  it("external comm prepare with a grant → RELEASED to ready (staged), NOT sent", async () => {
    const { store } = makeStore();
    const r = await prepareCommunication(
      { channel: "external_email", kind: "outreach", subject: "s", body: "b", scopeType: "client", clientId: "acme", preparedBy: "Moiz" },
      { store, recordAudit: async () => {}, resolveAutonomy: resolverFrom([autonomousGrant("comms.external.prepare", "acme")]), enforceAutonomy: true, now },
    );
    expect(r.released).toBe(true);
    expect(r.communication.status).toBe("ready");
  });

  it("idempotent: a repeated prepare with the same dedupeKey returns the same row, deduped", async () => {
    const { store, rows } = makeStore();
    const opts = { store, recordAudit: async () => {}, resolveAutonomy: resolverFrom([]), enforceAutonomy: true, now } as const;
    const input = { channel: "internal_notification", kind: "alert", subject: "s", body: "b", preparedBy: "Moiz", dedupeKey: "k1" } as const;
    const a = await prepareCommunication(input, opts);
    const b = await prepareCommunication(input, opts);
    expect(b.deduped).toBe(true);
    expect(b.communication.id).toBe(a.communication.id);
    expect(rows.size).toBe(1);
  });

  it("send + cancel guards: a staged comm sends; a sent comm cannot be cancelled", async () => {
    const staged = buildCommunicationRow({ channel: "external_email", kind: "outreach", subject: "s", body: "b", preparedBy: "Moiz" }, { id: "comm_x", now });
    const { store } = makeStore([{ ...staged, status: "ready" }]);
    const sent = await sendCommunication("comm_x", { sentBy: "Moiz" }, { store, recordAudit: async () => {}, resolveAutonomy: resolverFrom([]), enforceAutonomy: true, now });
    expect(sent?.communication.status).toBe("sent");
    expect(await cancelCommunication("comm_x", { cancelledBy: "Moiz" }, { store, recordAudit: async () => {}, now })).toBeNull();
  });
});
