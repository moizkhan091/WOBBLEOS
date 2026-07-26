import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { extractJson, parseStructured, parseStructuredWithRepair, repairInstruction } from "@/lib/providers/structured";

describe("structured-output parsing", () => {
  const Scores = z.array(z.object({ id: z.string(), score: z.number() }));

  describe("extractJson", () => {
    it("strips ```json code fences", () => {
      expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    });
    it("pulls the object out of surrounding prose", () => {
      expect(extractJson('Sure! Here it is: {"a":1} — hope that helps')).toBe('{"a":1}');
    });
    it("handles a top-level array preceded by chatter", () => {
      expect(extractJson('Here:\n[{"id":"x","score":9}]')).toBe('[{"id":"x","score":9}]');
    });
    it("returns trimmed text when there is no bracket (bare value)", () => {
      expect(extractJson("  42  ")).toBe("42");
    });
  });

  describe("parseStructured (pure, no LLM)", () => {
    it("parses + validates a good array", () => {
      const r = parseStructured('[{"id":"a","score":80}]', Scores);
      expect(r.ok).toBe(true);
      expect(r.data).toEqual([{ id: "a", score: 80 }]);
    });
    it("parses through code fences + prose", () => {
      const r = parseStructured('```json [{"id":"a","score":70}] ```', Scores);
      expect(r.ok).toBe(true);
    });
    it("fails (never throws) on invalid JSON", () => {
      const r = parseStructured("not json at all", Scores);
      expect(r.ok).toBe(false);
      expect(r.error).toContain("not valid JSON");
    });
    it("fails with a shape error naming the bad path", () => {
      const r = parseStructured('[{"id":"a","score":"high"}]', Scores);
      expect(r.ok).toBe(false);
      expect(r.error).toContain("did not match");
      expect(r.error).toContain("score");
    });
  });

  describe("parseStructuredWithRepair (one opt-in retry)", () => {
    it("returns the first result when valid — no repair call", async () => {
      const repair = vi.fn();
      const r = await parseStructuredWithRepair('[{"id":"a","score":50}]', Scores, { repair });
      expect(r.ok).toBe(true);
      expect(repair).not.toHaveBeenCalled();
    });
    it("repairs once and succeeds", async () => {
      const repair = vi.fn(async () => '[{"id":"a","score":50}]');
      const r = await parseStructuredWithRepair("garbage", Scores, { repair });
      expect(r.ok).toBe(true);
      expect(repair).toHaveBeenCalledTimes(1);
    });
    it("repairs at most ONCE, then gives up with the original error", async () => {
      const repair = vi.fn(async () => "still garbage");
      const r = await parseStructuredWithRepair("garbage", Scores, { repair });
      expect(r.ok).toBe(false);
      expect(repair).toHaveBeenCalledTimes(1); // never loops
      expect(r.error).toContain("not valid JSON"); // original error preserved
    });
    it("with no repair fn behaves exactly like parseStructured", async () => {
      const r = await parseStructuredWithRepair("garbage", Scores);
      expect(r.ok).toBe(false);
    });
    it("surfaces a thrown repair as a failure, not an exception", async () => {
      const r = await parseStructuredWithRepair("garbage", Scores, { repair: async () => { throw new Error("provider down"); } });
      expect(r.ok).toBe(false);
      expect(r.error).toContain("repair attempt failed");
    });
  });

  it("repairInstruction embeds the error and forbids prose", () => {
    const msg = repairInstruction("score: expected number");
    expect(msg).toContain("score: expected number");
    expect(msg.toLowerCase()).toContain("only the corrected json");
  });
});
