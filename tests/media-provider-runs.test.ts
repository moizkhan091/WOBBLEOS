import { describe, expect, it } from "vitest";
import { dispatchOneMediaJob, type MediaJobRow, type MediaStore } from "@/lib/media";
import type { RecordProviderRunInput } from "@/lib/provider-runs";

/** WOB-AUD-014: every paid media attempt writes a durable provider_runs record — success AND failure. */

function jobRow(over: Partial<MediaJobRow> = {}): MediaJobRow {
  const now = new Date();
  return {
    id: "mediajob_1", kind: "image", prompt: "a cat", provider: "fal", params: {}, status: "queued",
    attempts: 0, maxAttempts: 3, estimatedCostCents: 50, budgetCapCents: 100, actualCostCents: null,
    outputRefs: [], error: null, scopeType: "company", companyId: null, clientId: null, projectId: null,
    requestedBy: "Moiz", leaseOwner: null, leaseExpiresAt: null, dedupeKey: null, metadata: {},
    createdAt: now, updatedAt: now, startedAt: null, completedAt: null, ...over,
  };
}

function makeStore(seed: MediaJobRow[]): MediaStore {
  const rows = new Map(seed.map((r) => [r.id, r]));
  let claimedOnce = false;
  return {
    insert: async () => true,
    getById: async (id) => rows.get(id) ?? null,
    getByDedupeKey: async () => null,
    list: async () => [...rows.values()],
    update: async (id, f) => { const r = rows.get(id); if (r) Object.assign(r, f); },
    updateOwned: async (id, _o, f) => { const r = rows.get(id); if (r) { Object.assign(r, f); return true; } return false; },
    claim: async (owner, exp, now) => {
      if (claimedOnce) return null;
      claimedOnce = true;
      const j = [...rows.values()][0];
      const c = { ...j, status: "generating" as const, leaseOwner: owner, leaseExpiresAt: exp, startedAt: now };
      rows.set(j.id, c);
      return c;
    },
    reclaimStale: async () => 0,
  };
}

describe("media provider_runs cost records (WOB-AUD-014)", () => {
  it("records a success provider_run with actual cost", async () => {
    const runs: RecordProviderRunInput[] = [];
    await dispatchOneMediaJob({
      store: makeStore([jobRow()]),
      recordAudit: async () => {},
      recordProviderRun: async (r) => { runs.push(r); return {}; },
      providers: { fal: { slug: "fal", configured: () => true, generate: async () => ({ outputRefs: ["media/x.png"], actualCostCents: 42 }) } },
    });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("success");
    expect(runs[0].operation).toBe("media.image");
    expect(runs[0].actualCostCents).toBe(42);
    expect(runs[0].requestMetadata?.mediaJobId).toBe("mediajob_1");
  });

  it("records a failed provider_run with the error", async () => {
    const runs: RecordProviderRunInput[] = [];
    await dispatchOneMediaJob({
      store: makeStore([jobRow({ maxAttempts: 1 })]),
      recordAudit: async () => {},
      recordProviderRun: async (r) => { runs.push(r); return {}; },
      providers: { fal: { slug: "fal", configured: () => true, generate: async () => { throw new Error("fal exploded"); } } },
    });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("failed");
    expect(runs[0].error).toMatch(/fal exploded/);
    expect(runs[0].estimatedCostCents).toBe(50);
  });
});
