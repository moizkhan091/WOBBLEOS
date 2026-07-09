import { z } from "zod";
import { newId } from "@/lib/ids";

/** Tasks / work allocation (pure, testable). ERP brief section E. Connected to any business object. */

export const TASK_MODULE = "tasks";

export const TASK_TYPES = ["call", "whatsapp_followup", "email_followup", "meeting_prep", "proposal_work", "audit_work", "invoice_followup", "client_delivery", "internal_admin", "approval_needed", "content_task", "research_task", "finance_task", "bug"] as const;
export const TASK_STATUSES = ["not_started", "in_progress", "waiting", "blocked", "needs_review", "completed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  taskType: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  assignedBy: string | null;
  companyId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  proposalId: string | null;
  invoiceId: string | null;
  dueDate: Date | null;
  reminderDate: Date | null;
  completedAt: Date | null;
  notes: string | null;
  createdBy: string | null;
  archivedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const createTaskSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  taskType: z.enum(TASK_TYPES).default("internal_admin"),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  assignedTo: z.string().trim().min(1).optional(),
  companyId: z.string().trim().min(1).optional(),
  contactId: z.string().trim().min(1).optional(),
  opportunityId: z.string().trim().min(1).optional(),
  proposalId: z.string().trim().min(1).optional(),
  invoiceId: z.string().trim().min(1).optional(),
  dueDate: z.coerce.date().optional(),
  reminderDate: z.coerce.date().optional(),
  notes: z.string().trim().min(1).optional(),
  createdBy: z.string().trim().min(1).optional(),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

export function buildTaskRow(input: CreateTaskInput, opts: { now?: Date; id?: string } = {}): TaskRow {
  const p = createTaskSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("task"),
    title: p.title,
    description: p.description ?? null,
    taskType: p.taskType,
    priority: p.priority,
    status: "not_started",
    assignedTo: p.assignedTo ?? null,
    assignedBy: p.createdBy ?? null,
    companyId: p.companyId ?? null,
    contactId: p.contactId ?? null,
    opportunityId: p.opportunityId ?? null,
    proposalId: p.proposalId ?? null,
    invoiceId: p.invoiceId ?? null,
    dueDate: p.dueDate ?? null,
    reminderDate: p.reminderDate ?? null,
    completedAt: null,
    notes: p.notes ?? null,
    createdBy: p.createdBy ?? null,
    archivedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  not_started: ["in_progress", "waiting", "blocked", "cancelled", "completed"],
  in_progress: ["waiting", "blocked", "needs_review", "completed", "cancelled"],
  waiting: ["in_progress", "blocked", "completed", "cancelled"],
  blocked: ["in_progress", "waiting", "cancelled"],
  needs_review: ["in_progress", "completed", "cancelled"],
  completed: ["in_progress"], // allow reopen
  cancelled: ["not_started"],
};

export function canTransitionTask(from: string, to: TaskStatus): boolean {
  const allowed = TASK_TRANSITIONS[from as TaskStatus];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function isOverdue(task: { status: string; dueDate: Date | null }, now: Date): boolean {
  return !!task.dueDate && task.dueDate.getTime() < now.getTime() && task.status !== "completed" && task.status !== "cancelled";
}
