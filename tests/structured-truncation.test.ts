import { describe, expect, it } from "vitest";
import { looksTruncated, truncationInstruction, repairInstruction, parseStructuredWithRepair } from "@/lib/providers/structured";
import { z } from "zod";

/**
 * These exist because of a real, expensive failure. The deal reviewer wrote 2,400 tokens against a
 * 2,400 token ceiling on the first proposal it ever saw, so its JSON stopped mid-object. The repair
 * round was then told to "fix the JSON" and retried at the SAME ceiling, so it failed identically.
 * Four Sonnet calls, nothing produced, and the founder saw an error.
 */
describe("telling a cut-off response apart from a malformed one", () => {
  it("spots JSON that stops mid-object", () => {
    expect(looksTruncated('{"verdict":"would_hesitate","items":[{"issue":"Scope is vague')).toBe(true);
  });

  it("spots an unclosed array", () => {
    expect(looksTruncated('{"a":[1,2,3')).toBe(true);
  });

  it("spots a string left open, which is how a sentence gets cut", () => {
    expect(looksTruncated('{"headline":"They will refuse because the price')).toBe(true);
  });

  it("does not cry truncation over complete JSON", () => {
    expect(looksTruncated('{"verdict":"would_sign","items":[]}')).toBe(false);
    expect(looksTruncated('```json\n{"a":1}\n```')).toBe(false);
  });

  it("is not fooled by braces inside strings", () => {
    expect(looksTruncated('{"note":"use {this} and [that]"}')).toBe(false);
  });

  it("is not fooled by an escaped quote", () => {
    expect(looksTruncated('{"note":"they said \\"no\\" twice"}')).toBe(false);
  });

  it("says nothing about empty output", () => {
    expect(looksTruncated("")).toBe(false);
    expect(looksTruncated("   ")).toBe(false);
  });
});

describe("the two repair instructions say opposite things, because the failures are opposite", () => {
  it("a cut-off response is told to be shorter, not to be corrected", () => {
    const t = truncationInstruction();
    expect(t).toContain("CUT OFF");
    expect(t).toContain("SHORTER");
    expect(t).not.toContain("could not be used");
  });

  it("carries a caller's hint about what to drop", () => {
    expect(truncationInstruction("Keep the four issues that matter.")).toContain("Keep the four issues that matter.");
  });

  it("a malformed response is told what was wrong with it", () => {
    expect(repairInstruction("items.0.fix: Required")).toContain("items.0.fix: Required");
  });
});

describe("the repair round gets the right instruction", () => {
  const schema = z.object({ ok: z.boolean() });

  it("shortens a truncated first answer", async () => {
    let seen = "";
    const r = await parseStructuredWithRepair('{"ok":tr', schema, {
      repair: async (_bad, instruction) => { seen = instruction; return '{"ok":true}'; },
    });
    expect(r.ok).toBe(true);
    expect(seen).toContain("CUT OFF");
  });

  it("corrects a complete but wrong first answer", async () => {
    let seen = "";
    await parseStructuredWithRepair('{"ok":"yes"}', schema, {
      repair: async (_bad, instruction) => { seen = instruction; return '{"ok":true}'; },
    });
    expect(seen).toContain("could not be used");
  });

  it("still only ever repairs once, so one bad response cannot become an unbounded bill", async () => {
    let calls = 0;
    const r = await parseStructuredWithRepair('{"ok":tr', schema, {
      repair: async () => { calls += 1; return '{"ok":still bad'; },
    });
    expect(calls).toBe(1);
    expect(r.ok).toBe(false);
  });
});
