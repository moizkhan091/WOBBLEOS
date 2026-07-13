import { describe, expect, it } from "vitest";
import { providerHealthProvider } from "@/lib/daily-brief/providers";
import type { BriefScope } from "@/lib/domain/daily-brief";

/** provider_health is company-wide (workers aren't tenant-scoped) — it returns [] for a scoped brief BEFORE any
 *  store read, so this needs no DB. (The DB-backed signal emission is proven in verify:daily-brief-providers.) */
describe("daily-brief provider_health scope guard", () => {
  const ctx = { now: new Date(), lookbackMs: 86_400_000 };
  it("returns [] (no store read) for client/project/department scope", async () => {
    for (const type of ["client", "project", "department"] as const) {
      const scope: BriefScope = { type, id: "x", label: "X", cadence: "daily" };
      expect(await providerHealthProvider(scope, ctx)).toEqual([]);
    }
  });
});
