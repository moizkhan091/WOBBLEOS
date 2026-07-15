import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { killSwitches } from "@/db/schema";
import { isKilled, type KillSwitchRow, type KillSwitchTarget } from "@/lib/domain/security-governance";

/**
 * Kill-switch ENFORCEMENT (WOB-UAT-024 follow-up).
 *
 * Before this, `checkKillSwitch` existed, was tested, and was called by NOTHING — the switch recorded
 * intent and blocked no work. A control that appears to exist and enforces nothing is worse than no
 * control: it produces false confidence. (That is the same defect this system's own `risk_compliance_agent`
 * reports as HIGH for a disabled budget cap, which would have been an embarrassing thing to ship.)
 *
 * Enforcement points, chosen so a switch cannot be walked around:
 *   1. `enqueueJob`      — no NEW durable work enters the queue for a killed target.
 *   2. `claimNext`       — already-queued work is not picked up (see the attempt-burn note below).
 *   3. `runDepartment`   — no department work runs, including work arriving by handoff.
 *
 * 2 is the one that must be done at the CLAIM QUERY rather than after claiming. `claimNext` does
 * `attempts = attempts + 1` on every claim and `requeue` never decrements, so a claim-then-defer would
 * burn an attempt on every poll: a switch engaged for a few minutes would silently exhaust `maxAttempts`
 * and permanently fail queued work. A containment control that DESTROYS the work it contains is worse
 * than useless — and worse, founders would learn not to touch it. Filtering in the claim SQL leaves the
 * job untouched and `pending`, so it runs normally the moment the switch is released.
 */

/** Thrown when work is refused because a kill switch is engaged. Carries the exact switch + reason. */
export class KillSwitchEngagedError extends Error {
  constructor(
    readonly targetType: string,
    readonly targetRef: string,
    readonly switchReason: string,
  ) {
    super(`blocked by kill switch on ${targetType}:${targetRef} — ${switchReason}`);
    this.name = "KillSwitchEngagedError";
  }
}

/**
 * 409 CONFLICT — the correct status for contained work, and the reason this helper exists.
 *
 * The first live enforcement probe returned **500**, because every enqueue route maps a thrown error to
 * "unknown error". A 500 says THE SERVER BROKE. A kill switch is the opposite: the system is working
 * exactly as instructed and is refusing on purpose. A founder who cannot tell a deliberate control from
 * a crash will either ignore real outages or "fix" their own containment — and an operator's retry logic
 * will hammer a 500 while correctly backing off a 409.
 *
 * Use in any route that can enqueue or run department work:
 *   catch (error) { const k = killSwitchResponse(error); if (k) return NextResponse.json(k.body, { status: k.status }); ... }
 */
export function killSwitchResponse(error: unknown): { status: number; body: { ok: false; error: string; blockedBy: { targetType: string; targetRef: string; reason: string } } } | null {
  if (!(error instanceof KillSwitchEngagedError)) return null;
  return {
    status: 409,
    body: {
      ok: false,
      error: error.message,
      // Structured, not just prose: the UI must be able to render WHICH switch and WHY without parsing
      // an error string.
      blockedBy: { targetType: error.targetType, targetRef: error.targetRef, reason: error.switchReason },
    },
  };
}

/**
 * Which durable job types an AGENT owns.
 *
 * A kill switch on `agent:content_worker` must stop the work that agent actually performs, and that work
 * arrives as `content.generate`. Without this mapping an agent switch would be decorative for anything
 * running through the queue — the exact failure this whole change exists to fix.
 *
 * A `workflow:<jobType>` switch needs no mapping: its ref IS the job type.
 * Asserted against the real handler registry in `tests/kill-switch-enforcement.test.ts`, so a renamed
 * job type or agent cannot silently unhook enforcement.
 */
export const AGENT_JOB_TYPES: Record<string, string[]> = {
  content_worker: ["content.generate"],
  content_orchestrator: ["content.graph"],
  knowledge_compiler: ["knowledge.compile"],
  paid_audit_orchestrator: ["audit.paid"],
  competitor_scout: ["intelligence.scout"],
  intelligence_analyst: ["intelligence.analyze"],
  dreamer: ["intelligence.dream"],
  source_intake_orchestrator: ["source.intake"],
};

export interface EnforcementDeps {
  db?: Db;
  /** Injectable for tests + so a worker cycle can load the switches ONCE rather than per job. */
  loadSwitches?: () => Promise<KillSwitchRow[]>;
}

/**
 * Every ENGAGED switch. Fails OPEN on a read error, deliberately and narrowly: making the whole OS
 * unrunnable because this table is briefly unreadable would convert a minor outage into a total one.
 * The tradeoff is stated rather than implicit — if it should fail closed, that is a founder decision
 * about blast radius, not a code detail.
 */
export async function loadEngagedSwitches(deps: EnforcementDeps = {}): Promise<KillSwitchRow[]> {
  // The try/catch wraps EVERY source, not just the DB one. The contract is "a read failure never takes
  // the OS down", and a contract that only holds for one code path is not a contract — an earlier
  // version left the injected loader unguarded and a test caught the gap immediately.
  try {
    if (deps.loadSwitches) return await deps.loadSwitches();
    const db = deps.db ?? getDb();
    const rows = await db.select().from(killSwitches).where(eq(killSwitches.state, "disabled"));
    return rows.map((r) => ({ targetType: r.targetType, targetRef: r.targetRef, state: r.state, reason: r.reason }));
  } catch {
    return [];
  }
}

/** Throw if this exact target is killed. */
export function assertNotKilled(switches: KillSwitchRow[], targetType: KillSwitchTarget, targetRef: string): void {
  const hit = isKilled(switches, targetType, targetRef);
  if (hit.killed) throw new KillSwitchEngagedError(targetType, targetRef, hit.reason ?? "no reason recorded");
}

/**
 * Is this job type blocked, and by which switch?
 *
 * A job type is blocked when a `workflow` switch names it directly, OR an `agent` switch names an agent
 * that owns it. Checking both is what makes an agent switch mean something for queued work.
 */
export function blockedJobType(switches: KillSwitchRow[], jobType: string): { blocked: boolean; targetType: string; targetRef: string; reason: string } | null {
  const workflow = isKilled(switches, "workflow", jobType);
  if (workflow.killed) return { blocked: true, targetType: "workflow", targetRef: jobType, reason: workflow.reason ?? "" };

  for (const s of switches.filter((s) => s.state === "disabled" && s.targetType === "agent")) {
    if ((AGENT_JOB_TYPES[s.targetRef] ?? []).includes(jobType)) {
      return { blocked: true, targetType: "agent", targetRef: s.targetRef, reason: s.reason };
    }
  }
  return null;
}

/** Every job type currently blocked — passed into the claim SQL so killed work is never claimed. */
export function blockedJobTypes(switches: KillSwitchRow[]): string[] {
  const out = new Set<string>();
  for (const s of switches.filter((s) => s.state === "disabled")) {
    if (s.targetType === "workflow") out.add(s.targetRef);
    if (s.targetType === "agent") for (const t of AGENT_JOB_TYPES[s.targetRef] ?? []) out.add(t);
  }
  return [...out];
}
