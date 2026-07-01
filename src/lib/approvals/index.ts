import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { approvals } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { newId } from "@/lib/ids";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  APPROVAL_ACTIONS,
  evaluateApprovalAction,
  type ApprovalActionSlug,
  type ApprovalStatus,
} from "@/lib/domain/approval-flow";

/**
 * Chunk 04: Approvals service.
 *
 * createApproval() lets any worker/API enqueue an approval item.
 * applyApprovalAction() validates the transition against the state machine,
 * enforces confirmation + approver attribution, persists the change, and
 * writes an audit event (Chunk 03). Both accept injectable deps so the logic
 * is testable without a live Postgres.
 */

export const createApprovalSchema = z.object({
  approvalType: z.string().trim().min(1, "approvalType is required"),
  entityType: z.string().trim().min(1, "entityType is required"),
  entityId: z.string().trim().min(1, "entityId is required"),
  riskLevel: z.enum(["normal", "high"]).default("normal"),
  requestedBy: z.string().trim().min(1).optional(),
  confirmationRequired: z.boolean().default(false),
  notes: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type CreateApprovalInput = z.input<typeof createApprovalSchema>;

export const applyActionSchema = z.object({
  action: z.enum(APPROVAL_ACTIONS as [ApprovalActionSlug, ...ApprovalActionSlug[]]),
  approvedBy: z.string().trim().min(1, "approvedBy (actor) is required for approval actions"),
  confirmationProvided: z.boolean().default(false),
  notes: z.string().trim().min(1).optional(),
});

export type ApplyActionInput = z.input<typeof applyActionSchema> & { approvalId: string };

export interface ApprovalRow {
  id: string;
  approvalType: string;
  entityType: string;
  entityId: string;
  status: ApprovalStatus;
  riskLevel: string;
  requestedBy: string | null;
  confirmationRequired: boolean;
  confirmationCompleted: boolean;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalStore {
  insert(row: ApprovalRow): Promise<void>;
  getById(id: string): Promise<{ status: ApprovalStatus; approvalType: string } | null>;
  update(id: string, fields: Record<string, unknown>): Promise<void>;
}

export interface ApprovalDeps {
  store?: ApprovalStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

function defaultStore(db: Db = getDb()): ApprovalStore {
  return {
    async insert(row) {
      await db.insert(approvals).values(row);
    },
    async getById(id) {
      const rows = await db
        .select({ status: approvals.status, approvalType: approvals.approvalType })
        .from(approvals)
        .where(eq(approvals.id, id))
        .limit(1);
      const row = rows[0];
      return row ? { status: row.status as ApprovalStatus, approvalType: row.approvalType } : null;
    },
    async update(id, fields) {
      await db.update(approvals).set(fields).where(eq(approvals.id, id));
    },
  };
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

/** Build the pending approval row (pure; exported for tests). */
export function buildApprovalRow(input: CreateApprovalInput, opts: { id?: string; now?: Date } = {}): ApprovalRow {
  const parsed = createApprovalSchema.parse(input);
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("approval"),
    approvalType: parsed.approvalType,
    entityType: parsed.entityType,
    entityId: parsed.entityId,
    status: "pending",
    riskLevel: parsed.riskLevel,
    requestedBy: parsed.requestedBy ?? null,
    confirmationRequired: parsed.confirmationRequired,
    confirmationCompleted: false,
    notes: parsed.notes ?? null,
    metadata: parsed.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

export async function createApproval(input: CreateApprovalInput, deps: ApprovalDeps = {}): Promise<ApprovalRow> {
  const row = buildApprovalRow(input, { now: deps.now });
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;

  await store.insert(row);
  await recordAudit({
    eventType: "approval.created",
    module: "approvals",
    entityType: "approval",
    entityId: row.id,
    actor: row.requestedBy ?? undefined,
    metadata: {
      approvalType: row.approvalType,
      targetEntityType: row.entityType,
      targetEntityId: row.entityId,
      riskLevel: row.riskLevel,
    },
  });

  return row;
}

export interface ApplyActionResult {
  id: string;
  status: ApprovalStatus;
  action: ApprovalActionSlug;
  actor: string;
}

export async function applyApprovalAction(input: ApplyActionInput, deps: ApprovalDeps = {}): Promise<ApplyActionResult> {
  const { approvalId, ...rest } = input;
  if (!approvalId || approvalId.trim().length === 0) {
    throw new Error("approvalId is required");
  }
  const parsed = applyActionSchema.parse(rest);

  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const current = await store.getById(approvalId);
  if (!current) {
    throw new Error(`approval '${approvalId}' not found`);
  }

  const result = evaluateApprovalAction({
    currentStatus: current.status,
    action: parsed.action,
    confirmationProvided: parsed.confirmationProvided,
  });

  if (!result.ok) {
    throw new Error(result.reason);
  }

  const fields: Record<string, unknown> = {
    status: result.nextStatus,
    approvalAction: parsed.action,
    updatedAt: now,
  };
  if (result.isApproval) {
    fields.approvedBy = parsed.approvedBy;
    fields.approvedAt = now;
  }
  if (result.isRejection) {
    fields.rejectedBy = parsed.approvedBy;
    fields.rejectedAt = now;
  }
  if (result.requiresConfirmation) {
    fields.confirmationCompleted = true;
  }
  if (parsed.notes !== undefined) {
    fields.notes = parsed.notes;
  }

  await store.update(approvalId, fields);
  await recordAudit({
    eventType: `approval.${parsed.action}`,
    module: "approvals",
    entityType: "approval",
    entityId: approvalId,
    actor: parsed.approvedBy,
    metadata: {
      approvalType: current.approvalType,
      fromStatus: current.status,
      toStatus: result.nextStatus,
    },
  });

  return { id: approvalId, status: result.nextStatus, action: parsed.action, actor: parsed.approvedBy };
}

export interface ListApprovalsQuery {
  status?: ApprovalStatus;
  approvalType?: string;
  entityType?: string;
  limit?: number;
}

export const DEFAULT_APPROVAL_LIMIT = 50;
export const MAX_APPROVAL_LIMIT = 200;

export function clampApprovalLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_APPROVAL_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_APPROVAL_LIMIT);
}

export async function listApprovals(query: ListApprovalsQuery = {}, db: Db = getDb()) {
  const conditions = [];
  if (query.status) conditions.push(eq(approvals.status, query.status));
  if (query.approvalType) conditions.push(eq(approvals.approvalType, query.approvalType));
  if (query.entityType) conditions.push(eq(approvals.entityType, query.entityType));

  const where = conditions.length ? and(...conditions) : undefined;

  return db
    .select()
    .from(approvals)
    .where(where)
    .orderBy(desc(approvals.createdAt))
    .limit(clampApprovalLimit(query.limit));
}

export async function countPendingApprovals(db: Db = getDb()): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(approvals)
    .where(eq(approvals.status, "pending"));
  return Number(rows[0]?.value ?? 0);
}


/**
 * Load a full approval row by id (used by the approval router to dispatch to
 * the correct entity-specific approve/reject).
 */
export async function getApproval(id: string, db: Db = getDb()): Promise<ApprovalRow | null> {
  const rows = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
  return (rows[0] as ApprovalRow | undefined) ?? null;
}
