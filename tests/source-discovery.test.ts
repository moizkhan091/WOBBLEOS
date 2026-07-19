import { describe, expect, it } from "vitest";
import { parseSourceCandidates } from "@/lib/source-discovery";

/**
 * Source-discovery candidate parsing — the scout LLM returns a JSON array of NEW sources to propose. The parser
 * must tolerate fenced/prose-wrapped JSON, drop malformed entries, clamp fields, and coerce an unknown targetType
 * to a safe default. This is the gate before each candidate becomes a PENDING, evidence-cited founder proposal.
 */
describe("parseSourceCandidates", () => {
  it("parses a fenced JSON array + coerces an unknown targetType to 'website'", () => {
    const out = parseSourceCandidates('```json\n[{"name":"Rival Co","handleOrUrl":"https://rival.com","targetType":"nonsense","reason":"named 3x","evidenceIdx":[0,2],"expectedValue":"pricing moves","confidence":0.7}]\n```');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Rival Co");
    expect(out[0].targetType).toBe("website"); // unknown → safe default
    expect(out[0].evidenceIdx).toEqual([0, 2]);
    expect(out[0].confidence).toBe(0.7);
  });

  it("keeps a valid targetType + fills sensible defaults", () => {
    const out = parseSourceCandidates('[{"name":"@rival","handleOrUrl":"@rival","targetType":"competitor_account"}]');
    expect(out[0].targetType).toBe("competitor_account");
    expect(out[0].confidence).toBe(0.5);
    expect(out[0].collectionMethod).toBe("web_scrape");
    expect(out[0].risk).toBe("low");
  });

  it("drops entries missing a name or handle, and returns [] on non-JSON", () => {
    expect(parseSourceCandidates('[{"name":"NoHandle"},{"handleOrUrl":"x.com"}]')).toEqual([]);
    expect(parseSourceCandidates("sorry, nothing to propose")).toEqual([]);
    expect(parseSourceCandidates("")).toEqual([]);
  });
});
