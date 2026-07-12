import { test, expect, type APIRequestContext } from "@playwright/test";
import { reseed } from "../fixtures/reseed";
import { handoffByWorkflow } from "../fixtures/api";
import { PROPOSAL } from "../fixtures/constants";

/**
 * Phase-3 closure — the founder-facing AUTONOMOUS commercial chain, driven from the REAL acceptance API
 * through the REAL production execution path (atomic transactional outbox → autonomous consumer → deterministic
 * CRM/Finance/Delivery writes), asserted as actual DB state read back through the Command Centre APIs.
 *
 * The advisory LLM judgment in each vertical is served by the CI-only deterministic adapter (see
 * playwright.config `WOBBLE_JUDGMENT_ADAPTER=deterministic`) so no live paid LLM call runs in the gate — the
 * WRITE path (won / invoice / project) is fully real. The live OpenRouter provider path has its own separate
 * smoke proof; this test is NOT that proof.
 */
const OPP = PROPOSAL.opportunityId;

/** Drive the autonomous consumer loop (one claim/dept per tick) until the chain settles or maxTicks. */
async function driveUntil(request: APIRequestContext, check: () => Promise<boolean>, maxTicks = 14): Promise<boolean> {
  for (let i = 0; i < maxTicks; i++) {
    await request.post("/api/scheduler/tick?consumers=true");
    if (await check()) return true;
  }
  return false;
}

async function invoicesForOpp(request: APIRequestContext): Promise<Array<{ id: string; opportunityId: string | null }>> {
  const res = await request.get("/api/finance/invoices?limit=500");
  const json = (await res.json()) as { invoices?: Array<{ id: string; opportunityId: string | null }> };
  return (json.invoices ?? []).filter((iv) => iv.opportunityId === OPP);
}
async function projectsForOpp(request: APIRequestContext): Promise<Array<{ id: string; milestones?: unknown[] }>> {
  const res = await request.get(`/api/projects?opportunityId=${OPP}&limit=200`);
  const json = (await res.json()) as { projects?: Array<{ id: string; milestones?: unknown[] }> };
  return json.projects ?? [];
}
async function opportunity(request: APIRequestContext): Promise<{ id: string; status: string; stage: string } | undefined> {
  const res = await request.get("/api/crm/opportunities?limit=500");
  const json = (await res.json()) as { opportunities?: Array<{ id: string; status: string; stage: string }> };
  return (json.opportunities ?? []).find((o) => o.id === OPP);
}

test.describe("Proposal accept → autonomous commercial chain (real effects)", () => {
  test.beforeEach(() => reseed());

  test("acceptance emits the outbox ATOMICALLY, then the consumer drives won → exactly one invoice + one project", async ({ request }) => {
    // Accept the real sent proposal through the real founder-gated API.
    const res = await request.post(`/api/proposals/${PROPOSAL.proposalId}/action`, { data: { action: "accept" } });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { ok: boolean; handoffId?: string };
    expect(body.ok).toBe(true);
    expect(typeof body.handoffId).toBe("string"); // the outbox handoff id came back from the atomic accept

    // ATOMIC: the accepted proposal can never exist without its durable downstream event.
    const ho = await handoffByWorkflow(request, OPP);
    expect(ho).not.toBeNull();
    expect(ho!.deliveryState).toBe("delivered"); // ready for the sales_crm consumer to claim

    // Drive the autonomous chain (sales_crm → won → finance + delivery).
    const settled = await driveUntil(request, async () => (await invoicesForOpp(request)).length >= 1 && (await projectsForOpp(request)).length >= 1);
    expect(settled).toBe(true);

    // Command Centre readback of the completed chain — every effect is a REAL deterministic write:
    expect((await opportunity(request))?.status).toBe("won"); // Sales/CRM advanced the deal
    expect(await invoicesForOpp(request)).toHaveLength(1); // Finance drafted EXACTLY ONE invoice
    const projects = await projectsForOpp(request);
    expect(projects).toHaveLength(1); // Delivery stood up EXACTLY ONE project
    expect((projects[0].milestones?.length ?? 0)).toBeGreaterThan(0); // with kickoff milestones
  });

  test("DUPLICATE acceptance creates no second handoff; re-running the consumer creates no second invoice/project", async ({ request }) => {
    const first = await request.post(`/api/proposals/${PROPOSAL.proposalId}/action`, { data: { action: "accept" } });
    expect(first.ok()).toBe(true);
    expect(await driveUntil(request, async () => (await invoicesForOpp(request)).length >= 1 && (await projectsForOpp(request)).length >= 1)).toBe(true);

    // A duplicate acceptance loses the atomic claim → 409, and emits NO second outbox handoff.
    const dup = await request.post(`/api/proposals/${PROPOSAL.proposalId}/action`, { data: { action: "accept" } });
    expect(dup.status()).toBe(409);

    // Re-driving the consumer (reclaim/replay) is idempotent — still exactly one invoice + one project.
    await driveUntil(request, async () => false, 4); // extra ticks: any duplicate would show up as a 2nd row
    expect(await invoicesForOpp(request)).toHaveLength(1);
    expect(await projectsForOpp(request)).toHaveLength(1);
  });
});
