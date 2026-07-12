import { describe, expect, it } from "vitest";
import type { DecisionRow } from "@/lib/domain/decision";
import { deriveDecisionPolicies } from "@/lib/domain/decision-learning";
import {
  approveDecisionPolicy,
  inMemoryPolicyStore,
  proposeDecisionPolicies,
  type DecisionSource,
} from "@/lib/decision-learning";

const now = new Date("2026-07-12T12:00:00.000Z");

function decided(o: {
  id: string;
  label: string;
  category?: string;
  owner?: string | null;
  companyId?: string | null;
  opportunityId?: string | null;
  at?: Date;
  metadata?: Record<string, unknown>;
}): DecisionRow {
  const optId = `opt_${o.id}`;
  const at = o.at ?? now;
  return {
    id: o.id,
    title: `Decision ${o.id}`,
    context: null,
    category: o.category ?? "pricing",
    status: "decided",
    options: [{ id: optId, label: o.label }],
    decidedOptionId: optId,
    decisionRationale: `chose ${o.label}`,
    reasoningTrail: [],
    confidence: 80,
    owner: o.owner ?? null,
    companyId: o.companyId ?? null,
    opportunityId: o.opportunityId ?? null,
    createdBy: null,
    archivedAt: null,
    metadata: o.metadata ?? {},
    createdAt: at,
    updatedAt: at,
  };
}

describe("decision-learning domain — deriveDecisionPolicies", () => {
  it("a single decision NEVER becomes a policy", () => {
    const policies = deriveDecisionPolicies([decided({ id: "d1", owner: "moiz", label: "raise price" })], { minRepetitions: 3, now });
    expect(policies).toEqual([]);
  });

  it("N repeated same-scope decisions → a proposed policy carrying its source evidence", () => {
    const decisions = [
      decided({ id: "d1", owner: "moiz", label: "raise price", at: new Date("2026-07-01T00:00:00Z") }),
      decided({ id: "d2", owner: "moiz", label: "raise price", at: new Date("2026-07-05T00:00:00Z") }),
      decided({ id: "d3", owner: "moiz", label: "raise price", at: new Date("2026-07-09T00:00:00Z") }),
    ];
    const policies = deriveDecisionPolicies(decisions, { minRepetitions: 3, now });
    expect(policies).toHaveLength(1);
    const p = policies[0];
    expect(p.status).toBe("proposed"); // never auto-applied
    expect(p.origin).toBe("repetition");
    expect(p.scope).toBe("founder");
    expect(p.scopeId).toBe("moiz");
    expect(p.direction).toBe("raise price");
    expect(p.repetitionCount).toBe(3);
    expect(p.contested).toBe(false);
    expect(p.confidence).toBeGreaterThan(0);
    expect(p.evidence.map((e) => e.decisionId)).toEqual(["d1", "d2", "d3"]); // sorted by decidedAt
  });

  it("conflicting decisions in the same scope+category → no over-generalized policy", () => {
    const decisions = [
      decided({ id: "d1", owner: "moiz", label: "raise price" }),
      decided({ id: "d2", owner: "moiz", label: "raise price" }),
      decided({ id: "d3", owner: "moiz", label: "hold price" }),
      decided({ id: "d4", owner: "moiz", label: "hold price" }),
    ];
    // 2-vs-2 split: neither direction is a strict majority → nothing proposed even at a low threshold.
    expect(deriveDecisionPolicies(decisions, { minRepetitions: 2, now })).toEqual([]);
  });

  it("a strict-majority direction with minor dissent still proposes, flagged contested", () => {
    const decisions = [
      decided({ id: "d1", owner: "moiz", label: "raise price" }),
      decided({ id: "d2", owner: "moiz", label: "raise price" }),
      decided({ id: "d3", owner: "moiz", label: "raise price" }),
      decided({ id: "d4", owner: "moiz", label: "hold price" }),
    ];
    const policies = deriveDecisionPolicies(decisions, { minRepetitions: 3, now });
    expect(policies).toHaveLength(1);
    expect(policies[0].direction).toBe("raise price");
    expect(policies[0].contested).toBe(true);
    expect(policies[0].dissentCount).toBe(1);
  });

  it("per-scope isolation: one founder's policy never leaks to another founder", () => {
    const decisions = [
      decided({ id: "m1", owner: "moiz", label: "raise price" }),
      decided({ id: "m2", owner: "moiz", label: "raise price" }),
      decided({ id: "m3", owner: "moiz", label: "raise price" }),
      decided({ id: "a1", owner: "ali", label: "discount aggressively" }),
      decided({ id: "a2", owner: "ali", label: "discount aggressively" }),
      decided({ id: "a3", owner: "ali", label: "discount aggressively" }),
    ];
    const policies = deriveDecisionPolicies(decisions, { minRepetitions: 3, now });
    expect(policies).toHaveLength(2);
    const moiz = policies.find((p) => p.scopeId === "moiz")!;
    const ali = policies.find((p) => p.scopeId === "ali")!;
    expect(moiz.direction).toBe("raise price");
    expect(ali.direction).toBe("discount aggressively");
    // Evidence stays within each founder's own decisions — no cross-contamination.
    expect(moiz.evidence.every((e) => e.decisionId.startsWith("m"))).toBe(true);
    expect(ali.evidence.every((e) => e.decisionId.startsWith("a"))).toBe(true);
  });

  it("explicit approval lets a single flagged decision seed a proposal (still approval-gated)", () => {
    const policies = deriveDecisionPolicies(
      [decided({ id: "d1", owner: "moiz", label: "adopt annual billing", metadata: { approveAsPolicy: true } })],
      { minRepetitions: 3, now },
    );
    expect(policies).toHaveLength(1);
    expect(policies[0].origin).toBe("explicit_approval");
    expect(policies[0].status).toBe("proposed");
  });

  it("resolves client and project scope from decision fields", () => {
    const clientPolicies = deriveDecisionPolicies(
      [
        decided({ id: "c1", companyId: "acme", label: "weekly cadence" }),
        decided({ id: "c2", companyId: "acme", label: "weekly cadence" }),
      ],
      { minRepetitions: 2, now },
    );
    expect(clientPolicies[0].scope).toBe("client");
    expect(clientPolicies[0].scopeId).toBe("acme");

    const projectPolicies = deriveDecisionPolicies(
      [
        decided({ id: "p1", opportunityId: "opp7", companyId: "acme", label: "ship mvp first" }),
        decided({ id: "p2", opportunityId: "opp7", companyId: "acme", label: "ship mvp first" }),
      ],
      { minRepetitions: 2, now },
    );
    // opportunityId wins over companyId in the default resolver.
    expect(projectPolicies[0].scope).toBe("project");
    expect(projectPolicies[0].scopeId).toBe("opp7");
  });
});

describe("decision-learning service — propose + approval gating", () => {
  const repeated: DecisionRow[] = [
    decided({ id: "d1", owner: "moiz", label: "raise price" }),
    decided({ id: "d2", owner: "moiz", label: "raise price" }),
    decided({ id: "d3", owner: "moiz", label: "raise price" }),
  ];
  const source: DecisionSource = { async listCommittedDecisions() { return repeated; } };

  it("persists proposals and is idempotent by natural key", async () => {
    const store = inMemoryPolicyStore();
    const first = await proposeDecisionPolicies({ source, store, minRepetitions: 3, now });
    expect(first).toHaveLength(1);
    const second = await proposeDecisionPolicies({ source, store, minRepetitions: 3, now });
    expect(second).toEqual([]); // already tracked — not duplicated
    expect(await store.listPolicies()).toHaveLength(1);
  });

  it("approval is the only path to active, and it requires an approver", async () => {
    const store = inMemoryPolicyStore();
    const [proposal] = await proposeDecisionPolicies({ source, store, minRepetitions: 3, now });
    await expect(approveDecisionPolicy(proposal.id, { approvedBy: "" }, { store })).rejects.toThrow(/approver/i);
    const activated = await approveDecisionPolicy(proposal.id, { approvedBy: "moiz", now }, { store });
    expect(activated?.status).toBe("active");
    expect((await store.getPolicy(proposal.id))?.status).toBe("active");
  });
});
