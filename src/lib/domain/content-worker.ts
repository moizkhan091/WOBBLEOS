import { z } from "zod";
import {
  buildContentTrackPromptBlock,
  CONTENT_FORMATS,
  CONTENT_PLATFORMS,
  type ContentTrackRow,
} from "@/lib/domain/content-command";
import { selfReviewSchema } from "@/lib/domain/content-packet";
import type { ProviderMessage } from "@/lib/providers";

export const CONTENT_GENERATE_JOB_TYPE = "content.generate";
export const CONTENT_GENERATION_QUEUE = "general";
export const CONTENT_GENERATION_MODULE = "content_command";
export const CONTENT_PROVIDER_MODULE = "content";
export const CONTENT_STRATEGY_ROLE = "content_strategy";

export const contentGenerationRequestSchema = z.object({
  contentTrackId: z.string().trim().min(1).default("track_wobble_company"),
  requestedBy: z.string().trim().min(1).default("system"),
  objective: z.string().trim().min(1).optional(),
  platformFocus: z.array(z.enum(CONTENT_PLATFORMS)).default([]),
  formatFocus: z.array(z.enum(CONTENT_FORMATS)).default([]),
  sourceLimit: z.number().int().min(1).max(50).optional(),
  sourceChunkLimit: z.number().int().min(1).max(10).optional(),
  memoryLimit: z.number().int().min(1).max(50).optional(),
  maxPackets: z.number().int().min(1).max(10).optional(),
  maxTokens: z.number().int().min(400).max(4000).optional(),
  temperature: z.number().min(0).max(1.5).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

export type ContentGenerationRequest = z.input<typeof contentGenerationRequestSchema>;
export type ParsedContentGenerationRequest = z.output<typeof contentGenerationRequestSchema>;

export interface ContentWorkerBrainRecord {
  slug: string;
  title: string;
  area: string;
  content: string;
}

export interface ContentWorkerMemoryChunk {
  id: string;
  content: string;
  trustLevel: string;
  tags?: string[];
}

export interface ContentWorkerSourceRef {
  id: string;
  title: string;
  sourceType: string;
  trustLevel: string;
  chunks: Array<{ id: string; content: string }>;
}

const stringList = z.array(z.string().trim().min(1)).default([]);

const carouselSlideSchema = z.union([
  z.string().trim().min(1).transform((body) => ({ body })),
  z.record(z.string(), z.unknown()),
]);

export const generatedContentPacketSchema = z.object({
  platform: z.enum(CONTENT_PLATFORMS),
  format: z.enum(CONTENT_FORMATS),
  objective: z.string().trim().min(1),
  targetAudience: z.string().trim().min(1),
  angle: z.string().trim().min(1),
  hook: z.string().trim().min(1),
  mainCopy: z.string().trim().default(""),
  carouselSlides: z.array(carouselSlideSchema).default([]),
  caption: z.string().trim().default(""),
  cta: z.string().trim().min(1),
  designDirection: z.string().trim().min(1),
  sourceIdsUsed: z.array(z.string().trim().min(1)).min(1),
  insightIdsUsed: stringList,
  memoryChunksUsed: z.array(z.string().trim().min(1)).min(1),
  evidenceSummary: z.string().trim().min(1),
  claimRiskLevel: z.enum(["low", "medium", "high"]).default("medium"),
  proofRequired: z.boolean().default(true),
  selfReview: selfReviewSchema,
});

export const contentWorkerModelOutputSchema = z.object({
  packets: z.array(generatedContentPacketSchema).min(1).max(10),
  notes: z.string().trim().optional(),
});

export type GeneratedContentPacket = z.output<typeof generatedContentPacketSchema>;
export type ContentWorkerModelOutput = z.output<typeof contentWorkerModelOutputSchema>;

function clean(value: string, max = 1200): string {
  const single = value.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max - 1)}...` : single;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const raw = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(raw);
  } catch {
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(raw.slice(first, last + 1));
      } catch {
        // fall through to the standard error below
      }
    }
    throw new Error("Content worker model output must be valid JSON");
  }
}

export function parseContentWorkerModelOutput(text: string): ContentWorkerModelOutput {
  const parsed = contentWorkerModelOutputSchema.parse(extractJson(text));
  return {
    ...parsed,
    packets: parsed.packets.map((packet) => ({
      ...packet,
      caption: packet.caption.trim() || packet.mainCopy.trim() || packet.hook,
    })),
  };
}

function sourceChunkCount(sources: ContentWorkerSourceRef[]): number {
  return sources.reduce((total, source) => total + source.chunks.length, 0);
}

export function assertContentGenerationContext(input: {
  brain: ContentWorkerBrainRecord[];
  sources: ContentWorkerSourceRef[];
}): void {
  if (input.brain.length === 0 || sourceChunkCount(input.sources) === 0) {
    throw new Error("Content generation requires WOBBLE Brain and approved source chunk context before spending provider tokens");
  }
}

export interface BuildContentGenerationPromptInput {
  request: ContentGenerationRequest;
  track: ContentTrackRow;
  brain: ContentWorkerBrainRecord[];
  memory: ContentWorkerMemoryChunk[];
  sources: ContentWorkerSourceRef[];
  // Chunk 34: an approved prompt-skill loaded from the registry drives the
  // system instruction. When absent, the built-in default below is used.
  skill?: { promptBody: string; rules: string[] };
  /** Learned founder-taste guidance block (formatTasteGuidance) — the read-back half of the taste loop. */
  taste?: string;
}

export interface ContentGenerationPrompt {
  messages: ProviderMessage[];
  sourceIds: string[];
  memoryChunkIds: string[];
}

export function buildContentGenerationPrompt(input: BuildContentGenerationPromptInput): ContentGenerationPrompt {
  const request = contentGenerationRequestSchema.parse(input.request);
  assertContentGenerationContext({ brain: input.brain, sources: input.sources });

  const brainBlock = input.brain
    .map((record) => `- ${record.title} (${record.area}/${record.slug}): ${clean(record.content)}`)
    .join("\n");
  const memoryBlock = input.memory.length
    ? input.memory.map((chunk) => `- ${chunk.id} trust=${chunk.trustLevel}: ${clean(chunk.content)}`).join("\n")
    : "(no additional working memory retrieved)";
  const sourceBlock = input.sources
    .map((source) => {
      const chunks = source.chunks.map((chunk) => `  - ${chunk.id}: ${clean(chunk.content)}`).join("\n");
      return `- ${source.title} (${source.id}) type=${source.sourceType} trust=${source.trustLevel}\n${chunks}`;
    })
    .join("\n");

  const skillPreamble = input.skill
    ? [input.skill.promptBody, ...(input.skill.rules.length ? ["Skill rules:\n" + input.skill.rules.map((r) => "- " + r).join("\n")] : [])]
    : [];
  const systemPrompt = [
    ...skillPreamble,
    "You are the WOBBLE Content Worker. Generate WOBBLE company content packets from current approved context only.",
    "Do not invent facts, citations, metrics, trends, offers, or source IDs. Use the source IDs and memory chunk IDs provided below.",
    "Do not hardcode a fixed content mix. Choose the useful number of packets for the request, up to the requested max.",
    "Passing packets should be useful, original, clear, WOBBLE-fit, proof-aware, and approval-ready. If an angle is risky, score it honestly.",
    "If the supplied Brain and approved source chunks are sufficient, produce at least one approval-ready packet with all selfReview scores >= 7 and postWorthiness='pass'. Failed exploratory drafts are allowed, but at least one packet should be strong enough for founder review.",
    "Quality bar: avoid generic business cliches, vague transformation language, broad AI hashtags, and weak CTAs like 'learn more'. Be specific, operator-grade, teach-first, and grounded in the approved source primitives.",
    ...(input.taste ? [input.taste] : []),
    "Every serious or educational claim must be tied to sourceIdsUsed, memoryChunksUsed, and an evidenceSummary. Mention concrete workflow primitives from the source when useful.",
    "Avoid tired question-hook formulas such as 'Tired of...', 'Are you...', 'Why settle...', and generic 'It's time...' openings unless the source context makes them unusually strong.",
    "Self-review rubric: usefulness = practical teaching value; originality = non-generic WOBBLE POV; brandFit = premium teach-first WOBBLE voice; clarity = easy to understand; aggressionControl = the sharpness is controlled and within the track's range, so calm educational content should score high; proofStrength = source/memory evidence directly supports the claims. postWorthiness must be 'fail' if any score is below 7.",
    "Return strict JSON only with this shape: {\"packets\":[{\"platform\":\"linkedin|instagram|x|youtube|multi\",\"format\":\"static|carousel|text|thread|reel_script|youtube_script\",\"objective\":\"...\",\"targetAudience\":\"...\",\"angle\":\"...\",\"hook\":\"...\",\"mainCopy\":\"...\",\"carouselSlides\":[],\"caption\":\"...\",\"cta\":\"...\",\"designDirection\":\"...\",\"sourceIdsUsed\":[\"source_id\"],\"insightIdsUsed\":[\"insight_or_angle_id\"],\"memoryChunksUsed\":[\"memorychunk_id\"],\"evidenceSummary\":\"...\",\"claimRiskLevel\":\"low|medium|high\",\"proofRequired\":true,\"selfReview\":{\"usefulness\":0,\"originality\":0,\"brandFit\":0,\"clarity\":0,\"aggressionControl\":0,\"proofStrength\":0,\"postWorthiness\":\"pass|fail\"}}]}",
    buildContentTrackPromptBlock(input.track),
    `Request objective: ${request.objective ?? "Create useful WOBBLE company content from the strongest current approved evidence."}`,
    request.platformFocus.length ? `Platform focus: ${request.platformFocus.join(", ")}` : "",
    request.formatFocus.length ? `Format focus: ${request.formatFocus.join(", ")}` : "",
    request.maxPackets ? `Maximum packets requested: ${request.maxPackets}` : "No fixed packet count requested; choose the right amount up to 10.",
    `WOBBLE Brain:\n${brainBlock}`,
    `Working memory:\n${memoryBlock}`,
    `Approved sources and chunks:\n${sourceBlock}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    messages: [{ role: "system", content: systemPrompt }],
    sourceIds: input.sources.map((source) => source.id),
    memoryChunkIds: input.memory.map((chunk) => chunk.id),
  };
}
