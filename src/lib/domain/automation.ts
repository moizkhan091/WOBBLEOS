// Automations — pure domain. A rule = trigger -> action (enqueue a real job).
import { z } from "zod";
import { newId } from "@/lib/ids";

export const AUTOMATION_MODULE = "automations";
export const TRIGGER_TYPES = ["manual", "event", "schedule"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  triggerType: TriggerType;
  triggerEvent: string | null;
  schedule: string | null;
  actionQueue: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  enabled: boolean;
  runCount: number;
  lastRunAt: Date | null;
  lastStatus: string | null;
  createdBy: string | null;
  archivedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const createAutomationSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  triggerType: z.enum(TRIGGER_TYPES).default("manual"),
  triggerEvent: z.string().trim().min(1).optional(),
  schedule: z.string().trim().min(1).optional(),
  actionQueue: z.string().trim().min(1).default("general"),
  actionType: z.string().trim().min(1),
  actionPayload: z.record(z.string(), z.unknown()).optional(),
  createdBy: z.string().trim().min(1).optional(),
}).refine((v) => v.triggerType !== "event" || !!v.triggerEvent, { message: "event triggers need a triggerEvent", path: ["triggerEvent"] });
export type CreateAutomationInput = z.input<typeof createAutomationSchema>;

/** Queues a worker actually polls today. An action on any other queue would enqueue a job nothing runs. */
export const RUNNABLE_AUTOMATION_QUEUES = ["general"] as const;

/**
 * Reject an automation whose action could never succeed: an actionType with no registered job handler
 * (dead job) or an actionQueue no worker consumes (stranded job). Returns an error string or null.
 * Pure — the caller supplies the current handler/queue sets so this stays decoupled from the registry.
 */
export function validateAutomationAction(
  action: { actionType: string; actionQueue: string },
  ctx: { knownJobTypes: string[]; runnableQueues?: readonly string[] },
): string | null {
  const queues = ctx.runnableQueues ?? RUNNABLE_AUTOMATION_QUEUES;
  if (!ctx.knownJobTypes.includes(action.actionType)) {
    return `actionType '${action.actionType}' has no registered job handler (valid: ${ctx.knownJobTypes.join(", ")})`;
  }
  if (!queues.includes(action.actionQueue)) {
    return `actionQueue '${action.actionQueue}' is not consumed by any worker (valid: ${queues.join(", ")})`;
  }
  return null;
}

export function buildAutomationRow(input: CreateAutomationInput, opts: { now?: Date; id?: string } = {}): AutomationRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("auto"),
    name: input.name.trim(),
    description: input.description ?? null,
    triggerType: input.triggerType ?? "manual",
    triggerEvent: input.triggerEvent ?? null,
    schedule: input.schedule ?? null,
    actionQueue: input.actionQueue ?? "general",
    actionType: input.actionType.trim(),
    actionPayload: input.actionPayload ?? {},
    enabled: true,
    runCount: 0,
    lastRunAt: null,
    lastStatus: null,
    createdBy: input.createdBy ?? null,
    archivedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** Which enabled event-rules match a fired audit event. */
export function matchingRules(rules: AutomationRow[], eventType: string): AutomationRow[] {
  return rules.filter((r) => r.enabled && r.triggerType === "event" && r.triggerEvent === eventType);
}
