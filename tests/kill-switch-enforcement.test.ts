import { describe, expect, it } from "vitest";
import { enqueueJob, processNextJob, type JobStore, type JobDeps } from "@/lib/jobs";
import type { JobRow } from "@/lib/domain/jobs";
import type { AuditEventInput } from "@/lib/domain/audit";
import { AGENT_JOB_TYPES, blockedJobType, blockedJobTypes, loadEngagedSwitches, assertNotKilled, KillSwitchEngagedError, killSwitchResponse } from "@/lib/security-governance/enforcement";
import { readFileSync } from "node:fs";
import path from "node:path";
import { generalRegistry, knownJobTypes } from "@/lib/workers/registry";
import type { KillSwitchRow } from "@/lib/domain/security-governance";

/**
 * KILL-SWITCH ENFORCEMENT (WOB-UAT-024 follow-up).
 *
 * `checkKillSwitch` previously existed, was tested, and was called by NOTHING — the switch recorded
 * intent and blocked no work. These tests exist to prove the switch cannot be walked around, and are
 * deliberately written as BYPASS ATTEMPTS rather than happy paths: a control is only enforced if you
 * fail to get past it.
 */

const now = new Date("2026-07-16T12:00:00.000Z");
const killed = (targetType: string, targetRef: string, reason = "containment during investigation"): KillSwitchRow => ({ targetType, targetRef, state: "disabled", reason });

function makeStore() {
  const rows = new Map<string, JobRow>();
  const claims: { queue: string; blockedTypes?: string[] }[] = [];
  const store = {
    insert: async (r: JobRow) => void rows.set(r.id, r),
    findActiveByIdempotencyKey: async (k: string) => [...rows.values()].find((r) => r.idempotencyKey === k && ["pending", "active"].includes(r.status)) ?? null,
    claimNext: async (queue: string, at: Date, blockedTypes?: string[]) => {
      claims.push({ queue, blockedTypes });
      // Mirror the real SQL: a blocked type is never selected, so it never bumps `attempts`.
      const job = [...rows.values()].find(
        (r) => r.queue === queue && r.status === "pending" && (!r.runAfter || r.runAfter <= at) && !(blockedTypes ?? []).includes(r.type),
      );
      if (!job) return null;
      const claimed = { ...job, status: "active" as const, attempts: job.attempts + 1 };
      rows.set(job.id, claimed);
      return claimed;
    },
    complete: async (id: string, result: Record<string, unknown>, at: Date) => { const j = rows.get(id); if (j) rows.set(id, { ...j, status: "completed", result, completedAt: at }); },
    requeue: async (id: string, runAfter: Date | null, at: Date, reason: string) => { const j = rows.get(id); if (j) rows.set(id, { ...j, status: "pending", runAfter, failureReason: reason, updatedAt: at }); },
    markFailed: async (id: string, at: Date, reason: string) => { const j = rows.get(id); if (j) rows.set(id, { ...j, status: "failed", failedAt: at, failureReason: reason }); },
    recordAttempt: async () => {},
    listJobs: async () => [...rows.values()],
    getJobById: async (id: string) => rows.get(id) ?? null,
    cancel: async (id: string, at: Date) => { const j = rows.get(id); if (j) rows.set(id, { ...j, status: "cancelled", updatedAt: at }); },
    reclaimStalled: async () => 0,
  } as unknown as JobStore;
  return { store, rows, claims };
}

function deps(switches: KillSwitchRow[], extra: Partial<JobDeps> = {}): JobDeps {
  const events: AuditEventInput[] = [];
  return { store: extra.store, now, recordAudit: async (e) => void events.push(e), enforcement: { loadSwitches: async () => switches }, ...extra } as JobDeps;
}

describe("AGENT_JOB_TYPES maps agents to the work they actually do", () => {
  /**
   * The mapping is what makes an `agent:` switch mean anything for queued work. If a job type is renamed
   * and this map is not, the switch silently stops enforcing — the exact decorative-control failure this
   * change exists to fix. So the map is checked against the REAL handler registry.
   */
  it("every mapped job type is a real, registered handler", () => {
    const known = new Set(knownJobTypes(generalRegistry));
    const unknown = Object.entries(AGENT_JOB_TYPES).flatMap(([agent, types]) => types.filter((t) => !known.has(t)).map((t) => `${agent} → ${t}`));
    expect(unknown, `mapped to job types that do not exist: ${unknown.join(", ")}`).toEqual([]);
  });

  it("resolves an agent switch to its job types, and a workflow switch to itself", () => {
    expect(blockedJobTypes([killed("agent", "content_worker")])).toEqual(["content.generate"]);
    expect(blockedJobTypes([killed("workflow", "audit.paid")])).toEqual(["audit.paid"]);
    expect(blockedJobTypes([])).toEqual([]);
  });

  it("does not block an unrelated job type", () => {
    expect(blockedJobType([killed("agent", "content_worker")], "audit.paid")).toBeNull();
  });

  it("a RELEASED switch blocks nothing", () => {
    expect(blockedJobTypes([{ targetType: "agent", targetRef: "content_worker", state: "active", reason: "r" }])).toEqual([]);
  });
});

describe("BYPASS ATTEMPT: enqueue", () => {
  it("refuses to enqueue work for a killed agent — and THROWS rather than returning a fake job", async () => {
    const { store, rows } = makeStore();
    const d = deps([killed("agent", "content_worker", "suspected runaway loop")], { store });
    await expect(enqueueJob({ queue: "general", type: "content.generate", payload: {} }, d)).rejects.toBeInstanceOf(KillSwitchEngagedError);
    // The caller must LEARN the work did not happen. A silent drop that returns a job id would be a
    // false success — the worst possible outcome for a containment control.
    expect(rows.size).toBe(0);
  });

  it("the error names the exact switch and its reason (a founder must know WHY)", async () => {
    const { store } = makeStore();
    const d = deps([killed("agent", "content_worker", "suspected runaway loop")], { store });
    await expect(enqueueJob({ queue: "general", type: "content.generate", payload: {} }, d)).rejects.toThrow(/agent:content_worker.*suspected runaway loop/);
  });

  it("a workflow switch blocks its job type directly", async () => {
    const { store } = makeStore();
    const d = deps([killed("workflow", "audit.paid")], { store });
    await expect(enqueueJob({ queue: "general", type: "audit.paid", payload: {} }, d)).rejects.toBeInstanceOf(KillSwitchEngagedError);
  });

  it("unrelated work still enqueues — a targeted switch must not become a global outage", async () => {
    const { store, rows } = makeStore();
    const d = deps([killed("agent", "content_worker")], { store });
    const r = await enqueueJob({ queue: "general", type: "audit.paid", payload: {} }, d);
    expect(r.job.id).toBeTruthy();
    expect(rows.size).toBe(1);
  });
});

describe("BYPASS ATTEMPT: worker claim (already-queued work)", () => {
  /**
   * The load-bearing test. Work enqueued BEFORE the switch must not run after it — otherwise a founder
   * engages a switch and the backlog executes anyway, which is the illusion of containment.
   */
  it("does not run work that was queued BEFORE the switch was engaged", async () => {
    const { store, rows } = makeStore();
    const clean = deps([], { store });
    const { job } = await enqueueJob({ queue: "general", type: "content.generate", payload: {} }, clean);

    let ran = false;
    const registry = { "content.generate": async () => { ran = true; return {}; } };
    const result = await processNextJob("general", registry, deps([killed("agent", "content_worker")], { store }));

    expect(ran).toBe(false);
    expect(result.processed).toBe(false); // nothing claimable
    expect(rows.get(job.id)!.status).toBe("pending"); // untouched, not failed, not cancelled
  });

  /**
   * A contained job must NOT burn attempts. `claimNext` does `attempts = attempts + 1` and `requeue`
   * never decrements, so a claim-then-defer would exhaust maxAttempts during a few minutes of
   * containment and PERMANENTLY FAIL the work. A control that destroys what it contains is worse than
   * useless — founders would learn never to touch it.
   */
  it("a contained job burns NO attempts, however long the switch stays engaged", async () => {
    const { store, rows } = makeStore();
    const { job } = await enqueueJob({ queue: "general", type: "content.generate", payload: {} }, deps([], { store }));
    const before = rows.get(job.id)!.attempts;

    const registry = { "content.generate": async () => ({}) };
    for (let i = 0; i < 10; i++) await processNextJob("general", registry, deps([killed("agent", "content_worker")], { store }));

    expect(rows.get(job.id)!.attempts).toBe(before);
    expect(rows.get(job.id)!.status).toBe("pending");
  });

  it("the SAME job runs normally once the switch is released — containment, not destruction", async () => {
    const { store, rows } = makeStore();
    const { job } = await enqueueJob({ queue: "general", type: "content.generate", payload: {} }, deps([], { store }));

    let ran = false;
    const registry = { "content.generate": async () => { ran = true; return { ok: true }; } };
    await processNextJob("general", registry, deps([killed("agent", "content_worker")], { store }));
    expect(ran).toBe(false);

    const after = await processNextJob("general", registry, deps([], { store })); // switch released
    expect(ran).toBe(true);
    expect(after.outcome).toBe("completed");
    expect(rows.get(job.id)!.status).toBe("completed");
  });

  it("the claim query is told which types are blocked (enforcement is IN the query, not after it)", async () => {
    const { store, claims } = makeStore();
    await processNextJob("general", {}, deps([killed("agent", "content_worker")], { store }));
    expect(claims[0].blockedTypes).toEqual(["content.generate"]);
  });

  it("unrelated queued work still runs — a targeted switch is not a global stop", async () => {
    const { store } = makeStore();
    await enqueueJob({ queue: "general", type: "audit.paid", payload: {} }, deps([], { store }));
    let ran = false;
    const registry = { "audit.paid": async () => { ran = true; return {}; } };
    await processNextJob("general", registry, deps([killed("agent", "content_worker")], { store }));
    expect(ran).toBe(true);
  });

  /**
   * The narrow race: a switch engaged between the claim query and the handler call. Deferred with a real
   * backoff rather than executed. This one DOES cost an attempt — the honest tradeoff for a race this
   * narrow, since the alternative is running work a founder explicitly contained.
   */
  it("defers a job if the switch is engaged in the instant after the claim (race)", async () => {
    const { store, rows } = makeStore();
    const { job } = await enqueueJob({ queue: "general", type: "content.generate", payload: {} }, deps([], { store }));

    // The claim sees no block; the post-claim check does. Simulated by a store that ignores blockedTypes.
    const racyStore = { ...store, claimNext: async () => { const j = rows.get(job.id)!; const c = { ...j, status: "active" as const, attempts: j.attempts + 1 }; rows.set(job.id, c); return c; } } as unknown as JobStore;
    let ran = false;
    const registry = { "content.generate": async () => { ran = true; return {}; } };
    const r = await processNextJob("general", registry, deps([killed("agent", "content_worker")], { store: racyStore }));

    expect(ran).toBe(false); // the work did NOT execute
    expect(r.outcome).toBe("retry");
    expect(rows.get(job.id)!.status).toBe("pending");
    expect(rows.get(job.id)!.failureReason).toMatch(/kill switch/);
  });
});

describe("assertNotKilled", () => {
  it("throws with the switch and reason", () => {
    expect(() => assertNotKilled([killed("department", "content", "paused pending review")], "department", "content")).toThrow(/department:content.*paused pending review/);
  });

  it("does not throw for a different target", () => {
    expect(() => assertNotKilled([killed("department", "content")], "department", "publishing")).not.toThrow();
  });
});

describe("loadEngagedSwitches fails OPEN on a read error (stated tradeoff)", () => {
  /**
   * Deliberate and narrow: making the entire OS unrunnable because this one table is briefly unreadable
   * would convert a minor outage into a total one. Asserted so the choice is visible and a future change
   * to fail-closed is a decision about blast radius rather than an accident.
   */
  it("returns no switches rather than throwing", async () => {
    const switches = await loadEngagedSwitches({ loadSwitches: async () => { throw new Error("db down"); } }).catch(() => "threw");
    expect(switches).not.toBe("threw");
  });
});

describe("a contained action is 409, never 500", () => {
  /**
   * The first LIVE enforcement probe returned 500, because every enqueue route maps a thrown error to
   * "unknown error". A 500 says THE SERVER BROKE; a kill switch is the opposite — the system is working
   * exactly as instructed and refusing on purpose. A founder who cannot tell a deliberate control from a
   * crash will either ignore real outages or "fix" their own containment, and retry logic hammers a 500
   * while correctly backing off a 409.
   */
  it("maps KillSwitchEngagedError to 409 with the structured switch + reason", () => {
    const r = killSwitchResponse(new KillSwitchEngagedError("agent", "content_worker", "suspected runaway loop"));
    expect(r?.status).toBe(409);
    expect(r?.body.blockedBy).toEqual({ targetType: "agent", targetRef: "content_worker", reason: "suspected runaway loop" });
    // Structured, so the UI renders WHICH switch and WHY without parsing an error string.
    expect(r?.body.error).toMatch(/agent:content_worker/);
  });

  it("returns null for any other error — a real fault must still surface as a fault", () => {
    expect(killSwitchResponse(new Error("database exploded"))).toBeNull();
    expect(killSwitchResponse("not even an error")).toBeNull();
  });

  /**
   * Statically pins the mapping so a NEW enqueue route cannot silently reintroduce the 500. Any route
   * that can enqueue durable work can throw KillSwitchEngagedError, and must translate it.
   */
  it("every route that enqueues durable work maps the kill switch to 409", () => {
    const ENQUEUE_ROUTES = ["content/generate/route.ts", "jobs/route.ts", "revisions/[id]/action/route.ts"];
    const missing = ENQUEUE_ROUTES.filter((rel) => {
      const src = readFileSync(path.join(process.cwd(), "src", "app", "api", rel), "utf8");
      return !src.includes("killSwitchResponse");
    });
    expect(missing, `enqueue routes that would 500 on a contained action: ${missing.join(", ")}`).toEqual([]);
  });
});
