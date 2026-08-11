import { z } from "zod";

/**
 * Founder-instructed revisions (pure domain).
 *
 * The selective-revision engine already exists and is good: an artifact is a graph of versioned
 * components, only what changed reruns, approved components are preserved, the old version is retained
 * and the whole cycle can be rolled back. Its one limitation was the TRIGGER. A cycle could only open
 * when QA failed, so there was no path for the thing a founder actually does all day: "this proposal,
 * take out the reporting module and move the retainer to monthly".
 *
 * This file decides, from the instruction alone, WHICH components that change touches. Getting the
 * scope right is what makes a revision cheap: re-synthesising a solution design costs a model call, so
 * an instruction that only changes wording must not trigger one.
 */

export const FOUNDER_REVISION_MODULE = "founder_revision";

export const revisionRequestSchema = z.object({
  instruction: z.string().trim().min(8, "say what you want changed").max(2000),
  /** Optional: force the scope instead of inferring it. */
  scope: z.enum(["auto", "presentation", "substance"]).default("auto"),
});
export type RevisionRequest = z.infer<typeof revisionRequestSchema>;

/**
 * Presentation-only edits: wording, ordering, formatting, length, tone, titles.
 * These re-assemble the artifact WITHOUT re-running the expensive AI synthesis behind it.
 */
const PRESENTATION_PATTERNS: RegExp[] = [
  /\b(reword|rephrase|rewrite the (intro|summary|wording)|shorten|lengthen|tighten|trim)\b/i,
  /\b(typo|spelling|grammar|punctuation)\b/i,
  /\b(title|heading|headline|subject line|name it|call it)\b/i,
  /\b(reorder|re-?order|move .* (up|down|before|after)|sort)\b/i,
  /\b(format|layout|spacing|bullet|font|slide|page break)\b/i,
  /\b(tone|softer|firmer|less formal|more formal|friendlier)\b/i,
];

/**
 * Substance edits: anything that changes WHAT is being sold, for how much, in what order, or on what
 * assumptions. These must re-run the solution design, because that is where the judgment lives.
 */
const SUBSTANCE_PATTERNS: RegExp[] = [
  /\b(pric|cost|fee|retainer|discount|rate|budget|cheaper|expensive|quote)/i,
  /\b(scope|service|module|deliverable|include|exclude|remove|add|swap|replace|drop)\b/i,
  /\b(timeline|phase|milestone|sequence|roadmap|deadline|weeks|months)\b/i,
  /\b(roi|assumption|risk|integration|approach|architecture|solution)\b/i,
  /\b(terms|payment|instal?ments|contract)\b/i,
];

export type RevisionScope = "presentation" | "substance";

/**
 * Classify an instruction.
 *
 * Deliberately biased toward `substance`. Mis-classifying a real scope change as cosmetic would ship a
 * proposal whose body never actually changed, and a founder would send it believing it had. The reverse
 * error only costs one model call.
 */
export function classifyRevision(instruction: string): RevisionScope {
  const text = instruction ?? "";
  if (SUBSTANCE_PATTERNS.some((re) => re.test(text))) return "substance";
  if (PRESENTATION_PATTERNS.some((re) => re.test(text))) return "presentation";
  return "substance";
}

/** The proposal artifact's components, mirrored from the proposal revision module. */
export const PROPOSAL_COMPONENT_KEYS = ["solution_design", "assemble"] as const;

/**
 * Which components an instruction forces to rerun. Dependents are added by the engine's own plan, so
 * this returns only the ROOT components the change touches.
 */
export function componentsForInstruction(instruction: string, scope: RevisionRequest["scope"] = "auto"): string[] {
  const effective = scope === "auto" ? classifyRevision(instruction) : scope;
  // `assemble` depends on `solution_design`, so naming the design alone reruns both.
  return effective === "presentation" ? ["assemble"] : ["solution_design"];
}

/**
 * The instruction, turned into an addendum for the solution architect.
 *
 * Framed as a binding amendment rather than a suggestion, and it carries the previous design so the
 * rewrite is a targeted change rather than a fresh draft that loses everything the founder liked.
 */
export function revisionInstructionPrompt(input: {
  instruction: string;
  businessName: string;
  previousDesign?: { technicalSolution?: string; integrationDesign?: string; roiAssumptions?: string; risks?: string[] } | null;
}): string {
  const prev = input.previousDesign;
  return [
    `REVISION REQUESTED BY THE FOUNDER for ${input.businessName}. This is binding, not a suggestion:`,
    `"${input.instruction.trim()}"`,
    "",
    "Apply exactly that change. Keep everything else as close to the previous design as you can: the founder",
    "asked for one thing, and a rewrite that quietly changes the rest is worse than no revision at all.",
    prev
      ? [
          "",
          "PREVIOUS DESIGN, revise this rather than starting over:",
          prev.technicalSolution ? `Technical solution: ${prev.technicalSolution}` : null,
          prev.integrationDesign ? `Integration design: ${prev.integrationDesign}` : null,
          prev.roiAssumptions ? `ROI assumptions: ${prev.roiAssumptions}` : null,
          prev.risks?.length ? `Risks: ${prev.risks.join("; ")}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** A short, human summary of what a revision round did, for the founder to approve against. */
export function describeRevision(input: { instruction: string; scope: RevisionScope; rerun: string[]; preserved: string[] }): string {
  const label: Record<string, string> = { solution_design: "the solution design", assemble: "the assembled document" };
  const reran = input.rerun.map((k) => label[k] ?? k).join(" and ");
  const kept = input.preserved.map((k) => label[k] ?? k).join(" and ");
  return [
    `Applied: "${input.instruction.trim()}"`,
    `Re-ran ${reran || "nothing"}${kept ? `, preserved ${kept}` : ""}.`,
    input.scope === "presentation"
      ? "Treated as a presentation change, so the solution design was reused and no AI re-synthesis was paid for."
      : "Treated as a substance change, so the solution design was re-thought against your instruction.",
  ].join(" ");
}
