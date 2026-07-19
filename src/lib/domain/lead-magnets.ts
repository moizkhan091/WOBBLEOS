import { z } from "zod";
import { newId } from "@/lib/ids";
import { parseJsonObject } from "@/lib/domain/content-graph";

/**
 * Lead Magnets — the pure core. A magnet is a USABLE OUTCOME (an n8n workflow pack, prompt pack, checklist,
 * SOP, scorecard, calculator, template), not a pretty PDF. Deeply educational, mechanism-first, review-gated.
 * Portfolio-first: keep a small excellent set, not one per post. Provider-free + unit-tested.
 */

export const LEAD_MAGNET_TYPES = ["workflow_pack", "prompt_pack", "checklist", "template", "sop", "scorecard", "calculator"] as const;
export type LeadMagnetType = (typeof LEAD_MAGNET_TYPES)[number];

export type LeadMagnetStatus = "pending_review" | "approved" | "rejected" | "retired";

const sectionSchema = z.object({ heading: z.string().trim().min(1), body: z.string().trim().min(1) });

export const leadMagnetSchema = z.object({
  title: z.string().trim().min(1),
  magnetType: z.enum(LEAD_MAGNET_TYPES),
  audience: z.string().trim().min(1),
  promise: z.string().trim().min(1), // the concrete outcome the user gets
  sections: z.array(sectionSchema).min(2), // the teaching body
  deliverable: z.string().trim().min(1), // the actual usable asset (n8n JSON outline / the prompts / the checklist)
});
export type LeadMagnetSpec = z.infer<typeof leadMagnetSchema>;

/** Build the generator prompt. Enforces the content-value bar: real mechanism, usable outcome, no fluff. */
export function buildLeadMagnetPrompt(input: { topicTitle: string; teachingJob: string; pillar?: string; audience?: string }): { system: string; user: string } {
  const system = `You are WOBBLE's LEAD-MAGNET builder. Create ONE deeply-educational, genuinely USABLE lead magnet for Pakistan-first SMB founders — the kind that makes the reader smarter and able to DO something, not a shallow PDF. WOBBLE teaches the real mechanism; no gatekeeping, no fluff.

Pick the best type for the topic ∈ ${JSON.stringify(LEAD_MAGNET_TYPES)}. If it teaches an automation, prefer workflow_pack and give the ACTUAL n8n/Make workflow (nodes, inputs, actions, outputs, decisions, failure routes) so a founder can rebuild it. If it's about prompting, give a real prompt_pack with the exact prompts + how to use them.

The magnet MUST provide a usable outcome: complete content + a worked example, mechanism steps with inputs/actions/outputs, at least one failure check + human override, and a test to prove it works. Concrete, specific, correct.

Respond with STRICT JSON only:
{"title":"...","magnetType":"workflow_pack|prompt_pack|checklist|template|sop|scorecard|calculator","audience":"...","promise":"the concrete outcome the reader gets","sections":[{"heading":"...","body":"tight, concrete teaching (can be multi-line)"}],"deliverable":"the ACTUAL usable asset — the n8n node list / the exact prompts / the checklist items / the template — ready to copy and use"}`;
  const user = `TOPIC: ${input.topicTitle}\nTEACHING JOB (the real mechanism): ${input.teachingJob}\n${input.pillar ? `PILLAR: ${input.pillar}\n` : ""}${input.audience ? `AUDIENCE: ${input.audience}\n` : ""}Build the magnet. STRICT JSON only.`;
  return { system, user };
}

export function parseLeadMagnet(text: string): LeadMagnetSpec | null {
  return parseJsonObject(text, leadMagnetSchema);
}

export interface LeadMagnetRow {
  id: string;
  title: string;
  magnetType: LeadMagnetType;
  audience: string;
  promise: string;
  sections: Array<{ heading: string; body: string }>;
  deliverable: string | null;
  usableOutcome: boolean;
  status: LeadMagnetStatus;
  pillar: string | null;
  topicId: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdByAgent: string | null;
  model: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export function buildLeadMagnetRow(
  input: { spec: LeadMagnetSpec; pillar?: string; topicId?: string | null; createdByAgent?: string; model?: string },
  opts: { id?: string; now?: Date } = {},
): LeadMagnetRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("magnet"),
    title: input.spec.title,
    magnetType: input.spec.magnetType,
    audience: input.spec.audience,
    promise: input.spec.promise,
    sections: input.spec.sections,
    deliverable: input.spec.deliverable,
    usableOutcome: true,
    status: "pending_review",
    pillar: input.pillar ?? null,
    topicId: input.topicId ?? null,
    reviewedBy: null,
    reviewedAt: null,
    createdByAgent: input.createdByAgent ?? null,
    model: input.model ?? null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}
