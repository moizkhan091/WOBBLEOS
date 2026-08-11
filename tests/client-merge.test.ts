import { describe, expect, it } from "vitest";
import { domainOf, findDuplicates, mergeRequestSchema, nameKey, phoneKey, type MergeCandidateInput } from "@/lib/domain/client-merge";

const at = (iso: string) => new Date(iso);
const co = (over: Partial<MergeCandidateInput> & { id: string; name: string }): MergeCandidateInput => ({
  website: null, email: null, phone: null, createdAt: at("2026-01-01T00:00:00Z"), weight: 0, ...over,
});

describe("normalising the things two containers can share", () => {
  it("reduces a URL to the host that identifies the business", () => {
    expect(domainOf("https://www.zamzam.pk/about?x=1")).toBe("zamzam.pk");
    expect(domainOf("zamzam.pk")).toBe("zamzam.pk");
    expect(domainOf("HTTP://ZamZam.PK/")).toBe("zamzam.pk");
  });

  it("refuses anything that is not a host, rather than matching on junk", () => {
    expect(domainOf("instagram")).toBeNull();
    expect(domainOf("")).toBeNull();
    expect(domainOf(null)).toBeNull();
  });

  it("compares phone numbers on the digits that identify a person", () => {
    expect(phoneKey("+92 300 000 0001")).toBe(phoneKey("03000000001"));
    expect(phoneKey("+92 300 000 0001")).not.toBe(phoneKey("+92 300 000 0002"));
  });

  it("ignores a number too short to identify anyone", () => {
    expect(phoneKey("12345")).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });

  it("strips punctuation, brackets and legal suffixes from a name", () => {
    expect(nameKey("Zamzam Dental Clinics (WOBBLE OS test)")).toBe("zamzam dental clinics");
    expect(nameKey("Zamzam Dental Clinics Pvt Ltd")).toBe("zamzam dental clinics");
    expect(nameKey("The Wobble Company")).toBe("wobble");
  });
});

describe("finding twins", () => {
  it("is near certain when two containers share a website", () => {
    const pairs = findDuplicates([
      co({ id: "a", name: "Zamzam Dental", website: "https://zamzam.pk" }),
      co({ id: "b", name: "Zam Zam Clinics", website: "http://www.zamzam.pk/contact" }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].confidence).toBe(95);
    expect(pairs[0].reasons[0]).toContain("zamzam.pk");
  });

  it("is only a suggestion when nothing but the name matches", () => {
    const pairs = findDuplicates([
      co({ id: "a", name: "Bright Smile Dental" }),
      co({ id: "b", name: "Bright Smile Dental Pvt Ltd" }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].confidence).toBe(70);
  });

  it("says nothing about two businesses that merely both exist", () => {
    expect(findDuplicates([co({ id: "a", name: "Zamzam Dental" }), co({ id: "b", name: "Karachi Motors" })])).toEqual([]);
  });

  it("keeps the container holding more history", () => {
    const pairs = findDuplicates([
      co({ id: "thin", name: "Zamzam Dental", website: "zamzam.pk", weight: 1 }),
      co({ id: "rich", name: "Zamzam Dental", website: "zamzam.pk", weight: 40 }),
    ]);
    expect(pairs[0].keepId).toBe("rich");
    expect(pairs[0].mergeId).toBe("thin");
  });

  it("breaks a tie on age, since older records are the ones other things point at", () => {
    const pairs = findDuplicates([
      co({ id: "new", name: "Zamzam Dental", website: "zamzam.pk", createdAt: at("2026-08-01T00:00:00Z") }),
      co({ id: "old", name: "Zamzam Dental", website: "zamzam.pk", createdAt: at("2026-01-01T00:00:00Z") }),
    ]);
    expect(pairs[0].keepId).toBe("old");
  });

  it("ranks the strongest evidence first", () => {
    const pairs = findDuplicates([
      co({ id: "a", name: "Alpha Clinic" }),
      co({ id: "b", name: "Alpha Clinic Pvt Ltd" }),
      co({ id: "c", name: "Beta Motors", website: "beta.pk" }),
      co({ id: "d", name: "Beta Motors Group", website: "https://beta.pk" }),
    ]);
    expect(pairs[0].confidence).toBeGreaterThan(pairs[1].confidence);
    expect([pairs[0].keepId, pairs[0].mergeId].sort()).toEqual(["c", "d"]);
  });

  it("gives every reason it found, not just the strongest", () => {
    const pairs = findDuplicates([
      co({ id: "a", name: "Zamzam Dental", website: "zamzam.pk", email: "hi@zamzam.pk", phone: "+923000000001" }),
      co({ id: "b", name: "Zamzam Dental", website: "zamzam.pk", email: "hi@zamzam.pk", phone: "03000000001" }),
    ]);
    expect(pairs[0].reasons.length).toBe(4);
  });

  it("does not pair a container with itself", () => {
    expect(findDuplicates([co({ id: "a", name: "Zamzam Dental", website: "zamzam.pk" })])).toEqual([]);
  });
});

describe("the merge request", () => {
  it("refuses to merge a container into itself", () => {
    expect(mergeRequestSchema.safeParse({ keepId: "a", mergeId: "a" }).success).toBe(false);
    expect(mergeRequestSchema.safeParse({ keepId: "a", mergeId: "b" }).success).toBe(true);
  });
});
