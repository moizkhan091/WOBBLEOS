import type { APIRequestContext } from "@playwright/test";

/**
 * Thin, typed readers over the real Command Centre APIs — the suite asserts DB EFFECTS by reading state
 * back through these (not by trusting that a UI row vanished). The `request` fixture carries the founder
 * session cookie (project storageState), so these hit the same authenticated surface as the browser.
 */

export interface HandoffApi {
  id: string;
  workflowId: string;
  deliveryState: string;
  retryCount: number;
  sourceAgent: string;
  destinationAgent: string | null;
}

export interface EscalationApi {
  id: string;
  status: string;
  resolutionAction: string | null;
  departmentSlug: string;
}

export interface BudgetApi {
  departmentSlug: string;
  usage: { dailyCents: number; monthlyCents: number; dailyTokens: number; activeReservations: number };
  caps: { concurrencyLimit: number };
  providerUsage: { actualCostCents: number; actualRows: number; estimatedRows: number; unverifiedRows: number };
}

/**
 * Resilient authenticated GET returning parsed JSON, or null on a non-2xx or a TRANSIENT network error
 * (e.g. a dev-server ECONNRESET). Returning null lets `expect.poll` retry rather than throw on a blip —
 * the assertion still only passes on the real, settled state.
 */
async function getJson<T>(request: APIRequestContext, path: string): Promise<T | null> {
  try {
    const res = await request.get(path);
    if (!res.ok()) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** The single seeded handoff for an E2E workflow (each E2E workflow owns exactly one handoff). */
export async function handoffByWorkflow(request: APIRequestContext, workflowId: string): Promise<HandoffApi | null> {
  const json = await getJson<{ handoffs?: HandoffApi[] }>(request, `/api/handoffs?workflowId=${encodeURIComponent(workflowId)}&limit=200`);
  return (json?.handoffs ?? []).find((h) => h.workflowId === workflowId) ?? null;
}

/** Read one escalation back by id across ALL statuses (so we can observe resolved/dismissed too). */
export async function escalationById(request: APIRequestContext, id: string): Promise<EscalationApi | null> {
  const json = await getJson<{ escalations?: EscalationApi[] }>(request, `/api/escalations?limit=500`);
  return (json?.escalations ?? []).find((e) => e.id === id) ?? null;
}

export async function budgetState(request: APIRequestContext, department: string): Promise<BudgetApi | null> {
  const json = await getJson<{ budget?: BudgetApi }>(request, `/api/departments/${encodeURIComponent(department)}/budget`);
  return json?.budget ?? null;
}
