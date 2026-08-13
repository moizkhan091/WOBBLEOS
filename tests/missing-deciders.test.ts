import { describe, expect, it } from "vitest";
import { missingDeciders, namesInFinding } from "@/lib/domain/known-facts";

/**
 * Verbatim from an approved call finding on a real client. Sara was a contact. Dr Faisal, the OTHER
 * person who has to agree, existed nowhere in the OS, so every "who else has to sign this" check was
 * answering from half the picture.
 */
const REAL = "Sara and Dr Faisal are co-owners; Sara has unilateral authority under PKR 500,000.";

describe("reading the people a call actually named", () => {
  it("finds both owners in the real finding", () => {
    const names = namesInFinding(REAL).map((p) => p.name);
    expect(names).toContain("Dr Faisal");
    expect(names).toContain("Sara");
  });

  it("takes the role from the text when the text says it, and leaves it empty when it does not", () => {
    expect(namesInFinding(REAL)[0].roleHint).toBe("co-owners");
    expect(namesInFinding("Approval sits with Ahmed.")[0]?.roleHint).toBe("");
  });

  it("quotes the sentence, so a founder judges it rather than trusts it", () => {
    expect(namesInFinding(REAL)[0].quote).toContain("co-owners");
  });

  it("says nothing about a finding with no decision-making language in it", () => {
    expect(namesInFinding("They use WhatsApp and a paper diary for everything.")).toEqual([]);
  });

  it("does not mistake a tool or a month for a person", () => {
    const names = namesInFinding("The owner reviews WhatsApp every Monday in Excel.").map((p) => p.name);
    expect(names).not.toContain("WhatsApp");
    expect(names).not.toContain("Monday");
    expect(names).not.toContain("Excel");
  });

  it("does not treat the first word of a sentence as a name", () => {
    // Every sentence starts with a capital; only mid-sentence capitals are candidates.
    expect(namesInFinding("Ownership is split between the two partners.").map((p) => p.name)).not.toContain("Ownership");
  });

  it("counts one person named twice as one person", () => {
    const names = namesInFinding("Faisal is the owner; Faisal signs everything.").map((p) => p.name);
    expect(names.filter((n) => n === "Faisal")).toHaveLength(1);
  });
});

describe("who the calls named that the CRM does not have", () => {
  const findings = [
    { kind: "authority", content: REAL },
    { kind: "pain", content: "Ahmed complains the diary is slow." },
  ];

  it("offers the co-owner who is missing, and not the contact we already have", () => {
    const missing = missingDeciders(findings, ["Sara Ahmed"]);
    expect(missing.map((p) => p.name)).toEqual(["Dr Faisal"]);
  });

  it("matches an existing contact through their title", () => {
    expect(missingDeciders(findings, ["Sara Ahmed", "Faisal Khan"])).toEqual([]);
  });

  it("ignores findings that are not about who decides", () => {
    // "Ahmed" appears in a pain finding; that is not a statement about authority.
    expect(missingDeciders(findings, ["Sara Ahmed"]).map((p) => p.name)).not.toContain("Ahmed");
  });

  it("offers nobody when the calls named nobody", () => {
    expect(missingDeciders([{ kind: "authority", content: "The owner decides everything." }], [])).toEqual([]);
  });

  it("does not offer the same person twice across findings", () => {
    const twice = [
      { kind: "authority", content: REAL },
      { kind: "authority", content: "Dr Faisal is the other owner and has to agree." },
    ];
    expect(missingDeciders(twice, ["Sara"]).filter((p) => p.name.includes("Faisal"))).toHaveLength(1);
  });

  it("survives an empty client with no findings and no contacts", () => {
    expect(missingDeciders([], [])).toEqual([]);
  });
});
