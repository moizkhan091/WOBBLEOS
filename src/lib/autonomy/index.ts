import { and, eq } from "drizzle-orm";
import { autonomyPolicies } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { newId } from "@/lib/ids";
import { resolveAutonomyLevel, type AutonomyAction, type AutonomyDecision, type AutonomyLevel, type AutonomyPolicy, type RiskTier } from "@/lib/domain/autonomy";

/**
 * Earned autonomy service (IO). Durable, founder-approved, versioned, revocable/expirable per-action policies.
 * `resolveActionAutonomy` loads the ACTIVE, in-effect policies for an action's category and resolves the
 * effective level through the pure engine (hard safety caps apply). There is no global switch.
 */

const AUTONOMY_MODULE = "autonomy";

export interface AutonomyDeps {
  db?: Db;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}
async function audit(deps: AutonomyDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export interface CreateAutonomyPolicyInput {
  category: string;
  grantedLevel: AutonomyLevel;
  approvedBy: string;
  actor?: string | null;
  companyId?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  maxRiskLevel?: RiskTier;
  maxFinancialCents?: number;
  requiresQaPass?: boolean;
  successThreshold?: number;
  historicalSampleSize?: number;
  effectiveFrom?: Date;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
}

function rowToPolicy(r: typeof autonomyPolicies.$inferSelect): AutonomyPolicy {
  return {
    id: r.id,
    category: r.category,
    grantedLevel: r.grantedLevel as AutonomyLevel,
    status: r.status === "active" ? "active" : "revoked",
    actor: r.actor,
    companyId: r.companyId,
    clientId: r.clientId,
    projectId: r.projectId,
    maxRiskLevel: (r.maxRiskLevel as RiskTier | null) ?? undefined,
    maxFinancialCents: r.maxFinancialCents ?? undefined,
    requiresQaPass: r.requiresQaPass,
  };
}

export async function createAutonomyPolicy(input: CreateAutonomyPolicyInput, deps: AutonomyDeps = {}): Promise<AutonomyPolicy & { id: string }> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const id = newId("autopol");
  await db.insert(autonomyPolicies).values({
    id, category: input.category, grantedLevel: input.grantedLevel, status: "active",
    actor: input.actor ?? null, companyId: input.companyId ?? null, clientId: input.clientId ?? null, projectId: input.projectId ?? null,
    maxRiskLevel: input.maxRiskLevel ?? null, maxFinancialCents: input.maxFinancialCents ?? null, requiresQaPass: input.requiresQaPass ?? false,
    successThreshold: input.successThreshold !== undefined ? String(input.successThreshold) : null, historicalSampleSize: input.historicalSampleSize ?? null,
    approvedBy: input.approvedBy, effectiveFrom: input.effectiveFrom ?? now, expiresAt: input.expiresAt ?? null, revokedAt: null, version: 1,
    metadata: input.metadata ?? {}, createdAt: now, updatedAt: now,
  } as typeof autonomyPolicies.$inferInsert);
  await audit(deps, { eventType: "autonomy.policy_created", module: AUTONOMY_MODULE, entityType: "autonomy_policy", entityId: id, actor: input.approvedBy, metadata: { category: input.category, grantedLevel: input.grantedLevel } });
  const row = (await db.select().from(autonomyPolicies).where(eq(autonomyPolicies.id, id)).limit(1))[0];
  return { ...rowToPolicy(row), id };
}

export async function listAutonomyPolicies(filter: { category?: string; status?: string } = {}, deps: AutonomyDeps = {}): Promise<Array<AutonomyPolicy & { approvedBy: string; expiresAt: Date | null; effectiveFrom: Date }>> {
  const db = deps.db ?? getDb();
  const conds = [];
  if (filter.category) conds.push(eq(autonomyPolicies.category, filter.category));
  if (filter.status) conds.push(eq(autonomyPolicies.status, filter.status));
  const base = db.select().from(autonomyPolicies);
  const rows = await (conds.length ? base.where(and(...conds)) : base);
  return rows.map((r) => ({ ...rowToPolicy(r), approvedBy: r.approvedBy, expiresAt: r.expiresAt, effectiveFrom: r.effectiveFrom }));
}

export async function revokeAutonomyPolicy(id: string, revokedBy: string, deps: AutonomyDeps = {}): Promise<boolean> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const cur = (await db.select().from(autonomyPolicies).where(eq(autonomyPolicies.id, id)).limit(1))[0];
  if (!cur || cur.status !== "active") return false;
  await db.update(autonomyPolicies).set({ status: "revoked", revokedAt: now, updatedAt: now }).where(eq(autonomyPolicies.id, id));
  await audit(deps, { eventType: "autonomy.policy_revoked", module: AUTONOMY_MODULE, entityType: "autonomy_policy", entityId: id, actor: revokedBy, metadata: { category: cur.category } });
  return true;
}

/**
 * Resolve the effective autonomy level for an action from the durable policies: only ACTIVE policies that are
 * in effect (effectiveFrom ≤ now < expiresAt) participate; the pure engine applies matching + hard safety caps.
 */
export async function resolveActionAutonomy(action: AutonomyAction, deps: AutonomyDeps = {}): Promise<AutonomyDecision> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const rows = await db.select().from(autonomyPolicies).where(and(eq(autonomyPolicies.category, action.category), eq(autonomyPolicies.status, "active")));
  const inEffect = rows.filter((r) => r.effectiveFrom.getTime() <= now.getTime() && (!r.expiresAt || r.expiresAt.getTime() > now.getTime()));
  return resolveAutonomyLevel(action, inEffect.map(rowToPolicy));
}

/** May this action run FULLY autonomously (no founder in the loop) right now? */
export async function mayActAutonomously(action: AutonomyAction, deps: AutonomyDeps = {}): Promise<boolean> {
  return (await resolveActionAutonomy(action, deps)).level === "autonomous";
}
