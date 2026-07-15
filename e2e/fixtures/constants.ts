/**
 * Shared E2E constants — pure TypeScript, NO `@/…` imports, so this file is safe to import from both
 * the Playwright test process AND the `tsx`-run seed script. Everything the browser gate needs to line
 * up (auth, the department under test, deterministic row ids, greppable UI labels) lives here so the
 * seed and the assertions can never drift apart.
 */

export const E2E_PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${E2E_PORT}`;

// Saved founder session (storageState). Written once by auth.setup.ts, reused by the authed project.
export const AUTH_STATE_PATH = "e2e/.auth/founder.json";

// ---- Isolated E2E auth --------------------------------------------------------------------------
// Founder credentials live in Postgres, so the E2E SEED writes these accounts (see seedFounderAccounts)
// rather than the Playwright config injecting a password hash into the server env. These passwords are
// non-secret test values that only ever exist in the isolated E2E database.
//
// TWO founders are provisioned so the suite can prove ISOLATION (A cannot act as B) and per-founder
// session revocation, which a single shared account could never demonstrate.
export const E2E_FOUNDER = "Moiz"; // display name — the acting founder the authed suite expects
export const E2E_EMAIL = "moiz@wobble.local";
export const E2E_PASSWORD = "wobble-e2e-secret-pw";
export const E2E_FOUNDER_ID = "founder_moiz";

export const E2E_FOUNDER_B = "Ali";
export const E2E_EMAIL_B = "ali@wobble.local";
export const E2E_PASSWORD_B = "wobble-e2e-secret-pw-b";
export const E2E_FOUNDER_B_ID = "founder_ali";

export const E2E_SESSION_SECRET = "e2e-session-secret-please-change-0001"; // >= 16 chars (getSecretKey)

// ---- Isolated logical workspace + the department under test -------------------------------------
export const E2E_WORKSPACE = "e2e_ws";
export const E2E_DEPARTMENT = "paid_audit"; // seeded `active` with real KPIs — a truthful, stable target.

// ---- Deterministic workflow ids (also the cleanup scope) ----------------------------------------
export const WF = {
  retry: "wf_e2e_retry",
  cancel: "wf_e2e_cancel",
  resume: "wf_e2e_resume",
  terminate: "wf_e2e_terminate",
  dismiss: "wf_e2e_dismiss",
  budget: "wf_e2e_budget",
} as const;

// ---- Deterministic row ids. The seed deletes-then-inserts these, so the suite is repeatable. -----
export const IDS = {
  handoffRetry: "handoff_e2e_retry",
  handoffCancel: "handoff_e2e_cancel",
  handoffResume: "handoff_e2e_resume",
  handoffTerminate: "handoff_e2e_terminate",
  escResume: "escalation_e2e_resume",
  escTerminate: "escalation_e2e_terminate",
  escDismiss: "escalation_e2e_dismiss",
} as const;

// ---- Unique, greppable UI labels so a test can find EXACTLY its own row --------------------------
export const AGENTS = {
  retrySrc: "e2e_retry_src",
  retryDst: "e2e_retry_dst",
  cancelSrc: "e2e_cancel_src",
  cancelDst: "e2e_cancel_dst",
  resumeSrc: "e2e_resume_src",
  resumeDst: "e2e_resume_dst",
  terminateSrc: "e2e_terminate_src",
  terminateDst: "e2e_terminate_dst",
} as const;

// Proposal-accept autonomous-chain fixture: a real `sent` proposal linked to a real opportunity + company.
// Accepting it fires the atomic outbox → the consumer chain drives won → invoice → project. The chain's
// workflowId is the opportunity id (see buildProposalArtifactEnvelope).
export const PROPOSAL = {
  companyId: "company_e2e_prop",
  opportunityId: "opp_e2e_prop",
  proposalId: "proposal_e2e_sent",
  businessName: "E2E Proposal Co",
  valueCents: 500000,
} as const;

// The escalation panel renders `requiredDecision` as its row text — unique strings = precise locators.
export const DECISIONS = {
  resume: "E2E-RESUME redrive the dead-lettered handoff",
  terminate: "E2E-TERMINATE stop this workflow",
  dismiss: "E2E-DISMISS non-actionable noise",
} as const;

export const PROVIDER_USAGE_REQ_ID = "preq_e2e_paidaudit_1";
