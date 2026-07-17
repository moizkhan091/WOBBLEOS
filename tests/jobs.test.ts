import { describe, expect, it } from "vitest";
import { buildJobRow, evaluateJobFailure, type JobRow } from "@/lib/domain/jobs";
import { enqueueJob, processNextJob, clampJobLimit, type JobStore, type JobAttemptRow } from "@/lib/jobs";
import type { AuditEventInput } from "@/lib/domain/audit";

const now = new Date("2026-06-29T12:00:00.000Z");

describe("buildJobRow", () => {
  it("creates a pending job with defaults", () => {
    const row = buildJobRow({ queue: "general", type: "test.echo", payload: { a: 1 } }, { id: "job_fixed", now });
    expect(row).toMatchObject({
      id: "job_fixed",
      queue: "general",
      type: "test.echo",
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      priority: 0,
      payload: { a: 1 },
    });
  });

  it("rejects missing queue/type", () => {
    expect(() => buildJobRow({ queue: "", type: "x" })).toThrowError();
    expect(() => buildJobRow({ queue: "q", type: " " })).toThrowError();
  });
});

describe("evaluateJobFailure", () => {
  it("retries with exponential backoff while attempts remain", () => {
    const d1 = evaluateJobFailure({ attempts: 1, maxAttempts: 3, now });
    expect(d1).toMatchObject({ willRetry: true, nextStatus: "pending", delayMs: 1000 });
    expect(d1.runAfter?.toISOString()).toBe(new Date(now.getTime() + 1000).toISOString());

    const d2 = evaluateJobFailure({ attempts: 2, maxAttempts: 3, now });
    expect(d2.delayMs).toBe(2000);
  });

  it("gives up (failed) once attempts reach maxAttempts", () => {
    const d = evaluateJobFailure({ attempts: 3, maxAttempts: 3, now });
    expect(d).toMatchObject({ willRetry: false, nextStatus: "failed", runAfter: null });
  });
});

// ---- fake store ----
function makeFakeStore(claimed: JobRow | null, existing: JobRow | null = null) {
  const calls = {
    insert: [] as JobRow[],
    complete: [] as { id: string; result: Record<string, unknown> }[],
    requeue: [] as { id: string; reason: string }[],
    markFailed: [] as { id: string; reason: string }[],
    attempts: [] as JobAttemptRow[],
  };
  const store: JobStore = {
    findActiveByIdempotencyKey: async () => existing,
    findByIdempotencyKeyAnyStatus: async () => existing,
    insert: async (r) => {
      calls.insert.push(r);
    },
    claimNext: async () => claimed,
    complete: async (id, result) => {
      calls.complete.push({ id, result });
    },
    requeue: async (id, _runAfter, _now, reason) => {
      calls.requeue.push({ id, reason });
    },
    markFailed: async (id, _now, reason) => {
      calls.markFailed.push({ id, reason });
    },
    recordAttempt: async (a) => {
      calls.attempts.push(a);
    },
    reclaimStalled: async () => 0,
  };
  return { store, calls };
}

function activeJob(overrides: Partial<JobRow> = {}): JobRow {
  return { ...buildJobRow({ queue: "general", type: "test.echo" }, { id: "job_1", now }), status: "active", attempts: 1, lockedAt: now, ...overrides };
}

describe("enqueueJob", () => {
  it("inserts a new job and writes an audit event", async () => {
    const { store, calls } = makeFakeStore(null, null);
    const audit: AuditEventInput[] = [];
    const res = await enqueueJob({ queue: "general", type: "test.echo" }, { store, recordAudit: async (i) => { audit.push(i); }, now });
    expect(res.deduped).toBe(false);
    expect(calls.insert).toHaveLength(1);
    expect(audit[0]).toMatchObject({ eventType: "job.enqueued", module: "jobs" });
  });

  it("dedupes when an active job shares the idempotency key", async () => {
    const existing = activeJob({ id: "job_existing" });
    const { store, calls } = makeFakeStore(null, existing);
    const res = await enqueueJob({ queue: "general", type: "test.echo", idempotencyKey: "k1" }, { store, recordAudit: async () => {}, now });
    expect(res.deduped).toBe(true);
    expect(res.job.id).toBe("job_existing");
    expect(calls.insert).toHaveLength(0);
  });
});

describe("processNextJob", () => {
  it("returns processed:false when the queue is empty", async () => {
    const { store } = makeFakeStore(null);
    const res = await processNextJob("general", {}, { store, recordAudit: async () => {}, now });
    expect(res.processed).toBe(false);
  });

  it("completes a job when its handler succeeds", async () => {
    const { store, calls } = makeFakeStore(activeJob());
    const audit: AuditEventInput[] = [];
    const res = await processNextJob(
      "general",
      { "test.echo": async () => ({ echoed: true }) },
      { store, recordAudit: async (i) => { audit.push(i); }, now },
    );
    expect(res).toMatchObject({ processed: true, jobId: "job_1", outcome: "completed" });
    expect(calls.complete[0]).toMatchObject({ id: "job_1", result: { echoed: true } });
    expect(calls.attempts[0].status).toBe("completed");
    expect(audit.some((a) => a.eventType === "job.completed")).toBe(true);
  });

  it("re-queues a job when the handler throws and retries remain", async () => {
    const { store, calls } = makeFakeStore(activeJob({ attempts: 1, maxAttempts: 3 }));
    const res = await processNextJob(
      "general",
      { "test.echo": async () => { throw new Error("boom"); } },
      { store, recordAudit: async () => {}, now },
    );
    expect(res.outcome).toBe("retry");
    expect(calls.requeue[0]).toMatchObject({ id: "job_1", reason: "boom" });
    expect(calls.markFailed).toHaveLength(0);
  });

  it("marks a job failed when retries are exhausted", async () => {
    const { store, calls } = makeFakeStore(activeJob({ attempts: 3, maxAttempts: 3 }));
    const res = await processNextJob(
      "general",
      { "test.echo": async () => { throw new Error("dead"); } },
      { store, recordAudit: async () => {}, now },
    );
    expect(res.outcome).toBe("failed");
    expect(calls.markFailed[0]).toMatchObject({ id: "job_1", reason: "dead" });
    expect(calls.requeue).toHaveLength(0);
  });

  it("fails a job whose type has no registered handler", async () => {
    const { store, calls } = makeFakeStore(activeJob({ type: "unknown.type", attempts: 3, maxAttempts: 3 }));
    const res = await processNextJob("general", {}, { store, recordAudit: async () => {}, now });
    expect(res.outcome).toBe("failed");
    expect(calls.markFailed[0].reason).toContain("no handler");
  });
});

describe("clampJobLimit", () => {
  it("defaults and clamps", () => {
    expect(clampJobLimit(undefined)).toBe(50);
    expect(clampJobLimit(0)).toBe(1);
    expect(clampJobLimit(9999)).toBe(200);
  });
});
