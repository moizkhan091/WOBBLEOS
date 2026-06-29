export type FounderName = "Moiz" | "Haad" | "Founder 3" | "Founder 4";
export type ApprovalAction = "approve" | "reject" | "request_revision" | "regenerate" | "edit_manually" | "archive" | "send_to_n8n" | "retry_handoff" | "mark_as_final";
export type RiskLevel = "low" | "medium" | "high";

export interface CreateApprovalInput {
  entityType: string;
  entityId: string;
  action: ApprovalAction;
  approvedBy: FounderName;
  riskLevel: RiskLevel;
  confirmationRequired: boolean;
  confirmationCompleted: boolean;
  notes?: string;
  now?: Date;
}

export function createApprovalRecord(input: CreateApprovalInput) {
  const approvedAt = (input.now ?? new Date()).toISOString();

  return {
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    approvedBy: input.approvedBy,
    approvedAt,
    riskLevel: input.riskLevel,
    confirmationRequired: input.confirmationRequired,
    confirmationCompleted: input.confirmationCompleted,
    notes: input.notes ?? "",
  };
}
