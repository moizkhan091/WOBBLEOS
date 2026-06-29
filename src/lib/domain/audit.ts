import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Chunk 03: Audit Log domain logic.
 *
 * Pure, DB-free normalization + validation for append-only audit events.
 * Every important OS action (approval, source add, memory proposal, model
 * run, webhook event, kill-switch toggle, backup) should funnel through
 * buildAuditEvent so rows are shaped consistently and required fields are
 * enforced before they ever reach Postgres.
 *
 * eventType and module are intentionally open strings (not enums): new
 * modules/actions are added by data and feature work, not by editing this
 * file. We only enforce that they are present and non-empty.
 */

export const auditEventInputSchema = z.object({
  eventType: z.string().trim().min(1, "eventType is required"),
  module: z.string().trim().min(1, "module is required"),
  entityType: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  actor: z.string().trim().min(1).optional(),
  modelRunId: z.string().trim().min(1).optional(),
  costEstimate: z.number().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AuditEventInput = z.input<typeof auditEventInputSchema>;

/** Normalized row, ready to insert into the audit_logs table. */
export interface AuditEventRow {
  id: string;
  eventType: string;
  module: string;
  entityType: string | null;
  entityId: string | null;
  actor: string | null;
  modelRunId: string | null;
  /** numeric columns are represented as strings by the pg driver */
  costEstimate: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface BuildAuditEventOptions {
  now?: Date;
  id?: string;
}

/**
 * Validate and normalize an audit event. Throws (ZodError) when required
 * fields are missing so bad events fail fast instead of writing junk rows.
 */
export function buildAuditEvent(input: AuditEventInput, options: BuildAuditEventOptions = {}): AuditEventRow {
  const parsed = auditEventInputSchema.parse(input);

  return {
    id: options.id ?? newId("audit"),
    eventType: parsed.eventType,
    module: parsed.module,
    entityType: parsed.entityType ?? null,
    entityId: parsed.entityId ?? null,
    actor: parsed.actor ?? null,
    modelRunId: parsed.modelRunId ?? null,
    costEstimate: parsed.costEstimate !== undefined ? String(parsed.costEstimate) : null,
    metadata: parsed.metadata ?? {},
    createdAt: options.now ?? new Date(),
  };
}
