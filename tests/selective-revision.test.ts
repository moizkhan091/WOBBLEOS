import { describe, expect, it } from "vitest";
import { planSelectiveRevision, applyRevision, type ArtifactComponent } from "@/lib/domain/selective-revision";

/** Selective artifact revision (Phase 7): rerun ONLY failed components (+ dependents), preserve the rest. */
const comp = (id: string, over: Partial<ArtifactComponent> = {}): ArtifactComponent => ({ id, kind: "slide", version: 1, status: "approved", producedBy: `spec_${id}`, dependsOn: [], ...over });

describe("planSelectiveRevision", () => {
  // A 10-component artifact; components 2, 5, 8 failed, no dependencies between them.
  const ten = Array.from({ length: 10 }, (_, i) => comp(`c${i + 1}`, { status: [2, 5, 8].includes(i + 1) ? "failed" : "approved" }));

  it("reruns ONLY the failed components + their specialists; preserves every other approved component", () => {
    const plan = planSelectiveRevision(ten, ["c2", "c5", "c8"]);
    expect(plan.rerun.sort()).toEqual(["c2", "c5", "c8"]);
    expect(plan.preserved.sort()).toEqual(["c1", "c10", "c3", "c4", "c6", "c7", "c9"]);
    expect(plan.specialists).toEqual(["spec_c2", "spec_c5", "spec_c8"]);
    expect(plan.nextVersions).toEqual({ c2: 2, c5: 2, c8: 2 });
  });

  it("requires local QA on reran components AND a final global consistency QA", () => {
    const plan = planSelectiveRevision(ten, ["c2"]);
    expect(plan.requiresLocalQa).toBe(true);
    expect(plan.requiresGlobalConsistencyQa).toBe(true);
  });

  it("propagates to DEPENDENTS — a component depending on a failed one is also reran (consistency)", () => {
    const comps = [comp("a", { status: "failed" }), comp("b", { dependsOn: ["a"] }), comp("c", { dependsOn: ["b"] }), comp("d")];
    const plan = planSelectiveRevision(comps, ["a"]);
    expect(plan.rerun.sort()).toEqual(["a", "b", "c"]); // a failed → b + c depend transitively → all rerun
    expect(plan.preserved).toEqual(["d"]); // d is independent → preserved
  });

  it("nothing failed → nothing reran, everything preserved, no QA cycle", () => {
    const plan = planSelectiveRevision(ten.map((c) => ({ ...c, status: "approved" as const })), []);
    expect(plan.rerun).toHaveLength(0);
    expect(plan.preserved).toHaveLength(10);
    expect(plan.requiresGlobalConsistencyQa).toBe(false);
  });

  it("applyRevision bumps ONLY reran components' versions (preserved ones keep their version + evidence)", () => {
    const plan = planSelectiveRevision(ten, ["c2", "c5"]);
    const after = applyRevision(ten, plan);
    expect(after.find((c) => c.id === "c2")!.version).toBe(2);
    expect(after.find((c) => c.id === "c2")!.status).toBe("approved");
    expect(after.find((c) => c.id === "c1")!.version).toBe(1); // preserved, untouched
  });
});
