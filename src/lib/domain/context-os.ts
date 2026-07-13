// Context OS — pure domain (onboarding → trusted context).
//
// Onboarding never dumps raw imported information into trusted memory. The pipeline is:
//   raw intake (immutable) → extracted ASSERTIONS (pending) → founder approval → versioned TRUSTED context →
//   scoped retrieval. Only APPROVED assertions are trusted; extraction alone never trusts anything, and a
//   generator can only retrieve the correct SCOPE's approved context (strict company/founder/client/project/
//   department isolation). Contradictions between approved assertions are recorded, never silently overwritten.

export const ASSERTION_STATUSES = ["extracted", "approved", "rejected", "superseded"] as const;
export type AssertionStatus = (typeof ASSERTION_STATUSES)[number];

export const CONTEXT_SCOPES = ["company", "founder", "client", "project", "department"] as const;
export type ContextScopeType = (typeof CONTEXT_SCOPES)[number];
export interface ContextScope {
  type: ContextScopeType;
  id: string;
}

export interface RawContextSource {
  id: string;
  /** questionnaire | document | interview | url | crm | drive | notion | chatgpt_export | transcript | … */
  kind: string;
  content: string;
  scope: ContextScope;
  importedAt: Date;
}

export interface ContextAssertion {
  id: string;
  /** Provenance — the immutable raw source this was extracted from. */
  sourceId: string;
  statement: string;
  entities: string[];
  scope: ContextScope;
  classification: string;
  /** 0..1 — trust in this assertion. */
  trust: number;
  status: AssertionStatus;
  version: number;
  /** The prior assertion id this one supersedes (a correction bumps the version, never overwrites history). */
  supersedes: string | null;
}

export function scopeEquals(a: ContextScope, b: ContextScope): boolean {
  return a.type === b.type && a.id === b.id;
}

/**
 * The trusted context for a scope: ONLY approved assertions in that exact scope. Raw sources and extracted
 * (unapproved) assertions are NEVER returned — extraction alone trusts nothing.
 */
export function trustedContext(assertions: ContextAssertion[], scope: ContextScope): ContextAssertion[] {
  return assertions.filter((a) => a.status === "approved" && scopeEquals(a.scope, scope));
}

/** An assertion may be APPROVED only from `extracted` — the only path from raw intake to trusted context. */
export function canApproveAssertion(a: Pick<ContextAssertion, "status">): boolean {
  return a.status === "extracted";
}

/** Approve an extracted assertion, optionally superseding a prior one (versioned, history-preserving). */
export function approveAssertion(a: ContextAssertion, opts: { supersedes?: ContextAssertion } = {}): { approved: ContextAssertion; superseded: ContextAssertion | null } {
  if (!canApproveAssertion(a)) throw new Error(`cannot approve a '${a.status}' assertion (must be extracted)`);
  const prior = opts.supersedes ?? null;
  const approved: ContextAssertion = { ...a, status: "approved", version: prior ? prior.version + 1 : a.version, supersedes: prior?.id ?? a.supersedes };
  const superseded = prior ? { ...prior, status: "superseded" as const } : null;
  return { approved, superseded };
}

export interface ContextContradiction {
  aId: string;
  bId: string;
  entity: string;
  reason: string;
}

const _norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Contradictions among APPROVED assertions in a scope: two assertions sharing an entity but stating different
 * things. Recorded for founder reconciliation — never silently overwritten.
 */
export function detectContextContradictions(assertions: ContextAssertion[]): ContextContradiction[] {
  const approved = assertions.filter((a) => a.status === "approved");
  const out: ContextContradiction[] = [];
  for (let i = 0; i < approved.length; i++) {
    for (let j = i + 1; j < approved.length; j++) {
      const a = approved[i];
      const b = approved[j];
      if (!scopeEquals(a.scope, b.scope)) continue;
      const sharedEntity = a.entities.find((e) => b.entities.includes(e));
      if (!sharedEntity) continue;
      if (_norm(a.statement) !== _norm(b.statement)) {
        out.push({ aId: a.id, bId: b.id, entity: sharedEntity, reason: "approved assertions share an entity but state different things" });
      }
    }
  }
  return out;
}

/** Onboarding coverage: fraction of raw sources that have produced ≥1 approved assertion (0..1). */
export function contextCoverage(sources: RawContextSource[], assertions: ContextAssertion[]): number {
  if (sources.length === 0) return 0;
  const approvedSourceIds = new Set(assertions.filter((a) => a.status === "approved").map((a) => a.sourceId));
  const covered = sources.filter((s) => approvedSourceIds.has(s.id)).length;
  return Math.round((covered / sources.length) * 100) / 100;
}
