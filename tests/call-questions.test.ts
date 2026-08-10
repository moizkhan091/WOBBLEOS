import { describe, expect, it } from "vitest";
import {
  COVERAGE_AREAS,
  alreadyKnown,
  callQuestionSetSchema,
  coverageRepairInstruction,
  missingCoverage,
  questionSystemPrompt,
  questionUserPrompt,
} from "@/lib/domain/call-questions";
import type { IntakeSnapshot } from "@/lib/domain/intake";

const snapshot: IntakeSnapshot = {
  submittedAt: "2026-08-10T10:00:00.000Z",
  contactName: "Sara Ahmed",
  role: "Founder / owner",
  teamSize: "11-25",
  cityMarket: "Karachi, Pakistan",
  businessDescription: "Three dental clinics across Karachi",
  focusAreas: ["Scheduling / appointments", "Customer support"],
  painPoints: "Front desk answers the same 10 questions all day and no-shows are around 30 percent",
  aiWorkflowStage: "Experimenting personally",
  currentTools: "WhatsApp, Excel, a booking tool",
  urgency: "Immediately",
  openToPaidAudit: "Yes",
  canShareWorkflowContext: "Yes, fully",
  whatMakesCallUseful: "Know what to automate first and what it costs",
  score: 100,
  tier: "Hot",
};

const question = (coverage: string, tier = "core") => ({
  question: "How many enquiries land in a typical week, and who sees them first?",
  why: "Turns the stated bottleneck into a number we can size an audit against.",
  coverage,
  tier,
});

describe("call questions — coverage spine", () => {
  it("reports every area the generated set failed to cover", () => {
    const set = { questions: [question("how_they_get_customers"), question("what_a_fix_is_worth")] } as never;
    const missing = missingCoverage(set);
    expect(missing).toContain("the_bottleneck_in_numbers");
    expect(missing).toContain("who_decides_and_how");
    expect(missing).not.toContain("how_they_get_customers");
  });

  it("is satisfied only when all areas appear", () => {
    const set = { questions: COVERAGE_AREAS.map((a) => question(a)) } as never;
    expect(missingCoverage(set)).toEqual([]);
  });

  it("names the missing areas AND what they mean in the repair instruction", () => {
    const instruction = coverageRepairInstruction(["what_a_fix_is_worth", "who_decides_and_how"]);
    expect(instruction).toContain("what_a_fix_is_worth");
    expect(instruction).toContain("money on the table");
    expect(instruction).toContain("Who signs");
    expect(instruction).toMatch(/Return the FULL corrected JSON/);
  });
});

describe("call questions — never re-ask what the form answered", () => {
  it("turns every answered form field into an explicit ban", () => {
    const known = alreadyKnown(snapshot);
    const joined = known.join("\n");
    expect(joined).toContain("no-shows are around 30 percent"); // their pain
    expect(joined).toContain("WhatsApp, Excel"); // their tools
    expect(joined).toContain("Immediately"); // their urgency
    expect(known.length).toBeGreaterThanOrEqual(8);
  });

  it("bans nothing when the client never filled the form", () => {
    expect(alreadyKnown(undefined)).toEqual([]);
  });

  it("only bans fields they actually answered", () => {
    const sparse = { ...snapshot, currentTools: null, urgency: null, painPoints: null };
    const joined = alreadyKnown(sparse).join("\n");
    expect(joined).not.toMatch(/Which tools they use/);
    expect(joined).not.toMatch(/How soon they want to move/);
    expect(joined).toContain("Three dental clinics"); // still banned — they did answer this
  });
});

describe("call questions — prompt construction", () => {
  it("puts the client's own words and WOBBLE's real services in the prompt", () => {
    const prompt = questionUserPrompt({
      companyName: "Bright Smile Dental",
      industry: "dental",
      snapshot,
      services: ["No-Show Reduction", "AI Receptionist"],
      approvedFacts: ["[metric] 400 enquiries a month"],
      marketNotes: ["Competitor X answers within 3 minutes"],
    });
    expect(prompt).toContain("Bright Smile Dental");
    expect(prompt).toContain("no-shows are around 30 percent");
    expect(prompt).toContain("No-Show Reduction");
    expect(prompt).toContain("400 enquiries a month");
    expect(prompt).toContain("Competitor X");
    expect(prompt).toContain("DO NOT ASK");
    // The pain is restated as the call's job, so the model optimises for making it countable.
    expect(prompt).toMatch(/turn their stated pain .* into countable reality/);
  });

  it("tells the model to FIND a pain when the client described none", () => {
    const prompt = questionUserPrompt({ companyName: "Acme", snapshot: { ...snapshot, painPoints: null }, services: [] });
    expect(prompt).toMatch(/did not describe a specific pain/);
  });

  it("survives a client who never filled the form at all", () => {
    const prompt = questionUserPrompt({ companyName: "Walk-in Co", services: ["AI Receptionist"] });
    expect(prompt).toContain("Walk-in Co");
    expect(prompt).not.toContain("undefined");
  });

  it("the system prompt demands numbers, bans stacked questions and lists the spine", () => {
    const sys = questionSystemPrompt();
    expect(sys).toMatch(/Chase NUMBERS/);
    expect(sys).toMatch(/One question per question/);
    expect(sys).toMatch(/find out WHY/); // why a previous tool failed
    for (const area of COVERAGE_AREAS) expect(sys).toContain(area);
  });
});

describe("call questions — output validation", () => {
  const valid = {
    opening: "Thanks for the detail on the form — I want to start with the front desk.",
    questions: COVERAGE_AREAS.map((a) => question(a)),
    doNotAsk: ["What the business does"],
  };

  it("accepts a well-formed set", () => {
    expect(callQuestionSetSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a set too thin to run a call from", () => {
    expect(callQuestionSetSchema.safeParse({ ...valid, questions: valid.questions.slice(0, 3) }).success).toBe(false);
  });

  it("rejects an unknown coverage area rather than silently accepting it", () => {
    const bad = { ...valid, questions: [...valid.questions.slice(1), question("vibes")] };
    expect(callQuestionSetSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a one-word question", () => {
    const bad = { ...valid, questions: [...valid.questions.slice(1), { ...question("what_a_fix_is_worth"), question: "Budget?" }] };
    expect(callQuestionSetSchema.safeParse(bad).success).toBe(false);
  });

  it("defaults doNotAsk so a model omitting it does not fail the whole set", () => {
    const parsed = callQuestionSetSchema.safeParse({ opening: valid.opening, questions: valid.questions });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.doNotAsk).toEqual([]);
  });
});
