import { describe, expect, it } from "vitest";
import { buildDepartmentRow, type DepartmentRow } from "@/lib/domain/department";
import { buildDepartmentMemberRow, type DepartmentMemberRow } from "@/lib/domain/department-membership";
import { buildHandoffEnvelope } from "@/lib/domain/handoff";
import type { HandoffStore } from "@/lib/handoff";
import type { HandoffRow } from "@/lib/domain/handoff-delivery";
import type { EscalationStore } from "@/lib/departments/escalation";
import type { EscalationRow } from "@/lib/domain/escalation";
import type { CrmStore } from "@/lib/crm";
import type { FinanceStore } from "@/lib/finance";
import type { ProjectStore } from "@/lib/projects";
import type { TaskStore } from "@/lib/tasks";
import { buildOpportunityRow, type OpportunityRow, type StageHistoryRow } from "@/lib/domain/crm";
import type { InvoiceRow, RevenueSummary } from "@/lib/domain/finance";
import type { ProjectRow } from "@/lib/domain/project";
import type { TaskRow } from "@/lib/domain/task";
import { DepartmentRejectedError } from "@/lib/departments/orchestrator";
import { runSalesCrmDepartment, type DealRiskAssessment } from "@/lib/departments/verticals/sales-crm";
import { runFinanceDepartment, type MarginAssessment } from "@/lib/departments/verticals/finance";
import { runDeliveryDepartment, type DeliveryFeasibility } from "@/lib/departments/verticals/delivery";

const now = new Date("2026-07-12T12:00:00.000Z");

// ── canned judgment (no live LLM in the unit proofs) ────────────────────────────────────────────
const CANNED_DEAL: DealRiskAssessment = { lossRisk: "low", riskFactors: [], nextBestAction: "Book the kickoff call within 48h", rationale: "Clear scope, engaged buyer." };
const CANNED_MARGIN: MarginAssessment = { marginRisk: "low", overdueRisk: "low", notes: ["Healthy margin"] };
const CANNED_FEASIBILITY: DeliveryFeasibility = { feasibility: "clear", risks: [], dependencies: ["Twilio credentials"] };
const CANNED_REVENUE: RevenueSummary = { paidRevenueCents: 0, outstandingCents: 480000, overdueCents: 0, pipelineValueCents: 0, weightedPipelineCents: 0, wonValueCents: 480000, invoiceCounts: {}, openDeals: 0, wonDeals: 1, avgDealSizeCents: 480000, revenueByService: {} };

// ── in-memory stores ────────────────────────────────────────────────────────────────────────────
function makeHandoffStore() {
  const rows = new Map<string, HandoffRow>();
  const key = (r: { workflowId: string; idempotencyKey: string }) => `${r.workflowId}::${r.idempotencyKey}`;
  const store: HandoffStore = {
    findByIdempotency: async (wf, k) => [...rows.values()].find((r) => r.workflowId === wf && r.idempotencyKey === k) ?? null,
    insert: async (row) => { if ([...rows.values()].some((r) => key(r) === key(row))) throw new Error("duplicate key value violates unique constraint"); rows.set(row.id, row); },
    getById: async (id) => rows.get(id) ?? null,
    claimNext: async () => null,
    claimNextForDepartment: async () => null,
    transition: async (id, from, fields) => { const r = rows.get(id); if (!r || r.deliveryState !== from) return false; rows.set(id, { ...r, ...fields }); return true; },
    reclaimExpiredLeases: async () => 0,
    list: async () => [...rows.values()],
    countByState: async () => ({}),
    deleteExpired: async () => 0,
  };
  return { store, rows };
}

function makeEscalationStore() {
  const rows: EscalationRow[] = [];
  const store: EscalationStore = {
    findOpen: async (dept, wf, task, reason) => rows.find((r) => r.departmentSlug === dept && r.workflowId === wf && r.taskId === task && r.reason === reason && r.status === "open") ?? null,
    insert: async (row) => { rows.push(row); },
    getById: async (id) => rows.find((r) => r.id === id) ?? null,
    transition: async () => true,
    list: async () => rows,
    countByStatus: async () => ({}),
  };
  return { store, rows };
}

function makeCrmStore(seed: OpportunityRow[] = []) {
  const opps = new Map(seed.map((o) => [o.id, o] as const));
  const history: StageHistoryRow[] = [];
  const store: CrmStore = {
    insertCompany: async () => {}, listCompanies: async () => [], getCompany: async () => null, updateCompany: async () => {},
    insertContact: async () => {}, listContacts: async () => [],
    insertLead: async () => {}, listLeads: async () => [], getLead: async () => null, updateLead: async () => {}, markLeadConverted: async () => false,
    insertOpportunity: async (r) => { opps.set(r.id, r); }, listOpportunities: async () => [...opps.values()],
    getOpportunity: async (id) => opps.get(id) ?? null,
    updateOpportunity: async (id, f) => { const o = opps.get(id); if (o) opps.set(id, { ...o, ...f } as OpportunityRow); },
    insertStageHistory: async (r) => { history.push(r); },
    listStageHistory: async (id) => history.filter((h) => h.opportunityId === id),
  };
  return { store, opps, history };
}

function makeFinanceStore() {
  const invs = new Map<string, InvoiceRow>();
  const store: FinanceStore = {
    insertInvoice: async (r) => { invs.set(r.id, r); },
    listInvoices: async () => [...invs.values()],
    getInvoice: async (id) => invs.get(id) ?? null,
    updateInvoice: async (id, f) => { const i = invs.get(id); if (i) invs.set(id, { ...i, ...f } as InvoiceRow); },
    countInvoices: async () => invs.size,
    recordPayment: async () => null,
  };
  return { store, invs };
}

function makeProjectStore() {
  const projs = new Map<string, ProjectRow>();
  const store: ProjectStore = {
    insertProject: async (r) => { projs.set(r.id, r); },
    listProjects: async (q) => [...projs.values()].filter((p) => (!q.opportunityId || p.opportunityId === q.opportunityId) && (!q.companyId || p.companyId === q.companyId)),
    getProject: async (id) => projs.get(id) ?? null,
    updateProject: async (id, f) => { const p = projs.get(id); if (p) projs.set(id, { ...p, ...f } as ProjectRow); },
  };
  return { store, projs };
}

function makeTaskStore() {
  const tasks = new Map<string, TaskRow>();
  const store: TaskStore = {
    insertTask: async (r) => { tasks.set(r.id, r); },
    listTasks: async () => [...tasks.values()],
    getTask: async (id) => tasks.get(id) ?? null,
    updateTask: async (id, f) => { const t = tasks.get(id); if (t) tasks.set(id, { ...t, ...f } as TaskRow); },
  };
  return { store, tasks };
}

// ── the commercial departments (mirror the seed's declared topology so routing is authorized) ────
const salesCrmDept = buildDepartmentRow(
  { slug: "sales_crm", name: "Sales & CRM", purpose: "p", status: "active", orchestratorAgentSlug: "sales_crm_orchestrator",
    io: { acceptedHandoffSchemas: ["proposal_artifact"], inboundCapabilities: ["qualify", "advance_deal"], outboundProducts: ["won_deal"], downstreamConsumers: ["delivery", "finance"] },
    permissions: { authorizedMemoryScopes: ["company", "offer"], permittedDataClassifications: ["internal", "client_confidential"], allowedTools: ["run_node"], deniedTools: [] } },
  { now },
);
const financeDept = buildDepartmentRow(
  { slug: "finance", name: "Finance", purpose: "p", status: "active", orchestratorAgentSlug: "finance_orchestrator",
    io: { acceptedHandoffSchemas: [], inboundCapabilities: ["invoice", "report_revenue"], outboundProducts: ["revenue_margin_intelligence"], downstreamConsumers: ["founder_command_centre"] },
    permissions: { authorizedMemoryScopes: ["company"], permittedDataClassifications: ["internal", "restricted", "client_confidential"], allowedTools: ["run_node"], deniedTools: [] } },
  { now },
);
const deliveryDept = buildDepartmentRow(
  { slug: "delivery", name: "Delivery & Projects", purpose: "p", status: "active", orchestratorAgentSlug: "delivery_orchestrator",
    io: { acceptedHandoffSchemas: ["won_deal"], inboundCapabilities: ["run_project"], outboundProducts: ["delivery_health"], downstreamConsumers: ["founder_command_centre"] },
    permissions: { authorizedMemoryScopes: ["company", "client"], permittedDataClassifications: ["internal", "client_confidential"], allowedTools: ["run_node"], deniedTools: [] } },
  { now },
);
const founderCC = buildDepartmentRow(
  { slug: "founder_command_centre", name: "Founder Command Centre", purpose: "p", status: "active",
    io: { acceptedHandoffSchemas: [], inboundCapabilities: ["approve", "escalate", "intervene"], outboundProducts: [], downstreamConsumers: [] },
    permissions: { authorizedMemoryScopes: ["company", "offer", "client"], permittedDataClassifications: ["internal", "client_confidential", "restricted"], allowedTools: [], deniedTools: [] } },
  { now },
);

const DEPTS: Record<string, DepartmentRow> = { sales_crm: salesCrmDept, finance: financeDept, delivery: deliveryDept, founder_command_centre: founderCC };

function member(departmentSlug: string, capability: string): DepartmentMemberRow {
  return buildDepartmentMemberRow(
    { departmentSlug, memberType: "agent", memberRef: `${departmentSlug}_specialist`, role: "specialist", responsibility: "work", priority: 10, capabilities: [capability], toolGrants: ["run_node"], memoryGrants: DEPTS[departmentSlug].permissions.authorizedMemoryScopes },
    { now },
  );
}
const MEMBERS: Record<string, DepartmentMemberRow[]> = {
  sales_crm: [member("sales_crm", "advance_deal")],
  finance: [member("finance", "invoice")],
  delivery: [member("delivery", "run_project")],
  founder_command_centre: [],
};

const registry = {
  loadDepartment: async (slug: string) => DEPTS[slug] ?? null,
  loadMembers: async (slug: string) => MEMBERS[slug] ?? [],
};

function wonableOpp(id = "opp_win_1"): OpportunityRow {
  return buildOpportunityRow(
    { name: "Acme — Missed-call text-back", companyId: "co_acme", stage: "negotiation", valueCents: 480000, serviceInterest: ["Missed-call text-back"], assignedOwner: "Ali", createdBy: "Moiz" },
    { now, id },
  );
}

const noAudit = { recordAudit: async () => {} };

describe("Commercial verticals — Sales & CRM", () => {
  it("accepts proposal_artifact → advisory risk → DETERMINISTIC opportunity→won → routes to Delivery + Finance", async () => {
    const { store: handoffStore, rows: handoffRows } = makeHandoffStore();
    const { store: crm, opps } = makeCrmStore([wonableOpp()]);
    const audits: string[] = [];

    const res = await runSalesCrmDepartment(
      { opportunityId: "opp_win_1", proposalId: "prop_1", businessName: "Acme", companyId: "co_acme", requestedBy: "Moiz", workflowId: "wf_sc_1" },
      { ...registry, handoffStore, assessDeal: async () => CANNED_DEAL, crmDeps: { store: crm, ...noAudit }, recordAudit: async (e) => void audits.push(e.eventType), now },
    );

    expect(res.accepted).toBe(true);
    // DETERMINISTIC EFFECT: the real deal advanced to won in the CRM store.
    expect(res.product?.opportunity.stage).toBe("won");
    expect(opps.get("opp_win_1")?.stage).toBe("won");
    expect(opps.get("opp_win_1")?.status).toBe("won");
    // Advisory judgment rode on the product (real downstream), never on the write.
    expect(res.product?.assessment?.nextBestAction).toContain("kickoff");
    // Routed the won_deal to the DECLARED downstream departments as real durable handoffs.
    expect(res.routedTo.map((r) => r.department).sort()).toEqual(["delivery", "finance"]);
    const routed = [...handoffRows.values()].filter((r) => r.department === "delivery" || r.department === "finance");
    expect(routed).toHaveLength(2);
    expect(routed.every((h) => h.deliveryState === "delivered")).toBe(true);
    expect(routed.every((h) => h.envelope.expectedOutputSchema === "won_deal")).toBe(true);
    expect(audits).toEqual(expect.arrayContaining(["department.accepted", "department.routed", "department.completed"]));
  });

  it("ANTI-DECORATIVE: the deal advances to won even when the judgment agent FAILS (LLM is not on the write path)", async () => {
    const { store: crm, opps } = makeCrmStore([wonableOpp("opp_win_2")]);

    const res = await runSalesCrmDepartment(
      { opportunityId: "opp_win_2", businessName: "Acme", companyId: "co_acme", requestedBy: "Moiz", workflowId: "wf_sc_2" },
      { ...registry, assessDeal: async () => { throw new Error("provider down"); }, crmDeps: { store: crm, ...noAudit }, ...noAudit, now },
    );

    // The deterministic mutation happened regardless of the judgment failure.
    expect(opps.get("opp_win_2")?.stage).toBe("won");
    expect(res.product?.assessment).toBeNull(); // judgment unavailable — never determined the mutation
  });

  it("ANTI-DECORATIVE: a HIGH loss-risk judgment does NOT block the deal (advisory only), it escalates", async () => {
    const { store: crm, opps } = makeCrmStore([wonableOpp("opp_win_3")]);
    const { store: escalationStore, rows: escalations } = makeEscalationStore();

    await runSalesCrmDepartment(
      { opportunityId: "opp_win_3", businessName: "Acme", companyId: "co_acme", requestedBy: "Moiz", workflowId: "wf_sc_3" },
      { ...registry, escalationStore, assessDeal: async () => ({ lossRisk: "high", riskFactors: ["Single-threaded buyer"], nextBestAction: "Multi-thread", rationale: "risk" }), crmDeps: { store: crm, ...noAudit }, ...noAudit, now },
    );

    expect(opps.get("opp_win_3")?.stage).toBe("won"); // high risk did NOT block the mutation
    expect(escalations.some((e) => e.departmentSlug === "sales_crm")).toBe(true); // it raised a real escalation
  });

  it("REJECTS a mis-scoped inbound (over-scoped memory not authorized for the department)", async () => {
    const { store: crm } = makeCrmStore([wonableOpp("opp_win_4")]);
    const misScoped = buildHandoffEnvelope(
      { workflowId: "wf_sc_4", department: "sales_crm", sourceAgent: "x", destinationAgent: "sales_crm_orchestrator", objective: "o", requestedAction: "advance_deal", expectedOutputSchema: "proposal_artifact", confidence: 0.8, companyId: "co_acme", clientWorkspaceId: "co_acme", dataClassification: "client_confidential", authorizedMemoryScopes: ["company", "offer", "restricted"], idempotencyKey: "wf_sc_4:sales_crm:inbound" },
      { now },
    );

    await expect(
      runSalesCrmDepartment(
        { opportunityId: "opp_win_4", businessName: "Acme", companyId: "co_acme", requestedBy: "Moiz", workflowId: "wf_sc_4" },
        { ...registry, inboundEnvelope: misScoped, assessDeal: async () => CANNED_DEAL, crmDeps: { store: crm, ...noAudit }, ...noAudit, now },
      ),
    ).rejects.toBeInstanceOf(DepartmentRejectedError);
  });

  it("throws (not a silent no-op) when the referenced deal does not exist", async () => {
    const { store: crm } = makeCrmStore([]);
    await expect(
      runSalesCrmDepartment(
        { opportunityId: "missing", businessName: "Acme", companyId: "co_acme", requestedBy: "Moiz", workflowId: "wf_sc_5" },
        { ...registry, assessDeal: async () => CANNED_DEAL, crmDeps: { store: crm, ...noAudit }, ...noAudit, now },
      ),
    ).rejects.toThrow(/opportunity 'missing' not found/);
  });
});

describe("Commercial verticals — Finance", () => {
  it("accepts won_deal → DETERMINISTIC invoice draft + revenue intelligence → routes to Founder Command Centre", async () => {
    const { store: fin, invs } = makeFinanceStore();
    const { store: handoffStore, rows: handoffRows } = makeHandoffStore();

    const res = await runFinanceDepartment(
      { opportunityId: "opp_win_1", companyId: "co_acme", proposalId: "prop_1", businessName: "Acme", amountCents: 480000, description: "AI OS engagement", requestedBy: "Moiz", workflowId: "wf_fin_1" },
      { ...registry, handoffStore, assessMargin: async () => CANNED_MARGIN, getRevenue: async () => CANNED_REVENUE, financeDeps: { store: fin, ...noAudit }, ...noAudit, now },
    );

    expect(res.accepted).toBe(true);
    // DETERMINISTIC EFFECT: a real draft invoice exists for the deal total.
    expect(res.product?.invoice?.totalCents).toBe(480000);
    expect(res.product?.invoice?.status).toBe("draft"); // founder must approve/send — AI never moves money
    expect([...invs.values()]).toHaveLength(1);
    expect(res.product?.revenue.wonValueCents).toBe(480000); // revenue intelligence rode on the product
    expect(res.routedTo.map((r) => r.department)).toEqual(["founder_command_centre"]);
    expect([...handoffRows.values()].some((h) => h.department === "founder_command_centre")).toBe(true);
  });

  it("ANTI-DECORATIVE: the invoice is created even when the margin-assessment agent FAILS (LLM is not on the money path)", async () => {
    const { store: fin, invs } = makeFinanceStore();

    const res = await runFinanceDepartment(
      { opportunityId: "opp_win_1", companyId: "co_acme", businessName: "Acme", amountCents: 480000, requestedBy: "Moiz", workflowId: "wf_fin_2" },
      { ...registry, assessMargin: async () => { throw new Error("provider down"); }, getRevenue: async () => CANNED_REVENUE, financeDeps: { store: fin, ...noAudit }, ...noAudit, now },
    );

    expect([...invs.values()]).toHaveLength(1); // invoice written despite the judgment failure
    expect(res.product?.invoice?.totalCents).toBe(480000);
    expect(res.product?.assessment).toBeNull();
  });

  it("escalates (does not fabricate an invoice) when the deal has no invoiceable amount", async () => {
    const { store: fin, invs } = makeFinanceStore();
    const { store: escalationStore, rows: escalations } = makeEscalationStore();

    const res = await runFinanceDepartment(
      { businessName: "Acme", amountCents: 0, requestedBy: "Moiz", workflowId: "wf_fin_3" },
      { ...registry, escalationStore, assessMargin: async () => CANNED_MARGIN, getRevenue: async () => CANNED_REVENUE, financeDeps: { store: fin, ...noAudit }, ...noAudit, now },
    );

    expect(res.product?.invoice).toBeNull();
    expect([...invs.values()]).toHaveLength(0);
    expect(escalations.some((e) => e.departmentSlug === "finance")).toBe(true);
  });
});

describe("Commercial verticals — Delivery", () => {
  it("accepts won_deal → advisory feasibility → DETERMINISTIC project + milestones + tasks + owner → health + route", async () => {
    const { store: proj, projs } = makeProjectStore();
    const { store: task, tasks } = makeTaskStore();
    const { store: handoffStore, rows: handoffRows } = makeHandoffStore();

    const res = await runDeliveryDepartment(
      { opportunityId: "opp_win_1", companyId: "co_acme", proposalId: "prop_1", projectName: "Acme — Missed-call text-back", servicesIncluded: ["Missed-call text-back"], owner: "Ali", teamMembers: ["Ali", "Haad"], requestedBy: "Moiz", workflowId: "wf_del_1" },
      { ...registry, handoffStore, assessFeasibility: async () => CANNED_FEASIBILITY, projectDeps: { store: proj, ...noAudit }, taskDeps: { store: task, ...noAudit }, ...noAudit, now },
    );

    expect(res.accepted).toBe(true);
    // DETERMINISTIC EFFECT: a real project with kickoff milestones + an assigned owner.
    const project = res.product!.project;
    expect(projs.get(project.id)).toBeTruthy();
    expect(project.status).toBe("onboarding");
    expect(project.owner).toBe("Ali");
    expect(project.milestones.map((m) => m.title)).toEqual(["Kickoff call", "Onboarding complete"]);
    expect(project.opportunityId).toBe("opp_win_1");
    // Real owned kickoff tasks assigned to the responsible owner.
    expect([...tasks.values()]).toHaveLength(2);
    expect([...tasks.values()].every((t) => t.assignedTo === "Ali")).toBe(true);
    // Truthful health from real signals + declared downstream route.
    expect(res.product?.health).toBe("healthy");
    expect(res.routedTo.map((r) => r.department)).toEqual(["founder_command_centre"]);
    expect([...handoffRows.values()].filter((h) => h.department === "founder_command_centre")).toHaveLength(1);
  });

  it("ANTI-DECORATIVE: the project is created even when the feasibility agent FAILS (LLM is not on the write path)", async () => {
    const { store: proj, projs } = makeProjectStore();
    const { store: task } = makeTaskStore();

    const res = await runDeliveryDepartment(
      { opportunityId: "opp_win_1", companyId: "co_acme", projectName: "Acme delivery", owner: "Ali", requestedBy: "Moiz", workflowId: "wf_del_2" },
      { ...registry, assessFeasibility: async () => { throw new Error("provider down"); }, projectDeps: { store: proj, ...noAudit }, taskDeps: { store: task, ...noAudit }, ...noAudit, now },
    );

    expect([...projs.values()]).toHaveLength(1); // project stood up despite the judgment failure
    expect(res.product?.feasibility).toBeNull();
  });

  it("raises a REAL escalation on a blocked run (feasibility blocked by the delivery lead)", async () => {
    const { store: proj } = makeProjectStore();
    const { store: task } = makeTaskStore();
    const { store: escalationStore, rows: escalations } = makeEscalationStore();

    await runDeliveryDepartment(
      { opportunityId: "opp_win_1", companyId: "co_acme", projectName: "Acme delivery", owner: "Ali", requestedBy: "Moiz", workflowId: "wf_del_3" },
      { ...registry, escalationStore, assessFeasibility: async () => ({ feasibility: "blocked", risks: ["Client has no telephony access"], dependencies: [] }), projectDeps: { store: proj, ...noAudit }, taskDeps: { store: task, ...noAudit }, ...noAudit, now },
    );

    // A real escalation row was created for the blocked delivery (visible in the Command Centre).
    expect(escalations.some((e) => e.departmentSlug === "delivery")).toBe(true);
  });
});
