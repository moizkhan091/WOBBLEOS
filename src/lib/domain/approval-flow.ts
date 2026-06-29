/**
 * Chunk 04: Approvals state machine (pure, DB-free).
 *
 * The founder gate that controls content, sources, memory updates, media,
 * client deliverables, and n8n handoffs. This file owns the rules:
 * which actions are valid from which status, what status an action leads to,
 * and which actions require explicit confirmation (high-risk / external).
 *
 * Action slugs match the seeded `approval_actions` table. Statuses match the
 * `approvals.status` column. Keeping this pure makes the rules unit-testable
 * without a database.
 */

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revision_requested"
  | "archived";

export type ApprovalActionSlug =
  | "approve"
  | "reject"
  | "request_revision"
  | "regenerate"
  | "edit_manually"
  | "archive"
  | "send_to_n8n"
  | "retry_handoff"
  | "mark_final"
  | "approve_clip"
  | "reject_clip"
  | "approve_final_mp4";

export const APPROVAL_STATUSES: ApprovalStatus[] = [
  "pending",
  "approved",
  "rejected",
  "revision_requested",
  "archived",
];

export const APPROVAL_ACTIONS: ApprovalActionSlug[] = [
  "approve",
  "reject",
  "request_revision",
  "regenerate",
  "edit_manually",
  "archive",
  "send_to_n8n",
  "retry_handoff",
  "mark_final",
  "approve_clip",
  "reject_clip",
  "approve_final_mp4",
];

/** High-risk / external / irreversible actions that require explicit confirmation. */
export const CONFIRMATION_REQUIRED_ACTIONS: ApprovalActionSlug[] = [
  "send_to_n8n",
  "retry_handoff",
  "approve_final_mp4",
];

/** Actions that count as a positive approval (set approved_by/approved_at). */
export const APPROVE_ACTIONS: ApprovalActionSlug[] = [
  "approve",
  "approve_clip",
  "approve_final_mp4",
  "mark_final",
];

/** Actions that count as a rejection (set rejected_by/rejected_at). */
export const REJECT_ACTIONS: ApprovalActionSlug[] = ["reject", "reject_clip"];

/**
 * Resulting status for an action. Actions not listed here do not change the
 * status (e.g. regenerate, edit_manually, send_to_n8n, retry_handoff act on an
 * item without moving it through the lifecycle).
 */
const ACTION_RESULT: Partial<Record<ApprovalActionSlug, ApprovalStatus>> = {
  approve: "approved",
  approve_clip: "approved",
  approve_final_mp4: "approved",
  mark_final: "approved",
  reject: "rejected",
  reject_clip: "rejected",
  request_revision: "revision_requested",
  archive: "archived",
};

/** Which actions are allowed from a given status. */
const ALLOWED_ACTIONS: Record<ApprovalStatus, ApprovalActionSlug[]> = {
  pending: [
    "approve",
    "reject",
    "request_revision",
    "regenerate",
    "edit_manually",
    "archive",
    "approve_clip",
    "reject_clip",
    "approve_final_mp4",
    "mark_final",
  ],
  revision_requested: [
    "approve",
    "reject",
    "regenerate",
    "edit_manually",
    "request_revision",
    "archive",
  ],
  approved: ["send_to_n8n", "retry_handoff", "mark_final", "archive"],
  rejected: ["regenerate", "archive"],
  archived: [],
};

export interface EvaluateApprovalActionInput {
  currentStatus: ApprovalStatus;
  action: ApprovalActionSlug;
  confirmationProvided: boolean;
}

export interface EvaluateApprovalActionResult {
  ok: boolean;
  nextStatus: ApprovalStatus;
  requiresConfirmation: boolean;
  isApproval: boolean;
  isRejection: boolean;
  reason: string;
}

export function actionRequiresConfirmation(action: ApprovalActionSlug): boolean {
  return CONFIRMATION_REQUIRED_ACTIONS.includes(action);
}

export function allowedActionsFor(status: ApprovalStatus): ApprovalActionSlug[] {
  return ALLOWED_ACTIONS[status] ?? [];
}

/**
 * Validate an attempted action against the current status. Returns the next
 * status and confirmation/attribution flags. Never throws; callers decide how
 * to surface `ok: false`.
 */
export function evaluateApprovalAction(
  input: EvaluateApprovalActionInput,
): EvaluateApprovalActionResult {
  const base = {
    nextStatus: input.currentStatus,
    requiresConfirmation: actionRequiresConfirmation(input.action),
    isApproval: APPROVE_ACTIONS.includes(input.action),
    isRejection: REJECT_ACTIONS.includes(input.action),
  };

  const allowed = allowedActionsFor(input.currentStatus);
  if (!allowed.includes(input.action)) {
    return {
      ...base,
      ok: false,
      reason: `action '${input.action}' is not allowed from status '${input.currentStatus}'`,
    };
  }

  if (base.requiresConfirmation && !input.confirmationProvided) {
    return {
      ...base,
      ok: false,
      reason: `action '${input.action}' requires explicit confirmation`,
    };
  }

  return {
    ...base,
    ok: true,
    nextStatus: ACTION_RESULT[input.action] ?? input.currentStatus,
    reason: "ok",
  };
}
