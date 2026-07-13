import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Phase 4 — the INDEPENDENT QA gate proven end-to-end through the founder surface (real DB effects). Drives
 * the SAME gate the live department flows use, over the real proposal_technical_review board, and asserts
 * every branch: PASS / FAIL / REVISE / BLOCKED, a self-review REJECTED (never a silent pass), DUPLICATE
 * idempotency (no second review), and TENANT isolation on the inspection API.
 *
 * The `e2e_qa_*` workflow ids are isolated + cleaned up by the fixture.
 */
const BOARD = "proposal_technical_review";
const REVIEWER = "proposal_technical_reviewer"; // the board's own evaluator identity (a self-review uses this)

// Proposal artifacts tuned to land on each verdict (the board scores solution length, service items,
// integration-design length and timeline phases — see src/lib/qa/gate.ts evaluateProposalTechnical).
function artifact(opts: { solution: string; services: number; integration: string; phases: number }) {
  return {
    proposal: { id: "p_e2e", version: 1, pricingCents: 500000, scope: "Bounded engagement scope for the E2E proposal.", services: Array.from({ length: opts.services }, (_, i) => ({ name: `svc${i}` })), timeline: Array.from({ length: opts.phases }, (_, i) => ({ phase: `phase${i}` })), companyId: "co_e2e" },
    synthesis: { technicalSolution: opts.solution, integrationDesign: opts.integration, roiAssumptions: "ROI: payback within two quarters on the automation savings.", risks: ["adoption"] },
  };
}
const GOOD = artifact({ solution: "S".repeat(400), services: 3, integration: "I".repeat(200), phases: 3 }); // all criteria pass
const REVISE_ART = artifact({ solution: "S".repeat(400), services: 3, integration: "", phases: 3 }); // required integration fails, score still >= reviseFloor
const BAD = artifact({ solution: "", services: 0, integration: "", phases: 0 }); // everything fails → score < reviseFloor

async function runReview(request: APIRequestContext, body: unknown) {
  const res = await request.post("/api/qa/reviews", { data: body });
  return { status: res.status(), json: (await res.json()) as { verdict?: string; released?: boolean; firstRelease?: boolean; review?: { id: string; independent: boolean }; routingTarget?: { failedStages: string[] } | null; violations?: string[] } };
}
function submission(workflowId: string, extra: Record<string, unknown> = {}) {
  return { authorAgentSlug: "proposal_orchestrator", contributingAgents: ["proposal_solution_architect"], workflowId, completedStages: ["solution_design", "assemble"], ...extra };
}

test.describe("Phase 4 — independent QA gate through the founder surface (real effects)", () => {
  test("PASS releases a good artifact", async ({ request }) => {
    const r = await runReview(request, { boardSlug: BOARD, artifact: GOOD, submission: submission(`e2e_qa_pass_${Date.now()}`) });
    expect(r.status).toBe(201);
    expect(r.json.verdict).toBe("pass");
    expect(r.json.released).toBe(true);
    expect(r.json.review?.independent).toBe(true);
  });

  test("REVISE routes the EXACT failed stage while preserving completed work", async ({ request }) => {
    const r = await runReview(request, { boardSlug: BOARD, artifact: REVISE_ART, submission: submission(`e2e_qa_revise_${Date.now()}`) });
    expect(r.status).toBe(201);
    expect(r.json.verdict).toBe("revise");
    expect(r.json.released).toBe(false);
    expect(r.json.routingTarget?.failedStages).toContain("solution_design");
  });

  test("FAIL rejects a poor artifact (not released)", async ({ request }) => {
    const r = await runReview(request, { boardSlug: BOARD, artifact: BAD, submission: submission(`e2e_qa_fail_${Date.now()}`) });
    expect(r.status).toBe(201);
    expect(r.json.verdict).toBe("fail");
    expect(r.json.released).toBe(false);
  });

  test("BLOCKED when the board cannot assess (missing artifact) — no fake pass/fail", async ({ request }) => {
    const r = await runReview(request, { boardSlug: BOARD, artifact: {}, submission: submission(`e2e_qa_blocked_${Date.now()}`) });
    expect(r.status).toBe(201);
    expect(r.json.verdict).toBe("blocked");
    expect(r.json.released).toBe(false);
  });

  test("a SELF-REVIEW is rejected (409) — the reviewer cannot judge its own work; no review is written", async ({ request }) => {
    const workflowId = `e2e_qa_self_${Date.now()}`;
    // The reviewer identity is listed as a contributor → independence violated → hard 409, never a silent pass.
    const r = await runReview(request, { boardSlug: BOARD, artifact: GOOD, submission: submission(workflowId, { contributingAgents: [REVIEWER] }) });
    expect(r.status).toBe(409);
    expect(r.json.violations?.join(" ")).toContain(REVIEWER);
    // Nothing persisted: an inspection for that workflow returns no review.
    const list = await request.get(`/api/qa/reviews?workflowId=${workflowId}`);
    expect(((await list.json()) as { reviews: unknown[] }).reviews).toHaveLength(0);
  });

  test("a DUPLICATE run for the same unit of work reuses the review (idempotent — no second row)", async ({ request }) => {
    const workflowId = `e2e_qa_dup_${Date.now()}`;
    const first = await runReview(request, { boardSlug: BOARD, artifact: GOOD, submission: submission(workflowId, { taskId: "t1" }) });
    expect(first.json.firstRelease).toBe(true);
    const second = await runReview(request, { boardSlug: BOARD, artifact: GOOD, submission: submission(workflowId, { taskId: "t1" }) });
    expect(second.json.review?.id).toBe(first.json.review?.id); // same review reused
    expect(second.json.firstRelease).toBe(false); // NOT a fresh release
  });

  test("TENANT isolation — a review scoped to client A is never returned when inspecting client B", async ({ request }) => {
    const stamp = Date.now();
    const clientA = `e2e_qa_client_a_${stamp}`, clientB = `e2e_qa_client_b_${stamp}`;
    const a = await runReview(request, { boardSlug: BOARD, artifact: GOOD, submission: submission(`e2e_qa_tenant_${stamp}`, { clientWorkspaceId: clientA }) });
    const reviewId = a.json.review?.id;
    expect(reviewId).toBeTruthy();
    // Client A sees it…
    const seenByA = (await (await request.get(`/api/qa/reviews?clientWorkspaceId=${clientA}`)).json()) as { reviews: Array<{ id: string }> };
    expect(seenByA.reviews.some((r) => r.id === reviewId)).toBe(true);
    // …client B never does.
    const seenByB = (await (await request.get(`/api/qa/reviews?clientWorkspaceId=${clientB}`)).json()) as { reviews: Array<{ id: string }> };
    expect(seenByB.reviews.some((r) => r.id === reviewId)).toBe(false);
  });
});
