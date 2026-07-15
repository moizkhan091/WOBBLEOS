import { providerRuns } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { newId } from "@/lib/ids";

/**
 * Durable provider-attempt / cost records (WOB-AUD-014). Every paid external provider attempt (e.g. a
 * fal.ai media generation) writes a `provider_runs` row — on SUCCESS and on FAILURE — with the operation,
 * status, latency, estimated + actual cost, and redacted request/response metadata. This is the required
 * cost-observability path for reconciliation, distinct from the media job's own status fields.
 */

export type ProviderRunStatus = "success" | "failed" | "blocked";

export interface RecordProviderRunInput {
  provider: string;
  operation: string;
  status: ProviderRunStatus;
  requestMetadata?: Record<string, unknown>;
  responseMetadata?: Record<string, unknown> | null;
  estimatedCostCents?: number | null;
  actualCostCents?: number | null;
  latencyMs?: number | null;
  error?: string | null;
}

export interface ProviderRunRow extends RecordProviderRunInput {
  id: string;
}

export interface ProviderRunStore {
  insert(row: {
    id: string; provider: string; operation: string; status: string;
    requestMetadata: Record<string, unknown>; responseMetadata: Record<string, unknown> | null;
    estimatedCost: string | null; actualCost: string | null; latencyMs: number | null; error: string | null;
  }): Promise<void>;
}

/** cents → a numeric-string dollar amount (the column is `numeric`), or null. */
function centsToAmount(cents?: number | null): string | null {
  if (cents === undefined || cents === null || !Number.isFinite(cents)) return null;
  return (cents / 100).toFixed(4);
}

export async function recordProviderRun(
  input: RecordProviderRunInput,
  deps: { store?: ProviderRunStore } = {},
): Promise<ProviderRunRow> {
  const store = deps.store ?? defaultStore();
  const id = newId("providerrun");
  await store.insert({
    id,
    provider: input.provider,
    operation: input.operation,
    status: input.status,
    requestMetadata: input.requestMetadata ?? {},
    responseMetadata: input.responseMetadata ?? null,
    estimatedCost: centsToAmount(input.estimatedCostCents),
    actualCost: centsToAmount(input.actualCostCents),
    latencyMs: input.latencyMs ?? null,
    error: input.error ?? null,
  });
  return { id, ...input };
}

export function defaultStore(db: Db = getDb()): ProviderRunStore {
  return {
    async insert(row) {
      await db.insert(providerRuns).values(row as never);
    },
  };
}
