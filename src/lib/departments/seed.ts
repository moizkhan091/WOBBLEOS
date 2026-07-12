import { PAID_AUDIT_AGENTS } from "@/lib/domain/paid-audit-graph";
import { CONTENT_GRAPH_AGENTS } from "@/lib/domain/content-graph";
import { upsertDepartment, upsertMember, type DepartmentRegistryDeps } from "@/lib/departments/registry";
import type { DepartmentInput } from "@/lib/domain/department";
import type { DepartmentMemberInput } from "@/lib/domain/department-membership";

/**
 * Canonical WOBBLE department org (Phase 3, Batch 3b). This is the REAL org chart — each department's
 * stable identity, policy, products and downstream consumers. Status is TRUTHFUL: a department is
 * `active` only when it has a real orchestrator + specialist team wired through the handoff runtime;
 * everything else is `draft` (declared, awaiting its vertical build). We do NOT mark shallow records
 * active. Seeding is idempotent (upsert) so it is safe to run on every boot.
 */

const AUDIT_MEMORY = ["company", "research", "offer", "brand"];
const CONTENT_MEMORY = ["content", "brand", "research", "founder_taste"];

export const CANONICAL_DEPARTMENTS: DepartmentInput[] = [
  {
    slug: "research_intelligence",
    name: "Research & Intelligence",
    purpose: "Continuously scout, analyse and validate market/competitor/trend signals into approved intelligence.",
    status: "draft", // multi-agent (scout→analyst→dreamer) but currently chained via jobs; handoff migration = Phase 5
    permissions: { authorizedMemoryScopes: ["research", "competitor", "market", "company"], permittedDataClassifications: ["internal"] },
    io: { inboundCapabilities: ["scout", "analyse", "dream"], acceptedHandoffSchemas: [], outboundProducts: ["validated_intelligence", "source_recommendations", "trend_reports", "opportunity_recommendations", "change_alerts"], downstreamConsumers: ["content", "proposal", "founder_command_centre"] },
    governance: { requiredApprovals: ["intelligence_suggestion", "research_target"], escalationRules: [] },
    owner: "Moiz",
  },
  {
    slug: "free_audit",
    name: "Free Audit",
    purpose: "Produce an evidence-backed diagnostic + opportunity assessment + service matching for a prospect.",
    status: "draft", // becomes a real multi-agent flow in Phase 9
    permissions: { authorizedMemoryScopes: ["company", "offer"], permittedDataClassifications: ["internal", "client_confidential"] },
    io: { inboundCapabilities: ["run_free_audit"], acceptedHandoffSchemas: [], outboundProducts: ["diagnostic", "opportunity_assessment", "service_matching", "presentation"], downstreamConsumers: ["sales_crm"] },
    owner: "Moiz",
  },
  {
    slug: "paid_audit",
    name: "Paid Audit",
    purpose: "Deliver a McKinsey-depth business audit: current-state map, opportunities, prioritisation, roadmap, executive report.",
    status: "active",
    orchestratorAgentSlug: "paid_audit_orchestrator",
    deterministicServices: ["assemblePaidAuditReport"],
    permissions: { authorizedMemoryScopes: AUDIT_MEMORY, permittedDataClassifications: ["internal", "client_confidential"], deniedTools: ["apply_model_upgrade"] },
    io: { inboundCapabilities: ["run_paid_audit"], acceptedHandoffSchemas: ["current_state_map"], outboundProducts: ["business_audit", "architecture", "roadmap", "priority_recommendations"], downstreamConsumers: ["proposal"] },
    governance: { requiredApprovals: [], escalationRules: [{ condition: "required_node_failure", escalateTo: "founder_command_centre" }] },
    kpis: [{ key: "success_rate", target: 0.95, unit: "ratio" }, { key: "qa_pass_rate", target: 0.85, unit: "ratio" }],
    budget: { operatingBudgetCents: null, tokenBudget: null, providerBudgets: {} },
    limits: { concurrencyLimit: 2, timeoutMs: 900000, retryPolicy: { maxRetries: 2, backoffMs: 3000 } },
    degradedBehaviour: "queue new audits; alert founder; finish in-flight work only",
    owner: "Moiz",
  },
  {
    slug: "proposal",
    name: "Proposal & Solution Design",
    purpose: "Turn an approved audit into a technical solution, pricing, implementation plan, ROI model and proposal artifact.",
    status: "active",
    orchestratorAgentSlug: "proposal_orchestrator",
    deterministicServices: ["createProposalFromAudit", "proposalAction"],
    permissions: { authorizedMemoryScopes: ["company", "offer", "research"], permittedDataClassifications: ["internal", "client_confidential"] },
    io: { inboundCapabilities: ["design_solution"], acceptedHandoffSchemas: ["business_audit", "audit_report"], outboundProducts: ["technical_solution", "pricing", "implementation_plan", "roi_model", "proposal_artifact"], downstreamConsumers: ["sales_crm"] },
    governance: { requiredApprovals: [], escalationRules: [{ condition: "audit_missing", escalateTo: "founder_command_centre" }] },
    kpis: [{ key: "success_rate", target: 0.9, unit: "ratio" }],
    owner: "Moiz",
  },
  {
    slug: "content",
    name: "Content",
    purpose: "Produce grounded, on-brand content packs: strategy → research → copy (draft→revise) → QA scoring.",
    status: "active",
    orchestratorAgentSlug: "content_orchestrator",
    permissions: { authorizedMemoryScopes: CONTENT_MEMORY, permittedDataClassifications: ["internal"] },
    io: { inboundCapabilities: ["generate_content_pack"], acceptedHandoffSchemas: ["creative_brief"], outboundProducts: ["content_strategy", "brief", "content_pack"], downstreamConsumers: ["publishing"] },
    governance: { requiredApprovals: ["content_packet"], escalationRules: [{ condition: "quality_gate_failed", escalateTo: "founder_command_centre" }] },
    kpis: [{ key: "approval_rate", target: 0.8, unit: "ratio" }, { key: "success_rate", target: 0.9, unit: "ratio" }],
    degradedBehaviour: "queue new packs; finish in-flight; alert founder",
    owner: "Moiz",
  },
  {
    slug: "design_intelligence",
    name: "Design Intelligence",
    purpose: "Own visual direction, design briefs, layout rules and reference selection for every asset.",
    status: "draft",
    permissions: { authorizedMemoryScopes: ["design", "brand", "content"], permittedDataClassifications: ["internal"] },
    io: { inboundCapabilities: ["produce_visual_direction"], acceptedHandoffSchemas: ["content_pack"], outboundProducts: ["visual_direction", "design_briefs", "layout_rules", "references"], downstreamConsumers: ["media_production"] },
    owner: "Moiz",
  },
  {
    slug: "media_production",
    name: "Media Production",
    purpose: "Generate and process media assets from an approved design brief (reference-conditioned).",
    status: "draft",
    permissions: { authorizedMemoryScopes: ["design", "brand"], permittedDataClassifications: ["internal"] },
    io: { inboundCapabilities: ["produce_media"], acceptedHandoffSchemas: ["design_briefs"], outboundProducts: ["media_assets"], downstreamConsumers: ["publishing"] },
    owner: "Moiz",
  },
  {
    slug: "publishing",
    name: "Publishing",
    purpose: "Schedule and publish approved content across channels.",
    status: "draft",
    permissions: { authorizedMemoryScopes: ["content"], permittedDataClassifications: ["internal", "public"] },
    io: { inboundCapabilities: ["publish"], acceptedHandoffSchemas: ["content_pack", "media_assets"], outboundProducts: ["published_content"], downstreamConsumers: ["founder_command_centre"] },
    governance: { requiredApprovals: ["content_packet"], escalationRules: [] },
    owner: "Moiz",
  },
  {
    slug: "sales_crm",
    name: "Sales & CRM",
    purpose: "Qualify opportunities, handle objections, run follow-ups, recommend deals; on won → hand to Delivery.",
    status: "draft",
    permissions: { authorizedMemoryScopes: ["company", "offer"], permittedDataClassifications: ["internal", "client_confidential"] },
    io: { inboundCapabilities: ["qualify", "advance_deal"], acceptedHandoffSchemas: ["proposal_artifact"], outboundProducts: ["qualified_opportunities", "objections", "follow_ups", "deal_recommendations"], downstreamConsumers: ["delivery", "finance"] },
    owner: "Moiz",
  },
  {
    slug: "finance",
    name: "Finance",
    purpose: "Issue invoices, track payment state, produce revenue and margin intelligence.",
    status: "draft",
    permissions: { authorizedMemoryScopes: ["company"], permittedDataClassifications: ["internal", "restricted"] },
    io: { inboundCapabilities: ["invoice", "report_revenue"], acceptedHandoffSchemas: [], outboundProducts: ["invoices", "payment_state", "revenue_margin_intelligence"], downstreamConsumers: ["founder_command_centre"] },
    owner: "Moiz",
  },
  {
    slug: "delivery",
    name: "Delivery & Projects",
    purpose: "Run projects: milestones, tasks, risks and truthful delivery health.",
    status: "draft",
    permissions: { authorizedMemoryScopes: ["company", "client"], permittedDataClassifications: ["internal", "client_confidential"] },
    io: { inboundCapabilities: ["run_project"], acceptedHandoffSchemas: ["won_deal"], outboundProducts: ["projects", "milestones", "tasks", "risks", "delivery_health"], downstreamConsumers: ["founder_command_centre", "finance"] },
    owner: "Moiz",
  },
  {
    slug: "security_governance",
    name: "Security & Governance",
    purpose: "Review security, make policy decisions, surface risk findings across the org.",
    status: "draft",
    permissions: { authorizedMemoryScopes: ["company"], permittedDataClassifications: ["internal", "restricted"] },
    io: { inboundCapabilities: ["security_review"], acceptedHandoffSchemas: [], outboundProducts: ["security_reviews", "policy_decisions", "risk_findings"], downstreamConsumers: ["founder_command_centre"] },
    owner: "Moiz",
  },
  {
    slug: "founder_command_centre",
    name: "Founder Command Centre",
    purpose: "The founders' console: operational summaries, approvals, escalations and intervention controls.",
    status: "active", // human-operated hub (no LLM orchestrator) — the escalation + approval destination
    permissions: { authorizedMemoryScopes: ["company"], permittedDataClassifications: ["internal", "client_confidential", "restricted"] },
    io: { inboundCapabilities: ["approve", "escalate", "intervene"], acceptedHandoffSchemas: [], outboundProducts: ["operational_summaries", "approvals", "escalations", "intervention_controls"], downstreamConsumers: [] },
    owner: "Moiz",
  },
];

/** Specialist memberships for the departments that are actually operational today (real agent teams). */
export const CANONICAL_MEMBERSHIPS: DepartmentMemberInput[] = [
  // Paid Audit team — one claimed handoff drives each specialist (see the paid-audit graph).
  { departmentSlug: "paid_audit", memberType: "agent", memberRef: PAID_AUDIT_AGENTS.discovery, role: "specialist", responsibility: "map the client's current state", priority: 10, capabilities: ["discovery"], toolGrants: ["run_node"], memoryGrants: AUDIT_MEMORY, allowedInputSchemas: ["current_state_map"], expectedOutputs: ["current_state_map"], escalationDestination: "paid_audit_orchestrator" },
  { departmentSlug: "paid_audit", memberType: "agent", memberRef: PAID_AUDIT_AGENTS.opportunity, role: "specialist", responsibility: "identify AI/automation opportunities", priority: 20, capabilities: ["opportunity"], toolGrants: ["run_node"], memoryGrants: AUDIT_MEMORY, allowedInputSchemas: ["opportunity_set"], expectedOutputs: ["opportunity_set"], escalationDestination: "paid_audit_orchestrator" },
  { departmentSlug: "paid_audit", memberType: "agent", memberRef: PAID_AUDIT_AGENTS.prioritization, role: "specialist", responsibility: "rank opportunities by impact/difficulty", priority: 30, capabilities: ["prioritization"], toolGrants: ["run_node"], memoryGrants: AUDIT_MEMORY, allowedInputSchemas: ["prioritization"], expectedOutputs: ["prioritization"], escalationDestination: "paid_audit_orchestrator" },
  { departmentSlug: "paid_audit", memberType: "agent", memberRef: PAID_AUDIT_AGENTS.roadmap, role: "specialist", responsibility: "sequence a 12-month roadmap", priority: 40, capabilities: ["roadmap"], toolGrants: ["run_node"], memoryGrants: AUDIT_MEMORY, allowedInputSchemas: ["roadmap"], expectedOutputs: ["roadmap"], escalationDestination: "paid_audit_orchestrator" },
  { departmentSlug: "paid_audit", memberType: "agent", memberRef: PAID_AUDIT_AGENTS.report, role: "specialist", responsibility: "write the executive report + ROI", priority: 50, capabilities: ["report"], toolGrants: ["run_node"], memoryGrants: AUDIT_MEMORY, allowedInputSchemas: ["audit_report"], expectedOutputs: ["audit_report"], escalationDestination: "paid_audit_orchestrator" },
  { departmentSlug: "paid_audit", memberType: "service", memberRef: "assemblePaidAuditReport", role: "assembler", responsibility: "assemble the final audit report deterministically", priority: 60, capabilities: ["assemble"] },
  // Content team.
  { departmentSlug: "content", memberType: "agent", memberRef: CONTENT_GRAPH_AGENTS.strategy, role: "strategist", responsibility: "decide topic/angle/format/platform", priority: 10, capabilities: ["strategy"], toolGrants: ["run_node"], memoryGrants: CONTENT_MEMORY, allowedInputSchemas: ["creative_brief"], expectedOutputs: ["creative_brief"], escalationDestination: "content_orchestrator" },
  { departmentSlug: "content", memberType: "agent", memberRef: CONTENT_GRAPH_AGENTS.research, role: "researcher", responsibility: "gather grounded evidence for the angle", priority: 20, capabilities: ["research"], toolGrants: ["run_node", "retrieve_memory"], memoryGrants: CONTENT_MEMORY, allowedInputSchemas: ["evidence_pack"], expectedOutputs: ["evidence_pack"], escalationDestination: "content_orchestrator" },
  { departmentSlug: "content", memberType: "agent", memberRef: CONTENT_GRAPH_AGENTS.copywriting, role: "copywriter", responsibility: "write + self-revise in-brand copy", priority: 30, capabilities: ["copywriting"], toolGrants: ["run_node"], memoryGrants: CONTENT_MEMORY, allowedInputSchemas: ["content_copy"], expectedOutputs: ["content_copy"], escalationDestination: "content_orchestrator" },
  { departmentSlug: "content", memberType: "agent", memberRef: CONTENT_GRAPH_AGENTS.scoring, role: "qa_scorer", responsibility: "score + gate the pack", priority: 40, capabilities: ["scoring"], toolGrants: ["run_node"], memoryGrants: CONTENT_MEMORY, allowedInputSchemas: ["score"], expectedOutputs: ["score"], approvalAuthority: [], escalationDestination: "content_orchestrator" },
  // Proposal team — the solution architect (AGENT judgment) synthesizes the design from the audit; the
  // deterministic service maps it into the versioned proposal artifact + fires the commercial chain on accept.
  { departmentSlug: "proposal", memberType: "agent", memberRef: "proposal_solution_architect", role: "solution_architect", responsibility: "design the technical solution, integration, ROI and risks from the audit", priority: 10, capabilities: ["solution_design"], toolGrants: ["run_node"], memoryGrants: ["company", "offer", "research"], allowedInputSchemas: ["business_audit", "audit_report"], expectedOutputs: ["technical_solution"], escalationDestination: "proposal_orchestrator" },
  { departmentSlug: "proposal", memberType: "service", memberRef: "createProposalFromAudit", role: "assembler", responsibility: "map the audit into the versioned proposal artifact deterministically", priority: 20, capabilities: ["assemble"] },
];

export interface SeedDepartmentsResult {
  departments: number;
  memberships: number;
}

/** Idempotently upsert the canonical departments + memberships. Safe to run repeatedly (e.g. on boot). */
export async function seedDepartments(deps: DepartmentRegistryDeps = {}): Promise<SeedDepartmentsResult> {
  for (const d of CANONICAL_DEPARTMENTS) await upsertDepartment(d, deps);
  for (const m of CANONICAL_MEMBERSHIPS) await upsertMember(m, deps);
  return { departments: CANONICAL_DEPARTMENTS.length, memberships: CANONICAL_MEMBERSHIPS.length };
}
