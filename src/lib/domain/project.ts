// Projects / Client Delivery — pure domain (ERP brief section I).
// A won deal becomes a client project workspace. No IO here.

import { z } from "zod";
import { newId } from "@/lib/ids";

export const PROJECT_MODULE = "projects";

export const PROJECT_STATUSES = [
  "not_started",
  "onboarding",
  "in_progress",
  "waiting_on_client",
  "at_risk",
  "completed",
  "paused",
  "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// status -> statuses it may move to.
const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  not_started: ["onboarding", "in_progress", "cancelled", "paused"],
  onboarding: ["in_progress", "waiting_on_client", "at_risk", "paused", "cancelled"],
  in_progress: ["waiting_on_client", "at_risk", "completed", "paused", "cancelled"],
  waiting_on_client: ["in_progress", "at_risk", "completed", "paused", "cancelled"],
  at_risk: ["in_progress", "waiting_on_client", "completed", "paused", "cancelled"],
  paused: ["in_progress", "onboarding", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionProject(from: ProjectStatus, to: ProjectStatus): boolean {
  if (from === to) return true;
  return (PROJECT_TRANSITIONS[from] ?? []).includes(to);
}

export interface ProjectMilestone {
  title: string;
  due?: string;
  done?: boolean;
}
export interface ProjectDeliverable {
  title: string;
  done?: boolean;
}

export interface ProjectRow {
  id: string;
  name: string;
  companyId: string | null;
  opportunityId: string | null;
  proposalId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  owner: string | null;
  teamMembers: string[];
  status: ProjectStatus;
  servicesIncluded: string[];
  milestones: ProjectMilestone[];
  deliverables: ProjectDeliverable[];
  healthScore: number;
  clientNotes: string | null;
  internalNotes: string | null;
  createdBy: string | null;
  archivedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  name: string;
  companyId?: string;
  opportunityId?: string;
  proposalId?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  owner?: string;
  teamMembers?: string[];
  status?: ProjectStatus;
  servicesIncluded?: string[];
  milestones?: ProjectMilestone[];
  deliverables?: ProjectDeliverable[];
  clientNotes?: string;
  internalNotes?: string;
  createdBy?: string;
}

const milestoneSchema = z.object({ title: z.string().trim().min(1), due: z.string().trim().optional(), done: z.boolean().optional() });
const deliverableSchema = z.object({ title: z.string().trim().min(1), done: z.boolean().optional() });

export const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  companyId: z.string().trim().min(1).optional(),
  opportunityId: z.string().trim().min(1).optional(),
  proposalId: z.string().trim().min(1).optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  owner: z.string().trim().min(1).optional(),
  teamMembers: z.array(z.string().trim().min(1)).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  servicesIncluded: z.array(z.string().trim().min(1)).optional(),
  milestones: z.array(milestoneSchema).optional(),
  deliverables: z.array(deliverableSchema).optional(),
  clientNotes: z.string().trim().min(1).optional(),
  internalNotes: z.string().trim().min(1).optional(),
  createdBy: z.string().trim().min(1).optional(),
});

function toDate(v: string | Date | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Deterministic 0-100 health score from progress + status. */
export function computeHealthScore(row: Pick<ProjectRow, "status" | "milestones" | "deliverables" | "endDate">, now: Date): number {
  if (row.status === "completed") return 100;
  if (row.status === "cancelled") return 0;
  let score = 80;
  if (row.status === "at_risk") score -= 30;
  if (row.status === "waiting_on_client") score -= 10;
  if (row.status === "paused") score -= 15;
  const all = [...row.milestones, ...row.deliverables];
  if (all.length) {
    const doneRatio = all.filter((m) => m.done).length / all.length;
    score += Math.round(doneRatio * 20) - 10; // +/-10 around progress
  }
  // Overdue end date drags health down (completed/cancelled already returned above).
  if (row.endDate && row.endDate.getTime() < now.getTime()) score -= 20;
  return Math.max(0, Math.min(100, score));
}

export function buildProjectRow(input: CreateProjectInput, opts: { now?: Date; id?: string } = {}): ProjectRow {
  const now = opts.now ?? new Date();
  const id = opts.id ?? newId("project");
  const status = input.status ?? "not_started";
  const milestones = input.milestones ?? [];
  const deliverables = input.deliverables ?? [];
  const endDate = toDate(input.endDate);
  const base: ProjectRow = {
    id,
    name: input.name.trim(),
    companyId: input.companyId ?? null,
    opportunityId: input.opportunityId ?? null,
    proposalId: input.proposalId ?? null,
    startDate: toDate(input.startDate),
    endDate,
    owner: input.owner ?? null,
    teamMembers: input.teamMembers ?? [],
    status,
    servicesIncluded: input.servicesIncluded ?? [],
    milestones,
    deliverables,
    healthScore: 80,
    clientNotes: input.clientNotes ?? null,
    internalNotes: input.internalNotes ?? null,
    createdBy: input.createdBy ?? null,
    archivedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
  base.healthScore = computeHealthScore(base, now);
  return base;
}
