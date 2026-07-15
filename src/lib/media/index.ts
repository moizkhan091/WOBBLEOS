import { and, desc, eq, or, isNull, lt, sql } from "drizzle-orm";
import { mediaJobs } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { newId } from "@/lib/ids";
import { recordProviderRun, type RecordProviderRunInput } from "@/lib/provider-runs";
import { falMediaProvider } from "@/lib/media/fal-provider";
import {
  MEDIA_KINDS,
  validateMediaRequest,
  canRetryMediaJob,
  falConfigured,
  type MediaKind,
  type MediaJobStatus,
} from "@/lib/domain/media";

export const MEDIA_MODULE = "media";

// ---- Providers ----
export interface MediaGenerationResult { outputRefs: string[]; actualCostCents?: number }
export interface MediaProvider {
  slug: string;
  configured(): boolean;
  /** Generate media. MUST throw (not fabricate) when it cannot produce a real result. */
  generate(input: { kind: MediaKind; prompt: string; params: Record<string, unknown> }): Promise<MediaGenerationResult>;
}

/** CI/dev-only provider — deterministic, no external call. Produces a stable synthetic ref so the pipeline can be
 *  proven end-to-end without any credential. NEVER used in production (it fabricates a ref, honestly labeled). */
export const deterministicMediaProvider: MediaProvider = {
  slug: "deterministic",
  configured: () => true,
  generate: async ({ kind, prompt }) => {
    const hash = [...`${kind}:${prompt}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1_000_000_007, 7);
    return { outputRefs: [`synthetic://media/${kind}/${hash}`], actualCostCents: 0 };
  },
};

// Real fal.ai provider (WOB-AUD-014) — the live queue→poll→result→download adapter (imported above).
// `configured()` is true only when FAL_KEY/FAL_API_KEY is set; an unconfigured environment keeps a job
// truthfully BLOCKED (never a fabricated success).
export { falMediaProvider };

/** The PRODUCTION registry contains ONLY real providers. `deterministicMediaProvider` is intentionally NOT here — it
 *  fabricates a synthetic ref and is available ONLY via explicit injection (tests/proofs), so a founder request can
 *  never get a synthetic "success" in production; an unknown provider is truthfully BLOCKED. */
export function defaultProviderRegistry(): Record<string, MediaProvider> {
  return { fal: falMediaProvider };
}

// ---- Store ----
export interface MediaJobRow {
  id: string; kind: MediaKind; prompt: string; provider: string; params: Record<string, unknown>;
  status: MediaJobStatus; attempts: number; maxAttempts: number; estimatedCostCents: number; budgetCapCents: number;
  actualCostCents: number | null; outputRefs: string[]; error: string | null; scopeType: string;
  companyId: string | null; clientId: string | null; projectId: string | null; requestedBy: string;
  leaseOwner: string | null; leaseExpiresAt: Date | null; dedupeKey: string | null; metadata: Record<string, unknown>;
  createdAt: Date; updatedAt: Date; startedAt: Date | null; completedAt: Date | null;
}

export interface MediaStore {
  insert(row: MediaJobRow): Promise<boolean>; // false on dedupe conflict
  getById(id: string): Promise<MediaJobRow | null>;
  getByDedupeKey(key: string): Promise<MediaJobRow | null>;
  list(q: { status?: string; limit: number }): Promise<MediaJobRow[]>;
  update(id: string, fields: Partial<MediaJobRow>): Promise<void>;
  /** Terminal write guarded by lease ownership (compare-and-set): only applies if THIS worker still owns the lease.
   *  Returns false if the lease was lost (reclaimed + re-claimed by another worker) → prevents a double-write/spend. */
  updateOwned(id: string, leaseOwner: string, fields: Partial<MediaJobRow>): Promise<boolean>;
  /** Atomically claim the oldest queued job (or an expired-lease generating job) → generating + lease. */
  claim(leaseOwner: string, leaseExpiresAt: Date, now: Date): Promise<MediaJobRow | null>;
  /** Reclaim generating jobs whose lease has expired → back to queued. Returns count. */
  reclaimStale(now: Date): Promise<number>;
}

export interface MediaDeps {
  store?: MediaStore;
  recordAudit?: (i: AuditEventInput) => Promise<void>;
  recordProviderRun?: (i: RecordProviderRunInput) => Promise<unknown>;
  providers?: Record<string, MediaProvider>;
  now?: Date;
}

async function audit(deps: MediaDeps, i: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((x: AuditEventInput) => writeAuditEvent(x)))(i);
}

export interface CreateMediaJobInput {
  kind: string; prompt: string; provider?: string; params?: Record<string, unknown>;
  estimatedCostCents: number; budgetCapCents: number; maxAttempts?: number;
  scopeType?: string; companyId?: string; clientId?: string; projectId?: string; requestedBy: string; dedupeKey?: string;
}

export interface CreateMediaJobResult { ok: boolean; error?: string; errors?: string[]; job?: MediaJobRow; deduped?: boolean }

/** Create a queued media job after validation + budget-cap enforcement. Idempotent via dedupeKey. */
export async function createMediaJob(input: CreateMediaJobInput, deps: MediaDeps = {}): Promise<CreateMediaJobResult> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const validation = validateMediaRequest({ kind: input.kind, prompt: input.prompt, estimatedCostCents: input.estimatedCostCents, budgetCapCents: input.budgetCapCents });
  if (!validation.ok) return { ok: false, error: "validation failed", errors: validation.errors };

  if (input.dedupeKey) {
    const existing = await store.getByDedupeKey(input.dedupeKey);
    if (existing) return { ok: true, job: existing, deduped: true };
  }
  const row: MediaJobRow = {
    id: newId("mediajob"), kind: input.kind as MediaKind, prompt: input.prompt.trim(), provider: input.provider ?? "fal",
    params: input.params ?? {}, status: "queued", attempts: 0, maxAttempts: input.maxAttempts ?? 3,
    estimatedCostCents: input.estimatedCostCents, budgetCapCents: input.budgetCapCents, actualCostCents: null,
    outputRefs: [], error: null, scopeType: input.scopeType ?? "company", companyId: input.companyId ?? null,
    clientId: input.clientId ?? null, projectId: input.projectId ?? null, requestedBy: input.requestedBy,
    leaseOwner: null, leaseExpiresAt: null, dedupeKey: input.dedupeKey ?? null, metadata: {}, createdAt: now, updatedAt: now, startedAt: null, completedAt: null,
  };
  const inserted = await store.insert(row);
  if (!inserted && input.dedupeKey) { const w = await store.getByDedupeKey(input.dedupeKey); if (w) return { ok: true, job: w, deduped: true }; }
  await audit(deps, { eventType: "media.job_created", module: MEDIA_MODULE, entityType: "media_job", entityId: row.id, actor: input.requestedBy, metadata: { kind: row.kind, provider: row.provider, estimatedCostCents: row.estimatedCostCents } });
  return { ok: true, job: row };
}

/**
 * Worker step: claim ONE due job (lease) and run it. Resolves the provider; an UNCONFIGURED provider → BLOCKED
 * (truthful, never a fake success). A provider error → retry (attempts < maxAttempts → back to queued) or FAILED
 * (dead-letter). Success → succeeded + outputRefs. Lease-based so a crash mid-generation is reclaimable.
 */
export async function dispatchOneMediaJob(deps: MediaDeps & { leaseOwner?: string; leaseMs?: number } = {}): Promise<{ claimed: boolean; jobId?: string; status?: MediaJobStatus }> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const providers = deps.providers ?? defaultProviderRegistry();
  const leaseOwner = deps.leaseOwner ?? `media-worker-${now.getTime()}`;
  const leaseMs = deps.leaseMs ?? 5 * 60_000;
  const job = await store.claim(leaseOwner, new Date(now.getTime() + leaseMs), now);
  if (!job) return { claimed: false };

  const provider = providers[job.provider];
  if (!provider || !provider.configured()) {
    await store.updateOwned(job.id, leaseOwner, { status: "blocked", error: `media provider '${job.provider}' is not configured — generation blocked (no credentials)`, leaseOwner: null, leaseExpiresAt: null, updatedAt: now });
    await audit(deps, { eventType: "media.job_blocked", module: MEDIA_MODULE, entityType: "media_job", entityId: job.id, actor: "media_worker", metadata: { provider: job.provider } });
    return { claimed: true, jobId: job.id, status: "blocked" };
  }
  const attemptStart = Date.now();
  // Durable paid-attempt / cost record (WOB-AUD-014) — written on BOTH success and failure.
  const recordRun = (fields: Omit<RecordProviderRunInput, "provider" | "operation" | "requestMetadata">) =>
    (deps.recordProviderRun ?? recordProviderRun)({
      provider: provider.slug,
      operation: `media.${job.kind}`,
      requestMetadata: { mediaJobId: job.id, kind: job.kind, provider: provider.slug },
      estimatedCostCents: job.estimatedCostCents,
      latencyMs: Date.now() - attemptStart,
      ...fields,
    }).catch(() => {});
  try {
    const result = await provider.generate({ kind: job.kind, prompt: job.prompt, params: job.params });
    // Compare-and-set: only write the terminal result if THIS worker still owns the lease (a slow generation that
    // outlived its lease could have been reclaimed + re-claimed — never double-write / double-spend).
    const owned = await store.updateOwned(job.id, leaseOwner, { status: "succeeded", outputRefs: result.outputRefs, actualCostCents: result.actualCostCents ?? job.estimatedCostCents, error: null, leaseOwner: null, leaseExpiresAt: null, completedAt: now, updatedAt: now });
    if (!owned) return { claimed: true, jobId: job.id, status: "generating" }; // lost the lease → another worker owns it
    await recordRun({ status: "success", actualCostCents: result.actualCostCents ?? job.estimatedCostCents, responseMetadata: { outputs: result.outputRefs.length } });
    await audit(deps, { eventType: "media.job_succeeded", module: MEDIA_MODULE, entityType: "media_job", entityId: job.id, actor: "media_worker", metadata: { provider: provider.slug, outputs: result.outputRefs.length } });
    return { claimed: true, jobId: job.id, status: "succeeded" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "generation failed";
    await recordRun({ status: "failed", error: msg });
    const attempts = job.attempts + 1;
    const willRetry = canRetryMediaJob({ status: "failed", attempts, maxAttempts: job.maxAttempts });
    if (willRetry) {
      await store.updateOwned(job.id, leaseOwner, { status: "queued", attempts, error: msg, leaseOwner: null, leaseExpiresAt: null, updatedAt: now });
      await audit(deps, { eventType: "media.job_retry", module: MEDIA_MODULE, entityType: "media_job", entityId: job.id, actor: "media_worker", metadata: { attempts, maxAttempts: job.maxAttempts, error: msg } });
      return { claimed: true, jobId: job.id, status: "queued" };
    }
    await store.updateOwned(job.id, leaseOwner, { status: "failed", attempts, error: msg, leaseOwner: null, leaseExpiresAt: null, completedAt: now, updatedAt: now });
    await audit(deps, { eventType: "media.job_failed", module: MEDIA_MODULE, entityType: "media_job", entityId: job.id, actor: "media_worker", metadata: { attempts, error: msg } });
    return { claimed: true, jobId: job.id, status: "failed" };
  }
}

/** Worker tick: dispatch up to `limit` due jobs, and reclaim stale (crashed) leases first. */
export async function dispatchMediaJobs(deps: MediaDeps & { limit?: number; leaseOwner?: string; leaseMs?: number } = {}): Promise<{ dispatched: number; reclaimed: number; byStatus: Record<string, number> }> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const reclaimed = await store.reclaimStale(now);
  const byStatus: Record<string, number> = {};
  let dispatched = 0;
  const limit = deps.limit ?? 10;
  for (let i = 0; i < limit; i++) {
    const r = await dispatchOneMediaJob(deps);
    if (!r.claimed) break;
    dispatched++;
    if (r.status) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }
  return { dispatched, reclaimed, byStatus };
}

export async function cancelMediaJob(id: string, opts: { canceledBy: string }, deps: MediaDeps = {}): Promise<{ ok: boolean; error?: string }> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const job = await store.getById(id);
  if (!job) return { ok: false, error: "job not found" };
  if (job.status !== "queued" && job.status !== "generating" && job.status !== "blocked") return { ok: false, error: `cannot cancel a '${job.status}' job` };
  await store.update(id, { status: "canceled", leaseOwner: null, leaseExpiresAt: null, completedAt: now, updatedAt: now });
  await audit(deps, { eventType: "media.job_canceled", module: MEDIA_MODULE, entityType: "media_job", entityId: id, actor: opts.canceledBy, metadata: {} });
  return { ok: true };
}

/** Requeue a failed/blocked job (founder, or after a provider is configured). Resets the lease; keeps attempts. */
export async function retryMediaJob(id: string, opts: { retriedBy: string }, deps: MediaDeps = {}): Promise<{ ok: boolean; error?: string }> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const job = await store.getById(id);
  if (!job) return { ok: false, error: "job not found" };
  if (job.status !== "failed" && job.status !== "blocked") return { ok: false, error: `cannot retry a '${job.status}' job` };
  await store.update(id, { status: "queued", error: null, leaseOwner: null, leaseExpiresAt: null, completedAt: null, updatedAt: now });
  await audit(deps, { eventType: "media.job_requeued", module: MEDIA_MODULE, entityType: "media_job", entityId: id, actor: opts.retriedBy, metadata: { from: job.status } });
  return { ok: true };
}

export async function listMediaJobs(query: { status?: string; limit?: number } = {}, deps: MediaDeps = {}): Promise<MediaJobRow[]> {
  return (deps.store ?? defaultStore()).list({ status: query.status, limit: Math.min(Math.max(query.limit ?? 100, 1), 500) });
}
export async function getMediaJob(id: string, deps: MediaDeps = {}): Promise<MediaJobRow | null> {
  return (deps.store ?? defaultStore()).getById(id);
}

/** Founder-facing pipeline status — honest about what is built vs blocked. */
export function mediaPipelineStatus(): { pipelineBuilt: boolean; providerConfigured: boolean; provider: string; kinds: readonly string[]; note: string } {
  const configured = falConfigured();
  return {
    pipelineBuilt: true, // durable queue + worker + retries + recovery + UI are built
    providerConfigured: configured,
    provider: "fal",
    kinds: MEDIA_KINDS,
    note: configured
      ? "Pipeline built AND the live fal.ai adapter is wired (queue→poll→result→download to durable storage, with provider_runs cost records). FAL key present — real generation is enabled."
      : "Pipeline built (durable queue, worker, retries, recovery, UI) and the fal.ai adapter is wired. The live provider is BLOCKED until FAL_KEY is set; until then a submitted job is truthfully 'blocked', never faked.",
  };
}

export function defaultStore(db: Db = getDb()): MediaStore {
  return {
    async insert(row) {
      try { await db.insert(mediaJobs).values(row as never); return true; }
      catch (e) { if ((e as { code?: string })?.code === "23505") return false; throw e; }
    },
    async getById(id) { const r = await db.select().from(mediaJobs).where(eq(mediaJobs.id, id)).limit(1); return (r[0] as MediaJobRow) ?? null; },
    async getByDedupeKey(key) { const r = await db.select().from(mediaJobs).where(eq(mediaJobs.dedupeKey, key)).limit(1); return (r[0] as MediaJobRow) ?? null; },
    async list(q) {
      const base = db.select().from(mediaJobs);
      const rows = await (q.status ? base.where(eq(mediaJobs.status, q.status)) : base).orderBy(desc(mediaJobs.createdAt)).limit(q.limit);
      return rows as MediaJobRow[];
    },
    async update(id, fields) { await db.update(mediaJobs).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() } as never).where(eq(mediaJobs.id, id)); },
    async updateOwned(id, leaseOwner, fields) {
      const res = await db.update(mediaJobs).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() } as never).where(and(eq(mediaJobs.id, id), eq(mediaJobs.leaseOwner, leaseOwner))).returning({ id: mediaJobs.id });
      return (res as unknown[]).length > 0;
    },
    async claim(leaseOwner, leaseExpiresAt, now) {
      // Atomic claim: pick the oldest queued job (or a generating job whose lease expired) and lock it in one UPDATE.
      const claimed = await db.execute(sql`
        update media_jobs set status = 'generating', lease_owner = ${leaseOwner}, lease_expires_at = ${leaseExpiresAt.toISOString()}, started_at = coalesce(started_at, ${now.toISOString()}), updated_at = ${now.toISOString()}
        where id = (
          select id from media_jobs
          where status = 'queued' or (status = 'generating' and lease_expires_at < ${now.toISOString()})
          order by created_at asc limit 1 for update skip locked
        ) returning id`);
      const rows = (claimed as unknown as { rows?: Array<{ id: string }> }).rows ?? (claimed as unknown as Array<{ id: string }>);
      const cid = rows?.[0]?.id;
      if (!cid) return null;
      return await this.getById(cid);
    },
    async reclaimStale(now) {
      const res = await db.update(mediaJobs)
        .set({ status: "queued", leaseOwner: null, leaseExpiresAt: null, updatedAt: now })
        .where(and(eq(mediaJobs.status, "generating"), or(isNull(mediaJobs.leaseExpiresAt), lt(mediaJobs.leaseExpiresAt, now))))
        .returning({ id: mediaJobs.id });
      return (res as unknown[]).length;
    },
  };
}
