import { describe, expect, it } from "vitest";
import { mapIngestRecordToItemInput, ingestIntelligencePayload } from "@/lib/intelligence/ingest";
import type { IntelligenceStore } from "@/lib/intelligence";

describe("intelligence ingest mapping", () => {
  it("maps a competitor reel (transcript + engagement + extracted) to a pending item", () => {
    const input = mapIngestRecordToItemInput({
      itemType: "competitor_reel", platform: "instagram", account: "rivalco", url: "https://insta/p/1",
      caption: "POV: your AI books the patient", transcript: "hey so today I want to show you...",
      hook: "POV you never miss a call", format: "talking-head POV", cta: "DM AUDIT",
      metrics: { views: 480000, likes: 22000 }, postedAt: "2026-06-20",
    });
    expect(input.itemType).toBe("competitor_reel");
    expect(input.approvalStatus).toBe("pending");
    expect(input.actorName).toBe("rivalco");
    expect(input.rawText).toContain("today I want to show");
    expect(input.extracted).toMatchObject({ hook: "POV you never miss a call", format: "talking-head POV", cta: "DM AUDIT" });
    expect(input.metrics).toMatchObject({ views: 480000 });
    expect(input.createdByAgent).toBe("ingest");
  });
  it("derives a title/summary when missing", () => {
    const input = mapIngestRecordToItemInput({ account: "rivalco", platform: "linkedin" });
    expect(input.title).toContain("rivalco");
    expect(input.summary.length).toBeGreaterThan(0);
  });
});

describe("ingestIntelligencePayload", () => {
  it("ingests a batch of records as pending items", async () => {
    const inserted: string[] = [];
    const store = {
      insertIntelligenceItem: async (row: { id: string; approvalStatus: string }) => { inserted.push(row.approvalStatus); void row.id; },
    } as unknown as IntelligenceStore;
    const res = await ingestIntelligencePayload(
      { records: [{ account: "a", caption: "x" }, { account: "b", caption: "y" }] },
      { store, recordAudit: async () => {} },
    );
    expect(res.count).toBe(2);
    expect(res.created).toHaveLength(2);
    expect(inserted).toEqual(["pending", "pending"]);
  });
  it("accepts a single record too", async () => {
    const store = { insertIntelligenceItem: async () => {} } as unknown as IntelligenceStore;
    const res = await ingestIntelligencePayload({ account: "solo", itemType: "competitor_post" }, { store, recordAudit: async () => {} });
    expect(res.count).toBe(1);
  });
});
