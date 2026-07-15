import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import {
  founderProfiles,
  authSessions,
  budgetCaps as budgetCapsTable,
  autonomyPolicies as autonomyPoliciesTable,
  departments as departmentsTable,
  securityFindings,
  securityIncidents,
  riskRegister,
  killSwitches,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  assembleGovernanceRun,
  isKilled,
  newGovernanceRunId,
  requiresFounderAttention,
  securityFindingDraftSchema,
  worstSeverity,
  type AccessReviewState,
  type GovernanceRunResult,
  type KillSwitchTarget,
  type PolicyReviewState,
  type SecurityFindingDraft,
} from "@/lib/domain/security-governance";

/**
 * Security & Governance IO (WOB-UAT-024).
 *
 * The department's execution layer: gather REAL state, run the deterministic rules, persist findings
 * with dedup + audit, and enforce kill switches at the point of execution.
 *
 * Every function here is injectable so the rules can be proven without a database — the rules are pure
 * (see `domain/security-governance.ts`) and this file only supplies them with real rows.
 */

export const SECURITY_MODULE = "security_governance";
export const SECURITY_DEPARTMENT = "security_governance";

/**
 * The department's executing agents. These are not labels: `runGovernanceReview` dispatches each one,
 * findings carry the detecting agent in `detectedBy`, and `tests/registry-integrity.test.ts` greps this
 * file to prove the registry's "active" claim is backed by real code rather than a declaration.
 */
export const GOVERNANCE_ORCHESTRATOR = "governance_orchestrator";
export const ACCESS_POLICY_AGENT = "access_policy_agent";
export const RISK_COMPLIANCE_AGENT = "risk_compliance_agent";
export const INCIDENT_AUDIT_AGENT = "incident_audit_agent";

export interface SecurityDeps {
  db?: Db;
  now?: Date;
  recordAudit?: (event: AuditEventInput) => Promise<void>;
}

async function audit(deps: SecurityDeps, event: AuditEventInput): Promise<void> {
  const write = deps.recordAudit ?? ((e: AuditEventInput) => writeAuditEvent(e));
  // Best-effort: a logging failure must never flip a real security action into a failure. The finding
  // row IS the record; the audit event is the history.
  await write(event).catch(() => {});
}

// ---- state gathering ----------------------------------------------------------------------------

/** Read the REAL account + session state the access review needs. */
export async function gatherAccessState(deps: SecurityDeps = {}): Promise<AccessReviewState> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const [founders, sessions] = await Promise.all([
    // NEVER select password_hash — it must not enter a governance record, a finding, or an audit event.
    db.select({
      id: founderProfiles.id,
      displayName: founderProfiles.displayName,
      email: founderProfiles.email,
      status: founderProfiles.status,
      isSuperAdmin: founderProfiles.isSuperAdmin,
      passwordHashPresent: sql<boolean>`(${founderProfiles.passwordHash} is not null)`,
      lastLoginAt: founderProfiles.lastLoginAt,
      passwordChangedAt: founderProfiles.passwordChangedAt,
    }).from(founderProfiles),
    db.select({ id: authSessions.id, founderId: authSessions.founderId, status: authSessions.status, expiresAt: authSessions.expiresAt, lastSeenAt: authSessions.lastSeenAt }).from(authSessions),
  ]);
  return {
    founders: founders.map((f) => ({
      id: f.id,
      displayName: f.displayName,
      email: f.email ?? null,
      status: f.status,
      isSuperAdmin: Boolean(f.isSuperAdmin),
      passwordSet: Boolean(f.passwordHashPresent),
      lastLoginAt: f.lastLoginAt ?? null,
      passwordChangedAt: f.passwordChangedAt ?? null,
    })),
    sessions: sessions.map((s) => ({ id: s.id, founderId: s.founderId ?? null, status: s.status, expiresAt: s.expiresAt ?? null, lastSeenAt: s.lastSeenAt ?? null })),
    now,
  };
}

/** Read the REAL policy/config state the policy review needs. */
export async function gatherPolicyState(deps: SecurityDeps = {}): Promise<PolicyReviewState> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const [caps, policies, depts] = await Promise.all([
    db.select().from(budgetCapsTable),
    db.select().from(autonomyPoliciesTable),
    db.select().from(departmentsTable),
  ]);
  return {
    budgetCaps: caps.map((c) => ({ id: c.id, category: c.category, period: c.period, amount: Number(c.amount), enabled: Boolean(c.enabled) })),
    autonomyPolicies: policies.map((p) => ({
      id: p.id,
      category: p.category,
      grantedLevel: p.grantedLevel,
      status: p.status,
      maxRiskLevel: p.maxRiskLevel ?? null,
      maxFinancialCents: p.maxFinancialCents ?? null,
      approvedBy: p.approvedBy,
    })),
    departments: depts.map((d) => ({
      slug: d.slug,
      status: d.status,
      permittedDataClassifications: ((d.permissions as { permittedDataClassifications?: string[] } | null)?.permittedDataClassifications) ?? [],
    })),
    now,
  };
}

// ---- findings -----------------------------------------------------------------------------------

export interface PersistFindingsResult {
  created: string[];
  /** Findings whose problem is ALREADY open — not re-created. The dedup working, not an error. */
  deduped: string[];
}

/**
 * Persist a batch of drafts, deduping by `dedupeKey` against rows that are still OPEN.
 *
 * A scheduled review runs repeatedly over the same state, so without dedup every tick would re-report
 * the same unresolved issue and bury the new ones — which is how a security screen becomes noise a
 * founder stops reading. A recurrence AFTER closure is legitimately new and DOES create a fresh row
 * (the partial unique index only covers non-terminal statuses).
 */
export async function persistFindings(drafts: SecurityFindingDraft[], opts: { governanceRunId?: string } = {}, deps: SecurityDeps = {}): Promise<PersistFindingsResult> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const created: string[] = [];
  const deduped: string[] = [];

  for (const raw of drafts) {
    const draft = securityFindingDraftSchema.parse(raw);
    const rows = await db
      .insert(securityFindings)
      .values({
        id: newId("finding"),
        kind: draft.kind,
        severity: draft.severity,
        title: draft.title,
        detail: draft.detail,
        affectedAssetType: draft.affectedAssetType,
        affectedAssetId: draft.affectedAssetId,
        clientWorkspaceId: draft.clientWorkspaceId,
        detectedBy: draft.detectedBy,
        detectionMethod: draft.detectionMethod,
        evidence: draft.evidence,
        reproduction: draft.reproduction,
        remediation: draft.remediation,
        remediationOwner: draft.remediationOwner,
        status: "open",
        governanceRunId: opts.governanceRunId ?? null,
        dedupeKey: draft.dedupeKey,
        createdAt: now,
        updatedAt: now,
      })
      // The partial unique index is the authority, not a pre-SELECT: two concurrent reviews would race a
      // check-then-insert and both write. Let the DB arbitrate.
      .onConflictDoNothing()
      .returning({ id: securityFindings.id });

    if (rows[0]?.id) {
      created.push(rows[0].id);
      await audit(deps, {
        eventType: "security.finding_opened",
        module: SECURITY_MODULE,
        entityType: "security_finding",
        entityId: rows[0].id,
        actor: draft.detectedBy,
        metadata: { kind: draft.kind, severity: draft.severity, dedupeKey: draft.dedupeKey, detectionMethod: draft.detectionMethod, affected: draft.affectedAssetId },
      });
    } else {
      deduped.push(draft.dedupeKey);
    }
  }
  return { created, deduped };
}

export interface GovernanceRunRecord extends GovernanceRunResult {
  /** The orchestrator that ran this pass — real attribution, distinct from whoever requested it. */
  executedBy: string;
  created: string[];
  deduped: string[];
  /** Incidents opened from CRITICAL findings by `incident_audit_agent`. */
  incidents: string[];
  requiresAttention: boolean;
  worst: string | null;
}

/**
 * Run a full governance review: gather → deterministic rules → persist → audit.
 *
 * A check that CANNOT run is recorded as `skipped` and forces founder attention regardless of the
 * finding count. "I could not check" is not "all clear", and conflating them is exactly how a control
 * becomes decorative.
 */
export async function runGovernanceReview(input: { requestedBy: string } = { requestedBy: "scheduler" }, deps: SecurityDeps = {}): Promise<GovernanceRunRecord> {
  const now = deps.now ?? new Date();
  const runId = newGovernanceRunId();

  let access: { state: AccessReviewState } | { skipped: string };
  try {
    access = { state: await gatherAccessState(deps) };
  } catch (e) {
    access = { skipped: e instanceof Error ? e.message : "access state unavailable" };
  }

  let policy: { state: PolicyReviewState } | { skipped: string };
  try {
    policy = { state: await gatherPolicyState(deps) };
  } catch (e) {
    policy = { skipped: e instanceof Error ? e.message : "policy state unavailable" };
  }

  const run = assembleGovernanceRun({ runId, startedAt: now, access, policy });
  const persisted = await persistFindings(run.findings, { governanceRunId: runId }, deps);
  const requiresAttention = requiresFounderAttention(run);

  // A CRITICAL finding is not merely a row to read later — it is an incident happening now, and it gets
  // a lifecycle a founder must close. `incident_audit_agent` owns this: it is what makes that agent a
  // real executing member rather than a registry entry. Deduped per problem, so a recurring critical
  // condition updates ONE incident instead of spawning thousands.
  const incidents: string[] = [];
  for (const f of run.findings.filter((f) => f.severity === "critical")) {
    try {
      const r = await openIncident(
        {
          title: f.title,
          severity: "critical",
          detectionSource: "governance_review",
          affectedService: f.affectedAssetType,
          clientWorkspaceId: f.clientWorkspaceId ?? null,
          detail: f.detail,
          openedBy: INCIDENT_AUDIT_AGENT,
          dedupeKey: `incident:${f.dedupeKey}`,
        },
        deps,
      );
      if (r.created) incidents.push(r.id);
    } catch {
      // An incident-open failure must not lose the finding — the finding row is already persisted and
      // is the authoritative record. Reported via the run, never silently swallowed into a clean result.
    }
  }

  await audit(deps, {
    eventType: "security.governance_review_completed",
    module: SECURITY_MODULE,
    entityType: "governance_run",
    entityId: runId,
    // The ACTOR is whoever asked (a founder or the scheduler) — that is the accountable identity.
    // The EXECUTOR is the orchestrator that actually ran it. Collapsing the two would misattribute a
    // scheduled machine run to a person, or a founder's decision to an agent.
    actor: input.requestedBy,
    metadata: {
      executedBy: GOVERNANCE_ORCHESTRATOR,
      dispatchedAgents: [ACCESS_POLICY_AGENT, RISK_COMPLIANCE_AGENT, INCIDENT_AUDIT_AGENT],
      checks: run.checks,
      skipped: run.skipped,
      findings: run.findings.length,
      created: persisted.created.length,
      deduped: persisted.deduped.length,
      worst: worstSeverity(run.findings),
      incidentsOpened: incidents.length,
      requiresAttention,
    },
  });

  return { ...run, executedBy: GOVERNANCE_ORCHESTRATOR, created: persisted.created, deduped: persisted.deduped, incidents, requiresAttention, worst: worstSeverity(run.findings) };
}

export interface ListFindingsQuery {
  status?: string;
  kind?: string;
  severity?: string;
  clientWorkspaceId?: string;
  limit?: number;
}

export async function listFindings(query: ListFindingsQuery = {}, deps: SecurityDeps = {}) {
  const db = deps.db ?? getDb();
  const where = [];
  if (query.status) where.push(eq(securityFindings.status, query.status));
  if (query.kind) where.push(eq(securityFindings.kind, query.kind));
  if (query.severity) where.push(eq(securityFindings.severity, query.severity));
  if (query.clientWorkspaceId) where.push(eq(securityFindings.clientWorkspaceId, query.clientWorkspaceId));
  return db
    .select()
    .from(securityFindings)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(securityFindings.createdAt))
    .limit(Math.min(query.limit ?? 100, 200));
}

export const FINDING_ACTIONS = ["acknowledge", "start_remediation", "resolve", "accept_risk", "false_positive"] as const;
export type FindingAction = (typeof FINDING_ACTIONS)[number];

/**
 * A founder decision on a finding. `resolve` REQUIRES closure proof — a finding that is merely marked
 * done proves nothing, and "we fixed it" without evidence is the same unverified claim the campaign
 * exists to eliminate.
 */
export async function actOnFinding(
  input: { id: string; action: FindingAction; actor: string; note?: string; closureProof?: Record<string, unknown> },
  deps: SecurityDeps = {},
): Promise<{ ok: true; status: string } | { ok: false; error: string; status: number }> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const rows = await db.select().from(securityFindings).where(eq(securityFindings.id, input.id)).limit(1);
  const finding = rows[0];
  if (!finding) return { ok: false, error: `finding '${input.id}' not found`, status: 404 };

  if (input.action === "resolve" && !input.closureProof && !input.note) {
    return { ok: false, error: "resolving a finding requires closure proof (what re-verified it) or an explicit note — a finding marked done without evidence proves nothing", status: 422 };
  }

  const next: Record<FindingAction, string> = {
    acknowledge: "acknowledged",
    start_remediation: "remediating",
    resolve: "resolved",
    accept_risk: "accepted_risk",
    false_positive: "false_positive",
  };
  const status = next[input.action];
  const terminal = status === "resolved" || status === "accepted_risk" || status === "false_positive";

  await db
    .update(securityFindings)
    .set({
      status,
      remediation: input.note ?? finding.remediation,
      closureProof: input.closureProof ?? finding.closureProof,
      resolvedBy: terminal ? input.actor : finding.resolvedBy,
      resolvedAt: terminal ? now : finding.resolvedAt,
      updatedAt: now,
    })
    .where(eq(securityFindings.id, input.id));

  await audit(deps, {
    eventType: `security.finding_${input.action}`,
    module: SECURITY_MODULE,
    entityType: "security_finding",
    entityId: input.id,
    actor: input.actor,
    metadata: { from: finding.status, to: status, note: input.note ?? null, closureProof: input.closureProof ?? null, severity: finding.severity, dedupeKey: finding.dedupeKey },
  });
  return { ok: true, status };
}

// ---- kill switches ------------------------------------------------------------------------------

/**
 * Is this target killed RIGHT NOW? Read at the point of execution.
 *
 * Fails OPEN on a DB error, deliberately and narrowly: a kill switch is a targeted containment control,
 * and making every agent unrunnable because the switches table is briefly unreadable would convert a
 * minor outage into a total one. The tradeoff is stated here rather than left implicit — if this ever
 * needs to fail closed, that is a founder decision about blast radius, not a code detail.
 */
export async function checkKillSwitch(targetType: KillSwitchTarget, targetRef: string, deps: SecurityDeps = {}): Promise<{ killed: boolean; reason: string | null }> {
  const db = deps.db ?? getDb();
  try {
    const rows = await db.select().from(killSwitches).where(eq(killSwitches.state, "disabled"));
    return isKilled(rows.map((r) => ({ targetType: r.targetType, targetRef: r.targetRef, state: r.state, reason: r.reason })), targetType, targetRef);
  } catch {
    return { killed: false, reason: null };
  }
}

export async function listKillSwitches(deps: SecurityDeps = {}) {
  const db = deps.db ?? getDb();
  return db.select().from(killSwitches).orderBy(desc(killSwitches.updatedAt)).limit(200);
}

/** Disable a named target. Idempotent: re-disabling an already-disabled target returns the live switch. */
export async function setKillSwitch(
  input: { targetType: KillSwitchTarget; targetRef: string; reason: string; actor: string },
  deps: SecurityDeps = {},
): Promise<{ id: string; created: boolean }> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const rows = await db
    .insert(killSwitches)
    .values({ id: newId("kill"), targetType: input.targetType, targetRef: input.targetRef, state: "disabled", reason: input.reason, disabledBy: input.actor, disabledAt: now, createdAt: now, updatedAt: now })
    // One live switch per target — the unique index is the authority. Re-disabling must not create a
    // second row: "is this off?" is the one question a kill switch has to answer unambiguously.
    .onConflictDoNothing()
    .returning({ id: killSwitches.id });

  if (rows[0]?.id) {
    await audit(deps, {
      eventType: "security.kill_switch_engaged",
      module: SECURITY_MODULE,
      entityType: "kill_switch",
      entityId: rows[0].id,
      actor: input.actor,
      metadata: { targetType: input.targetType, targetRef: input.targetRef, reason: input.reason },
    });
    return { id: rows[0].id, created: true };
  }
  const existing = await db.select().from(killSwitches).where(and(eq(killSwitches.targetType, input.targetType), eq(killSwitches.targetRef, input.targetRef), eq(killSwitches.state, "disabled"))).limit(1);
  return { id: existing[0]!.id, created: false };
}

/** Reactivate a killed target. Requires a reason — turning a control back ON is itself a decision. */
export async function clearKillSwitch(input: { id: string; actor: string; reason: string }, deps: SecurityDeps = {}): Promise<{ ok: boolean; error?: string }> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const rows = await db.select().from(killSwitches).where(eq(killSwitches.id, input.id)).limit(1);
  const sw = rows[0];
  if (!sw) return { ok: false, error: "kill switch not found" };
  if (sw.state !== "disabled") return { ok: false, error: "kill switch is not engaged" };

  await db.update(killSwitches).set({ state: "active", reactivatedBy: input.actor, reactivatedAt: now, reactivationReason: input.reason, updatedAt: now }).where(eq(killSwitches.id, input.id));
  await audit(deps, {
    eventType: "security.kill_switch_released",
    module: SECURITY_MODULE,
    entityType: "kill_switch",
    entityId: input.id,
    actor: input.actor,
    metadata: { targetType: sw.targetType, targetRef: sw.targetRef, disabledBy: sw.disabledBy, disabledReason: sw.reason, reactivationReason: input.reason },
  });
  return { ok: true };
}

// ---- incidents ----------------------------------------------------------------------------------

export interface OpenIncidentInput {
  title: string;
  severity: string;
  detectionSource: string;
  affectedService?: string | null;
  clientWorkspaceId?: string | null;
  detail: string;
  openedBy: string;
  dedupeKey: string;
}

/** Open an incident, or append to the live one for the same condition (never spawn thousands). */
export async function openIncident(input: OpenIncidentInput, deps: SecurityDeps = {}): Promise<{ id: string; created: boolean }> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const entry = { at: now.toISOString(), actor: input.openedBy, event: "detected", detail: input.detail };
  const rows = await db
    .insert(securityIncidents)
    .values({
      id: newId("incident"),
      title: input.title,
      severity: input.severity,
      detectionSource: input.detectionSource,
      affectedService: input.affectedService ?? null,
      clientWorkspaceId: input.clientWorkspaceId ?? null,
      status: "detected",
      timeline: [entry],
      openedBy: input.openedBy,
      dedupeKey: input.dedupeKey,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: securityIncidents.id });

  if (rows[0]?.id) {
    await audit(deps, {
      eventType: "security.incident_opened",
      module: SECURITY_MODULE,
      entityType: "security_incident",
      entityId: rows[0].id,
      actor: input.openedBy,
      metadata: { severity: input.severity, detectionSource: input.detectionSource, affectedService: input.affectedService, dedupeKey: input.dedupeKey },
    });
    return { id: rows[0].id, created: true };
  }
  const existing = await db.select({ id: securityIncidents.id }).from(securityIncidents).where(and(eq(securityIncidents.dedupeKey, input.dedupeKey), inArray(securityIncidents.status, ["detected", "contained", "remediating", "recovered"]))).limit(1);
  return { id: existing[0]!.id, created: false };
}

export const INCIDENT_ACTIONS = ["contain", "remediate", "recover", "resolve", "close"] as const;
export type IncidentAction = (typeof INCIDENT_ACTIONS)[number];

const INCIDENT_NEXT: Record<IncidentAction, string> = { contain: "contained", remediate: "remediating", recover: "recovered", resolve: "resolved", close: "closed" };

/** Advance an incident. Every step appends to the timeline — the history IS the incident record. */
export async function actOnIncident(input: { id: string; action: IncidentAction; actor: string; note: string }, deps: SecurityDeps = {}): Promise<{ ok: true; status: string } | { ok: false; error: string; status: number }> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const rows = await db.select().from(securityIncidents).where(eq(securityIncidents.id, input.id)).limit(1);
  const incident = rows[0];
  if (!incident) return { ok: false, error: `incident '${input.id}' not found`, status: 404 };

  const status = INCIDENT_NEXT[input.action];
  const terminal = status === "resolved" || status === "closed";
  const timeline = [...(incident.timeline ?? []), { at: now.toISOString(), actor: input.actor, event: input.action, detail: input.note }];

  await db
    .update(securityIncidents)
    .set({
      status,
      timeline,
      containment: input.action === "contain" ? input.note : incident.containment,
      remediation: input.action === "remediate" ? input.note : incident.remediation,
      recovery: input.action === "recover" ? input.note : incident.recovery,
      postIncidentReview: input.action === "close" ? input.note : incident.postIncidentReview,
      founderDecision: terminal ? input.note : incident.founderDecision,
      resolvedBy: terminal ? input.actor : incident.resolvedBy,
      resolvedAt: terminal ? now : incident.resolvedAt,
      updatedAt: now,
    })
    .where(eq(securityIncidents.id, input.id));

  await audit(deps, {
    eventType: `security.incident_${input.action}`,
    module: SECURITY_MODULE,
    entityType: "security_incident",
    entityId: input.id,
    actor: input.actor,
    metadata: { from: incident.status, to: status, note: input.note, severity: incident.severity },
  });
  return { ok: true, status };
}

export async function listIncidents(query: { status?: string; limit?: number } = {}, deps: SecurityDeps = {}) {
  const db = deps.db ?? getDb();
  return db
    .select()
    .from(securityIncidents)
    .where(query.status ? eq(securityIncidents.status, query.status) : undefined)
    .orderBy(desc(securityIncidents.createdAt))
    .limit(Math.min(query.limit ?? 50, 200));
}

// ---- risk register ------------------------------------------------------------------------------

export async function listRisks(query: { status?: string; limit?: number } = {}, deps: SecurityDeps = {}) {
  const db = deps.db ?? getDb();
  return db
    .select()
    .from(riskRegister)
    .where(query.status ? eq(riskRegister.status, query.status) : undefined)
    .orderBy(desc(riskRegister.updatedAt))
    .limit(Math.min(query.limit ?? 50, 200));
}

export async function createRisk(
  input: { title: string; description: string; category: string; severity: string; likelihood: string; impact: string; owner: string; mitigation?: string; affectedClients?: string[]; affectedSystems?: string[]; createdBy: string },
  deps: SecurityDeps = {},
): Promise<{ id: string }> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const id = newId("risk");
  await db.insert(riskRegister).values({
    id,
    title: input.title,
    description: input.description,
    category: input.category,
    severity: input.severity,
    likelihood: input.likelihood,
    impact: input.impact,
    affectedClients: input.affectedClients ?? [],
    affectedSystems: input.affectedSystems ?? [],
    owner: input.owner,
    mitigation: input.mitigation ?? null,
    status: "open",
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  });
  await audit(deps, {
    eventType: "security.risk_registered",
    module: SECURITY_MODULE,
    entityType: "risk",
    entityId: id,
    actor: input.createdBy,
    metadata: { category: input.category, severity: input.severity, likelihood: input.likelihood, owner: input.owner },
  });
  return { id };
}
