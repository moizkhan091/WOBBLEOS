import type { ApprovalEffectApplier } from "@/lib/approval-effects";

/**
 * The registered, idempotent appliers for each approval effect type. Used by the reconciler (inline
 * fast-path in the approve* services + the scheduler safety net). Each applier MUST converge when run
 * more than once. New approval downstreams register their effect type here as they adopt the outbox.
 */
export const APPROVAL_EFFECT_APPLIERS: Record<string, ApprovalEffectApplier> = {
  "source.activate": async (effect) => {
    const { activateApprovedSource } = await import("@/lib/sources");
    await activateApprovedSource(effect.entityId, { trustLevel: String(effect.payload.trustLevel ?? "tier_3_monitored"), approvedBy: effect.actor ?? "system" });
  },
  "content.import": async (effect) => {
    const { activateApprovedContentPacket } = await import("@/lib/content");
    await activateApprovedContentPacket(effect.entityId, { approvedBy: effect.actor ?? "system" });
  },
  "skill.activate": async (effect) => {
    const { activateApprovedSkillVersion } = await import("@/lib/prompt-skills");
    await activateApprovedSkillVersion(effect.entityId, { approvedBy: effect.actor ?? "system" });
  },
  "model.apply": async (effect) => {
    const { applyApprovedModelRole } = await import("@/lib/model-registry");
    await applyApprovedModelRole(effect.entityId, { modelId: String(effect.payload.modelId ?? ""), approvedBy: effect.actor ?? "system" });
  },
};
