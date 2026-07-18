import { z } from "zod";
import { newId } from "@/lib/ids";

/**
 * Discovery & Meeting Intelligence — the pure core. An LLM reads a meeting transcript/notes and extracts
 * discrete, typed discovery facts, EACH carrying a confidence (0-100) and a verbatim source snippet so a
 * founder can review it against what was actually said. Nothing is trusted until reviewed: every extracted
 * item lands `pending_review`. Parsing/validation here is provider-free and unit-tested.
 */

export const MEETING_INTELLIGENCE_KINDS = [
  "pain",          // a business problem / cost / chaos the prospect described
  "budget",        // any budget signal (has budget, no budget, range, who controls spend)
  "authority",     // decision-maker / who signs off
  "need",          // a specific need or desired workflow/outcome
  "timeline",      // urgency / when they want to act
  "current_stack", // tools / systems / manual processes in use today
  "objection",     // a concern or hesitation raised
  "next_step",     // an agreed next action
  "risk",          // a deal risk (ghosting signal, unrealistic expectation, compliance, etc.)
] as const;
export type MeetingIntelligenceKind = (typeof MEETING_INTELLIGENCE_KINDS)[number];

export type MeetingIntelligenceStatus = "pending_review" | "approved" | "rejected";

export interface ExtractedFact {
  kind: MeetingIntelligenceKind;
  content: string;
  confidence: number; // 0..100
  sourceSnippet: string;
}

const factSchema = z.object({
  kind: z.enum(MEETING_INTELLIGENCE_KINDS),
  content: z.string().trim().min(1),
  confidence: z.coerce.number().min(0).max(100),
  sourceSnippet: z.string().trim().min(1),
});
const extractionSchema = z.object({ facts: z.array(factSchema) });

/** Parse + validate the extractor's JSON output. Tolerates prose/fences; drops malformed facts, never invents. */
export function parseExtraction(raw: string): ExtractedFact[] {
  let json: unknown;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    json = JSON.parse(m ? m[0] : raw);
  } catch {
    throw new Error("meeting extraction returned unparseable output");
  }
  const parsed = extractionSchema.safeParse(json);
  if (!parsed.success) {
    // fall back to salvaging any well-formed facts from a facts[] array
    const facts = (json as { facts?: unknown }).facts;
    if (!Array.isArray(facts)) throw new Error("meeting extraction missing a facts[] array");
    return facts.map((f) => factSchema.safeParse(f)).filter((r) => r.success).map((r) => ({ ...r.data, confidence: Math.round(r.data.confidence) }));
  }
  return parsed.data.facts.map((f) => ({ ...f, confidence: Math.round(f.confidence) }));
}

export interface MeetingIntelligenceRow {
  id: string;
  meetingId: string;
  companyId: string | null;
  kind: MeetingIntelligenceKind;
  content: string;
  confidence: number;
  sourceSnippet: string;
  status: MeetingIntelligenceStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  model: string | null;
  createdBy: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export function buildMeetingIntelligenceRow(
  input: { meetingId: string; companyId?: string | null; kind: MeetingIntelligenceKind; content: string; confidence: number; sourceSnippet: string; model?: string; createdBy?: string },
  opts: { id?: string; now?: Date } = {},
): MeetingIntelligenceRow {
  const now = opts.now ?? new Date();
  return {
    id: opts.id ?? newId("meetingintel"),
    meetingId: input.meetingId,
    companyId: input.companyId ?? null,
    kind: input.kind,
    content: input.content,
    confidence: Math.max(0, Math.min(100, Math.round(input.confidence))),
    sourceSnippet: input.sourceSnippet,
    status: "pending_review",
    reviewedBy: null,
    reviewedAt: null,
    model: input.model ?? null,
    createdBy: input.createdBy ?? null,
    metadata: {},
    createdAt: now,
  };
}
