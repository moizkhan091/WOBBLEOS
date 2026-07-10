import { buildApprovedIntelligenceContext, type IntelligenceDeps } from "@/lib/intelligence";
import type { IntelligenceTask, IntelligenceScope } from "@/lib/domain/intelligence";

/**
 * The retrieval bridge every generator uses so NOTHING is hardcoded: pull the latest
 * APPROVED intelligence for a task and format it into a prompt block. Returns the ids
 * used so the caller can log output_intelligence_usage (output → evidence provenance).
 *
 * Honest by design: if there's no approved intelligence yet, `block` is empty and `gaps`
 * explains what's missing — the model is told to rely on brand/first-principles, not invent.
 */
export interface IntelligenceContextBlock {
  block: string;
  itemIds: string[];
  insightIds: string[];
  gaps: string[];
  hasIntelligence: boolean;
}

export async function getIntelligenceContextBlock(
  task: IntelligenceTask,
  opts: { scope?: IntelligenceScope; clientId?: string; limit?: number } = {},
  deps: IntelligenceDeps = {},
): Promise<IntelligenceContextBlock> {
  let ctx;
  try {
    ctx = await buildApprovedIntelligenceContext({ task, scope: opts.scope, clientId: opts.clientId, limit: opts.limit ?? 12 }, deps);
  } catch {
    // Intelligence retrieval must never break a generation — degrade to empty.
    return { block: "", itemIds: [], insightIds: [], gaps: ["intelligence retrieval unavailable"], hasIntelligence: false };
  }

  const lines: string[] = [];
  if (ctx.insights.length) {
    lines.push("APPROVED INSIGHTS (act on these — they are current, founder-approved conclusions):");
    for (const i of ctx.insights) {
      lines.push(`- [${i.insightType}] ${i.title}: ${i.summary}${i.recommendation ? ` → ${i.recommendation}` : ""}${typeof i.impactScore === "number" ? ` (impact ${i.impactScore})` : ""}`);
    }
  }
  if (ctx.items.length) {
    lines.push("");
    lines.push("APPROVED OBSERVATIONS (recent facts — competitor moves, performance, market signals):");
    for (const it of ctx.items) {
      const extra = it.extracted && Object.keys(it.extracted).length ? ` {${Object.entries(it.extracted).slice(0, 4).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join("; ")}}` : "";
      lines.push(`- [${it.itemType}${it.freshnessStatus && it.freshnessStatus !== "current" ? "/" + it.freshnessStatus : ""}] ${it.title}: ${it.summary}${extra}`);
    }
  }

  const hasIntelligence = ctx.items.length > 0 || ctx.insights.length > 0;
  const header = hasIntelligence
    ? "== CURRENT WOBBLE INTELLIGENCE (ground your output in this live, approved knowledge — do not contradict it or fall back to stale assumptions) ==\n"
    : "";
  const gapNote = ctx.gaps.length ? `\n(Intelligence gaps for this task: ${ctx.gaps.join(", ")}. Use brand truth + first principles for those; do not invent specifics.)` : "";

  return {
    block: hasIntelligence ? header + lines.join("\n") + gapNote : "",
    itemIds: ctx.items.map((i) => i.id),
    insightIds: ctx.insights.map((i) => i.id),
    gaps: ctx.gaps,
    hasIntelligence,
  };
}
