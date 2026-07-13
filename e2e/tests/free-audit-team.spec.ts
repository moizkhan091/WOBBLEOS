import { test, expect } from "@playwright/test";

/**
 * Free Audit multi-agent team — the founder-facing enrichment path (real DB effects). `enrich:true` runs the
 * grounded 3-agent team (via the CI deterministic adapter — no paid LLM call). The enrichment is always persisted
 * and scoped to the diagnosis's REAL opportunity service slugs (anti-hallucination); it is never blocked/fabricated.
 */
test.describe("Free Audit team — grounded multi-agent enrichment (real effects)", () => {
  test("an enriched free audit persists a grounded enrichment scoped to real opportunities", async ({ request }) => {
    const stamp = Date.now();
    const res = await request.post("/api/audit/free", { data: { businessName: `E2E FreeAudit ${stamp}`, industry: "ecommerce", signals: ["slow_response", "no_followup", "no_seo"], enrich: true } });
    expect(res.status()).toBe(201);
    const audit = ((await res.json()) as { audit: { id: string; report: { opportunities: Array<{ service: string }>; enrichment: { generated: boolean; finalPitch: string; groundedServiceSlugs: string[] } } } }).audit;
    const report = audit.report;
    // The enrichment exists and is anti-hallucination-scoped to EXACTLY the real opportunities (never an invented service).
    expect(report.enrichment).toBeTruthy();
    const realSlugs = new Set(report.opportunities.map((o) => o.service));
    expect(report.enrichment.groundedServiceSlugs.every((s) => realSlugs.has(s))).toBe(true);
    expect(report.enrichment.groundedServiceSlugs.length).toBe(realSlugs.size);
    expect(report.enrichment.finalPitch.length).toBeGreaterThan(0);

    // A plain (non-enriched) free audit still works.
    const plain = await request.post("/api/audit/free", { data: { businessName: `E2E FreeAudit plain ${stamp}`, signals: ["no_crm"] } });
    expect(plain.status()).toBe(201);
  });
});
