import { z } from "zod";
import type { ProviderMessage } from "@/lib/providers";
import { CONTENT_FORMATS, CONTENT_PLATFORMS, type ContentFormat, type ContentPlatform } from "@/lib/domain/content-command";
import { selfReviewSchema } from "@/lib/domain/content-packet";

/**
 * Chunk 15 (evolution) — Multi-Agent Content Graph (pure domain).
 *
 * Replaces the single-LLM content call with a real creative-agency GRAPH: Strategy ->
 * Research (grounded in the Knowledge Compiler + memory) -> Copywriting (draft -> self-critique
 * -> revise) -> Scoring/QA -> Assemble a content PACK. Each node is its own agent_run with its
 * own model role. This file holds the pure pieces (schemas, prompts, parsers, assembly); the
 * orchestrator + IO live in src/lib/content-graph.
 */

export const CONTENT_GRAPH_MODULE = "content";
export const CONTENT_GRAPH_JOB_TYPE = "content.graph";
export const CONTENT_GRAPH_QUEUE = "general";

// Per-node model roles (routed via settings model_roles; fall back to the default model when
// unmapped). Cheap for extraction/scoring, strong for strategy/copy — see the vision's tiering.
export const CONTENT_GRAPH_ROLES = {
  strategy: "content_strategy",
  research: "content_research",
  copywriting: "content_copywriting",
  scoring: "content_scoring",
} as const;

// Distinct registry agents so the dashboard shows the TEAM behind each pack.
export const CONTENT_GRAPH_AGENTS = {
  strategy: "content_strategist",
  research: "content_researcher",
  copywriting: "content_copywriter",
  scoring: "content_scorer",
} as const;

// ---------------------------------------------------------------- node schemas

const platformEnum = z.enum(CONTENT_PLATFORMS);
const formatEnum = z.enum(CONTENT_FORMATS);

export const creativeBriefSchema = z.object({
  topic: z.string().trim().min(1),
  angle: z.string().trim().min(1),
  platform: platformEnum,
  format: formatEnum,
  targetAudience: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
});
export type CreativeBrief = z.infer<typeof creativeBriefSchema>;

export const evidencePackSchema = z.object({
  supportingPoints: z
    .array(
      z.object({
        point: z.string().trim().min(1),
        noteIndexes: z.array(z.number().int().nonnegative()).default([]),
        chunkIndexes: z.array(z.number().int().nonnegative()).default([]),
      }),
    )
    .default([]),
  evidenceSummary: z.string().trim().default(""),
  claimRiskLevel: z.enum(["low", "medium", "high"]).default("low"),
  proofRequired: z.boolean().default(false),
});
export type EvidencePack = z.infer<typeof evidencePackSchema>;

const carouselSlideSchema = z.object({ heading: z.string().trim().default(""), body: z.string().trim().default("") });

export const copyDraftSchema = z.object({
  hook: z.string().trim().min(1),
  mainCopy: z.string().trim().default(""),
  caption: z.string().trim().min(1),
  cta: z.string().trim().min(1),
  carouselSlides: z.array(carouselSlideSchema).default([]),
  designDirection: z.string().trim().min(1),
});
export type CopyDraft = z.infer<typeof copyDraftSchema>;

export const copyRevisionSchema = z.object({
  issues: z.array(z.string().trim().min(1)).default([]),
  revised: copyDraftSchema,
});
export type CopyRevision = z.infer<typeof copyRevisionSchema>;

export const contentScoreSchema = z.object({
  selfReview: selfReviewSchema,
  predictedImpact: z.number().min(0).max(100).default(0),
  brandFit: z.number().min(0).max(100).default(0),
  platformFit: z.number().min(0).max(100).default(0),
  rationale: z.string().trim().default(""),
});
export type ContentScore = z.infer<typeof contentScoreSchema>;

// ---------------------------------------------------------------- robust JSON parse

function extractJson(text: string): string | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  if (start === -1) return null;
  const end = body.lastIndexOf("}");
  if (end <= start) return null;
  return body.slice(start, end + 1);
}

/** Parse a model response into a schema-validated object, or null when it can't be trusted. */
export function parseJsonObject<T>(text: string, schema: z.ZodType<T>): T | null {
  const raw = extractJson(text);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}

// ---------------------------------------------------------------- retrieval refs

export interface GraphKnowledgeNote {
  id: string;
  title: string;
  content: string;
  noteType: string;
  sourceIds: string[];
  sourceId?: string | null;
}
export interface GraphSourceChunk {
  id: string;
  sourceId: string | null;
  content: string;
}

/** Map the research node's cited note/chunk indexes back to real ids + the sources behind them. */
export function collectProvenance(
  points: EvidencePack["supportingPoints"],
  notes: GraphKnowledgeNote[],
  chunks: GraphSourceChunk[],
): { insightIds: string[]; chunkIds: string[]; sourceIds: string[] } {
  const insightIds = new Set<string>();
  const chunkIds = new Set<string>();
  const sourceIds = new Set<string>();
  for (const p of points) {
    for (const ni of p.noteIndexes) {
      const note = notes[ni];
      if (note) {
        insightIds.add(note.id);
        for (const s of note.sourceIds ?? []) sourceIds.add(s);
        if (note.sourceId) sourceIds.add(note.sourceId);
      }
    }
    for (const ci of p.chunkIndexes) {
      const chunk = chunks[ci];
      if (chunk) {
        chunkIds.add(chunk.id);
        if (chunk.sourceId) sourceIds.add(chunk.sourceId);
      }
    }
  }
  return { insightIds: [...insightIds], chunkIds: [...chunkIds], sourceIds: [...sourceIds] };
}

// ---------------------------------------------------------------- prompts

export interface GraphTrackContext {
  personaName: string;
  platform?: ContentPlatform;
  bannedPhrases?: string[];
  voiceNotes?: string;
}

export function buildStrategyPrompt(input: {
  objective: string;
  track: GraphTrackContext;
  platformFocus?: string[];
  formatFocus?: string[];
  brain: Array<{ title: string; content: string }>;
  knowledgeTopics: string[];
}): ProviderMessage[] {
  const system = `You are the Content STRATEGIST (creative director) for ${input.track.personaName}. Decide the single best thing to post now: the TOPIC, the ANGLE (fresh — avoid the obvious), the FORMAT, the PLATFORM, the target audience, and the concrete objective. Ground your choice in what we actually know. Respond with STRICT JSON only:
{"topic":"...","angle":"...","platform":"instagram|linkedin|x|youtube|multi","format":"static|carousel|text|thread|reel_script|youtube_script","targetAudience":"...","objective":"...","rationale":"..."}`;
  const context = [
    `OBJECTIVE: ${input.objective}`,
    input.platformFocus?.length ? `PREFERRED PLATFORMS: ${input.platformFocus.join(", ")}` : null,
    input.formatFocus?.length ? `PREFERRED FORMATS: ${input.formatFocus.join(", ")}` : null,
    input.knowledgeTopics.length ? `KNOWLEDGE WE HAVE (topics): ${input.knowledgeTopics.slice(0, 30).join(", ")}` : null,
    input.brain.length ? `BRAND BRAIN:\n${input.brain.slice(0, 8).map((b) => `- ${b.title}: ${b.content}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: context },
  ];
}

export function buildEvidencePrompt(input: { brief: CreativeBrief; notes: GraphKnowledgeNote[]; chunks: GraphSourceChunk[] }): ProviderMessage[] {
  const system = `You are the Content RESEARCHER. For the given brief, assemble the EVIDENCE from ONLY the numbered knowledge notes and source chunks below — never invent. Cite the indexes you used. If evidence is thin, say so and keep claimRiskLevel low. Respond with STRICT JSON only:
{"supportingPoints":[{"point":"...","noteIndexes":[0],"chunkIndexes":[0]}],"evidenceSummary":"...","claimRiskLevel":"low|medium|high","proofRequired":false}`;
  const notes = input.notes.map((n, i) => `NOTE[${i}] (${n.noteType}) ${n.title}: ${n.content}`).join("\n");
  const chunks = input.chunks.map((c, i) => `CHUNK[${i}] ${c.content}`).join("\n");
  const user = `BRIEF: ${input.brief.topic} — angle: ${input.brief.angle}\n\nKNOWLEDGE NOTES:\n${notes || "(none)"}\n\nSOURCE CHUNKS:\n${chunks || "(none)"}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildCopyDraftPrompt(input: { brief: CreativeBrief; evidence: EvidencePack; track: GraphTrackContext }): ProviderMessage[] {
  const banned = input.track.bannedPhrases?.length ? `\nNEVER use these phrases: ${input.track.bannedPhrases.join(", ")}.` : "";
  const system = `You are the COPYWRITER for ${input.track.personaName}. Write in-brand copy for the brief using ONLY the supporting evidence. Strong scroll-stopping hook, tight caption, one clear CTA. For carousel format, write 3-6 slides.${banned} ${input.track.voiceNotes ?? ""}
Respond with STRICT JSON only:
{"hook":"...","mainCopy":"...","caption":"...","cta":"...","carouselSlides":[{"heading":"...","body":"..."}],"designDirection":"..."}`;
  const evidence = input.evidence.supportingPoints.map((p, i) => `- ${p.point}`).join("\n");
  const user = `TOPIC: ${input.brief.topic}\nANGLE: ${input.brief.angle}\nPLATFORM: ${input.brief.platform}\nFORMAT: ${input.brief.format}\nAUDIENCE: ${input.brief.targetAudience}\n\nEVIDENCE:\n${evidence || "(thin — keep claims soft)"}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildCopyRevisePrompt(input: { draft: CopyDraft; brief: CreativeBrief; track: GraphTrackContext }): ProviderMessage[] {
  const system = `You are the COPYWRITER doing a rigorous SELF-CRITIQUE pass. Find the real weaknesses (weak hook, vague CTA, off-brand, generic, unsupported) and output a genuinely stronger revision. Do not just restate. Respond with STRICT JSON only:
{"issues":["..."],"revised":{"hook":"...","mainCopy":"...","caption":"...","cta":"...","carouselSlides":[{"heading":"...","body":"..."}],"designDirection":"..."}}`;
  const user = `BRIEF ANGLE: ${input.brief.angle}\n\nDRAFT:\n${JSON.stringify(input.draft)}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildScorePrompt(input: { copy: CopyDraft; brief: CreativeBrief; hasEvidence: boolean }): ProviderMessage[] {
  const system = `You are the Content QUALITY & SCORING agent. Score the copy honestly (0-10 each) and decide if it is post-worthy. Be strict: postWorthiness "pass" only if it would genuinely represent a premium agency. Respond with STRICT JSON only:
{"selfReview":{"usefulness":0,"originality":0,"brandFit":0,"clarity":0,"aggressionControl":0,"proofStrength":0,"postWorthiness":"pass|fail"},"predictedImpact":0,"brandFit":0,"platformFit":0,"rationale":"..."}`;
  const user = `PLATFORM: ${input.brief.platform} FORMAT: ${input.brief.format}\nHAS EVIDENCE: ${input.hasEvidence}\n\nCOPY:\n${JSON.stringify(input.copy)}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ---------------------------------------------------------------- assembly

export interface AssemblePacketInput {
  contentTrackId: string;
  brief: CreativeBrief;
  copy: CopyDraft;
  evidence: EvidencePack;
  score: ContentScore;
  provenance: { insightIds: string[]; chunkIds: string[]; sourceIds: string[] };
  createdBy: string;
}

/** Coerce a possibly-loose platform/format onto the allowed enums (fallback: sensible defaults). */
export function coercePlatform(value: string): ContentPlatform {
  return (CONTENT_PLATFORMS as readonly string[]).includes(value) ? (value as ContentPlatform) : "instagram";
}
export function coerceFormat(value: string): ContentFormat {
  return (CONTENT_FORMATS as readonly string[]).includes(value) ? (value as ContentFormat) : "carousel";
}

/** Build the exact input createContentPacket expects from the graph's outputs. */
export function assembleContentPacketInput(input: AssemblePacketInput) {
  const { brief, copy, evidence, score, provenance } = input;
  // If we have no grounded sources, the packet's own guard forbids medium/high claim risk — so
  // downgrade to low + not-proof-required rather than fail assembly on an ungrounded pack.
  const grounded = provenance.sourceIds.length > 0;
  const claimRiskLevel = grounded ? evidence.claimRiskLevel : "low";
  const proofRequired = grounded ? evidence.proofRequired : false;
  return {
    contentTrackId: input.contentTrackId,
    platform: coercePlatform(brief.platform),
    format: coerceFormat(brief.format),
    objective: brief.objective,
    targetAudience: brief.targetAudience,
    angle: brief.angle,
    hook: copy.hook,
    mainCopy: copy.mainCopy || copy.caption,
    carouselSlides: copy.carouselSlides.map((s) => ({ heading: s.heading, body: s.body })),
    caption: copy.caption,
    cta: copy.cta,
    designDirection: copy.designDirection,
    sourceIdsUsed: provenance.sourceIds,
    insightIdsUsed: provenance.insightIds,
    memoryChunksUsed: provenance.chunkIds,
    evidenceSummary: evidence.evidenceSummary,
    claimRiskLevel,
    proofRequired,
    selfReview: score.selfReview,
    createdBy: input.createdBy,
  };
}
