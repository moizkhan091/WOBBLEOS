import { eq } from "drizzle-orm";
import { settings } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { applyApprovalAction, createApproval, getApproval, type ApprovalRow, type ApprovalStore } from "@/lib/approvals";
import {
  DEFAULT_MODEL_CATALOG,
  modelCatalogSchema,
  modelUpgradeProposalSchema,
  validateModelSwap,
  type ModelCatalog,
  type ModelUpgradeProposalInput,
} from "@/lib/domain/model-registry";
import { modelRoleMapSchema, type ModelRoleConfig, type ModelRoleMap } from "@/lib/domain/providers";

/**
 * Model Registry service — the safe, central place to read the model catalog, read /
 * change which model each role uses, and (approval-gated) PROPOSE upgrades. Every swap
 * is validated against the catalog and written to the audit log. Nothing is force-swapped.
 */

export interface ModelRegistryStore {
  getModelCatalog(): Promise<ModelCatalog>;
  getModelRoleMap(): Promise<ModelRoleMap>;
  setModelRoleMap(map: ModelRoleMap): Promise<void>;
}

export interface ModelRegistryDeps {
  store?: ModelRegistryStore;
  approvalStore?: ApprovalStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  /** Load the full approval row for validation (injectable for tests). */
  loadApproval?: (id: string) => Promise<{ approvalType: string; entityId: string; status: string; metadata: Record<string, unknown> } | null>;
  /** Atomic flip+effect (transactional outbox). Injectable for tests; defaults to the DB implementation. */
  claimAndRecordEffect?: (input: { approvalId: string; approvedBy: string; effect: { approvalId: string; effectType: string; entityType: string; entityId: string; payload?: Record<string, unknown>; actor?: string | null } }) => Promise<{ claimed: boolean; effectId: string | null }>;
  now?: Date;
}

/** Idempotent downstream of approving a model upgrade: set the role→model mapping. Reconciler-safe. */
export async function applyApprovedModelRole(role: string, opts: { modelId: string; approvedBy: string }, deps: ModelRegistryDeps = {}): Promise<SetModelForRoleResult> {
  return setModelForRole({ role, modelId: opts.modelId, changedBy: opts.approvedBy, reason: `Approved model upgrade` }, deps);
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

export async function getModelCatalog(deps: ModelRegistryDeps = {}): Promise<ModelCatalog> {
  const store = deps.store ?? defaultStore();
  return store.getModelCatalog();
}

export async function getModelRoleMap(deps: ModelRegistryDeps = {}): Promise<ModelRoleMap> {
  const store = deps.store ?? defaultStore();
  return store.getModelRoleMap();
}

export interface SetModelForRoleInput {
  role: string;
  modelId: string;
  changedBy: string;
  reason?: string;
}

export interface SetModelForRoleResult {
  role: string;
  config: ModelRoleConfig;
  previousModelId: string | null;
}

/**
 * Directly change the model a role uses — after validating it against the catalog.
 * Throws with a clear reason if the model is unknown, deprecated, or incompatible.
 * Records a model_role.changed audit event.
 */
export async function setModelForRole(input: SetModelForRoleInput, deps: ModelRegistryDeps = {}): Promise<SetModelForRoleResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const [catalog, roleMap] = await Promise.all([store.getModelCatalog(), store.getModelRoleMap()]);
  const validation = validateModelSwap({ role: input.role, modelId: input.modelId, catalog });
  if (!validation.ok || !validation.entry) {
    throw new Error(validation.reason);
  }

  const previous = roleMap[input.role] ?? null;
  const nextConfig: ModelRoleConfig = { provider: validation.entry.provider, model: validation.entry.id };
  const nextMap: ModelRoleMap = { ...roleMap, [input.role]: nextConfig };
  await store.setModelRoleMap(nextMap);

  await recordAudit({
    eventType: "model_role.changed",
    module: "settings",
    entityType: "model_role",
    entityId: input.role,
    actor: input.changedBy,
    metadata: {
      role: input.role,
      fromModel: previous?.model ?? null,
      toModel: nextConfig.model,
      provider: nextConfig.provider,
      reason: input.reason ?? null,
    },
  });

  return { role: input.role, config: nextConfig, previousModelId: previous?.model ?? null };
}

export interface ProposeModelSwapResult {
  approval: ApprovalRow;
  role: string;
  fromModelId: string | null;
  toModelId: string;
}

/**
 * Propose a model upgrade for a role (e.g. from the Model Scout agent or Ask WOBBLE).
 * Validates compatibility, then creates an approval so a founder decides — never applied
 * automatically. This is the "offered, not force-fed" upgrade path.
 */
export async function proposeModelSwap(input: ModelUpgradeProposalInput, deps: ModelRegistryDeps = {}): Promise<ProposeModelSwapResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const proposal = modelUpgradeProposalSchema.parse(input);

  const [catalog, roleMap] = await Promise.all([store.getModelCatalog(), store.getModelRoleMap()]);
  const validation = validateModelSwap({ role: proposal.role, modelId: proposal.toModelId, catalog });
  if (!validation.ok) {
    throw new Error(validation.reason);
  }
  const currentModel = roleMap[proposal.role]?.model ?? proposal.fromModelId ?? null;

  const approval = await createApproval(
    {
      approvalType: "model_upgrade",
      entityType: "model_role",
      entityId: proposal.role,
      riskLevel: "normal",
      requestedBy: proposal.proposedBy,
      notes: `Proposed model upgrade for '${proposal.role}': ${currentModel ?? "(unset)"} -> ${proposal.toModelId}. ${proposal.rationale}`,
      metadata: {
        role: proposal.role,
        fromModel: currentModel,
        toModel: proposal.toModelId,
        rationale: proposal.rationale,
        confidence: proposal.confidence,
        evidence: proposal.evidence,
        proposedBy: proposal.proposedBy,
      },
    },
    { store: deps.approvalStore, recordAudit, now },
  );

  return { approval, role: proposal.role, fromModelId: currentModel, toModelId: proposal.toModelId };
}

export interface ApplyModelSwapApprovalInput {
  approvalId: string;
  role: string;
  toModelId: string;
  approvedBy: string;
  notes?: string;
}

/** Approve a proposed model upgrade and apply it. Validates that the approval actually
 * corresponds to THIS role+model (so it can't rubber-stamp an unrelated approval) and that
 * the swap is catalog-valid, BEFORE consuming the approval. */
export async function applyModelSwapApproval(input: ApplyModelSwapApprovalInput, deps: ModelRegistryDeps = {}): Promise<SetModelForRoleResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  // 1) The approval must be a model_upgrade for exactly this role + target model.
  const loadApproval = deps.loadApproval ?? ((id: string) => getApproval(id).then((a) => a as { approvalType: string; entityId: string; status: string; metadata: Record<string, unknown> } | null));
  const approval = await loadApproval(input.approvalId);
  if (!approval) throw new Error(`approval '${input.approvalId}' not found`);
  if (approval.approvalType !== "model_upgrade") throw new Error(`approval '${input.approvalId}' is not a model upgrade`);
  if (approval.entityId !== input.role) throw new Error(`approval '${input.approvalId}' is for role '${approval.entityId}', not '${input.role}'`);
  const proposedModel = (approval.metadata as { toModel?: unknown }).toModel;
  if (typeof proposedModel === "string" && proposedModel !== input.toModelId) {
    throw new Error(`approval '${input.approvalId}' proposed '${proposedModel}', not '${input.toModelId}'`);
  }

  // 2) Validate the swap against the catalog BEFORE consuming the approval (so a bad swap
  //    never leaves an approval marked-approved with no corresponding change).
  const catalog = await store.getModelCatalog();
  const validation = validateModelSwap({ role: input.role, modelId: input.toModelId, catalog });
  if (!validation.ok) throw new Error(validation.reason);

  // Transactional outbox: atomically flip the approval + record the model-apply effect (validation
  // already ran above, so a bad swap never records an effect). Then apply inline (idempotent).
  const claimFn = deps.claimAndRecordEffect ?? (async (i: { approvalId: string; approvedBy: string; effect: { approvalId: string; effectType: string; entityType: string; entityId: string; payload?: Record<string, unknown>; actor?: string | null } }) => (await import("@/lib/approval-effects")).claimApprovalAndRecordEffect(i, { now }));
  const { claimed, effectId } = await claimFn({ approvalId: input.approvalId, approvedBy: input.approvedBy, effect: { approvalId: input.approvalId, effectType: "model.apply", entityType: "model_role", entityId: input.role, payload: { modelId: input.toModelId }, actor: input.approvedBy } });
  // Idempotent either way: apply the role mapping (a re-run just re-sets the same model). If we lost
  // the claim, the winner already flipped the approval — the mapping is still (re-)applied safely.
  await recordAudit({ eventType: "approval.approve", module: "approvals", entityType: "approval", entityId: input.approvalId, actor: input.approvedBy, metadata: { approvalType: "model_upgrade", toStatus: "approved", claimed } });
  const result = await applyApprovedModelRole(input.role, { modelId: input.toModelId, approvedBy: input.approvedBy }, deps);
  if (claimed && effectId && !deps.claimAndRecordEffect) {
    try {
      const { reconcileApprovalEffects } = await import("@/lib/approval-effects");
      const { APPROVAL_EFFECT_APPLIERS } = await import("@/lib/approval-effects/appliers");
      await reconcileApprovalEffects(APPROVAL_EFFECT_APPLIERS, { onlyId: effectId, now });
    } catch { /* safety net */ }
  }
  return result;
}

function catalogFromValue(value: unknown): ModelCatalog {
  const models = (value as { models?: unknown } | null)?.models;
  const parsed = modelCatalogSchema.safeParse(models);
  return parsed.success ? parsed.data : DEFAULT_MODEL_CATALOG;
}

export function defaultStore(db: Db = getDb()): ModelRegistryStore {
  return {
    async getModelCatalog() {
      const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "model_catalog")).limit(1);
      return rows[0] ? catalogFromValue(rows[0].value) : DEFAULT_MODEL_CATALOG;
    },
    async getModelRoleMap() {
      const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "model_roles")).limit(1);
      return modelRoleMapSchema.parse(rows[0]?.value ?? {});
    },
    async setModelRoleMap(map) {
      const value = modelRoleMapSchema.parse(map) as unknown as Record<string, unknown>;
      // Upsert so the very first swap on a fresh DB (no model_roles row yet) is not silently lost.
      await db
        .insert(settings)
        .values({ id: "setting_model_roles", key: "model_roles", scope: "global", value, description: "Model-role routing for provider adapter calls." })
        .onConflictDoUpdate({ target: settings.id, set: { value, updatedAt: new Date() } });
    },
  };
}
