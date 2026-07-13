import { and, desc, eq, gte } from "drizzle-orm";
import { contextAssertions, contextRetrievals, contextRetrievalFailures, contextSources } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { newId } from "@/lib/ids";
import {
  approveAssertion,
  contextCoverage,
  detectContextContradictions,
  trustedContext,
  type ContextAssertion,
  type ContextContradiction,
  type ContextScope,
  type RawContextSource,
} from "@/lib/domain/context-os";

/**
 * Context OS service (IO). The durable onboarding → trusted-context pipeline: immutable raw intake →
 * extracted (PENDING) assertions → founder approval → trusted context → scope-isolated, telemetered
 * retrieval. Raw is NEVER trusted directly; a generator only ever sees APPROVED assertions in its own scope.
 */

const CONTEXT_MODULE = "context_os";

export interface ContextOsDeps {
  db?: Db;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

async function audit(deps: ContextOsDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

function rowToSource(r: typeof contextSources.$inferSelect): RawContextSource {
  return { id: r.id, kind: r.kind, content: r.content, scope: { type: r.scopeType as ContextScope["type"], id: r.scopeId }, importedAt: r.createdAt };
}
function rowToAssertion(r: typeof contextAssertions.$inferSelect): ContextAssertion {
  return { id: r.id, sourceId: r.sourceId, statement: r.statement, entities: r.entities, scope: { type: r.scopeType as ContextScope["type"], id: r.scopeId }, classification: r.classification, trust: Number(r.trust), status: r.status as ContextAssertion["status"], version: r.version, supersedes: r.supersedes };
}

// -------------------------------------------------- 1. immutable raw intake
export async function recordContextSource(
  input: { kind: string; content: string; scope: ContextScope; classification?: string; importedBy?: string; metadata?: Record<string, unknown> },
  deps: ContextOsDeps = {},
): Promise<RawContextSource> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const row = { id: newId("ctxsrc"), kind: input.kind, content: input.content, scopeType: input.scope.type, scopeId: input.scope.id, classification: input.classification ?? "internal", importedBy: input.importedBy ?? null, metadata: input.metadata ?? {}, createdAt: now, updatedAt: now };
  await db.insert(contextSources).values(row as typeof contextSources.$inferInsert);
  await audit(deps, { eventType: "context.source_recorded", module: CONTEXT_MODULE, entityType: "context_source", entityId: row.id, actor: input.importedBy ?? "system", metadata: { kind: input.kind, scope: `${input.scope.type}:${input.scope.id}` } });
  return rowToSource(row as typeof contextSources.$inferSelect);
}

// -------------------------------------------------- 2. extraction → PENDING assertions (never trusted)
export interface AssertionDraft { statement: string; entities: string[]; classification?: string; trust?: number }
export async function extractAssertions(sourceId: string, drafts: AssertionDraft[], deps: ContextOsDeps = {}): Promise<ContextAssertion[]> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const src = (await db.select().from(contextSources).where(eq(contextSources.id, sourceId)).limit(1))[0];
  if (!src) throw new Error(`context source '${sourceId}' not found`);
  const out: ContextAssertion[] = [];
  for (const d of drafts) {
    const row = { id: newId("ctxasrt"), sourceId, statement: d.statement, entities: d.entities, scopeType: src.scopeType, scopeId: src.scopeId, classification: d.classification ?? src.classification, trust: String(d.trust ?? 0.5), status: "extracted", version: 1, supersedes: null, extractedByAgent: "context_extractor", approvedBy: null, approvedAt: null, metadata: {}, createdAt: now, updatedAt: now };
    await db.insert(contextAssertions).values(row as typeof contextAssertions.$inferInsert);
    out.push(rowToAssertion(row as typeof contextAssertions.$inferSelect));
  }
  await audit(deps, { eventType: "context.assertions_extracted", module: CONTEXT_MODULE, entityType: "context_source", entityId: sourceId, actor: "context_extractor", metadata: { count: out.length } });
  return out;
}

// -------------------------------------------------- 3. approval (the ONLY path from raw to trusted)
export async function approveContextAssertion(id: string, approvedBy: string, opts: { supersedesId?: string } = {}, deps: ContextOsDeps = {}): Promise<ContextAssertion | null> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const cur = (await db.select().from(contextAssertions).where(eq(contextAssertions.id, id)).limit(1))[0];
  if (!cur || cur.status !== "extracted") return null; // only extracted → approved
  const prior = opts.supersedesId ? (await db.select().from(contextAssertions).where(eq(contextAssertions.id, opts.supersedesId)).limit(1))[0] : undefined;
  const { approved, superseded } = approveAssertion(rowToAssertion(cur), { supersedes: prior ? rowToAssertion(prior) : undefined });
  await db.update(contextAssertions).set({ status: "approved", version: approved.version, supersedes: approved.supersedes, approvedBy, approvedAt: now, updatedAt: now }).where(eq(contextAssertions.id, id));
  if (superseded) await db.update(contextAssertions).set({ status: "superseded", updatedAt: now }).where(eq(contextAssertions.id, superseded.id));
  await audit(deps, { eventType: "context.assertion_approved", module: CONTEXT_MODULE, entityType: "context_assertion", entityId: id, actor: approvedBy, metadata: { supersedes: approved.supersedes, version: approved.version } });
  return { ...approved, approvedBy } as ContextAssertion;
}

export async function rejectContextAssertion(id: string, rejectedBy: string, deps: ContextOsDeps = {}): Promise<boolean> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const cur = (await db.select().from(contextAssertions).where(eq(contextAssertions.id, id)).limit(1))[0];
  if (!cur || cur.status !== "extracted") return false;
  await db.update(contextAssertions).set({ status: "rejected", updatedAt: now }).where(eq(contextAssertions.id, id));
  await audit(deps, { eventType: "context.assertion_rejected", module: CONTEXT_MODULE, entityType: "context_assertion", entityId: id, actor: rejectedBy, metadata: {} });
  return true;
}

// -------------------------------------------------- 4. scope-isolated, telemetered retrieval
async function loadScopeAssertions(db: Db, scope: ContextScope): Promise<ContextAssertion[]> {
  const rows = await db.select().from(contextAssertions).where(and(eq(contextAssertions.scopeType, scope.type), eq(contextAssertions.scopeId, scope.id)));
  return rows.map(rowToAssertion);
}

/** Retrieve the trusted (approved-in-scope) context for a generator + RECORD the retrieval evidence. */
export async function retrieveTrustedContext(scope: ContextScope, task: string, opts: { agentSlug?: string; limit?: number } = {}, deps: ContextOsDeps = {}): Promise<{ assertions: ContextAssertion[]; retrievalId: string }> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const trusted = trustedContext(await loadScopeAssertions(db, scope), scope).slice(0, Math.min(Math.max(opts.limit ?? 100, 1), 500));
  const retrievalId = newId("ctxret");
  await db.insert(contextRetrievals).values({ id: retrievalId, scopeType: scope.type, scopeId: scope.id, task, agentSlug: opts.agentSlug ?? null, assertionIds: trusted.map((a) => a.id), createdAt: now } as typeof contextRetrievals.$inferInsert);
  return { assertions: trusted, retrievalId };
}

/**
 * Production generator helper: retrieve the trusted (approved-in-scope) context for a scope + format it as a
 * grounding block for an LLM prompt (or null when none), recording the retrieval as evidence (telemetry). Used
 * by every real generator (content / proposal / paid-audit / …) so a generator only ever sees APPROVED,
 * scope-isolated facts — never raw/unapproved, never another tenant's.
 */
export async function retrieveTrustedContextBlock(
  scope: ContextScope,
  task: string,
  opts: { agentSlug?: string; label?: string; limit?: number; correlationId?: string } = {},
  deps: ContextOsDeps = {},
): Promise<string | null> {
  try {
    const { assertions } = await retrieveTrustedContext(scope, task, { agentSlug: opts.agentSlug, limit: opts.limit }, deps);
    if (!assertions.length) return null;
    const label = opts.label ?? `APPROVED ${scope.type.toUpperCase()} CONTEXT`;
    return `${label} (trusted, founder-approved facts — treat as ground truth, never contradict):\n` + assertions.map((a) => `- ${a.statement}`).join("\n");
  } catch (error) {
    // FAIL-OPEN, BUT NEVER SILENT: the generator proceeds WITHOUT grounding (never fabricated), and the failure is
    // recorded EXPLICITLY so a sustained Context OS fault is founder-visible (Command Centre health), not invisible.
    await recordContextRetrievalFailure({ scope, task, generator: opts.agentSlug ?? null, correlationId: opts.correlationId ?? null, error }, deps);
    return null;
  }
}

const RETRYABLE_ERROR_CATEGORIES = new Set(["db_unavailable", "timeout"]);
/** Classify a retrieval error into a stable category + whether a retry could plausibly succeed. */
export function classifyRetrievalError(error: unknown): { category: string; retryable: boolean } {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const code = (error as { code?: string } | undefined)?.code;
  let category = "unknown";
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || /connect|econnrefused|connection|terminat|shutdown|too many clients/.test(msg)) category = "db_unavailable";
  else if (/timeout|timed out/.test(msg)) category = "timeout";
  else if (/column|relation|syntax|operator|type|invalid input/.test(msg)) category = "query_error";
  return { category, retryable: RETRYABLE_ERROR_CATEGORIES.has(category) };
}

/** Record a trusted-context retrieval FAILURE (best-effort — never throws). Downstream: the generator proceeded ungrounded. */
export async function recordContextRetrievalFailure(
  input: { scope: ContextScope; task: string; generator?: string | null; correlationId?: string | null; error: unknown; downstreamOutcome?: string },
  deps: ContextOsDeps = {},
): Promise<void> {
  try {
    const db = deps.db ?? getDb();
    const now = deps.now ?? new Date();
    const { category, retryable } = classifyRetrievalError(input.error);
    await db.insert(contextRetrievalFailures).values({
      id: newId("ctxfail"), generator: input.generator ?? null, task: input.task, scopeType: input.scope.type, scopeId: input.scope.id,
      errorCategory: category, errorMessage: (input.error instanceof Error ? input.error.message : String(input.error)).slice(0, 500),
      correlationId: input.correlationId ?? null, retryable, downstreamOutcome: input.downstreamOutcome ?? "proceeded_ungrounded", createdAt: now,
    } as typeof contextRetrievalFailures.$inferInsert);
    await audit(deps, { eventType: "context.retrieval_failed", module: CONTEXT_MODULE, entityType: "context_scope", entityId: `${input.scope.type}:${input.scope.id}`, actor: input.generator ?? "system", metadata: { task: input.task, errorCategory: category, retryable } });
  } catch { /* telemetry is best-effort — a failure to record a failure must never fail the generator */ }
}

/** Founder health view: recent trusted-context retrieval FAILURES (a sustained fault surfaces here, never silently). */
export async function listContextRetrievalFailures(filter: { scopeType?: string; scopeId?: string; sinceMs?: number; limit?: number } = {}, deps: ContextOsDeps = {}): Promise<{ failures: Array<typeof contextRetrievalFailures.$inferSelect>; total: number }> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const conds = [];
  if (filter.scopeType) conds.push(eq(contextRetrievalFailures.scopeType, filter.scopeType));
  if (filter.scopeId) conds.push(eq(contextRetrievalFailures.scopeId, filter.scopeId));
  if (filter.sinceMs) conds.push(gte(contextRetrievalFailures.createdAt, new Date(now.getTime() - filter.sinceMs)));
  const base = db.select().from(contextRetrievalFailures);
  const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(contextRetrievalFailures.createdAt)).limit(Math.min(filter.limit ?? 100, 500));
  return { failures: rows, total: rows.length };
}

// -------------------------------------------------- 5. contradictions + coverage (computed on durable data)
export async function listContextContradictions(scope: ContextScope, deps: ContextOsDeps = {}): Promise<ContextContradiction[]> {
  const db = deps.db ?? getDb();
  return detectContextContradictions(await loadScopeAssertions(db, scope));
}
export async function contextCoverageForScope(scope: ContextScope, deps: ContextOsDeps = {}): Promise<number> {
  const db = deps.db ?? getDb();
  const sources = (await db.select().from(contextSources).where(and(eq(contextSources.scopeType, scope.type), eq(contextSources.scopeId, scope.id)))).map(rowToSource);
  return contextCoverage(sources, await loadScopeAssertions(db, scope));
}

// -------------------------------------------------- 6. export + deletion (retention/right-to-be-forgotten)
export async function exportContextScope(scope: ContextScope, deps: ContextOsDeps = {}): Promise<{ sources: RawContextSource[]; assertions: ContextAssertion[] }> {
  const db = deps.db ?? getDb();
  const sources = (await db.select().from(contextSources).where(and(eq(contextSources.scopeType, scope.type), eq(contextSources.scopeId, scope.id))).orderBy(desc(contextSources.createdAt))).map(rowToSource);
  return { sources, assertions: await loadScopeAssertions(db, scope) };
}
export async function deleteContextScope(scope: ContextScope, deps: ContextOsDeps = {}): Promise<{ deletedSources: number; deletedAssertions: number }> {
  const db = deps.db ?? getDb();
  const a = await db.delete(contextAssertions).where(and(eq(contextAssertions.scopeType, scope.type), eq(contextAssertions.scopeId, scope.id))).returning({ id: contextAssertions.id });
  const s = await db.delete(contextSources).where(and(eq(contextSources.scopeType, scope.type), eq(contextSources.scopeId, scope.id))).returning({ id: contextSources.id });
  await db.delete(contextRetrievals).where(and(eq(contextRetrievals.scopeType, scope.type), eq(contextRetrievals.scopeId, scope.id)));
  await audit(deps, { eventType: "context.scope_deleted", module: CONTEXT_MODULE, entityType: "context_scope", entityId: `${scope.type}:${scope.id}`, actor: "founder", metadata: { deletedSources: s.length, deletedAssertions: a.length } });
  return { deletedSources: s.length, deletedAssertions: a.length };
}
