/**
 * Chunk 11: Ask WOBBLE domain (pure, DB-free).
 *
 * Ask WOBBLE is the OS command surface / router - the front door, not every
 * module. This file owns the pure pieces: intent classification, the
 * capabilities map (intent -> module/job + built status), the grounded prompt
 * builder (Brain + APPROVED evidence + basic do-not-say), citations, confidence,
 * and the answer envelope. Routing to real services + LLM calls live in the
 * service layer. Keeping this pure makes intent/routing/grounding unit-testable
 * without a DB or an LLM.
 *
 * Per founder direction:
 * - If evidence is insufficient, the model is still asked (cost-logged) to
 *   explain the gap / ask a clarifying question / suggest sources - it must not
 *   invent. (No silent no-answer.)
 * - Do-not-say is BASIC here (loaded into the prompt). Full quality gate = Ch 17.
 * - Unbuilt modules return a "planned" route. We never enqueue a fake job.
 */

export type Confidence = "low" | "medium" | "high";

export type IntentType =
  | "question"
  | "content_generation"
  | "research"
  | "decision_brief"
  | "source_search"
  | "memory_update"
  | "handoff";

export interface CapabilityRoute {
  intent: IntentType;
  module: string;
  queue?: string;
  jobType?: string;
  /** "available" only once the downstream module/handler actually exists */
  status: "available" | "planned";
}

/**
 * Intent -> capability map. Everything except direct Q&A is "planned" until its
 * chunk ships (Content 14/15, Research 12, Decision 24, n8n 18, etc.). Flip a
 * route to "available" and give it a real registered jobType when that lands.
 */
export const DEFAULT_CAPABILITIES: Record<IntentType, CapabilityRoute> = {
  question: { intent: "question", module: "ask_wobble", status: "available" },
  content_generation: { intent: "content_generation", module: "content_command", queue: "general", jobType: "content.generate", status: "available" },
  research: { intent: "research", module: "research_radar", queue: "research", jobType: "research.run", status: "planned" },
  decision_brief: { intent: "decision_brief", module: "decision_room", queue: "general", jobType: "decision.brief", status: "planned" },
  source_search: { intent: "source_search", module: "source_library", queue: "research", jobType: "source.search", status: "planned" },
  memory_update: { intent: "memory_update", module: "memory", queue: "general", jobType: "memory.propose", status: "planned" },
  handoff: { intent: "handoff", module: "n8n_handoff", queue: "general", jobType: "n8n.handoff", status: "planned" },
};

/** Keyword-based intent classifier (deterministic V1; can be upgraded to an LLM classifier later). */
export function classifyIntent(text: string): IntentType {
  const q = text.toLowerCase();
  const makeVerb = /\b(write|draft|create|make|generate|produce)\b/.test(q);
  const contentNoun = /\b(post|posts|caption|carousel|thread|reel|script|content|linkedin|tweet|email|newsletter)\b/.test(q);
  if (makeVerb && contentNoun) return "content_generation";
  if (/\b(send|hand ?off|push)\b.*\b(n8n|handoff|publish)\b/.test(q) || /\bto n8n\b/.test(q)) return "handoff";
  if (/\b(update|add to|save to|remember)\b.*\b(brain|memory)\b/.test(q)) return "memory_update";
  if (/\b(find|search|look up|discover)\b.*\b(source|sources)\b/.test(q)) return "source_search";
  if (/\b(research|competitor|market trend|trends|radar)\b/.test(q)) return "research";
  if (/\b(decision|decide|should we|brief|trade-?off)\b/.test(q)) return "decision_brief";
  return "question";
}

export interface AskBrainRecord {
  slug: string;
  title: string;
  area: string;
  content: string;
}

export interface AskMemoryChunk {
  id: string;
  content: string;
  trustLevel: string;
  tags?: string[];
}

export interface AskSourceRef {
  id: string;
  title: string;
  sourceType: string;
  trustLevel: string;
  chunks?: AskSourceChunkRef[];
}

export interface AskSourceChunkRef {
  id: string;
  content: string;
}

export interface AskCitation {
  kind: "memory" | "source";
  id: string;
  label: string;
}

export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const HIGH_TRUST = new Set(["founder_core", "approved_expert", "tier_1_core_wobble", "tier_2_approved_expert"]);

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Length cap that PRESERVES internal newlines/formatting (unlike truncate, which flattens whitespace). */
function clampChars(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Pull the do-not-say rule text out of the loaded core Brain, if present. */
export function extractDoNotSay(brain: AskBrainRecord[]): string | undefined {
  const rec = brain.find((b) => b.slug === "do-not-say" || b.area === "do-not-say");
  return rec?.content;
}

export function buildCitations(memory: AskMemoryChunk[], sources: AskSourceRef[]): AskCitation[] {
  return [
    ...memory.map((m) => ({ kind: "memory" as const, id: m.id, label: truncate(m.content, 60) })),
    ...sources.map((s) => ({ kind: "source" as const, id: s.id, label: s.title })),
  ];
}

export function computeConfidence(evidenceCount: number, hasHighTrust: boolean): Confidence {
  if (evidenceCount === 0) return "low";
  if (evidenceCount >= 3 && hasHighTrust) return "high";
  return "medium";
}

function countSourceChunks(sources: AskSourceRef[]): number {
  return sources.reduce((total, source) => total + (source.chunks?.length ?? 0), 0);
}

function sourceHasChunkEvidence(source: AskSourceRef): boolean {
  return (source.chunks?.length ?? 0) > 0;
}

function buildEvidenceBlock(memory: AskMemoryChunk[], sources: AskSourceRef[]): string {
  const lines: string[] = [];
  let citationNumber = 1;

  for (const chunk of memory) {
    lines.push(`[${citationNumber}] (memory:${chunk.id}) trust=${chunk.trustLevel}`);
    lines.push(`Content: ${truncate(chunk.content, 1200)}`);
    citationNumber += 1;
  }

  for (const source of sources) {
    lines.push(`[${citationNumber}] (source:${source.id}) ${source.title} | type=${source.sourceType} | trust=${source.trustLevel}`);

    if (source.chunks?.length) {
      for (const chunk of source.chunks) {
        lines.push(`Chunk ${chunk.id}: ${truncate(chunk.content, 1200)}`);
      }
    } else {
      lines.push("Source metadata is approved, but no source chunks are attached yet. Treat this source as insufficient for factual claims until chunks are ingested.");
    }

    citationNumber += 1;
  }

  return lines.join("\n");
}

export interface BuildAskContextInput {
  question: string;
  brain: AskBrainRecord[];
  memory: AskMemoryChunk[];
  sources: AskSourceRef[];
  doNotSay?: string;
  /** Live OS state (agents, modules, pending approvals, models) — authoritative for operational questions. */
  systemSnapshot?: string;
  /** Caps on assembled input so a growing Brain/evidence set can't drive unbounded LLM input cost. */
  budget?: AskContextBudget;
}

/**
 * Input-token budget for the Ask prompt. The output is already capped (maxTokens); this bounds the
 * INPUT so Ask cost stays flat as the Brain, evidence, and snapshot grow. Char-based (≈ 4 chars/token)
 * for deterministic, testable truncation. Defaults cap total input at ~10k tokens.
 */
export interface AskContextBudget {
  maxBrainItems: number;
  maxBrainCharsPerItem: number;
  maxEvidenceChars: number;
  maxSnapshotChars: number;
}

export const DEFAULT_ASK_CONTEXT_BUDGET: AskContextBudget = {
  maxBrainItems: 24,
  maxBrainCharsPerItem: 700,
  maxEvidenceChars: 16000,
  maxSnapshotChars: 4000,
};

export interface AskContext {
  systemPrompt: string;
  messages: ProviderMessage[];
  citations: AskCitation[];
  evidenceCount: number;
  hasHighTrust: boolean;
  hasSufficientEvidence: boolean;
}

export function buildAskContext(input: BuildAskContextInput): AskContext {
  const sourceChunkCount = countSourceChunks(input.sources);
  const evidenceCount = input.memory.length + sourceChunkCount;
  const hasHighTrust =
    input.memory.some((m) => HIGH_TRUST.has(m.trustLevel)) ||
    input.sources.some((s) => sourceHasChunkEvidence(s) && HIGH_TRUST.has(s.trustLevel));
  const citations = buildCitations(input.memory, input.sources);
  const budget = input.budget ?? DEFAULT_ASK_CONTEXT_BUDGET;

  const brainBlock =
    input.brain
      .slice(0, budget.maxBrainItems)
      .map((b) => `- ${b.title} (${b.area}): ${truncate(b.content, budget.maxBrainCharsPerItem)}`)
      .join("\n") || "(no core WOBBLE Brain loaded)";
  // Per-chunk truncation happens in buildEvidenceBlock; this caps the TOTAL so many chunks can't blow the budget.
  const evidenceBlock = citations.length
    ? clampChars(buildEvidenceBlock(input.memory, input.sources), budget.maxEvidenceChars)
    : "(no approved evidence retrieved)";
  const snapshotBlock = input.systemSnapshot ? clampChars(input.systemSnapshot, budget.maxSnapshotChars) : "";

  const systemPrompt = [
    "You are WOBBLE OS answering for the founders. Use ONLY the WOBBLE Brain and the approved evidence below. Do not invent sources or facts.",
    input.doNotSay ? `Do-not-say rules (must follow): ${input.doNotSay}` : "",
    snapshotBlock
      ? `Live OS system state (AUTHORITATIVE for operational questions about the OS itself — number of agents, what each agent is, modules and their status, what is waiting on approval, which model each role uses. Answer such questions directly from this; no [n] citation needed):\n${snapshotBlock}`
      : "",
    `WOBBLE Brain:\n${brainBlock}`,
    `Approved evidence (cite by [n]):\n${evidenceBlock}`,
    "Answer rules: cite serious claims by their [n]; include a short opposing view or key risk; flag what needs founder judgment.",
    "For operational questions about the OS (e.g. how many agents exist and what they do, what is pending approval, which model a role uses, which modules are built), answer directly and specifically from the live system state.",
    "If the approved evidence is empty or insufficient for a serious/strategic answer AND it is not an operational question answerable from live system state, do NOT invent one: say clearly what is missing, ask one clarifying question if useful, and suggest what sources or research to add.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: input.question },
    ],
    citations,
    evidenceCount,
    hasHighTrust,
    hasSufficientEvidence: evidenceCount > 0 || input.brain.length > 0 || Boolean(input.systemSnapshot),
  };
}

export interface AskAnswer {
  answer: string;
  citations: AskCitation[];
  confidence: Confidence;
  hasSufficientEvidence: boolean;
  needsFounderJudgment: string[];
  modelRunId: string | null;
}

export function buildAskAnswer(modelText: string, context: AskContext, modelRunId: string | null): AskAnswer {
  const needsFounderJudgment: string[] = [];
  if (context.evidenceCount === 0) {
    needsFounderJudgment.push("No approved research/sources were found; verify before acting on this answer.");
  } else if (!context.hasHighTrust) {
    needsFounderJudgment.push("Evidence is from lower-trust sources; confirm key claims before acting.");
  }

  return {
    answer: modelText,
    citations: context.citations,
    confidence: computeConfidence(context.evidenceCount, context.hasHighTrust),
    hasSufficientEvidence: context.hasSufficientEvidence,
    needsFounderJudgment,
    modelRunId,
  };
}
