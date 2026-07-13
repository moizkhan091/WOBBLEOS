import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { revisionCycles, revisionComponents, revisionComponentVersions } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { newId } from "@/lib/ids";
import { clearNodeCheckpoints, type GraphCheckpointStore } from "@/lib/graph-checkpoint";
import { planSelectiveRevision, type ArtifactComponent, type RevisionPlan } from "@/lib/domain/selective-revision";

/**
 * Selective artifact revision service (IO). Durable, founder-inspectable revision cycles over a composite
 * artifact's versioned COMPONENTS. When only some components fail QA, this reruns EXACTLY the failed ones +
 * their transitive dependents and PRESERVES every approved component + its evidence. Bound to a checkpointed
 * graph run, the real consumer (`driveSelectiveGraphRerun`) clears ONLY the rerun nodes' checkpoints so a
 * re-enqueued graph regenerates exactly those nodes and reuses every preserved node's cached output.
 */

const MODULE = "selective_revision";

export interface RevisionDeps {
  db?: Db;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  checkpointStore?: GraphCheckpointStore;
  now?: Date;
}
async function audit(deps: RevisionDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export interface RevisionComponentInput {
  key: string;
  kind: string;
  producedBy: string;
  dependsOn?: string[];
  version?: number;
  status?: "approved" | "failed" | "pending";
  evidence?: Record<string, unknown>;
}

export interface OpenRevisionInput {
  artifactKind: string;
  artifactRef: string;
  graphRunId?: string | null;
  triggeredBy: string;
  components: RevisionComponentInput[];
  /** Component keys that failed QA — the plan reruns these + their transitive dependents. */
  failedComponents: string[];
  companyId?: string | null;
  clientId?: string | null;
  createdBy?: string | null;
  /** Context needed to RE-ENQUEUE the artifact's producer bound to the SAME graphRunId (so the rerun reuses the
   *  preserved nodes). For content_graph: { contentTrackId, objective, requestedBy }. */
  reenqueue?: Record<string, unknown>;
  /**
   * Stable natural key for this revision ROUND — the idempotency backstop. When omitted it is derived from the
   * graphRunId (`<kind>:<graphRunId>:<triggeredBy>`), which is stable across a graph RETRY. For an artifact with
   * NO graph run (proposal) the caller MUST supply one built from the stable revision identity (workflow + task +
   * failed-stage set) so a reclaimed/duplicated handoff retry reuses the one open cycle instead of spawning more.
   */
  dedupeKey?: string;
}

function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

export interface RevisionCycleView {
  id: string;
  artifactKind: string;
  artifactRef: string;
  graphRunId: string | null;
  status: string;
  triggeredBy: string;
  failedComponents: string[];
  plan: RevisionPlan;
  /** Context to re-enqueue the producer bound to the same graphRunId (content_graph: track/objective/requestedBy). */
  reenqueue: Record<string, unknown> | null;
  components: Array<{ key: string; kind: string; producedBy: string; dependsOn: string[]; version: number; status: string }>;
}

/**
 * Open a selective revision cycle: persist the artifact's components, snapshot each (pre_revision), compute the
 * plan (rerun failed + transitive dependents, preserve the approved rest), and mark the rerun components
 * `rerun` at their NEXT version. Idempotent per (graphRunId, triggeredBy) — a replay returns the open cycle.
 */
export async function openRevisionCycle(input: OpenRevisionInput, deps: RevisionDeps = {}): Promise<RevisionCycleView> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();

  // Idempotency backstop: a stable natural key for this revision round (derived from the graphRunId for graph
  // artifacts, or supplied by the caller for graph-less ones). A duplicated/reclaimed handoff RETRY reuses the
  // one OPEN (planned) cycle for this key rather than spawning more; a partial unique index makes it concurrent-safe.
  const dedupeKey = input.dedupeKey ?? (input.graphRunId ? `${input.artifactKind}:${input.graphRunId}:${input.triggeredBy}` : null);
  const findOpen = async () => (dedupeKey
    ? (await db.select({ id: revisionCycles.id }).from(revisionCycles).where(and(eq(revisionCycles.dedupeKey, dedupeKey), eq(revisionCycles.status, "planned"))).orderBy(desc(revisionCycles.createdAt)).limit(1))[0]
    : undefined);
  const pre = await findOpen();
  if (pre) return (await getRevisionCycle(pre.id, deps))!;

  const components: ArtifactComponent[] = input.components.map((c) => ({ id: c.key, kind: c.kind, version: c.version ?? 1, status: c.status ?? "approved", producedBy: c.producedBy, dependsOn: c.dependsOn ?? [] }));
  const plan = planSelectiveRevision(components, input.failedComponents);
  const rerun = new Set(plan.rerun);
  const cycleId = newId("revcyc");

  try {
    await db.insert(revisionCycles).values({
      id: cycleId, artifactKind: input.artifactKind, artifactRef: input.artifactRef, graphRunId: input.graphRunId ?? null, dedupeKey,
      status: "planned", triggeredBy: input.triggeredBy, failedComponents: input.failedComponents, plan: plan as unknown as Record<string, unknown>,
      companyId: input.companyId ?? null, clientId: input.clientId ?? null, createdBy: input.createdBy ?? null,
      metadata: input.reenqueue ? { reenqueue: input.reenqueue } : {}, createdAt: now, updatedAt: now,
    } as typeof revisionCycles.$inferInsert);
  } catch (e) {
    // A CONCURRENT duplicate trigger won the race → reuse the one open cycle it created (no duplicate round).
    if (isUniqueViolation(e)) { const winner = await findOpen(); if (winner) return (await getRevisionCycle(winner.id, deps))!; }
    throw e;
  }

  for (const c of input.components) {
    const isRerun = rerun.has(c.key);
    const curVersion = c.version ?? 1;
    await db.insert(revisionComponents).values({
      id: newId("revcmp"), cycleId, componentKey: c.key, kind: c.kind, producedBy: c.producedBy, dependsOn: c.dependsOn ?? [],
      version: isRerun ? plan.nextVersions[c.key] ?? curVersion + 1 : curVersion, status: isRerun ? "rerun" : (c.status ?? "approved"),
      evidence: c.evidence ?? {}, createdAt: now, updatedAt: now,
    } as typeof revisionComponents.$inferInsert);
    // pre_revision snapshot captures the CURRENT (pre-rerun) version + status for rollback.
    await db.insert(revisionComponentVersions).values({
      id: newId("revver"), cycleId, componentKey: c.key, version: curVersion, status: c.status ?? "approved", evidence: c.evidence ?? {}, snapshotReason: "pre_revision", createdAt: now,
    } as typeof revisionComponentVersions.$inferInsert);
  }

  await audit(deps, { eventType: "revision.opened", module: MODULE, entityType: "revision_cycle", entityId: cycleId, actor: input.createdBy ?? "system", metadata: { artifactKind: input.artifactKind, artifactRef: input.artifactRef, rerun: plan.rerun, preserved: plan.preserved, specialists: plan.specialists } });
  return (await getRevisionCycle(cycleId, deps))!;
}

/**
 * REAL CONSUMER: for a cycle bound to a checkpointed graph run, clear ONLY the rerun nodes' checkpoints so a
 * re-enqueued graph regenerates exactly those nodes and REUSES every preserved node's cached output. Returns
 * the number of checkpoints cleared (the preserved nodes' checkpoints are untouched).
 */
export async function driveSelectiveGraphRerun(cycleId: string, deps: RevisionDeps = {}): Promise<{ cleared: number; rerun: string[]; preserved: string[] }> {
  const cycle = await getRevisionCycle(cycleId, deps);
  if (!cycle) throw new Error(`revision cycle '${cycleId}' not found`);
  if (!cycle.graphRunId) throw new Error(`revision cycle '${cycleId}' is not bound to a graph run`);
  const cleared = await clearNodeCheckpoints(cycle.graphRunId, cycle.plan.rerun, { store: deps.checkpointStore });
  await audit(deps, { eventType: "revision.graph_rerun_prepared", module: MODULE, entityType: "revision_cycle", entityId: cycleId, actor: "system", metadata: { graphRunId: cycle.graphRunId, cleared, rerun: cycle.plan.rerun, preserved: cycle.plan.preserved } });
  return { cleared, rerun: cycle.plan.rerun, preserved: cycle.plan.preserved };
}

/**
 * Mark a cycle's selective rerun as DISPATCHED (planned → reran). Called once the reran nodes' checkpoints are
 * cleared + the producer is re-enqueued, so this cycle no longer satisfies `openRevisionCycle`'s
 * "reuse an OPEN (planned) cycle" idempotency — a SUBSEQUENT revise of the same run opens a FRESH cycle with the
 * current plan instead of reusing the stale first-round plan.
 */
export async function markRevisionReran(cycleId: string, deps: RevisionDeps = {}): Promise<boolean> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const cur = (await db.select().from(revisionCycles).where(eq(revisionCycles.id, cycleId)).limit(1))[0];
  if (!cur || cur.status !== "planned") return false;
  await db.update(revisionCycles).set({ status: "reran", updatedAt: now }).where(eq(revisionCycles.id, cycleId));
  return true;
}

/** Apply the completed revision: each rerun component → the given outcome (approved/failed) at its next version;
 *  preserved components untouched. Snapshots the post-apply state. */
export async function applyRevisionOutcome(cycleId: string, outcomes: Array<{ key: string; status: "approved" | "failed"; evidence?: Record<string, unknown> }>, deps: RevisionDeps = {}): Promise<RevisionCycleView | null> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const cycle = (await db.select().from(revisionCycles).where(eq(revisionCycles.id, cycleId)).limit(1))[0];
  if (!cycle || (cycle.status !== "planned" && cycle.status !== "reran")) return null;
  const byKey = new Map(outcomes.map((o) => [o.key, o]));
  const comps = await db.select().from(revisionComponents).where(eq(revisionComponents.cycleId, cycleId));
  for (const c of comps) {
    if (c.status !== "rerun") continue; // preserved components are untouched
    const outcome = byKey.get(c.componentKey);
    const status = outcome?.status ?? "approved";
    const evidence = outcome?.evidence ?? (c.evidence as Record<string, unknown>);
    await db.update(revisionComponents).set({ status, evidence, updatedAt: now }).where(eq(revisionComponents.id, c.id));
    await db.insert(revisionComponentVersions).values({ id: newId("revver"), cycleId, componentKey: c.componentKey, version: c.version, status, evidence, snapshotReason: "post_apply", createdAt: now } as typeof revisionComponentVersions.$inferInsert);
  }
  await db.update(revisionCycles).set({ status: "applied", appliedAt: now, updatedAt: now }).where(eq(revisionCycles.id, cycleId));
  await audit(deps, { eventType: "revision.applied", module: MODULE, entityType: "revision_cycle", entityId: cycleId, actor: "system", metadata: { outcomes: outcomes.map((o) => `${o.key}:${o.status}`) } });
  return getRevisionCycle(cycleId, deps);
}

/** Roll a cycle back to its pre-revision snapshot: every component's version + status + evidence is restored. */
export async function rollbackRevisionCycle(cycleId: string, deps: RevisionDeps = {}): Promise<boolean> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const cycle = (await db.select().from(revisionCycles).where(eq(revisionCycles.id, cycleId)).limit(1))[0];
  if (!cycle || cycle.status === "rolled_back") return false;
  const snapshots = await db.select().from(revisionComponentVersions).where(and(eq(revisionComponentVersions.cycleId, cycleId), eq(revisionComponentVersions.snapshotReason, "pre_revision")));
  for (const s of snapshots) {
    await db.update(revisionComponents).set({ version: s.version, status: s.status, evidence: s.evidence as Record<string, unknown>, updatedAt: now }).where(and(eq(revisionComponents.cycleId, cycleId), eq(revisionComponents.componentKey, s.componentKey)));
  }
  await db.update(revisionCycles).set({ status: "rolled_back", rolledBackAt: now, updatedAt: now }).where(eq(revisionCycles.id, cycleId));
  await audit(deps, { eventType: "revision.rolled_back", module: MODULE, entityType: "revision_cycle", entityId: cycleId, actor: "system", metadata: { restored: snapshots.length } });
  return true;
}

export async function getRevisionCycle(cycleId: string, deps: RevisionDeps = {}): Promise<RevisionCycleView | null> {
  const db = deps.db ?? getDb();
  const cycle = (await db.select().from(revisionCycles).where(eq(revisionCycles.id, cycleId)).limit(1))[0];
  if (!cycle) return null;
  const comps = await db.select().from(revisionComponents).where(eq(revisionComponents.cycleId, cycleId));
  const reenqueue = ((cycle.metadata ?? {}) as { reenqueue?: Record<string, unknown> }).reenqueue ?? null;
  return {
    id: cycle.id, artifactKind: cycle.artifactKind, artifactRef: cycle.artifactRef, graphRunId: cycle.graphRunId, status: cycle.status,
    triggeredBy: cycle.triggeredBy, failedComponents: (cycle.failedComponents ?? []) as string[], plan: cycle.plan as unknown as RevisionPlan, reenqueue,
    components: comps.map((c) => ({ key: c.componentKey, kind: c.kind, producedBy: c.producedBy, dependsOn: (c.dependsOn ?? []) as string[], version: c.version, status: c.status })).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

export async function listRevisionCycles(filter: { artifactKind?: string; status?: string; clientId?: string; limit?: number } = {}, deps: RevisionDeps = {}): Promise<RevisionCycleView[]> {
  const db = deps.db ?? getDb();
  const conds = [];
  if (filter.artifactKind) conds.push(eq(revisionCycles.artifactKind, filter.artifactKind));
  if (filter.status) conds.push(eq(revisionCycles.status, filter.status));
  if (filter.clientId) conds.push(eq(revisionCycles.clientId, filter.clientId));
  const base = db.select({ id: revisionCycles.id }).from(revisionCycles);
  const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(revisionCycles.createdAt)).limit(Math.min(filter.limit ?? 50, 200));
  const views: RevisionCycleView[] = [];
  for (const r of rows) { const v = await getRevisionCycle(r.id, deps); if (v) views.push(v); }
  return views;
}
