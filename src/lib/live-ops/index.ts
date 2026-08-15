import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { jobs } from "@/db/schema";
import { newId } from "@/lib/ids";

/**
 * What is running right now, so nothing gets generated twice.
 *
 * Every expensive button in the OS had the same shape: a React `busy` flag, held in component state,
 * for the life of one page. Refresh the tab and it is gone. Open a second tab and it never existed. So
 * "Generate questions" would show as available while a run was already in flight, and clicking it again
 * paid for the same eight model calls twice and wrote a second version nobody asked for.
 *
 * A UI flag can never be the guarantee here. Two tabs will always race, and the second one wins by
 * accident. The guarantee has to live where both tabs can see it, which is the database.
 *
 * Nothing new is stored to do this. The `jobs` table already carries the exact constraint required:
 *
 *     uniqueIndex("jobs_idempotency_live_idx").on(idempotencyKey).where(status in ('pending','active'))
 *
 * One live row per key, enforced by Postgres rather than by a check-then-insert that races. So a
 * synchronous operation claims a row for its duration, a second attempt fails the insert and is told
 * what is already running and since when, and `reclaimStalledJobs` (active for over five minutes) frees
 * anything left behind by a crash. No new table, no new reclaim logic, no second source of truth.
 */

export const LIVE_OPS_QUEUE = "live_operation";

/** Postgres unique_violation. The one error that means "somebody else already holds this key". */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === "23505") return true;
  const msg = error instanceof Error ? error.message.toLowerCase() : "";
  return msg.includes("unique") || msg.includes("duplicate key");
}

export interface OperationKey {
  /** What is being done, e.g. "qualify" or "questions". */
  operation: string;
  /** What it is being done to. */
  entityType: string;
  entityId: string;
}

/** The idempotency key. One live operation of a given kind per entity, which is exactly the rule. */
export function keyFor(k: OperationKey): string {
  return `${k.operation}:${k.entityType}:${k.entityId}`;
}

export interface BeginResult {
  started: boolean;
  /** The claim to release when the work finishes. Null when it did not start. */
  id: string | null;
  /** When the run already in flight began, so the UI can say how long it has been going. */
  since: Date | null;
  /** What to tell the founder. Empty when it started cleanly. */
  because: string;
}

function humanAge(since: Date, now: Date): string {
  const secs = Math.max(0, Math.round((now.getTime() - since.getTime()) / 1000));
  if (secs < 60) return `${secs} second${secs === 1 ? "" : "s"}`;
  const mins = Math.round(secs / 60);
  return `${mins} minute${mins === 1 ? "" : "s"}`;
}

/**
 * Claim the right to run this operation, or find out who already has it.
 *
 * Deliberately returns rather than throws when something is already running. This is not an error, it
 * is the correct answer to "start this again", and the caller should say so plainly.
 */
export async function beginOperation(k: OperationKey, opts: { label: string; module?: string; actor?: string; now?: Date }, db: Db = getDb()): Promise<BeginResult> {
  const now = opts.now ?? new Date();
  const key = keyFor(k);
  try {
    const [row] = await db
      .insert(jobs)
      .values({
        // `jobs.id` is a text primary key with no default, so an insert without one is rejected. The
        // first live proof of this guard "passed" twice because that rejection was being swallowed.
        id: newId("job"),
        queue: LIVE_OPS_QUEUE,
        type: k.operation,
        // active, not pending: this work is happening in the request that just claimed it, and a
        // pending row would invite a worker to pick it up and run it a second time.
        status: "active",
        idempotencyKey: key,
        linkedModule: opts.module ?? null,
        linkedEntityType: k.entityType,
        linkedEntityId: k.entityId,
        payload: { label: opts.label, actor: opts.actor ?? null },
        lockedAt: now,
        createdAt: now,
        updatedAt: now,
      } as never)
      .returning({ id: jobs.id });
    return { started: true, id: row.id, since: null, because: "" };
  } catch (error) {
    // ONLY a unique violation means "already running". Anything else means this guard is broken, and it
    // must be loud. An earlier version swallowed every error and reported success, so the very first
    // live proof showed two concurrent claims both starting and nobody noticed until the numbers were
    // read. A guard that silently does nothing is worse than no guard, because nothing reveals it.
    if (!isUniqueViolation(error)) throw error;
    const existing = await findLive(k, db);
    if (!existing) {
      // The key was taken and freed between the insert and this read. Nothing is running, so proceed.
      return { started: true, id: null, since: null, because: "" };
    }
    return {
      started: false,
      id: null,
      since: existing.startedAt,
      because: `${opts.label} is already running, started ${humanAge(existing.startedAt, now)} ago. Wait for it rather than starting a second one.`,
    };
  }
}

/** Release the claim. Always call this, including when the work failed, or the key stays locked. */
export async function endOperation(id: string | null, ok: boolean, db: Db = getDb()): Promise<void> {
  if (!id) return;
  const now = new Date();
  await db
    .update(jobs)
    .set(ok ? { status: "completed", completedAt: now, updatedAt: now } : { status: "failed", failedAt: now, updatedAt: now })
    .where(eq(jobs.id, id));
}

export interface LiveOperation {
  operation: string;
  entityType: string;
  entityId: string;
  label: string;
  startedAt: Date;
}

function rowToOperation(r: { type: string; linkedEntityType: string | null; linkedEntityId: string | null; payload: Record<string, unknown>; createdAt: Date }): LiveOperation {
  return {
    operation: r.type,
    entityType: r.linkedEntityType ?? "",
    entityId: r.linkedEntityId ?? "",
    label: typeof r.payload?.label === "string" ? r.payload.label : r.type,
    startedAt: r.createdAt,
  };
}

async function findLive(k: OperationKey, db: Db): Promise<LiveOperation | null> {
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.idempotencyKey, keyFor(k)), inArray(jobs.status, ["pending", "active"])))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  return rows[0] ? rowToOperation(rows[0]) : null;
}

/**
 * Everything currently running against one entity.
 *
 * This is what makes a refresh honest: the page asks what is in flight rather than remembering, so a
 * founder who reloads mid-run still sees "already running" instead of a button that invites a second one.
 *
 * Rows stuck active beyond the reclaim window are excluded. A crashed worker must not leave a button
 * disabled forever, and `reclaimStalledJobs` clears them on the next scheduler tick anyway.
 */
export const STALE_AFTER_MS = 5 * 60_000;

export async function liveOperationsFor(entityIds: string[], opts: { now?: Date } = {}, db: Db = getDb()): Promise<LiveOperation[]> {
  if (!entityIds.length) return [];
  const now = opts.now ?? new Date();
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.queue, LIVE_OPS_QUEUE), inArray(jobs.status, ["pending", "active"]), inArray(jobs.linkedEntityId, entityIds)))
    .orderBy(desc(jobs.createdAt))
    .limit(200);
  return rows
    .filter((r) => now.getTime() - r.createdAt.getTime() < STALE_AFTER_MS)
    .map(rowToOperation);
}

/**
 * Run something under a claim, releasing it whatever happens.
 *
 * The release has to be in a finally. An operation that throws and leaves its key held would lock a
 * founder out of retrying the very thing that just failed, which is worse than the double-run this is
 * here to prevent.
 */
export async function withOperation<T>(
  k: OperationKey,
  opts: { label: string; module?: string; actor?: string },
  run: () => Promise<T>,
  db: Db = getDb(),
): Promise<{ ok: true; value: T } | { ok: false; because: string; since: Date | null }> {
  const claim = await beginOperation(k, opts, db);
  if (!claim.started) return { ok: false, because: claim.because, since: claim.since };
  try {
    const value = await run();
    await endOperation(claim.id, true, db);
    return { ok: true, value };
  } catch (e) {
    await endOperation(claim.id, false, db);
    throw e;
  }
}

/** Kept so a caller can express the count without importing drizzle. */
export async function countLive(db: Db = getDb()): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(jobs).where(and(eq(jobs.queue, LIVE_OPS_QUEUE), inArray(jobs.status, ["pending", "active"])));
  return Number(row?.n ?? 0);
}
