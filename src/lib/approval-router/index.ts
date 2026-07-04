import { getApproval, applyApprovalAction, type ApprovalRow } from "@/lib/approvals";
import { approveSource, rejectSource } from "@/lib/sources";
import { approveSkillVersion, rejectSkillVersion } from "@/lib/prompt-skills";
import { approveContentPacket, rejectContentPacket } from "@/lib/content";
import { recordFeedbackEvent, type RecordFeedbackEventResult } from "@/lib/taste";
import { FEEDBACK_REASON_CATEGORIES, type FeedbackEventInput, type FeedbackReasonCategory } from "@/lib/domain/taste";

/**
 * Approval router (Chunk 04 completion): the founder's single Approvals gate
 * must ACTUALLY complete the entity action, not just flip the approval row.
 * Dispatches an approve/reject decision to the correct entity service by type.
 * memory_update is intentionally excluded - it needs founder-supplied fields
 * (slug/title/tier/trust), so the UI collects those and calls the memory
 * endpoint directly.
 *
 * Deps are injectable so the router is unit-testable without a live DB.
 */
export interface ResolveApprovalInput {
  approvalId: string;
  action: "approve" | "reject";
  approvedBy: string;
  notes?: string;
  trustLevel?: string;
}

export interface ResolveApprovalResult {
  approvalType: string;
  entityId: string;
  action: "approve" | "reject";
}

export interface ResolveApprovalDeps {
  loadApproval?: (id: string) => Promise<ApprovalRow | null>;
  approveSource?: (i: { sourceId: string; approvalId: string; approvedBy: string; trustLevel: string; notes?: string }) => Promise<unknown>;
  rejectSource?: (i: { sourceId: string; approvalId: string; rejectedBy: string; reason?: string }) => Promise<unknown>;
  approveSkillVersion?: (i: { skillId: string; approvalId: string; approvedBy: string; notes?: string }) => Promise<unknown>;
  rejectSkillVersion?: (i: { skillId: string; approvalId: string; approvedBy: string; notes?: string }) => Promise<unknown>;
  approveContentPacket?: (i: { packetId: string; approvalId: string; approvedBy: string; notes?: string }) => Promise<unknown>;
  rejectContentPacket?: (i: { packetId: string; approvalId: string; approvedBy: string; notes?: string }) => Promise<unknown>;
  applyApprovalAction?: (i: { approvalId: string; action: "approve" | "reject"; approvedBy: string; notes?: string }) => Promise<unknown>;
  recordFeedbackEvent?: (i: FeedbackEventInput) => Promise<RecordFeedbackEventResult | unknown>;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function asDimensions(value: unknown): FeedbackEventInput["dimensions"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      if (typeof obj.key !== "string" || typeof obj.value !== "string") return null;
      return {
        key: obj.key,
        value: obj.value,
        weight: typeof obj.weight === "number" ? obj.weight : undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asReasonCategory(value: unknown): FeedbackReasonCategory | undefined {
  if (typeof value !== "string") return undefined;
  return FEEDBACK_REASON_CATEGORIES.includes(value as FeedbackReasonCategory) ? (value as FeedbackReasonCategory) : undefined;
}

export async function resolveApproval(input: ResolveApprovalInput, deps: ResolveApprovalDeps = {}): Promise<ResolveApprovalResult> {
  const load = deps.loadApproval ?? getApproval;
  const approval = await load(input.approvalId);
  if (!approval) throw new Error(`approval '${input.approvalId}' not found`);

  const type = approval.approvalType;
  const entityId = approval.entityId;
  const approve = input.action === "approve";
  if (!approve && !input.notes?.trim()) {
    throw new Error("rejection reason is required before WOBBLE can learn from the decision");
  }

  if (type === "source") {
    if (approve) {
      const requested = typeof approval.metadata?.requestedTrustLevel === "string" ? approval.metadata.requestedTrustLevel : undefined;
      await (deps.approveSource ?? approveSource)({
        sourceId: entityId,
        approvalId: input.approvalId,
        approvedBy: input.approvedBy,
        trustLevel: input.trustLevel ?? requested ?? "tier_3_monitored",
        notes: input.notes,
      });
    } else {
      await (deps.rejectSource ?? rejectSource)({ sourceId: entityId, approvalId: input.approvalId, rejectedBy: input.approvedBy, reason: input.notes });
    }
  } else if (type === "skill" || type === "skill_update") {
    if (approve) await (deps.approveSkillVersion ?? approveSkillVersion)({ skillId: entityId, approvalId: input.approvalId, approvedBy: input.approvedBy, notes: input.notes });
    else await (deps.rejectSkillVersion ?? rejectSkillVersion)({ skillId: entityId, approvalId: input.approvalId, approvedBy: input.approvedBy, notes: input.notes });
  } else if (type === "content_packet") {
    if (approve) await (deps.approveContentPacket ?? approveContentPacket)({ packetId: entityId, approvalId: input.approvalId, approvedBy: input.approvedBy, notes: input.notes });
    else await (deps.rejectContentPacket ?? rejectContentPacket)({ packetId: entityId, approvalId: input.approvalId, approvedBy: input.approvedBy, notes: input.notes });
  } else if (type === "memory_update") {
    throw new Error("memory_update approvals require the memory approval form (slug, title, tier, trust)");
  } else {
    await (deps.applyApprovalAction ?? applyApprovalAction)({ approvalId: input.approvalId, action: approve ? "approve" : "reject", approvedBy: input.approvedBy, notes: input.notes });
  }

  const feedback = deps.recordFeedbackEvent ?? (Object.keys(deps).length ? undefined : recordFeedbackEvent);
  if (feedback) {
    await feedback({
      targetType: type,
      targetId: entityId,
      decision: input.action,
      actor: input.approvedBy,
      reason: input.notes,
      reasonCategory: !approve ? asReasonCategory(approval.metadata?.reasonCategory) ?? "other" : asReasonCategory(approval.metadata?.reasonCategory),
      outputType: asOptionalString(approval.metadata?.outputType),
      module: asOptionalString(approval.metadata?.module) ?? asOptionalString(approval.entityType),
      agentSlug: asOptionalString(approval.metadata?.agentSlug),
      sourceIds: asStringArray(approval.metadata?.sourceIds),
      memoryBankSlugs: asStringArray(approval.metadata?.memoryBankSlugs),
      dimensions: asDimensions(approval.metadata?.tasteDimensions),
      metadata: {
        approvalId: input.approvalId,
        approvalType: type,
        entityType: approval.entityType,
      },
    });
  }

  return { approvalType: type, entityId, action: input.action };
}
