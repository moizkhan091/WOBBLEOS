import { z } from "zod";
import { listIntelligenceItems, createIntelligenceInsight, type IntelligenceDeps } from "@/lib/intelligence";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import { INTELLIGENCE_INSIGHT_TYPES, type IntelligenceScope } from "@/lib/domain/intelligence";

/**
 * Intelligence Analyst — the built-in agent that turns raw observations into insight PROPOSALS.
 * Reads recent intelligence_items (competitor posts/reels, performance, market signals),
 * extracts durable patterns, and writes intelligence_insights PENDING approval. Nothing becomes
 * trusted until a founder approves it in the Inbox. This is the "AI analyzes → insight" middle
 * of the self-improving loop.
 */

const insightOutputSchema = z.object({
  insights: z.array(z.object({
    insightType: z.enum(INTELLIGENCE_INSIGHT_TYPES),
    title: z.string(),
    summary: z.string(),
    recommendation: z.string().optional(),
    evidenceItemIds: z.array(z.string()).default([]),
    appliesToModules: z.array(z.string()).default([]),
    impactScore: z.number().min(0).max(100).default(50),
    confidence: z.number().min(0).max(1).default(0.6),
  })).default([]),
});

export interface AnalystInput {
  scope?: IntelligenceScope;
  clientId?: string;
  limit?: number; // how many recent items to analyze
}

export interface AnalystDeps extends IntelligenceDeps {
  runProvider?: (input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number }) => Promise<{ text: string; run: { id: string } }>;
}

export interface AnalystResult {
  analyzedItems: number;
  proposedInsights: number;
  insightIds: string[];
  note?: string;
}

export async function runIntelligenceAnalyst(input: AnalystInput = {}, deps: AnalystDeps = {}): Promise<AnalystResult> {
  const items = await listIntelligenceItems({ scope: input.scope, clientId: input.clientId, limit: input.limit ?? 40 }, deps);
  if (items.length < 2) {
    return { analyzedItems: items.length, proposedInsights: 0, insightIds: [], note: "Not enough observations to analyze yet — ingest more first." };
  }
  const runProvider = deps.runProvider ?? defaultRunProvider;

  const catalog = items.map((it) => {
    const ex = it.extracted && Object.keys(it.extracted).length ? ` | ${Object.entries(it.extracted).slice(0, 5).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join("; ")}` : "";
    const m = it.metrics && Object.keys(it.metrics).length ? ` | metrics: ${Object.entries(it.metrics).slice(0, 4).map(([k, v]) => `${k}=${String(v)}`).join(", ")}` : "";
    return `id=${it.id} [${it.itemType}${it.platform ? "/" + it.platform : ""}${it.actorName ? " @" + it.actorName : ""}] ${it.title}: ${it.summary}${ex}${m}`;
  }).join("\n");

  const messages: ProviderChatMessage[] = [
    { role: "system", content: `You are WOBBLE's intelligence analyst. WOBBLE is an AI automation studio. Study these recent observations (competitor posts/reels, performance, market signals) and extract 2-6 DURABLE insights WOBBLE can act on. Each insight: an insightType (one of content_pattern|competitor_pattern|performance_learning|market_shift|platform_shift|seo_opportunity|offer_opportunity|voice_of_customer|opportunity|risk), a title, a summary of the pattern, a concrete recommendation, the evidenceItemIds (the id= values that support it — cite real ids from the list), appliesToModules (e.g. content_command, seo, social, offers), an impactScore 0-100, and a confidence 0-1. Only claim what the evidence supports. Reply ONLY with JSON: {"insights":[{"insightType","title","summary","recommendation","evidenceItemIds":[],"appliesToModules":[],"impactScore","confidence"}]}. No prose.` },
    { role: "user", content: `Recent observations (${items.length}):\n${catalog}` },
  ];
  const { text } = await runProvider({ role: "performance_learning_agent", module: "intelligence", messages, maxTokens: 2500 });

  let parsed;
  try {
    const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
    const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
    parsed = insightOutputSchema.parse(JSON.parse(start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned));
  } catch {
    throw new Error("intelligence analyst returned unparseable output");
  }

  const validIds = new Set(items.map((i) => i.id));
  const insightIds: string[] = [];
  for (const ins of parsed.insights) {
    const evidenceItemIds = (ins.evidenceItemIds ?? []).filter((id) => validIds.has(id));
    const { insight } = await createIntelligenceInsight({
      insightType: ins.insightType,
      scope: input.scope ?? "wobble",
      clientId: input.clientId,
      title: ins.title,
      summary: ins.summary,
      recommendation: ins.recommendation,
      evidenceItemIds,
      appliesToModules: ins.appliesToModules ?? [],
      impactScore: Math.round(ins.impactScore),
      confidence: ins.confidence,
      approvalStatus: "pending",
      createdByAgent: "intelligence_analyst",
    }, deps);
    insightIds.push(insight.id);
  }

  return { analyzedItems: items.length, proposedInsights: insightIds.length, insightIds, note: "Insights proposed — approve in the Intelligence Inbox to make them retrievable." };
}

async function defaultRunProvider(input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number }) {
  const result = await runTextProvider(input);
  return { text: result.text, run: { id: result.run.id } };
}
