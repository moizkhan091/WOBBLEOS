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

export const AUDIT_CATEGORIES = ["creation", "edit", "deletion", "restore", "approval", "access", "learning", "model", "system"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/**
 * Bucket an event into a human-facing category so the audit log is instantly
 * readable/filterable ("show me all deletions"). Derived from the event type
 * unless the caller sets `category` explicitly.
 */
export function deriveAuditCategory(eventType: string): AuditCategory {
  const t = eventType.toLowerCase();
  if (/(approv|reject)/.test(t)) return "approval";
  if (/(archiv|delete|purge|remove)/.test(t)) return "deletion";
  if (/(restore|revert)/.test(t)) return "restore";
  if (/(creat|add|propose|generat)/.test(t)) return "creation";
  if (/(edit|update|chang)/.test(t)) return "edit";
  if (/(harvest|learn)/.test(t)) return "learning";
  if (/(answer|ask|read|retriev|access|view)/.test(t)) return "access";
  if (/(model|run|cost)/.test(t)) return "model";
  return "system";
}

export const auditEventInputSchema = z.object({
  eventType: z.string().trim().min(1, "eventType is required"),
  category: z.enum(AUDIT_CATEGORIES).optional(),
  module: z.string().trim().min(1, "module is required"),
  entityType: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  actor: z.string().trim().min(1).optional(),
  surface: z.string().trim().min(1).optional(),
  modelRunId: z.string().trim().min(1).optional(),
  costEstimate: z.number().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AuditEventInput = z.input<typeof auditEventInputSchema>;

/** Normalized row, ready to insert into the audit_logs table. */
export interface AuditEventRow {
  id: string;
  eventType: string;
  category: AuditCategory;
  module: string;
  entityType: string | null;
  entityId: string | null;
  actor: string | null;
  surface: string | null;
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
    category: parsed.category ?? deriveAuditCategory(parsed.eventType),
    module: parsed.module,
    entityType: parsed.entityType ?? null,
    entityId: parsed.entityId ?? null,
    actor: parsed.actor ?? null,
    surface: parsed.surface ?? null,
    modelRunId: parsed.modelRunId ?? null,
    costEstimate: parsed.costEstimate !== undefined ? String(parsed.costEstimate) : null,
    metadata: parsed.metadata ?? {},
    createdAt: options.now ?? new Date(),
  };
}
