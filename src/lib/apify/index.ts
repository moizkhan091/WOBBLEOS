import { loadEngagedSwitches, assertNotKilled } from "@/lib/security-governance/enforcement";
import { assertProviderAllowance, recordExternalSpend, withExternalProviderSlot, type ProviderBudgetDeps } from "@/lib/provider-budget";
import type { KillSwitchRow } from "@/lib/domain/security-governance";

/**
 * Apify actor-run adapter — a GOVERNED external provider. Runs an Actor synchronously with a HARD item cap
 * and returns its dataset items, under the same controls as any paid call: kill switch → budget (USD) →
 * max-1 concurrency, then records actual spend. Apify cost varies by Actor/compute; we budget on a
 * pessimistic per-run bound and cap items so a single run cannot explode. The token is read from the
 * environment (UAT secrets), never logged.
 */

export const APIFY_BASE = "https://api.apify.com/v2";
export const APIFY_PROVIDER = "apify";

export interface ApifyRunInput {
  /** Actor id/name, e.g. "apify/rag-web-browser". */
  actorId: string;
  input: Record<string, unknown>;
  /** HARD cap on dataset items returned/charged. The founder cap for the UAT test is 5. */
  maxItems: number;
  /** The named acceptance/ledger item this run advances — required. */
  item: string;
  /** Pessimistic worst-case USD for this run (defaults to a conservative small bound). */
  worstCaseUsd?: number;
  actor?: string;
}

export interface ApifyRunOutput {
  actorId: string;
  items: Array<Record<string, unknown>>;
  itemCount: number;
  estimatedCostUsd: number;
}

export interface ApifyDeps extends ProviderBudgetDeps {
  fetchImpl?: typeof fetch;
  token?: string;
  loadKillSwitches?: () => Promise<KillSwitchRow[]>;
  now?: Date;
}

export class ApifyNotConfiguredError extends Error {
  readonly name = "ApifyNotConfiguredError";
  constructor() {
    super("Apify is not configured (APIFY_API_TOKEN absent) — the run is blocked, never faked");
  }
}

const DEFAULT_WORST_CASE_USD = 0.1; // conservative per-run bound for a capped UAT run

export async function apifyRunActor(input: ApifyRunInput, deps: ApifyDeps = {}): Promise<ApifyRunOutput> {
  const token = deps.token ?? process.env.APIFY_API_TOKEN;
  if (!token) throw new ApifyNotConfiguredError();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const worst = input.worstCaseUsd ?? DEFAULT_WORST_CASE_USD;
  const maxItems = Math.min(Math.max(input.maxItems, 1), 5); // HARD cap: never more than 5 in UAT

  const switches: KillSwitchRow[] = deps.loadKillSwitches ? await deps.loadKillSwitches() : await loadEngagedSwitches();
  assertNotKilled(switches, "provider", APIFY_PROVIDER);
  try {
    await assertProviderAllowance(APIFY_PROVIDER, worst, deps);
  } catch (e) {
    await recordExternalSpend({ provider: APIFY_PROVIDER, item: input.item, estimatedMaxCost: worst, actualCost: 0, unit: "usd", result: "rejected_budget", actor: input.actor }, deps).catch(() => {});
    throw e;
  }

  return withExternalProviderSlot(async () => {
    const started = Date.now();
    const url = `${APIFY_BASE}/acts/${encodeURIComponent(input.actorId).replace("%2F", "~")}/run-sync-get-dataset-items?token=${token}&maxItems=${maxItems}`;
    try {
      const resp = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.input) });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Apify run failed (${resp.status}): ${body.slice(0, 200)}`);
      }
      const items = (await resp.json()) as Array<Record<string, unknown>>;
      const capped = Array.isArray(items) ? items.slice(0, maxItems) : [];
      // Apify does not return exact per-run cost synchronously here; record the pessimistic bound as the
      // charge so the budget never under-counts. (A precise cost reconciler can refine this later.)
      const out: ApifyRunOutput = { actorId: input.actorId, items: capped, itemCount: capped.length, estimatedCostUsd: worst };
      await recordExternalSpend({ provider: APIFY_PROVIDER, item: input.item, estimatedMaxCost: worst, actualCost: worst, unit: "usd", latencyMs: Date.now() - started, result: "succeeded", actor: input.actor, metadata: { actorId: input.actorId, items: capped.length } }, deps).catch(() => {});
      return out;
    } catch (err) {
      await recordExternalSpend({ provider: APIFY_PROVIDER, item: input.item, estimatedMaxCost: worst, actualCost: 0, unit: "usd", latencyMs: Date.now() - started, result: "failed", actor: input.actor, metadata: { error: err instanceof Error ? err.message : String(err) } }, deps).catch(() => {});
      throw err;
    }
  }, deps);
}
