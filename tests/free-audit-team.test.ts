import { describe, expect, it } from "vitest";
import { runFreeAuditTeam, groundProse, type FreeAuditProvider } from "@/lib/free-audit/team";
import { WOBBLE_SERVICES } from "@/lib/domain/free-audit";
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

  it("groundProse drops prose that names a NON-grounded Wobble service (structural anti-hallucination)", () => {
    const someService = WOBBLE_SERVICES[0].name;
    // Text mentioning a real service that is NOT in the allowed (grounded) slug set → dropped.
    expect(groundProse(`We recommend ${someService} for you.`, [])).toBe("");
    // Neutral text (no service name) → kept.
    expect(groundProse("Your response times are hurting conversions.", [])).toBe("Your response times are hurting conversions.");
    // The same service, but now grounded (its slug allowed) → kept.
    expect(groundProse(`We recommend ${someService} for you.`, [WOBBLE_SERVICES[0].slug])).toContain(someService);
  });

  it("a hallucinated service in the composer output is dropped → falls back to the summary", async () => {
    const { store } = makeStore();
    const nonGrounded = WOBBLE_SERVICES.find((s) => s.slug === "owners-report-dashboard")!.name;
    const provider: FreeAuditProvider = async ({ role }) => ({ text: role.includes("pitch") ? `You need the ${nonGrounded}.` : "grounded gap text" });
    const row = await runFreeAuditTeam({ businessName: "Acme", signals: ["slow_response"], createdBy: "Moiz" } as never, { store, recordAudit: noAudit, runProvider: provider });
    const report = row.report as unknown as { summary: string; enrichment: { finalPitch: string; groundedServiceSlugs: string[] } };
    // The pitch mentioned a non-grounded service → dropped → fell back to the deterministic summary (unless the audit happens to surface that service).
    if (!report.enrichment.groundedServiceSlugs.includes("owners-report-dashboard")) {
      expect(report.enrichment.finalPitch).toBe(report.summary);
    }
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
