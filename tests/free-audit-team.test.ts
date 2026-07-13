import { describe, expect, it } from "vitest";
import { runFreeAuditTeam, type FreeAuditProvider } from "@/lib/free-audit/team";
import type { AuditStore } from "@/lib/free-audit";
import type { AuditRow } from "@/lib/domain/free-audit";

function makeStore() {
  const rows: AuditRow[] = [];
  const store: AuditStore = {
    insertAudit: async (r) => { rows.push(r); },
    listAudits: async () => rows,
    getAudit: async (id) => rows.find((r) => r.id === id) ?? null,
  };
  return { store, rows };
}
const noAudit = async () => {};
const input = { businessName: "Acme", industry: "ecommerce", signals: ["slow_response", "no_followup"], createdBy: "Moiz" } as never;

describe("free-audit multi-agent team", () => {
  it("runs three distinct roles, grounds the enrichment, and persists it", async () => {
    const { store } = makeStore();
    const calls: string[] = [];
    const provider: FreeAuditProvider = async ({ role, grounding }) => { calls.push(role); return { text: `[${role}] ${grounding.slice(0, 40)}` }; };
    const row = await runFreeAuditTeam(input, { store, recordAudit: noAudit, runProvider: provider });
    const report = row.report as unknown as { opportunities: Array<{ service: string }>; enrichment: { generated: boolean; groundedServiceSlugs: string[] } };
    expect(new Set(calls).size).toBe(3);
    expect(report.enrichment.generated).toBe(true);
    const realSlugs = new Set(report.opportunities.map((o) => o.service));
    expect(report.enrichment.groundedServiceSlugs.every((s) => realSlugs.has(s))).toBe(true);
  });

  it("degrades to the deterministic report when the provider fails (never blocked, never fabricated)", async () => {
    const { store } = makeStore();
    const boom: FreeAuditProvider = async () => { throw new Error("down"); };
    const row = await runFreeAuditTeam(input, { store, recordAudit: noAudit, runProvider: boom });
    const report = row.report as unknown as { summary: string; enrichment: { generated: boolean; finalPitch: string } };
    expect(report.enrichment.generated).toBe(false);
    expect(report.enrichment.finalPitch).toBe(report.summary);
  });
});
