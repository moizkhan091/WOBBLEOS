import { and, desc, eq } from "drizzle-orm";
import { promptSkills } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { createApproval, applyApprovalAction, type ApprovalRow, type ApprovalStore } from "@/lib/approvals";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  buildPromptSkillRow,
  createPromptSkillSchema,
  nextVersion,
  pickLatestApproved,
  proposeSkillVersionSchema,
  type CreatePromptSkillInput,
  type ProposeSkillVersionInput,
  type PromptSkillRow,
  type PromptSkillStatus,
} from "@/lib/domain/prompt-skills";

export type { PromptSkillRow };

export interface ListSkillsQuery {
  module?: string;
  slug?: string;
  status?: PromptSkillStatus;
  limit?: number;
}

export const DEFAULT_SKILL_LIMIT = 50;
export const MAX_SKILL_LIMIT = 200;

export function clampSkillLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_SKILL_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SKILL_LIMIT);
}

export interface PromptSkillStore {
  insert(row: PromptSkillRow): Promise<void>;
  getById(id: string): Promise<PromptSkillRow | null>;
  listBySlug(slug: string): Promise<PromptSkillRow[]>;
  updateFields(id: string, fields: Partial<PromptSkillRow>): Promise<void>;
  list(query: Required<Pick<ListSkillsQuery, "limit">> & Omit<ListSkillsQuery, "limit">): Promise<PromptSkillRow[]>;
}

export interface PromptSkillDeps {
  store?: PromptSkillStore;
  approvalStore?: ApprovalStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  /** Atomic flip+effect (transactional outbox). Injectable for tests; defaults to the DB implementation. */
  claimAndRecordEffect?: (input: { approvalId: string; approvedBy: string; effect: { approvalId: string; effectType: string; entityType: string; entityId: string; payload?: Record<string, unknown>; actor?: string | null } }) => Promise<{ claimed: boolean; effectId: string | null }>;
  now?: Date;
}

/**
 * Idempotent downstream of approving a skill version: archive older approved siblings + activate this
 * one. Safe to run more than once — called inline by approveSkillVersion AND by the reconciler.
 */
export async function activateApprovedSkillVersion(skillId: string, opts: { approvedBy: string }, deps: PromptSkillDeps = {}): Promise<void> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const skill = await store.getById(skillId);
  if (!skill) return;
  const siblings = await store.listBySlug(skill.slug);
  for (const s of siblings) {
    if (s.id !== skill.id && s.status === "approved") {
      await store.updateFields(s.id, { status: "archived", archivedAt: now, updatedAt: now });
    }
  }
  await store.updateFields(skill.id, { status: "approved", approvedBy: opts.approvedBy, approvedAt: now, archivedAt: null, updatedAt: now });
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

export interface CreatePromptSkillResult {
  skill: PromptSkillRow;
  approval: ApprovalRow;
}

/** Create a brand-new skill (version 1, draft) and open an approval for it. */
export async function createPromptSkill(
  input: CreatePromptSkillInput,
  deps: PromptSkillDeps = {},
): Promise<CreatePromptSkillResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const parsed = createPromptSkillSchema.parse(input);
  const skill = buildPromptSkillRow(parsed, { now, version: 1, status: "draft" });
  await store.insert(skill);

  await recordAudit({
    eventType: "skill.created",
    module: "prompt_skill_registry",
    entityType: "prompt_skill",
    entityId: skill.id,
    actor: parsed.requestedBy ?? undefined,
    metadata: { slug: skill.slug, module: skill.module, version: skill.version },
  });

  const approval = await createApproval(
    {
      approvalType: "skill",
      entityType: "prompt_skill",
      entityId: skill.id,
      riskLevel: "normal",
      requestedBy: parsed.requestedBy ?? undefined,
      notes: `Review new skill: ${skill.slug} v${skill.version}`,
      metadata: { slug: skill.slug, module: skill.module, version: skill.version },
    },
    { store: deps.approvalStore, recordAudit, now },
  );

  return { skill, approval };
}

export interface ProposeSkillVersionResult {
  skill: PromptSkillRow;
  approval: ApprovalRow;
  previousVersion: number;
}

/**
 * Propose a NEW version of an existing skill (founder feedback / improvement).
 * Creates a new draft row (version+1) carrying prior fields + the patch, and
 * opens a "skill_update" approval. Nothing changes what workers load until the
 * new version is approved.
 */
export async function proposeSkillVersion(
  skillId: string,
  input: ProposeSkillVersionInput,
  deps: PromptSkillDeps = {},
): Promise<ProposeSkillVersionResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const parsed = proposeSkillVersionSchema.parse(input);
  const base = await getExisting(store, skillId);
  const siblings = await store.listBySlug(base.slug);
  const version = nextVersion(siblings);

  const draft = buildPromptSkillRow(
    {
      slug: base.slug,
      name: parsed.name ?? base.name,
      module: base.module,
      trigger: parsed.trigger ?? base.trigger,
      goal: parsed.goal ?? base.goal,
      promptBody: parsed.promptBody,
      rules: parsed.rules ?? base.rules,
      referencePaths: parsed.referencePaths ?? base.referencePaths,
    },
    { now, version, status: "draft" },
  );
  await store.insert(draft);

  await recordAudit({
    eventType: "skill.version_proposed",
    module: "prompt_skill_registry",
    entityType: "prompt_skill",
    entityId: draft.id,
    actor: parsed.requestedBy ?? undefined,
    metadata: { slug: draft.slug, version: draft.version, previousVersion: base.version },
  });

  const approval = await createApproval(
    {
      approvalType: "skill_update",
      entityType: "prompt_skill",
      entityId: draft.id,
      riskLevel: "normal",
      requestedBy: parsed.requestedBy ?? undefined,
      notes: `Review skill update: ${draft.slug} v${draft.version}`,
      metadata: { slug: draft.slug, version: draft.version },
    },
    { store: deps.approvalStore, recordAudit, now },
  );

  return { skill: draft, approval, previousVersion: base.version };
}

export interface SkillActionInput {
  skillId: string;
  approvalId: string;
  approvedBy: string;
  notes?: string;
}

/**
 * Approve a skill version. Applies the approval action, marks this row approved,
 * and archives any older approved version of the same slug so exactly one
 * version is live (the loader always reads the latest approved).
 */
export async function approveSkillVersion(input: SkillActionInput, deps: PromptSkillDeps = {}): Promise<PromptSkillRow> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const skill = await getExisting(store, input.skillId);

  // Transactional outbox: atomically flip the approval + record the skill-activation effect.
  const claimFn = deps.claimAndRecordEffect ?? (async (i: { approvalId: string; approvedBy: string; effect: { approvalId: string; effectType: string; entityType: string; entityId: string; payload?: Record<string, unknown>; actor?: string | null } }) => (await import("@/lib/approval-effects")).claimApprovalAndRecordEffect(i, { now }));
  const { claimed, effectId } = await claimFn({ approvalId: input.approvalId, approvedBy: input.approvedBy, effect: { approvalId: input.approvalId, effectType: "skill.activate", entityType: "prompt_skill", entityId: skill.id, actor: input.approvedBy } });
  if (!claimed) return (await store.getById(skill.id)) ?? skill;

  await recordAudit({ eventType: "approval.approve", module: "approvals", entityType: "approval", entityId: input.approvalId, actor: input.approvedBy, metadata: { approvalType: "skill", toStatus: "approved" } });
  // Inline fast-path (idempotent); scheduler reconciler is the crash safety net.
  await activateApprovedSkillVersion(skill.id, { approvedBy: input.approvedBy }, { store, now });
  if (effectId && !deps.claimAndRecordEffect) {
    try {
      const { reconcileApprovalEffects } = await import("@/lib/approval-effects");
      const { APPROVAL_EFFECT_APPLIERS } = await import("@/lib/approval-effects/appliers");
      await reconcileApprovalEffects(APPROVAL_EFFECT_APPLIERS, { onlyId: effectId, now });
    } catch { /* safety net */ }
  }

  await recordAudit({
    eventType: "skill.approved",
    module: "prompt_skill_registry",
    entityType: "prompt_skill",
    entityId: skill.id,
    actor: input.approvedBy,
    metadata: { slug: skill.slug, version: skill.version, approvalId: input.approvalId },
  });

  return { ...skill, status: "approved", approvedBy: input.approvedBy, approvedAt: now, archivedAt: null, updatedAt: now };
}

export async function rejectSkillVersion(input: SkillActionInput, deps: PromptSkillDeps = {}): Promise<PromptSkillRow> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();

  const skill = await getExisting(store, input.skillId);

  await applyApprovalAction(
    { approvalId: input.approvalId, action: "reject", approvedBy: input.approvedBy, notes: input.notes },
    { store: deps.approvalStore, recordAudit, now },
  );

  const fields: Partial<PromptSkillRow> = { status: "archived", archivedAt: now, updatedAt: now };
  await store.updateFields(skill.id, fields);

  await recordAudit({
    eventType: "skill.rejected",
    module: "prompt_skill_registry",
    entityType: "prompt_skill",
    entityId: skill.id,
    actor: input.approvedBy,
    metadata: { slug: skill.slug, version: skill.version, approvalId: input.approvalId },
  });

  return { ...skill, ...fields };
}

/**
 * Worker context loader: return the latest APPROVED version of a skill by slug,
 * or null if none is approved. Draft/archived versions are excluded. Workers
 * call this instead of hardcoding a prompt.
 */
export async function loadApprovedSkill(slug: string, deps: PromptSkillDeps = {}): Promise<PromptSkillRow | null> {
  const store = deps.store ?? defaultStore();
  const rows = await store.listBySlug(slug);
  return pickLatestApproved(rows);
}

export async function listPromptSkills(query: ListSkillsQuery = {}, deps: PromptSkillDeps = {}): Promise<PromptSkillRow[]> {
  const store = deps.store ?? defaultStore();
  return store.list({ ...query, limit: clampSkillLimit(query.limit) });
}

async function getExisting(store: PromptSkillStore, skillId: string): Promise<PromptSkillRow> {
  if (!skillId || !skillId.trim()) throw new Error("skillId is required");
  const row = await store.getById(skillId);
  if (!row) throw new Error(`prompt skill '${skillId}' not found`);
  return row;
}

export function defaultStore(db: Db = getDb()): PromptSkillStore {
  return {
    async insert(row) {
      await db.insert(promptSkills).values(row);
    },
    async getById(id) {
      const rows = await db.select().from(promptSkills).where(eq(promptSkills.id, id)).limit(1);
      return (rows[0] as PromptSkillRow | undefined) ?? null;
    },
    async listBySlug(slug) {
      return db
        .select()
        .from(promptSkills)
        .where(eq(promptSkills.slug, slug))
        .orderBy(desc(promptSkills.version)) as Promise<PromptSkillRow[]>;
    },
    async updateFields(id, fields) {
      await db.update(promptSkills).set(fields).where(eq(promptSkills.id, id));
    },
    async list(query) {
      const conditions = [];
      if (query.module) conditions.push(eq(promptSkills.module, query.module));
      if (query.slug) conditions.push(eq(promptSkills.slug, query.slug));
      if (query.status) conditions.push(eq(promptSkills.status, query.status));
      const where = conditions.length ? and(...conditions) : undefined;
      return db
        .select()
        .from(promptSkills)
        .where(where)
        .orderBy(desc(promptSkills.createdAt))
        .limit(query.limit) as Promise<PromptSkillRow[]>;
    },
  };
}
