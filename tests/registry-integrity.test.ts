import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_AGENTS, type RegisterAgentInput } from "@/lib/domain/agents";
import { CONTENT_GRAPH_AGENTS } from "@/lib/domain/content-graph";
import { PAID_AUDIT_AGENTS } from "@/lib/domain/paid-audit-graph";
import { PITCH_AGENT } from "@/lib/domain/pitch-graph";
import { ROADMAP_AGENT } from "@/lib/domain/roadmap-graph";
import { KNOWLEDGE_COMPILER_AGENT_SLUG, KNOWLEDGE_COMPILE_JOB_TYPE } from "@/lib/domain/knowledge";
import { CONTENT_GENERATE_JOB_TYPE } from "@/lib/domain/content-worker";
import { CONTENT_GRAPH_JOB_TYPE } from "@/lib/domain/content-graph";
import { PAID_AUDIT_JOB_TYPE } from "@/lib/domain/paid-audit-graph";
import { DEFAULT_CAPABILITIES } from "@/lib/domain/ask";
import { OFFER_VALIDATION_DIMENSIONS } from "@/lib/domain/offer-validation";
import { QUALIFICATION_ROLES } from "@/lib/domain/qualification";
import { generalRegistry, knownJobTypes, hasHandler } from "@/lib/workers/registry";

/**
 * Registry integrity — the guardrail against "decorative" wiring. It fails the build when:
 *  - an agent is marked `active` but has no real execution path (no handler / graph / route), or
 *  - an agent that provably runs is left `paused`/absent, or
 *  - a job type the system enqueues (constants, intelligence/library/source, `available` Ask routes)
 *    has no handler in the worker registry.
 *
 * Everything here is derived from the REAL sources of truth (imported constants + the registry), so
 * a rename or a status flip on either side trips this test instead of silently shipping a no-op agent.
 */

const effectiveStatus = (a: RegisterAgentInput): string => a.status ?? "active";
const AGENTS_BY_SLUG = new Map(DEFAULT_AGENTS.map((a) => [a.slug, a]));

// --- The honest execution map: every ACTIVE agent must run through exactly one of these paths. ----

// Nodes inside a graph job (content.graph / audit.paid) — slugs pulled from the graph's own constants.
const GRAPH_NODE_AGENTS = [...Object.values(CONTENT_GRAPH_AGENTS), ...Object.values(PAID_AUDIT_AGENTS)];

// Synchronous graph services invoked directly by a route (pitch, interview roadmap).
const GRAPH_SERVICE_AGENTS = [PITCH_AGENT, ROADMAP_AGENT];

// Department orchestrators — driven by the department runtime (runDepartment), which accepts the inbound
// department handoff and runs the department's graph (paid-audit / content) through the handoff backbone.
const DEPARTMENT_ORCHESTRATOR_AGENTS = ["paid_audit_orchestrator", "content_orchestrator", "proposal_orchestrator", "research_intelligence_orchestrator", "sales_crm_orchestrator", "finance_orchestrator", "delivery_orchestrator", "quality_assurance_orchestrator"];

// Department specialists that run synchronously inside a department policy (not via a graph job) — the
// Proposal solution architect is the judgment step in runProposalDepartment, attributed for real settlement.
// The QA reviewers wired into live gates execute via runQaGate (release/block/route real downstream work).
const DEPARTMENT_SPECIALIST_AGENTS = ["proposal_solution_architect", "sales_deal_agent", "finance_analyst_agent", "delivery_lead_agent", "paid_audit_qa_reviewer", "content_quality_reviewer", "content_brand_reviewer", "proposal_technical_reviewer", "proposal_commercial_reviewer", "research_validation_reviewer",
  // Executes via runQaGate through the RUNNABLE `security_tenant_isolation` board (WOB-UAT-024). It is
  // deterministic — it scores validateHandoff's real output — which is why it carries no tools.
  "security_isolation_reviewer"];

// Security & Governance (WOB-UAT-024). Each runs INSIDE `runGovernanceReview`, deterministically:
//   governance_orchestrator → runGovernanceReview itself (gather → dispatch → persist → report skipped)
//   access_policy_agent     → reviewAccess()   (sessions, accounts, super-admin cover)
//   risk_compliance_agent   → reviewPolicies() (spend caps, autonomy grants, classification grants)
//   incident_audit_agent    → openIncident()   (a CRITICAL finding becomes a closable incident)
// The list below is NOT self-certifying: the test "the governance agents are referenced by the real
// governance code" greps the actual source for each slug, so this declaration cannot drift into fiction.
const DETERMINISTIC_GOVERNANCE_AGENTS = ["governance_orchestrator", "access_policy_agent", "risk_compliance_agent", "incident_audit_agent"];

// Design Intelligence (WOB-UAT-023). Each runs INSIDE `runDesignIntelligenceDepartment`:
//   design_intelligence_orchestrator → the vertical itself (upgrade direction → select → emit a brief)
//   visual_reference_analyst         → the ADVISORY vision descriptor pass (deps.describeReferences)
//   brand_voice_guardian             → the ADVISORY brand critique pass (deps.critiqueBrand)
// The AUTHORITATIVE step (`selectReferencesForBatch`) is deterministic and is not an agent — a model
// that re-picks a reference every run makes design direction unreproducible.
// Like the governance list, this is NOT self-certifying: the test below greps the real vertical source.
const DESIGN_INTELLIGENCE_AGENTS = ["design_intelligence_orchestrator", "visual_reference_analyst", "brand_voice_guardian"];

// Run synchronously in a request path, or as a deterministic subroutine of another agent's flow.
const SYNC_OR_SUBROUTINE_AGENTS = [
  "ask_wobble", // Ask WOBBLE — synchronous /api/ask router
  "content_excellence_gate", // deterministic quality gate inside the content worker
  "memory_router", // memory-bank routing role used by the memory harvester
];

// Offer Validation Lab — each dimension agent runs as a synchronous subroutine of runOfferValidation
// (scoreDimension → runTextProvider). Derived from the lab's own dimension constants so it cannot drift.
const OFFER_VALIDATION_AGENTS = OFFER_VALIDATION_DIMENSIONS.map((d) => d.agentSlug);

// Qualification Council — each role agent runs as a synchronous subroutine of runQualification
// (scoreRole → deterministic policy signal + runTextProvider). Derived from the council's role constants.
const QUALIFICATION_COUNCIL_AGENTS = QUALIFICATION_ROLES.map((r) => r.agentSlug);

// Backed by a queue job type — the pair is asserted against the handler registry below.
const JOB_BACKED_AGENTS: Array<{ slug: string; jobType: string }> = [
  { slug: "content_worker", jobType: CONTENT_GENERATE_JOB_TYPE },
  { slug: KNOWLEDGE_COMPILER_AGENT_SLUG, jobType: KNOWLEDGE_COMPILE_JOB_TYPE },
  { slug: "dreamer", jobType: "intelligence.dream" },
  { slug: "intelligence_analyst", jobType: "intelligence.analyze" },
  { slug: "competitor_scout", jobType: "intelligence.scout" },
  { slug: "source_intake_orchestrator", jobType: "source.intake" },
];

const EXECUTABLE_SLUGS = new Set<string>([
  ...GRAPH_NODE_AGENTS,
  ...GRAPH_SERVICE_AGENTS,
  ...DEPARTMENT_ORCHESTRATOR_AGENTS,
  ...DEPARTMENT_SPECIALIST_AGENTS,
  ...SYNC_OR_SUBROUTINE_AGENTS,
  ...OFFER_VALIDATION_AGENTS,
  ...QUALIFICATION_COUNCIL_AGENTS,
  ...DETERMINISTIC_GOVERNANCE_AGENTS,
  ...DESIGN_INTELLIGENCE_AGENTS,
  ...JOB_BACKED_AGENTS.map((j) => j.slug),
]);

// Job types the code enqueues from fixed sites (constants + literals) — each MUST have a handler.
const ENQUEUED_JOB_TYPES = [
  CONTENT_GENERATE_JOB_TYPE,
  CONTENT_GRAPH_JOB_TYPE,
  KNOWLEDGE_COMPILE_JOB_TYPE,
  PAID_AUDIT_JOB_TYPE,
  "library.import",
  "intelligence.scout",
  "intelligence.analyze",
  "intelligence.dream",
  "source.intake",
];

describe("registry integrity — agents", () => {
  it("every agent slug is unique", () => {
    const slugs = DEFAULT_AGENTS.map((a) => a.slug);
    expect(slugs.length).toBe(new Set(slugs).size);
  });

  it("every ACTIVE agent has a declared, real execution path (no decorative agents)", () => {
    const activeWithoutPath = DEFAULT_AGENTS.filter((a) => effectiveStatus(a) === "active" && !EXECUTABLE_SLUGS.has(a.slug)).map((a) => a.slug);
    expect(activeWithoutPath, `active agents with no execution path: ${activeWithoutPath.join(", ")}`).toEqual([]);
  });

  /**
   * Keeps the declaration above HONEST. Adding a slug to `DETERMINISTIC_GOVERNANCE_AGENTS` silences the
   * decorative-agent guard, so that list must not be self-certifying — it is checked against the real
   * governance source. If an agent is declared executable here but no code runs it, this fails.
   */
  it("the design intelligence agents are actually referenced by the real vertical", () => {
    // Same rule as the governance list: adding a slug above silences the decorative-agent guard, so it
    // must be checked against the code that claims to run it.
    const src = readFileSync(path.join(process.cwd(), "src", "lib", "departments", "verticals", "design-intelligence.ts"), "utf8");
    const seed = readFileSync(path.join(process.cwd(), "src", "lib", "departments", "seed.ts"), "utf8");
    const both = src + String.fromCharCode(10) + seed;
    const missing = DESIGN_INTELLIGENCE_AGENTS.filter((slug) => !both.includes(slug));
    expect(missing, `declared executable but never referenced by the design vertical/seed: ${missing.join(", ")}`).toEqual([]);
  });

  it("the governance agents are actually referenced by the real governance code", () => {
    const src = [
      readFileSync(path.join(process.cwd(), "src", "lib", "security-governance", "index.ts"), "utf8"),
      readFileSync(path.join(process.cwd(), "src", "lib", "domain", "security-governance.ts"), "utf8"),
    ].join(String.fromCharCode(10));
    const missing = DETERMINISTIC_GOVERNANCE_AGENTS.filter((slug) => !src.includes(slug));
    expect(missing, `declared executable but never referenced by the governance code: ${missing.join(", ")}`).toEqual([]);
  });

  it("every declared execution path points at a real, ACTIVE agent (no wired-but-paused / stale)", () => {
    for (const slug of EXECUTABLE_SLUGS) {
      const agent = AGENTS_BY_SLUG.get(slug);
      expect(agent, `execution map references unknown agent '${slug}'`).toBeTruthy();
      expect(effectiveStatus(agent!), `agent '${slug}' provably runs but is not active`).toBe("active");
    }
  });

  it("graph-node agent slugs match the graph's own constants", () => {
    for (const slug of GRAPH_NODE_AGENTS) expect(AGENTS_BY_SLUG.has(slug), `graph node '${slug}' missing from agent registry`).toBe(true);
  });
});

describe("registry integrity — jobs", () => {
  it("every job-backed agent's job type has a handler", () => {
    for (const { slug, jobType } of JOB_BACKED_AGENTS) {
      expect(hasHandler(jobType), `agent '${slug}' is wired to job '${jobType}' but no handler is registered`).toBe(true);
    }
  });

  it("every enqueued job type has a handler in the worker registry", () => {
    const known = new Set(knownJobTypes(generalRegistry));
    const missing = ENQUEUED_JOB_TYPES.filter((t) => !known.has(t));
    expect(missing, `enqueued job types with no handler: ${missing.join(", ")}`).toEqual([]);
  });

  it("every AVAILABLE Ask capability routes to a job type that has a handler", () => {
    for (const route of Object.values(DEFAULT_CAPABILITIES)) {
      if (route.status !== "available" || !route.jobType) continue;
      expect(hasHandler(route.jobType), `available Ask route '${route.intent}' -> '${route.jobType}' has no handler`).toBe(true);
    }
  });
});
