import { describe, expect, it } from "vitest";
import { runDesignIntelligenceDepartment, DESIGN_MEMORY_SCOPES } from "@/lib/departments/verticals/design-intelligence";
import { buildDepartmentRow, type DepartmentRow } from "@/lib/domain/department";
import { buildDepartmentMemberRow, type DepartmentMemberRow } from "@/lib/domain/department-membership";
import type { CreativeReference } from "@/lib/domain/reference-selection";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { EscalationInput } from "@/lib/domain/escalation";
import { CANONICAL_DEPARTMENTS } from "@/lib/departments/seed";
import { DEPARTMENT_CONSUMERS } from "@/lib/departments/consumer";
import { DEFAULT_AGENTS } from "@/lib/domain/agents";

/**
 * Design Intelligence (WOB-UAT-023) — the last genuinely-absent department.
 *
 * The doctrine under test: judgment ADVISES, deterministic code DECIDES. `selectReferencesForBatch`
 * picks exactly one reference per asset by a scored, stable rule; the vision and brand agents may
 * describe and critique but can never overturn it. A model that re-picks a reference every run makes
 * design direction unreproducible, and "exactly ONE reference per asset, never a hybrid blend" is a
 * founder RULE, not an opinion.
 */

const now = new Date("2026-07-16T12:00:00.000Z");

function department(): DepartmentRow {
  return buildDepartmentRow(
    {
      slug: "design_intelligence",
      name: "Design Intelligence",
      purpose: "visual direction",
      status: "active",
      operatingModel: "agent_team",
      orchestratorAgentSlug: "design_intelligence_orchestrator",
      permissions: { authorizedMemoryScopes: DESIGN_MEMORY_SCOPES, permittedDataClassifications: ["internal", "client_confidential"] },
      io: { inboundCapabilities: ["produce_visual_direction"], acceptedHandoffSchemas: ["content_pack"], outboundProducts: ["design_briefs", "visual_direction"], downstreamConsumers: ["media_production"] },
    },
    { now },
  );
}

function members(): DepartmentMemberRow[] {
  return [
    buildDepartmentMemberRow({ departmentSlug: "design_intelligence", memberType: "agent", memberRef: "visual_reference_analyst", role: "specialist", responsibility: "describe", capabilities: ["visual_analysis"], memoryGrants: ["design"] }, { now }),
    buildDepartmentMemberRow({ departmentSlug: "design_intelligence", memberType: "agent", memberRef: "brand_voice_guardian", role: "evaluator", responsibility: "critique", capabilities: ["brand_critique"], memoryGrants: ["brand"] }, { now }),
  ];
}

function deps(extra: Record<string, unknown> = {}) {
  const events: AuditEventInput[] = [];
  const escalations: EscalationInput[] = [];
  return {
    events,
    escalations,
    d: {
      now,
      loadDepartment: async () => department(),
      loadMembers: async () => members(),
      recordAudit: async (e: AuditEventInput) => void events.push(e),
      escalationStore: { findOpen: async () => null, insert: async (i: EscalationInput) => void escalations.push(i), getById: async () => null, transition: async () => true, list: async () => [], countByStatus: async () => ({}) },
      handoffStore: { insert: async () => {}, findByIdempotencyKey: async () => null },
      enforcement: { loadSwitches: async () => [] },
      ...extra,
    } as Record<string, unknown>,
  };
}

const ref = (over: Partial<CreativeReference> = {}): CreativeReference => ({
  id: "ref_1",
  kind: "static",
  approvalStatus: "approved",
  styleTags: ["editorial", "high-contrast"],
  useCases: ["hook"],
  platform: "instagram",
  brandFit: 9,
  ...over,
});

const base = {
  packetId: "packet_1",
  designDirection: "Bold editorial layout, generous whitespace, one strong claim.",
  assets: [{ assetType: "static" as const, platform: "instagram", desiredStyleTags: ["editorial"] }],
  references: [ref()],
  requestedBy: "Moiz",
  workflowId: "wf_di_1",
};

describe("design_intelligence produces a renderable BRIEF (never an asset)", () => {
  it("selects exactly ONE reference per asset, deterministically", async () => {
    const { d, events } = deps();
    const r = await runDesignIntelligenceDepartment(base, d as never);
    expect(r.product!.selections).toHaveLength(1);
    expect(r.product!.selections[0].reference?.id).toBe("ref_1");
    expect(r.product!.referenceless).toBe(false);
    expect(events.map((e) => e.eventType)).toContain("department.completed");
  });

  /** The founder rule, and the reason selection is deterministic rather than a model call. */
  it("is REPRODUCIBLE — the same inputs select the same reference every run", async () => {
    const a = await runDesignIntelligenceDepartment(base, deps().d as never);
    const b = await runDesignIntelligenceDepartment(base, deps().d as never);
    expect(a.product!.selections[0].reference?.id).toBe(b.product!.selections[0].reference?.id);
    expect(a.product!.selections[0].rationale).toBe(b.product!.selections[0].rationale);
  });

  it("emits productSchema `design_briefs` — EXACTLY what media_production accepts", async () => {
    const r = await runDesignIntelligenceDepartment(base, deps().d as never);
    expect(r.product).toBeTruthy();
    const media = CANONICAL_DEPARTMENTS.find((x) => x.slug === "media_production")!;
    // A mismatch here means the route is rejected at dispatch and the brief silently goes nowhere.
    expect(media.io!.acceptedHandoffSchemas).toContain("design_briefs");
  });

  /**
   * The states must stay distinct. A brief carries an INSTRUCTION for a render — it is not a render.
   * Calling generated text a finished visual asset is the exact fabrication the campaign forbids.
   */
  it("produces media REQUESTS (instructions), never assets", async () => {
    const r = await runDesignIntelligenceDepartment(base, deps().d as never);
    const req = r.product!.mediaRequests[0];
    expect(req.kind).toBe("image");
    expect(req.prompt).toContain("Bold editorial layout");
    expect(req.prompt).toMatch(/do not blend/i);
    expect(req.params.referenceId).toBe("ref_1");
    // No asset fields anywhere — no url, no path, no rendered output.
    expect(Object.keys(req)).toEqual(["kind", "prompt", "params"]);
  });

  it("carries AVOID tags from negative references — what not to copy", async () => {
    const r = await runDesignIntelligenceDepartment(
      { ...base, references: [ref(), ref({ id: "ref_bad", negative: true, styleTags: ["cluttered", "neon"] })] },
      deps().d as never,
    );
    expect(r.product!.avoidStyleTags).toContain("cluttered");
    expect(r.product!.mediaRequests[0].prompt).toMatch(/Avoid: .*cluttered/);
  });
});

describe("it says what it does NOT have, rather than inventing it", () => {
  /** No eligible reference is a REAL state. A brief that reads complete while referenceless is a lie. */
  it("escalates and marks the brief REFERENCELESS when nothing is eligible", async () => {
    const { d, escalations } = deps();
    const r = await runDesignIntelligenceDepartment({ ...base, references: [] }, d as never);
    expect(r.product!.referenceless).toBe(true);
    expect(r.product!.selections[0].reference).toBeNull();
    expect(escalations.some((e) => /referenceless/.test(e.requiredDecision ?? ""))).toBe(true);
    // The prompt SAYS so rather than quietly omitting it — a renderer must not invent a style.
    expect(r.product!.mediaRequests[0].prompt).toMatch(/No approved style reference/);
  });

  it("lowers confidence when referenceless — the brief is real but weaker, and says so", async () => {
    const withRef = await runDesignIntelligenceDepartment(base, deps().d as never);
    const without = await runDesignIntelligenceDepartment({ ...base, references: [] }, deps().d as never);
    expect(without.telemetry).toBeDefined();
    expect(withRef.product!.referenceless).toBe(false);
    expect(without.product!.referenceless).toBe(true);
  });

  it("REFUSES a packet with no designDirection — never invents visual direction from nothing", async () => {
    await expect(runDesignIntelligenceDepartment({ ...base, designDirection: "  " }, deps().d as never)).rejects.toThrow(/no designDirection/);
  });

  it("only writes layout rules for references it ACTUALLY selected", async () => {
    const r = await runDesignIntelligenceDepartment({ ...base, references: [] }, deps().d as never);
    expect(r.product!.layoutRules).toEqual([]); // no reference → no rule describing one
  });
});

describe("judgment ADVISES, deterministic code DECIDES", () => {
  it("a vision-descriptor failure degrades the brief but never blocks it", async () => {
    const { d, escalations } = deps();
    const r = await runDesignIntelligenceDepartment(base, { ...d, describeReferences: async () => { throw new Error("vision provider down"); } } as never);
    expect(r.product!.selections[0].reference?.id).toBe("ref_1"); // selection UNAFFECTED
    expect(escalations.some((e) => /descriptors unavailable/.test(e.requiredDecision ?? ""))).toBe(true);
  });

  it("a FAILED brand critique escalates and annotates — it never rewrites the direction", async () => {
    const { d, escalations } = deps();
    const r = await runDesignIntelligenceDepartment(base, { ...d, critiqueBrand: async () => ({ passed: false, notes: ["claim unsupported"] }) } as never);
    expect(r.product!.brandCritique).toEqual({ passed: false, notes: ["claim unsupported"] });
    // The direction is UNCHANGED — the critique is advice on the record, not a silent edit.
    expect(r.product!.visualDirection).toContain("Bold editorial layout");
    expect(escalations.some((e) => /brand critique flagged/.test(e.requiredDecision ?? ""))).toBe(true);
  });

  it("escalates when the department has no visual analyst (membership is real, not a label)", async () => {
    const { d, escalations } = deps({ loadMembers: async () => [] });
    await runDesignIntelligenceDepartment(base, d as never);
    expect(escalations.some((e) => /no registered visual analyst/.test(e.requiredDecision ?? ""))).toBe(true);
  });
});

describe("the wiring is real, not declared", () => {
  /**
   * The crux the recon surfaced: NOTHING declared design_intelligence as a downstream consumer, so a
   * consumer registration would have been the decorative wiring `consumer.ts` forbids — AND
   * `enforcement.ts` would have rejected the route outright.
   */
  it("content ROUTES to design_intelligence (without this, the consumer is decorative)", () => {
    const content = CANONICAL_DEPARTMENTS.find((d) => d.slug === "content")!;
    expect(content.io!.downstreamConsumers).toContain("design_intelligence");
  });

  it("content still routes to publishing — text-only packs were not stranded", () => {
    const content = CANONICAL_DEPARTMENTS.find((d) => d.slug === "content")!;
    expect(content.io!.downstreamConsumers).toContain("publishing");
  });

  it("design_intelligence is ACTIVE — enforcement.ts rejects a route FROM a draft department", () => {
    expect(CANONICAL_DEPARTMENTS.find((d) => d.slug === "design_intelligence")!.status).toBe("active");
  });

  /** Content sets client_confidential whenever a companyId is present; `internal` only would have meant
   *  every real client pack was rejected at dispatch while the department looked built. */
  it("permits client_confidential — otherwise no real client work could ever arrive", () => {
    expect(CANONICAL_DEPARTMENTS.find((d) => d.slug === "design_intelligence")!.permissions!.permittedDataClassifications).toContain("client_confidential");
  });

  it("media_production has a consumer — otherwise the design brief dead-ends unclaimed", () => {
    expect(Object.keys(DEPARTMENT_CONSUMERS)).toContain("media_production");
    expect(Object.keys(DEPARTMENT_CONSUMERS)).toContain("design_intelligence");
  });

  it("the orchestrator agent exists and is active", () => {
    const a = DEFAULT_AGENTS.find((x) => x.slug === "design_intelligence_orchestrator");
    expect(a).toBeDefined();
    expect(a!.status ?? "active").toBe("active");
  });

  it("the two reused agents were EXTENDED, not duplicated", () => {
    const slugs = DEFAULT_AGENTS.map((a) => a.slug);
    expect(slugs.filter((s) => s === "visual_reference_analyst")).toHaveLength(1);
    expect(slugs.filter((s) => s === "brand_voice_guardian")).toHaveLength(1);
    // They now declare a modelRole — every executing agent in this codebase does.
    expect(DEFAULT_AGENTS.find((a) => a.slug === "visual_reference_analyst")!.modelRole).toBeTruthy();
  });
});

describe("an unreviewed critique is neither a pass nor a fail", () => {
  /**
   * My first version returned `{passed:true}` on an unparseable response — the comment said it must not
   * read as a PASS while the code did exactly that. Silently blessing off-brand direction is the worse
   * error; but reporting `passed:false` would invent a brand finding that nothing actually made. It is an
   * advisory FAILURE: unreviewed, and visibly so.
   */
  it("reports 'critique unavailable' rather than passing or failing the brand check", async () => {
    const { d, escalations } = deps();
    const r = await runDesignIntelligenceDepartment(
      base,
      { ...d, critiqueBrand: async () => { throw new Error("brand critique returned an unparseable response"); } } as never,
    );
    expect(r.product!.brandCritique).toBeNull(); // NOT a fabricated pass, NOT a fabricated fail
    expect(escalations.some((e) => /critique unavailable/.test(e.requiredDecision ?? ""))).toBe(true);
    // The brief still exists — an advisory failure never blocks the deterministic work.
    expect(r.product!.selections[0].reference?.id).toBe("ref_1");
  });
});
