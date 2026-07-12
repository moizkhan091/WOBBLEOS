import { describe, expect, it } from "vitest";
import {
  buildDeliveryCompletion,
  financeRecognitionOutputs,
  researchLessonsOutputs,
  type ProjectForCompletion,
  type TaskForCompletion,
  type InvoiceForCompletion,
} from "@/lib/domain/delivery-completion";
import { completeDelivery, type CompleteDeliveryDeps } from "@/lib/delivery-completion";
import { buildDepartmentRow, type DepartmentInput, type DepartmentRow } from "@/lib/domain/department";
import type { HandoffStore } from "@/lib/handoff";
import type { HandoffRow } from "@/lib/domain/handoff-delivery";

const now = new Date("2026-07-12T12:00:00.000Z");
const past = new Date("2026-06-01T00:00:00.000Z"); // before `now` → an outstanding invoice is overdue

// ---- an in-memory handoff store (dispatchHandoff only uses findByIdempotency + insert + getById) ----
function memHandoffStore() {
  const rows: HandoffRow[] = [];
  const store: HandoffStore = {
    findByIdempotency: async (workflowId, key) => rows.find((r) => r.workflowId === workflowId && r.idempotencyKey === key) ?? null,
    insert: async (row) => { rows.push(row); },
    getById: async (id) => rows.find((r) => r.id === id) ?? null,
    claimNext: async () => null,
    claimNextForDepartment: async () => null,
    transition: async () => false,
    reclaimExpiredLeases: async () => 0,
    list: async () => rows.slice(),
    countByState: async () => ({}),
    deleteExpired: async () => 0,
  };
  return { store, rows };
}

// ---- department fixtures: the POST-integration topology (delivery routes completion to the 3 consumers) ----
function makeDepartments(overrides: { deliveryConsumers?: string[]; financeAccepts?: string[] } = {}): Record<string, DepartmentRow> {
  const seededAt = new Date("2026-01-01T00:00:00.000Z");
  const mk = (input: DepartmentInput) => buildDepartmentRow(input, { now: seededAt });
  return {
    delivery: mk({
      slug: "delivery", name: "Delivery & Projects", purpose: "Run projects and close them out.", status: "active", orchestratorAgentSlug: "delivery_orchestrator",
      permissions: { authorizedMemoryScopes: ["company", "client"], permittedDataClassifications: ["internal", "client_confidential"] },
      io: { inboundCapabilities: ["run_project"], acceptedHandoffSchemas: ["won_deal"], outboundProducts: ["delivery_completion"], downstreamConsumers: overrides.deliveryConsumers ?? ["finance", "research_intelligence", "founder_command_centre"] },
    }),
    finance: mk({
      slug: "finance", name: "Finance", purpose: "Revenue recognition.", status: "active", orchestratorAgentSlug: "finance_orchestrator",
      permissions: { authorizedMemoryScopes: ["company"], permittedDataClassifications: ["internal", "restricted", "client_confidential"] },
      io: { inboundCapabilities: ["invoice", "report_revenue"], acceptedHandoffSchemas: overrides.financeAccepts ?? ["won_deal", "delivery_completion"], outboundProducts: [], downstreamConsumers: ["founder_command_centre"] },
    }),
    research_intelligence: mk({
      slug: "research_intelligence", name: "Research & Intelligence", purpose: "Learn lessons.", status: "active", orchestratorAgentSlug: "research_intelligence_orchestrator",
      permissions: { authorizedMemoryScopes: ["research", "competitor", "market", "company"], permittedDataClassifications: ["internal"] },
      io: { inboundCapabilities: ["scout", "analyse", "dream"], acceptedHandoffSchemas: ["delivery_completion"], outboundProducts: [], downstreamConsumers: ["founder_command_centre"] },
    }),
    founder_command_centre: mk({
      slug: "founder_command_centre", name: "Founder Command Centre", purpose: "The founders' console.", status: "active",
      permissions: { authorizedMemoryScopes: ["company"], permittedDataClassifications: ["internal", "client_confidential", "restricted"] },
      io: { inboundCapabilities: ["approve", "escalate", "intervene"], acceptedHandoffSchemas: [], outboundProducts: [], downstreamConsumers: [] },
    }),
  };
}

const completedProject: ProjectForCompletion = {
  id: "project_acme", name: "Acme AI OS Delivery", status: "completed", companyId: "company_acme", opportunityId: "opp_acme", proposalId: "prop_acme", owner: "Ali",
  servicesIncluded: ["Missed-call text-back"],
  milestones: [{ title: "Kickoff call", done: true }, { title: "Launch", done: true }],
  startDate: new Date("2026-05-01T00:00:00.000Z"), endDate: new Date("2026-06-15T00:00:00.000Z"),
};
const tasks: TaskForCompletion[] = [
  { id: "task_1", title: "Wire telephony", status: "completed", assignedTo: "Ali" },
  { id: "task_2", title: "Configure flow", status: "completed", assignedTo: "Haad" },
  { id: "task_3", title: "Client training", status: "in_progress", assignedTo: "Ali" },
];
const invoices: InvoiceForCompletion[] = [
  { id: "inv_1", invoiceNumber: "INV-2026-0001", status: "partially_paid", totalCents: 480000, amountPaidCents: 200000, dueDate: past },
];

const baseInput = { project: completedProject, tasks, invoices, budgetCents: 480000, actualCostCents: 300000, requestedBy: "Moiz" };

function deps(extra: Partial<CompleteDeliveryDeps> = {}) {
  const depts = extra.loadDepartment ? undefined : makeDepartments();
  const { store, rows } = memHandoffStore();
  const d: CompleteDeliveryDeps = {
    handoffStore: store,
    loadDepartment: extra.loadDepartment ?? (async (slug) => depts![slug] ?? null),
    recordAudit: async () => {},
    now,
    ...extra,
  };
  return { d, rows };
}

describe("buildDeliveryCompletion (pure)", () => {
  it("builds the completion from a completed project: completed vs incomplete tasks, budget vs actual, margin inputs", () => {
    const c = buildDeliveryCompletion(baseInput, { now });
    // completed vs incomplete work (cancelled would be neither; here one task is still in_progress)
    expect(c.completedTasks.map((t) => t.id)).toEqual(["task_1", "task_2"]);
    expect(c.incompleteTasks.map((t) => t.id)).toEqual(["task_3"]);
    expect(c.scopeVariance).toMatchObject({ plannedMilestones: 2, completedMilestones: 2, completedTasks: 2, incompleteTasks: 1, fullyDelivered: false });
    // budget vs actualCost + margin inputs, all computed from the ledger
    expect(c.budgetCents).toBe(480000);
    expect(c.actualCostCents).toBe(300000);
    expect(c.marginInputs).toMatchObject({ invoicedCents: 480000, recognizedRevenueCents: 480000, grossMarginCents: 180000, grossMarginPct: 38 });
    // payment state from the real invoice ledger
    expect(c.paymentState).toMatchObject({ invoicedCents: 480000, collectedCents: 200000, outstandingCents: 280000, overdueCents: 280000, state: "partially_paid" });
    // an incomplete task → delivered_with_gaps; on budget; not fully paid
    expect(c.outcome).toMatchObject({ status: "delivered_with_gaps", onBudget: true, fullyPaid: false });
    // versioned + evidence-backed
    expect(c.schema).toBe("delivery_completion");
    expect(c.version).toBe(1);
    expect(c.invoiceRefs).toEqual(["inv_1"]);
    expect(c.evidence).toContain("project:project_acme");
    expect(c.evidence).toContain("invoice:inv_1");
    // deterministic reusable lessons (qualitative, de-identified) for Research
    expect(c.reusableLessons.length).toBeGreaterThanOrEqual(2);
    expect(c.reusableLessons.join(" ")).not.toMatch(/company_acme|480000|Acme/);
  });

  it("throws when asked to build from a non-completed project", () => {
    expect(() => buildDeliveryCompletion({ ...baseInput, project: { ...completedProject, status: "in_progress" } }, { now })).toThrow(/completed/);
  });

  it("marks delivered_in_full + over_budget flags truthfully", () => {
    const c = buildDeliveryCompletion(
      { project: { ...completedProject, milestones: [{ title: "m", done: true }] }, tasks: [{ id: "t", title: "t", status: "completed", assignedTo: "Ali" }], invoices, budgetCents: 100000, actualCostCents: 250000, completedBy: "Moiz" },
      { now },
    );
    expect(c.outcome.status).toBe("delivered_in_full");
    expect(c.outcome.onBudget).toBe(false); // 250000 > 100000
    expect(c.reusableLessons.join(" ")).toMatch(/exceeded its approved budget/);
  });
});

describe("completeDelivery (service)", () => {
  it("routes the completion to the 3 authorized consumers with the right per-consumer payload + classification", async () => {
    const { d, rows } = deps();
    const res = await completeDelivery(baseInput, d);

    expect(res.produced).toBe(true);
    expect(res.routedTo.map((r) => r.department).sort()).toEqual(["finance", "founder_command_centre", "research_intelligence"]);
    expect(res.routedTo.every((r) => r.ok && r.handoffId)).toBe(true);
    expect(rows).toHaveLength(3);

    const byDept = (slug: string) => rows.find((r) => r.department === slug)!;
    // Finance: client_confidential + the DETERMINISTIC revenue-recognition figures
    const fin = byDept("finance");
    expect(fin.dataClassification).toBe("client_confidential");
    expect(fin.envelope.expectedOutputSchema).toBe("delivery_completion");
    expect(fin.envelope.previousAgentOutputs).toMatchObject({ recognizedRevenueCents: 480000, grossMarginCents: 180000, outstandingCents: 280000, paymentState: "partially_paid", invoiceRefs: ["inv_1"] });
    // Research: INTERNAL + de-identified (lessons/metrics only — no cents, no client id)
    const res2 = byDept("research_intelligence");
    expect(res2.dataClassification).toBe("internal");
    const rOut = res2.envelope.previousAgentOutputs as Record<string, unknown>;
    expect(Array.isArray(rOut.reusableLessons)).toBe(true);
    expect(JSON.stringify(rOut)).not.toMatch(/480000|200000|company_acme|budgetCents|collectedCents/);
    // Founder: client_confidential executive summary
    const found = byDept("founder_command_centre");
    expect(found.dataClassification).toBe("client_confidential");
    expect(typeof (found.envelope.previousAgentOutputs as Record<string, unknown>).summary).toBe("string");
    // memory scopes narrowed to each destination's grant (delivery ∩ dest)
    expect(fin.envelope.authorizedMemoryScopes).toEqual(["company"]);
  });

  it("does NOT produce a completion for a non-completed project (builds + routes nothing)", async () => {
    const { d, rows } = deps();
    const res = await completeDelivery({ ...baseInput, project: { ...completedProject, status: "in_progress" } }, d);
    expect(res.produced).toBe(false);
    expect(res.completion).toBeNull();
    expect(res.routedTo).toHaveLength(0);
    expect(rows).toHaveLength(0);
  });

  it("financial path is DETERMINISTIC — no LLM, and the finance payload equals the pure ledger projection (stable across runs)", async () => {
    // Same inputs + clock → byte-identical financial figures (pure code, no provider/LLM in the path).
    const a = buildDeliveryCompletion(baseInput, { now, id: "delcomp_fixed" });
    const b = buildDeliveryCompletion(baseInput, { now, id: "delcomp_fixed" });
    expect(a.marginInputs).toEqual(b.marginInputs);
    expect(a.paymentState).toEqual(b.paymentState);

    const { d, rows } = deps();
    const res = await completeDelivery(baseInput, d);
    const fin = rows.find((r) => r.department === "finance")!;
    // The routed finance payload is exactly the pure projection of the built completion — nothing embellished.
    expect(fin.envelope.previousAgentOutputs).toEqual(financeRecognitionOutputs(res.completion!));
    // Research payload is exactly the pure de-identified projection.
    const r = rows.find((x) => x.department === "research_intelligence")!;
    expect(r.envelope.previousAgentOutputs).toEqual(researchLessonsOutputs(res.completion!));
  });

  it("enforces REAL routing authorization — a consumer delivery does not DECLARE is blocked, not decoratively routed", async () => {
    // Delivery only declares the founder hub → finance + research are blocked by planDepartmentRoute.
    const depts = makeDepartments({ deliveryConsumers: ["founder_command_centre"] });
    const { d, rows } = deps({ loadDepartment: async (slug) => depts[slug] ?? null });
    const res = await completeDelivery(baseInput, d);
    expect(res.produced).toBe(true);
    const finance = res.routedTo.find((r) => r.department === "finance")!;
    const research = res.routedTo.find((r) => r.department === "research_intelligence")!;
    const founder = res.routedTo.find((r) => r.department === "founder_command_centre")!;
    expect(finance.ok).toBe(false);
    expect(finance.errors.join(" ")).toMatch(/not a declared downstream consumer/);
    expect(research.ok).toBe(false);
    expect(founder.ok).toBe(true);
    expect(rows).toHaveLength(1); // only the founder handoff was dispatched
  });

  it("is blocked when the destination does not accept the delivery_completion schema", async () => {
    const depts = makeDepartments({ financeAccepts: ["won_deal"] }); // finance no longer accepts delivery_completion
    const { d } = deps({ loadDepartment: async (slug) => depts[slug] ?? null });
    const res = await completeDelivery(baseInput, d);
    const finance = res.routedTo.find((r) => r.department === "finance")!;
    expect(finance.ok).toBe(false);
    expect(finance.errors.join(" ")).toMatch(/does not accept product schema 'delivery_completion'/);
  });

  it("is idempotent — re-completing the same project dedups (no duplicate handoffs)", async () => {
    const depts = makeDepartments();
    const { store, rows } = memHandoffStore();
    const d: CompleteDeliveryDeps = { handoffStore: store, loadDepartment: async (slug) => depts[slug] ?? null, recordAudit: async () => {}, now };
    await completeDelivery(baseInput, d);
    const second = await completeDelivery(baseInput, d);
    expect(second.routedTo.every((r) => r.ok && r.deduped)).toBe(true);
    expect(rows).toHaveLength(3); // still exactly 3 — the dedup guard held
  });
});
