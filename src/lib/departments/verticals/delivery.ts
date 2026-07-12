import { buildHandoffEnvelope, type HandoffEnvelope } from "@/lib/domain/handoff";
import type { ProviderUsageContext } from "@/lib/domain/provider-usage";
import { runTextProvider } from "@/lib/providers";
import { addProject, listProjects, type ProjectDeps } from "@/lib/projects";
import { addTask, type TaskDeps } from "@/lib/tasks";
import type { ProjectRow } from "@/lib/domain/project";
import { runDepartment, type DepartmentPolicy, type DepartmentRunResult, type RunDepartmentDeps } from "@/lib/departments/orchestrator";

/**
 * Delivery & Projects DEPARTMENT vertical (Phase 3, commercial chain). Consumes a WON deal (from Sales &
 * CRM) and stands up the real client-delivery project: milestones, kickoff tasks and responsible owners.
 *
 * Division of labour (HARD RULE): the LLM NEVER writes project/milestone/task state. The DETERMINISTIC
 * projects + tasks services do the writes — `addProject` (kickoff milestones, onboarding status, assigned
 * owner) + `addTask` (kickoff work assigned to the owner). A delivery-lead AGENT adds real judgment —
 * feasibility, scope conflicts and dependency risks — with a real input (the won-deal scope + services) and
 * a real downstream (it rides on the product for founder review, and a BLOCKED feasibility raises a real
 * escalation). The judgment is advisory only: it never gates the project write. Delivery health is computed
 * truthfully from the real project signals (status + milestone/task progress + due dates), never assumed.
 *
 * Delivery is the SINGLE authoritative project creator in the commercial chain (Sales & CRM suppresses the
 * crm won→delivery auto-hook), so exactly one rich delivery project is created per won deal.
 */

const DELIVERY_MEMORY_SCOPES = ["company", "client"];

export type DeliveryFeasibilityLevel = "clear" | "at_risk" | "blocked";

export interface DeliveryFeasibility {
  feasibility: DeliveryFeasibilityLevel;
  risks: string[];
  dependencies: string[];
}

export type DeliveryHealthLabel = "healthy" | "at_risk" | "blocked";

export interface RunDeliveryDepartmentInput {
  /** The won deal to deliver (from Sales & CRM). */
  opportunityId?: string | null;
  companyId?: string | null;
  proposalId?: string | null;
  projectName: string;
  servicesIncluded?: string[];
  /** The responsible delivery owner (assigned to the project + kickoff tasks). */
  owner?: string | null;
  teamMembers?: string[];
  requestedBy: string;
  workflowId?: string;
}

export interface RunDeliveryDepartmentDeps extends RunDepartmentDeps {
  /** The delivery lead's judgment step (real LLM by default; injectable/canned in proofs). */
  assessFeasibility?: (input: { projectName: string; services: string[]; owner: string | null; usageContext: ProviderUsageContext }) => Promise<DeliveryFeasibility>;
  /** Deterministic projects service deps (store, recordAudit). */
  projectDeps?: ProjectDeps;
  /** Deterministic tasks service deps (store, recordAudit). */
  taskDeps?: TaskDeps;
  /** An already-claimed inbound handoff envelope (from claimNextDepartmentHandoff) to consume. */
  inboundEnvelope?: HandoffEnvelope;
}

/** Default feasibility assessor: a real delivery-lead LLM call, attributed for actual budget settlement. */
async function defaultAssessFeasibility(input: { projectName: string; services: string[]; owner: string | null; usageContext: ProviderUsageContext }): Promise<DeliveryFeasibility> {
  const r = await runTextProvider({
    role: "content_strategy",
    module: "projects",
    maxTokens: 600,
    messages: [
      { role: "system", content: "You are a delivery lead at WOBBLE. Assess a new client project's feasibility, scope conflicts and dependency risks before kickoff. Reply as JSON: {\"feasibility\":\"clear\"|\"at_risk\"|\"blocked\",\"risks\":string[],\"dependencies\":string[]}." },
      { role: "user", content: `New delivery project "${input.projectName}", services ${input.services.join(", ") || "unspecified"}, owner ${input.owner ?? "UNASSIGNED"}. Assess feasibility, scope conflicts and dependency risks.` },
    ],
    usageContext: input.usageContext,
  });
  try {
    const j = JSON.parse(r.text.replace(/^```json\s*|\s*```$/g, "")) as DeliveryFeasibility;
    const level = (v: unknown): DeliveryFeasibilityLevel => (v === "blocked" || v === "at_risk" || v === "clear" ? v : "at_risk");
    return { feasibility: level(j.feasibility), risks: Array.isArray(j.risks) ? j.risks.map(String) : [], dependencies: Array.isArray(j.dependencies) ? j.dependencies.map(String) : [] };
  } catch {
    return { feasibility: "at_risk", risks: [r.text.slice(0, 400)], dependencies: [] };
  }
}

/** Truthful delivery-health label derived from the REAL project signals (status + computed health score). */
export function deliveryHealthLabel(project: ProjectRow): DeliveryHealthLabel {
  if (project.status === "cancelled") return "blocked";
  if (project.status === "at_risk" || project.status === "paused" || project.healthScore < 50) return "at_risk";
  return "healthy";
}

export interface DeliveryProduct {
  project: ProjectRow;
  health: DeliveryHealthLabel;
  /** The delivery lead's advisory assessment (null when the judgment step was unavailable). */
  feasibility: DeliveryFeasibility | null;
}

/**
 * Run the Delivery department: accept the won-deal handoff → the delivery lead assesses feasibility
 * (advisory) → the DETERMINISTIC projects + tasks services create the project with kickoff milestones/tasks
 * and an assigned owner → delivery health is computed from the real project signals → real risks escalate →
 * the delivery product is routed to the declared downstream consumers (Founder Command Centre + Finance).
 */
export async function runDeliveryDepartment(input: RunDeliveryDepartmentInput, deps: RunDeliveryDepartmentDeps = {}): Promise<DepartmentRunResult<DeliveryProduct>> {
  const now = deps.now ?? new Date();
  const workflowId = input.workflowId ?? input.companyId ?? input.opportunityId ?? input.projectName;
  const assessFeasibility = deps.assessFeasibility ?? defaultAssessFeasibility;
  const projectDeps = deps.projectDeps ?? {};
  const taskDeps = deps.taskDeps ?? {};
  const owner = input.owner ?? null;
  const services = input.servicesIncluded ?? [];

  const envelope = deps.inboundEnvelope ?? buildHandoffEnvelope(
    {
      workflowId,
      department: "delivery",
      sourceAgent: "sales_crm_orchestrator",
      destinationAgent: "delivery_orchestrator",
      objective: `Stand up delivery for ${input.projectName}`,
      requestedAction: "run_project",
      expectedOutputSchema: "won_deal",
      confidence: 0.8,
      companyId: input.companyId ?? null,
      clientWorkspaceId: input.companyId ?? null,
      dataClassification: input.companyId ? "client_confidential" : "internal",
      authorizedMemoryScopes: DELIVERY_MEMORY_SCOPES,
      idempotencyKey: `${workflowId}:delivery:inbound`,
    },
    { now },
  );
  const receiverCtx = { clientWorkspaceId: input.companyId ?? null, grantedMemoryScopes: DELIVERY_MEMORY_SCOPES };

  const policy: DepartmentPolicy<DeliveryProduct> = async (api) => {
    // Confirm the department actually has a delivery specialist (real membership, not a label).
    if (!api.selectSpecialists({ capability: "run_project" }).length) api.escalate("delivery has no registered delivery specialist");

    // AGENT judgment (ADVISORY ONLY — never gates the project write). A judgment failure degrades the advice
    // without blocking the project from being stood up.
    let feasibility: DeliveryFeasibility | null = null;
    try {
      feasibility = await assessFeasibility({ projectName: input.projectName, services, owner, usageContext: { departmentSlug: "delivery", workflowId, taskId: api.envelope.taskId, companyId: input.companyId ?? null, clientWorkspaceId: input.companyId ?? null } });
    } catch (err) {
      api.escalate(`delivery feasibility assessment unavailable (advisory): ${err instanceof Error ? err.message : "error"}`);
    }

    // DETERMINISTIC write (AUTHORITATIVE — the LLM never touches project/milestone/task state). Stand up the
    // real delivery project with kickoff milestones + an assigned owner, then seed kickoff tasks.
    // IDEMPOTENCY GUARD: a consumer retry/reclaim (crash or a transient error on a later step) must NOT create
    // a SECOND project or duplicate kickoff tasks for the same deal. If a project already exists for this
    // opportunity we reuse it and skip the writes (the chain produces one project per opportunity).
    const existingProjects = input.opportunityId ? await listProjects({ opportunityId: input.opportunityId, limit: 1 }, projectDeps) : [];
    let project: ProjectRow;
    if (existingProjects.length > 0) {
      project = existingProjects[0];
    } else {
      project = await addProject(
        {
          name: input.projectName,
          companyId: input.companyId ?? undefined,
          opportunityId: input.opportunityId ?? undefined,
          proposalId: input.proposalId ?? undefined,
          servicesIncluded: services,
          owner: owner ?? undefined,
          teamMembers: input.teamMembers ?? (owner ? [owner] : []),
          status: "onboarding",
          milestones: [{ title: "Kickoff call" }, { title: "Onboarding complete" }],
          createdBy: input.requestedBy,
        },
        projectDeps,
      );
      // Kickoff tasks — assigned to the responsible owner (real, owned work; not a decorative label).
      await addTask({ title: `Kick off delivery: ${input.projectName}`, companyId: input.companyId ?? undefined, opportunityId: input.opportunityId ?? undefined, assignedTo: owner ?? undefined, createdBy: input.requestedBy }, taskDeps);
      await addTask({ title: `Schedule onboarding: ${input.projectName}`, companyId: input.companyId ?? undefined, opportunityId: input.opportunityId ?? undefined, assignedTo: owner ?? undefined, createdBy: input.requestedBy }, taskDeps);
    }

    // Truthful delivery health from the REAL project signals (never assumed from record existence).
    const health = deliveryHealthLabel(project);

    // Real risks raise real escalations (visible + resolvable in the Command Centre).
    if (!owner) api.escalate(`delivery project '${input.projectName}' has no assigned owner (unowned work)`);
    if (feasibility?.feasibility === "blocked") api.escalate(`delivery blocked before kickoff for '${input.projectName}': ${feasibility.risks.join("; ") || "scope/dependency conflict"}`);
    if (health === "at_risk") api.escalate(`delivery health is at_risk for '${input.projectName}' (score ${project.healthScore})`);

    return {
      product: { project, health, feasibility },
      productSchema: "delivery_health",
      outputs: {
        projectId: project.id,
        opportunityId: project.opportunityId,
        owner: project.owner,
        health,
        healthScore: project.healthScore,
        milestones: project.milestones.length,
      },
      telemetry: { qualityScore: project.healthScore },
      confidence: 0.8,
      // The kickoff health snapshot goes to the Founder Command Centre only. Finance + Research are declared
      // downstream consumers of the DELIVERY COMPLETION product (schema delivery_completion, emitted on
      // project completion via completeDelivery) — NOT of delivery_health, which they don't accept.
      routeTo: ["founder_command_centre"],
    };
  };

  return runDepartment({ departmentSlug: "delivery", inbound: { envelope, receiverCtx }, policy }, deps);
}
