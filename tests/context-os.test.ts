import { describe, expect, it } from "vitest";
import { trustedContext, canApproveAssertion, approveAssertion, detectContextContradictions, contextCoverage, type ContextAssertion, type RawContextSource, type ContextScope } from "@/lib/domain/context-os";

/** Context OS: raw is never trusted directly; approval-gated; scoped isolation; contradictions recorded. */
const scopeA: ContextScope = { type: "client", id: "A" };
const scopeB: ContextScope = { type: "client", id: "B" };
const asrt = (id: string, over: Partial<ContextAssertion> = {}): ContextAssertion => ({ id, sourceId: `src_${id}`, statement: "s", entities: ["e"], scope: scopeA, classification: "internal", trust: 0.8, status: "extracted", version: 1, supersedes: null, ...over });

describe("Context OS — raw never trusted; approval-gated", () => {
  it("trustedContext returns ONLY approved assertions in the exact scope (never extracted/rejected/other-scope)", () => {
    const all = [asrt("a", { status: "approved" }), asrt("b", { status: "extracted" }), asrt("c", { status: "rejected" }), asrt("d", { status: "approved", scope: scopeB })];
    const trusted = trustedContext(all, scopeA);
    expect(trusted.map((a) => a.id)).toEqual(["a"]); // b extracted, c rejected, d other-scope → excluded
  });

  it("an extracted assertion CAN be approved; an already-approved one cannot (only path from raw)", () => {
    expect(canApproveAssertion(asrt("a"))).toBe(true);
    expect(canApproveAssertion(asrt("a", { status: "approved" }))).toBe(false);
    expect(() => approveAssertion(asrt("a", { status: "approved" }))).toThrow();
  });

  it("approving with a supersede bumps the version + marks the prior superseded (history preserved)", () => {
    const prior = asrt("old", { status: "approved", version: 2 });
    const { approved, superseded } = approveAssertion(asrt("new"), { supersedes: prior });
    expect(approved.status).toBe("approved");
    expect(approved.version).toBe(3); // prior.version + 1
    expect(approved.supersedes).toBe("old");
    expect(superseded?.status).toBe("superseded");
  });
});

describe("Context OS — isolation + contradiction + coverage", () => {
  it("detects a contradiction between approved assertions sharing an entity (never silently overwrites)", () => {
    const c = detectContextContradictions([
      asrt("a", { status: "approved", entities: ["pricing"], statement: "Price is $99" }),
      asrt("b", { status: "approved", entities: ["pricing"], statement: "Price is $149" }),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].entity).toBe("pricing");
  });

  it("does NOT contradict across different scopes (tenant isolation)", () => {
    expect(detectContextContradictions([
      asrt("a", { status: "approved", entities: ["pricing"], statement: "Price is $99", scope: scopeA }),
      asrt("b", { status: "approved", entities: ["pricing"], statement: "Price is $149", scope: scopeB }),
    ])).toHaveLength(0);
  });

  it("computes onboarding coverage from sources that produced an approved assertion", () => {
    const sources: RawContextSource[] = [
      { id: "src_a", kind: "document", content: "x", scope: scopeA, importedAt: new Date() },
      { id: "src_z", kind: "document", content: "y", scope: scopeA, importedAt: new Date() },
    ];
    expect(contextCoverage(sources, [asrt("a", { status: "approved", sourceId: "src_a" })])).toBe(0.5);
  });
});
