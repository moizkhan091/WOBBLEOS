import { describe, expect, it } from "vitest";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  buildFeedbackEventRow,
  buildTasteProfileRow,
  DEFAULT_TASTE_PROFILES,
  profileKeyForFeedbackScope,
  type FeedbackEventRow,
  type TasteProfileRow,
} from "@/lib/domain/taste";
import {
  getTasteProfile,
  listFeedbackEvents,
  listTasteProfiles,
  recordFeedbackEvent,
  type TasteStore,
} from "@/lib/taste";

const now = new Date("2026-07-04T11:00:00.000Z");

function makeStore(seedProfiles: TasteProfileRow[] = []) {
  const profiles = new Map(seedProfiles.map((profile) => [profile.profileKey, profile]));
  const events: FeedbackEventRow[] = [];
  const updates: Array<{ profileKey: string; fields: Partial<TasteProfileRow> }> = [];

  const store: TasteStore = {
    insertProfile: async (profile) => {
      profiles.set(profile.profileKey, profile);
    },
    getProfileByKey: async (profileKey) => profiles.get(profileKey) ?? null,
    updateProfile: async (profileKey, fields) => {
      const current = profiles.get(profileKey);
      if (!current) return;
      updates.push({ profileKey, fields });
      profiles.set(profileKey, { ...current, ...fields } as TasteProfileRow);
    },
    insertFeedbackEvent: async (event) => {
      events.push(event);
    },
    listProfiles: async (query) =>
      [...profiles.values()]
        .filter((profile) => (query.scope ? profile.scope === query.scope : true))
        .filter((profile) => (query.subjectId ? profile.subjectId === query.subjectId : true))
        .slice(0, query.limit),
    listFeedbackEvents: async (query) =>
      events
        .filter((event) => (query.profileKey ? event.profileKeys.includes(query.profileKey) : true))
        .filter((event) => (query.targetType ? event.targetType === query.targetType : true))
        .slice(0, query.limit),
  };

  return { store, profiles, events, updates };
}

function audit() {
  const events: AuditEventInput[] = [];
  return {
    events,
    recordAudit: async (event: AuditEventInput) => {
      events.push(event);
    },
  };
}

describe("taste + feedback domain", () => {
  it("builds durable profile keys for brand, founder, client, project, and agent scopes", () => {
    expect(profileKeyForFeedbackScope({ scope: "brand" })).toBe("brand:wobble");
    expect(profileKeyForFeedbackScope({ scope: "founder", subjectId: "Moiz" })).toBe("founder:moiz");
    expect(profileKeyForFeedbackScope({ scope: "client", subjectId: "Northwind" })).toBe("client:northwind");
    expect(profileKeyForFeedbackScope({ scope: "project", subjectId: "Q3 Launch" })).toBe("project:q3_launch");
    expect(profileKeyForFeedbackScope({ scope: "agent", subjectId: "content_worker" })).toBe("agent:content_worker");
  });

  it("seeds brand and per-founder taste profiles without turning founder taste into brand law", () => {
    const seeded = DEFAULT_TASTE_PROFILES.map((profile) => profile.profileKey);
    expect(seeded).toEqual(expect.arrayContaining(["brand:wobble", "founder:moiz", "founder:ali", "founder:ibrahim", "founder:haad"]));

    const brand = buildTasteProfileRow({ scope: "brand", label: "WOBBLE Brand Taste" }, { id: "taste_brand", now });
    expect(brand.profileKey).toBe("brand:wobble");
    expect(brand.hardConstraints).toEqual([]);
    expect(brand.preferenceWeights).toEqual({});
  });

  it("requires a reason for rejected feedback so the OS learns what not to repeat", () => {
    expect(() =>
      buildFeedbackEventRow(
        {
          targetType: "content_packet",
          targetId: "packet_1",
          decision: "reject",
          actor: "Moiz",
          dimensions: [{ key: "hook_style", value: "generic_ai_hype" }],
        },
        { now },
      ),
    ).toThrow(/reason is required/i);
  });
});

describe("taste + feedback service", () => {
  it("records approval feedback and updates brand + founder profiles as separate signals", async () => {
    const { store, profiles, events } = makeStore();
    const { recordAudit, events: auditEvents } = audit();

    const result = await recordFeedbackEvent(
      {
        targetType: "content_packet",
        targetId: "packet_1",
        decision: "approve",
        actor: "Moiz",
        outputType: "linkedin_static",
        module: "content_command",
        agentSlug: "content_worker",
        reason: "Strong proof-led hook with premium WOBBLE tone.",
        dimensions: [
          { key: "hook_style", value: "proof_led", weight: 1 },
          { key: "tone", value: "direct_operator", weight: 0.6 },
        ],
      },
      { store, recordAudit, now },
    );

    expect(result.event.profileKeys).toEqual(expect.arrayContaining(["brand:wobble", "founder:moiz", "agent:content_worker"]));
    expect(events).toHaveLength(1);
    expect(profiles.get("brand:wobble")?.positiveSignals).toBe(1);
    expect(profiles.get("founder:moiz")?.positiveSignals).toBe(1);
    expect(Number(profiles.get("founder:moiz")?.preferenceWeights["hook_style:proof_led"])).toBeGreaterThan(
      Number(profiles.get("brand:wobble")?.preferenceWeights["hook_style:proof_led"]),
    );
    expect(profiles.get("brand:wobble")?.hardConstraints).toEqual([]);
    expect(auditEvents.map((event) => event.eventType)).toEqual(["feedback.recorded", "taste_profile.updated", "taste_profile.updated", "taste_profile.updated"]);
  });

  it("keeps conflicting founder preferences separate instead of overwriting global brand taste", async () => {
    const { store, profiles } = makeStore();

    await recordFeedbackEvent(
      {
        targetType: "content_packet",
        targetId: "packet_proof",
        decision: "approve",
        actor: "Moiz",
        reason: "This is sharp and proof-led.",
        dimensions: [{ key: "angle", value: "aggressive_proof" }],
      },
      { store, recordAudit: async () => {}, now },
    );

    await recordFeedbackEvent(
      {
        targetType: "content_packet",
        targetId: "packet_proof",
        decision: "reject",
        actor: "Haad",
        reasonCategory: "not_premium_enough",
        reason: "Too loud for this campaign.",
        dimensions: [{ key: "angle", value: "aggressive_proof" }],
      },
      { store, recordAudit: async () => {}, now },
    );

    expect(Number(profiles.get("founder:moiz")?.preferenceWeights["angle:aggressive_proof"])).toBeGreaterThan(0);
    expect(Number(profiles.get("founder:haad")?.preferenceWeights["angle:aggressive_proof"])).toBeLessThan(0);
    expect(profiles.get("brand:wobble")?.negativeSignals).toBe(1);
    expect(profiles.get("brand:wobble")?.metadata.conflictCount).toBe(1);
  });

  it("routes client, project, and agent feedback into their own profile keys", async () => {
    const { store, profiles } = makeStore();

    const result = await recordFeedbackEvent(
      {
        targetType: "strategy_brief",
        targetId: "brief_1",
        decision: "edit",
        actor: "Ali",
        clientId: "northwind",
        projectId: "q3_launch",
        agentSlug: "decision_strategist",
        outputType: "client_aios_brief",
        reason: "Client wants more proof and less abstract transformation language.",
        dimensions: [{ key: "proof_depth", value: "more_specific" }],
      },
      { store, recordAudit: async () => {}, now },
    );

    expect(result.event.profileKeys).toEqual(
      expect.arrayContaining(["brand:wobble", "founder:ali", "client:northwind", "project:q3_launch", "agent:decision_strategist"]),
    );
    expect(profiles.get("client:northwind")?.positiveSignals).toBe(1);
    expect(profiles.get("project:q3_launch")?.positiveSignals).toBe(1);
    expect(profiles.get("agent:decision_strategist")?.positiveSignals).toBe(1);
  });

  it("lists profiles and feedback events for retrieval and dashboard visibility", async () => {
    const { store } = makeStore();
    await recordFeedbackEvent(
      {
        targetType: "content_packet",
        targetId: "packet_1",
        decision: "approve",
        actor: "Ibrahim",
        reason: "Good client-safe tone.",
        dimensions: [{ key: "tone", value: "client_safe" }],
      },
      { store, recordAudit: async () => {}, now },
    );

    expect((await listTasteProfiles({ scope: "founder" }, { store })).map((profile) => profile.profileKey)).toEqual(["founder:ibrahim"]);
    expect((await getTasteProfile("brand:wobble", { store }))?.profileKey).toBe("brand:wobble");
    expect((await listFeedbackEvents({ profileKey: "founder:ibrahim" }, { store })).map((event) => event.targetId)).toEqual(["packet_1"]);
  });
});
