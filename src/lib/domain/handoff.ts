import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Structured inter-agent handoff envelope (Phase 2) — the versioned contract every agent-to-agent
 * handoff travels in. It carries workflow lineage (correlation/causation), tenant + client scope,
 * the memory scopes the receiver is AUTHORIZED to read, provenance, the request, and the expected
 * output shape. `validateHandoff` enforces it: strict schema, client/tenant isolation, and
 * memory-scope authorization. This is a real runtime contract — the graphs build + validate an
 * envelope at each hop; it is NOT a decorative wrapper.
 */

export const HANDOFF_SCHEMA_VERSION = 1;

export const DATA_CLASSIFICATIONS = ["public", "internal", "client_confidential", "restricted"] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

export const APPROVAL_STATES = ["not_required", "pending", "approved", "rejected"] as const;
export type HandoffApprovalState = (typeof APPROVAL_STATES)[number];

export interface HandoffEnvelope {
  schemaVersion: number;
  // ---- lineage ----
  workflowId: string;
  taskId: string;
  parentTaskId: string | null;
  correlationId: string; // stable across the whole workflow run
  causationId: string | null; // the taskId that caused THIS task
  // ---- routing ----
  department: string;
  sourceAgent: string;
  destinationAgent: string | null; // exact agent, OR…
  destinationCapability: string | null; // …a capability to resolve to an agent
  // ---- tenancy / scope ----
  companyId: string | null;
  clientWorkspaceId: string | null;
  projectId: string | null;
  leadId: string | null;
  actor: string; // founder/user on whose behalf this runs
  dataClassification: DataClassification;
  authorizedMemoryScopes: string[]; // the ONLY memory scopes the receiver may read
  // ---- payload ----
  objective: string;
  requiredInputs: string[]; // keys that MUST be present in `previousAgentOutputs`
  supportingEvidence: string[]; // evidence ids/notes backing the request
  sourceReferences: string[]; // source ids for provenance
  previousAgentOutputs: Record<string, unknown>;
  constraints: string[];
  approvalState: HandoffApprovalState;
  confidence: number; // 0..1
  uncertainties: string[];
  requestedAction: string;
  expectedOutputSchema: string; // a named schema the receiver must produce
  priority: "low" | "medium" | "high" | "urgent";
  deadline: string | null; // ISO
  idempotencyKey: string; // dedupe: (workflowId, destination, idempotencyKey) processed once
  createdAt: string; // ISO
}

const scopeString = z.string().trim().min(1);

export const handoffEnvelopeSchema = z.object({
  schemaVersion: z.number().int().positive(),
  workflowId: scopeString,
  taskId: scopeString,
  parentTaskId: z.string().trim().min(1).nullable().default(null),
  correlationId: scopeString,
  causationId: z.string().trim().min(1).nullable().default(null),
  department: scopeString,
  sourceAgent: scopeString,
  destinationAgent: z.string().trim().min(1).nullable().default(null),
  destinationCapability: z.string().trim().min(1).nullable().default(null),
  companyId: z.string().trim().min(1).nullable().default(null),
  clientWorkspaceId: z.string().trim().min(1).nullable().default(null),
  projectId: z.string().trim().min(1).nullable().default(null),
  leadId: z.string().trim().min(1).nullable().default(null),
  actor: scopeString,
  dataClassification: z.enum(DATA_CLASSIFICATIONS),
  authorizedMemoryScopes: z.array(scopeString).default([]),
  objective: scopeString,
  requiredInputs: z.array(scopeString).default([]),
  supportingEvidence: z.array(z.string()).default([]),
  sourceReferences: z.array(z.string()).default([]),
  previousAgentOutputs: z.record(z.string(), z.unknown()).default({}),
  constraints: z.array(z.string()).default([]),
  approvalState: z.enum(APPROVAL_STATES).default("not_required"),
  confidence: z.number().min(0).max(1),
  uncertainties: z.array(z.string()).default([]),
  requestedAction: scopeString,
  expectedOutputSchema: scopeString,
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  deadline: z.string().trim().min(1).nullable().default(null),
  idempotencyKey: scopeString,
  createdAt: scopeString,
})
  // A destination must be resolvable: either an exact agent or a capability.
  .refine((e) => Boolean(e.destinationAgent) || Boolean(e.destinationCapability), {
    message: "handoff needs a destinationAgent or destinationCapability",
    path: ["destinationAgent"],
  });

export type BuildHandoffInput = Omit<Partial<HandoffEnvelope>, "schemaVersion" | "taskId" | "createdAt" | "idempotencyKey" | "correlationId"> & {
  workflowId: string;
  department: string;
  sourceAgent: string;
  objective: string;
  requestedAction: string;
  expectedOutputSchema: string;
  correlationId?: string;
  idempotencyKey?: string;
  confidence?: number;
};

/** Build a well-formed envelope, filling ids/timestamps/version. `now` is passed in (no ambient clock). */
export function buildHandoffEnvelope(input: BuildHandoffInput, opts: { now: Date; taskId?: string }): HandoffEnvelope {
  const taskId = opts.taskId ?? newId("task");
  const correlationId = input.correlationId ?? input.workflowId;
  return {
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    workflowId: input.workflowId,
    taskId,
    parentTaskId: input.parentTaskId ?? null,
    correlationId,
    causationId: input.causationId ?? null,
    department: input.department,
    sourceAgent: input.sourceAgent,
    destinationAgent: input.destinationAgent ?? null,
    destinationCapability: input.destinationCapability ?? null,
    companyId: input.companyId ?? null,
    clientWorkspaceId: input.clientWorkspaceId ?? null,
    projectId: input.projectId ?? null,
    leadId: input.leadId ?? null,
    actor: input.actor ?? "system",
    dataClassification: input.dataClassification ?? "internal",
    authorizedMemoryScopes: input.authorizedMemoryScopes ?? [],
    objective: input.objective,
    requiredInputs: input.requiredInputs ?? [],
    supportingEvidence: input.supportingEvidence ?? [],
    sourceReferences: input.sourceReferences ?? [],
    previousAgentOutputs: input.previousAgentOutputs ?? {},
    constraints: input.constraints ?? [],
    approvalState: input.approvalState ?? "not_required",
    confidence: input.confidence ?? 0.5,
    uncertainties: input.uncertainties ?? [],
    requestedAction: input.requestedAction,
    expectedOutputSchema: input.expectedOutputSchema,
    priority: input.priority ?? "medium",
    deadline: input.deadline ?? null,
    idempotencyKey: input.idempotencyKey ?? `${input.workflowId}:${taskId}`,
    createdAt: opts.now.toISOString(),
  };
}

/** The receiving context: who is consuming, in which workspace, and what memory scopes it may access. */
export interface HandoffReceiverContext {
  /** The client workspace the RECEIVER is operating in. A handoff for a different client is rejected. */
  clientWorkspaceId?: string | null;
  /** Memory scopes the receiver is permitted to read (its own grant). The envelope may not exceed these. */
  grantedMemoryScopes?: string[];
}

export interface HandoffValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Validate a handoff before a receiver consumes it:
 *  - strict schema + schemaVersion compatibility
 *  - client/tenant isolation: the envelope's clientWorkspaceId must match the receiver's
 *  - memory-scope authorization: every authorizedMemoryScope must be within the receiver's grant
 *  - required inputs present in previousAgentOutputs
 */
export function validateHandoff(envelope: unknown, ctx: HandoffReceiverContext = {}): HandoffValidation {
  const errors: string[] = [];
  const parsed = handoffEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "envelope"}: ${i.message}`) };
  }
  const e = parsed.data;

  if (e.schemaVersion !== HANDOFF_SCHEMA_VERSION) {
    errors.push(`schemaVersion ${e.schemaVersion} != current ${HANDOFF_SCHEMA_VERSION}`);
  }

  // Client/tenant isolation: a client-scoped handoff must match the receiver's workspace exactly.
  if (e.clientWorkspaceId && ctx.clientWorkspaceId !== undefined && e.clientWorkspaceId !== ctx.clientWorkspaceId) {
    errors.push(`client isolation: envelope clientWorkspaceId '${e.clientWorkspaceId}' != receiver '${ctx.clientWorkspaceId ?? "none"}'`);
  }

  // Memory-scope authorization: the envelope cannot authorize more than the receiver is granted.
  if (ctx.grantedMemoryScopes) {
    const granted = new Set(ctx.grantedMemoryScopes);
    const over = e.authorizedMemoryScopes.filter((s) => !granted.has(s));
    if (over.length) errors.push(`unauthorized memory scopes: ${over.join(", ")}`);
  }

  // Required inputs must be present in the carried outputs.
  const missing = e.requiredInputs.filter((k) => !(k in e.previousAgentOutputs));
  if (missing.length) errors.push(`missing required inputs: ${missing.join(", ")}`);

  return { ok: errors.length === 0, errors };
}

/** Derive the next-hop envelope from a completed hop: preserves lineage, sets causation, carries output. */
export function nextHandoff(
  prev: HandoffEnvelope,
  input: {
    destinationAgent?: string | null;
    destinationCapability?: string | null;
    objective: string;
    requestedAction: string;
    expectedOutputSchema: string;
    addOutputs: Record<string, unknown>;
    requiredInputs?: string[];
    confidence?: number;
    sourceAgent: string;
  },
  opts: { now: Date; taskId?: string },
): HandoffEnvelope {
  return buildHandoffEnvelope(
    {
      workflowId: prev.workflowId,
      correlationId: prev.correlationId,
      parentTaskId: prev.taskId,
      causationId: prev.taskId,
      department: prev.department,
      sourceAgent: input.sourceAgent,
      destinationAgent: input.destinationAgent ?? null,
      destinationCapability: input.destinationCapability ?? null,
      companyId: prev.companyId,
      clientWorkspaceId: prev.clientWorkspaceId,
      projectId: prev.projectId,
      leadId: prev.leadId,
      actor: prev.actor,
      dataClassification: prev.dataClassification,
      authorizedMemoryScopes: prev.authorizedMemoryScopes,
      objective: input.objective,
      requiredInputs: input.requiredInputs ?? [],
      supportingEvidence: prev.supportingEvidence,
      sourceReferences: prev.sourceReferences,
      previousAgentOutputs: { ...prev.previousAgentOutputs, ...input.addOutputs },
      constraints: prev.constraints,
      approvalState: prev.approvalState,
      confidence: input.confidence ?? prev.confidence,
      requestedAction: input.requestedAction,
      expectedOutputSchema: input.expectedOutputSchema,
      priority: prev.priority,
      deadline: prev.deadline,
    },
    opts,
  );
}
