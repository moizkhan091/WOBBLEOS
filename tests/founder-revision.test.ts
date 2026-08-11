import { describe, expect, it } from "vitest";
import {
  classifyRevision,
  componentsForInstruction,
  describeRevision,
  revisionInstructionPrompt,
  revisionRequestSchema,
} from "@/lib/domain/founder-revision";

describe("founder revision — scoping an instruction", () => {
  it("treats anything touching what is sold or for how much as SUBSTANCE", () => {
    for (const instruction of [
      "move the retainer to monthly and drop the price by 15%",
      "take out the reporting module",
      "swap the AI receptionist for the no-show system",
      "push phase 2 back a month",
      "the ROI assumptions are too aggressive, make them conservative",
      "add instalment payment terms",
    ]) {
      expect(classifyRevision(instruction), instruction).toBe("substance");
    }
  });

  it("treats wording and layout as PRESENTATION, so no model call is paid for", () => {
    for (const instruction of [
      "shorten the intro, it is too long",
      "fix the typo in the second paragraph",
      "rename the title to something punchier",
      "make the tone a bit friendlier",
      "reorder the sections so outcomes come first",
    ]) {
      expect(classifyRevision(instruction), instruction).toBe("presentation");
    }
  });

  it("defaults to SUBSTANCE when the instruction is ambiguous", () => {
    // Getting this wrong the other way ships a proposal whose body never changed while the founder
    // believes it did. The reverse error only costs one model call.
    expect(classifyRevision("make it better for them")).toBe("substance");
    expect(classifyRevision("Sara will not like this")).toBe("substance");
  });

  it("a substance change re-runs the design; a presentation change only re-assembles", () => {
    expect(componentsForInstruction("drop the price")).toEqual(["solution_design"]);
    expect(componentsForInstruction("fix the typo")).toEqual(["assemble"]);
  });

  it("an explicit scope overrides the classifier", () => {
    expect(componentsForInstruction("drop the price", "presentation")).toEqual(["assemble"]);
    expect(componentsForInstruction("fix the typo", "substance")).toEqual(["solution_design"]);
  });
});

describe("founder revision — the instruction sent to the architect", () => {
  const previousDesign = {
    technicalSolution: "WhatsApp-native intake with an AI receptionist",
    integrationDesign: "Meta Cloud API into the booking tool",
    roiAssumptions: "Recovers 50% of lost slots",
    risks: ["Staff adoption"],
  };

  it("states the change is binding and carries the previous design so it amends rather than restarts", () => {
    const prompt = revisionInstructionPrompt({
      instruction: "remove the reporting module",
      businessName: "Bright Smile Dental",
      previousDesign,
    });
    expect(prompt).toContain("remove the reporting module");
    expect(prompt).toContain("Bright Smile Dental");
    expect(prompt).toMatch(/binding, not a suggestion/);
    // The previous design must travel with it, otherwise the "revision" is a fresh draft.
    expect(prompt).toContain("WhatsApp-native intake");
    expect(prompt).toContain("Meta Cloud API");
    expect(prompt).toMatch(/revise this rather than starting over/);
    // And it must be told to change ONLY the thing asked for.
    expect(prompt).toMatch(/Keep everything else as close to the previous design/);
  });

  it("works when there is no previous design to amend", () => {
    const prompt = revisionInstructionPrompt({ instruction: "add a phase zero", businessName: "Acme", previousDesign: null });
    expect(prompt).toContain("add a phase zero");
    expect(prompt).not.toContain("PREVIOUS DESIGN");
  });
});

describe("founder revision — what the founder is told happened", () => {
  it("says what reran, what was preserved, and whether it cost a synthesis", () => {
    const cheap = describeRevision({ instruction: "fix the typo", scope: "presentation", rerun: ["assemble"], preserved: ["solution_design"] });
    expect(cheap).toContain("fix the typo");
    expect(cheap).toContain("the assembled document");
    expect(cheap).toContain("preserved the solution design");
    expect(cheap).toMatch(/no AI re-synthesis was paid for/);

    const deep = describeRevision({ instruction: "drop the price", scope: "substance", rerun: ["solution_design", "assemble"], preserved: [] });
    expect(deep).toMatch(/re-thought against your instruction/);
    expect(deep).not.toMatch(/preserved /);
  });
});

describe("founder revision — request validation", () => {
  it("rejects an instruction too short to act on", () => {
    expect(revisionRequestSchema.safeParse({ instruction: "fix" }).success).toBe(false);
  });

  it("accepts a real instruction and defaults the scope to auto", () => {
    const parsed = revisionRequestSchema.safeParse({ instruction: "remove the reporting module please" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.scope).toBe("auto");
  });
});
