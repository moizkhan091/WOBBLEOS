import { describe, expect, it } from "vitest";
import { deterministicPitch, parsePitch, pitchToReportShape, diagnose } from "@/lib/domain/pitch-graph";
import { runPitch } from "@/lib/pitch";

const now = new Date("2026-07-09T12:00:00Z");

describe("pitch domain", () => {
  it("parses a valid pitch and rejects junk", () => {
    expect(parsePitch('{"headline":"Hi","services":[{"name":"X"}]}')).not.toBeNull();
    expect(parsePitch("nope")).toBeNull();
  });

  it("deterministic pitch is built from the diagnosis", () => {
    const input = { businessName: "Bright Dental", industry: "dental", signals: ["missed_calls", "few_reviews"] };
    const pitch = deterministicPitch(input, diagnose(input));
    expect(pitch.headline).toContain("Bright Dental");
    expect(pitch.services.length).toBeGreaterThan(0);
  });

  it("maps a pitch to the shared report shape", () => {
    const shape = pitchToReportShape({ headline: "H", situation: "s", whatWeNoticed: ["gap"], services: [{ name: "Missed-Call Text-Back", whatItDoes: "auto text", outcomeForYou: "more booked" }], whyWobble: "w", cta: "book" }, "Acme", "dental");
    expect((shape.opportunities as unknown[]).length).toBe(1);
    expect(shape.nextSteps).toEqual(["book"]);
  });
});

describe("pitch service", () => {
  it("uses the LLM pitch when the model returns valid JSON, and persists kind=pitch", async () => {
    const persisted: { kind: string; report: Record<string, unknown> }[] = [];
    const res = await runPitch(
      { businessName: "Bright Dental", industry: "dental", companyId: "co_1", signals: ["missed_calls"] },
      {
        scrape: async () => ({ scraped: true, website: { url: "x", title: "Bright Dental", text: "dental clinic", pages: 2 } }),
        runNode: async () => ({ text: JSON.stringify({ headline: "AI for Bright Dental", situation: "busy clinic", whatWeNoticed: ["missing after-hours calls"], services: [{ name: "Missed-Call Text-Back", whatItDoes: "texts missed callers", outcomeForYou: "recover after-hours patients" }], whyWobble: "one team", cta: "book a call" }), runId: "run_1" }),
        recordAudit: async () => {},
        recordAgentRun: async () => {},
        persist: async (r) => { persisted.push({ kind: r.kind, report: r.report }); },
        now,
      },
    );
    expect(res.usedLlm).toBe(true);
    expect(res.scraped).toBe(true);
    expect(res.pitch.headline).toBe("AI for Bright Dental");
    expect(persisted[0].kind).toBe("pitch");
    expect((persisted[0].report.opportunities as unknown[]).length).toBe(1);
  });

  it("falls back to a deterministic pitch when the LLM node throws (no key)", async () => {
    const res = await runPitch(
      { businessName: "Acme", signals: ["no_crm", "no_followup"] },
      { scrape: async () => ({ scraped: false }), runNode: async () => { throw new Error("no key"); }, recordAudit: async () => {}, persist: async () => {}, now },
    );
    expect(res.usedLlm).toBe(false);
    expect(res.pitch.services.length).toBeGreaterThan(0); // from the diagnosis
  });
});
