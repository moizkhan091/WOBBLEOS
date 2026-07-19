import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import {
  proposeResearchSource,
  listResearchTargets,
  listStaleSources,
  defaultStore as intelligenceStore,
  type IntelligenceDeps,
} from "@/lib/intelligence";
import { RESEARCH_TARGET_TYPES, type ResearchTargetType, type ResearchTargetRow } from "@/lib/domain/intelligence";
import { createEscalation } from "@/lib/departments/escalation";
import type { AuditEventInput } from "@/lib/domain/audit";

/**
 * SOURCE DISCOVERY — the autonomous "suggest new sources for the founder to approve" loop the founder asked for.
 * The research building blocks already exist (`proposeResearchSource` lands a PENDING target with evidence;
 * `listStaleSources` flags decaying ones) but NOTHING called them on a cadence — so the OS never actually
 * proposed sources or flagged stale ones. This module wires that: a scout agent reads recent observations +
 * the already-tracked set and proposes NEW sources worth watching (each pending founder approval, evidence-cited,
 * never auto-activated); and a stale sweep raises a founder escalation for approved sources that stopped
 * producing fresh intelligence. The LLM provider is injectable so the loop is provable without live credit.
 */

export const SOURCE_SCOUT_AGENT = "research_source_scout";
export const SOURCE_MODULE = "intelligence";

export type SourceDiscoveryProvider = (input: { role: string; module: string; model?: string; messages: ProviderChatMessage[]; maxTokens?: number; temperature?: number }) => Promise<{ text: string }>;

export interface SourceDiscoveryDeps extends IntelligenceDeps {
  runProvider?: SourceDiscoveryProvider;
  now?: Date;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
}

interface SourceCandidate {
  name: string;
  handleOrUrl: string;
  targetType: ResearchTargetType;
  reason: string;
  evidenceIdx: number[];
  expectedValue: string;
  collectionMethod: string;
  risk: string;
  confidence: number;
}

/** Normalise a handle/URL for dedup (drop scheme, www, trailing slash, lowercase). */
function normRef(v?: string | null): string {
  if (!v) return "";
  return v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

function validTargetType(v: unknown): ResearchTargetType {
  return (RESEARCH_TARGET_TYPES as readonly string[]).includes(String(v)) ? (v as ResearchTargetType) : "website";
}

/** Tolerant parse of the scout LLM's JSON candidate list. */
export function parseSourceCandidates(text: string): SourceCandidate[] {
  if (!text) return [];
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(body.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: SourceCandidate[] = [];
  for (const r of raw) {
    const c = (r ?? {}) as Record<string, unknown>;
    const name = typeof c.name === "string" ? c.name.trim() : "";
    const handleOrUrl = typeof c.handleOrUrl === "string" ? c.handleOrUrl.trim() : "";
    if (!name || !handleOrUrl) continue;
    out.push({
      name: name.slice(0, 120),
      handleOrUrl: handleOrUrl.slice(0, 400),
      targetType: validTargetType(c.targetType),
      reason: (typeof c.reason === "string" ? c.reason : "").slice(0, 400) || "surfaced repeatedly in recent observations",
      evidenceIdx: Array.isArray(c.evidenceIdx) ? c.evidenceIdx.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0) : [],
      expectedValue: (typeof c.expectedValue === "string" ? c.expectedValue : "").slice(0, 200) || "adds coverage on a recurring theme",
      collectionMethod: (typeof c.collectionMethod === "string" ? c.collectionMethod : "web_scrape").slice(0, 60),
      risk: (typeof c.risk === "string" ? c.risk : "low").slice(0, 20),
      confidence: typeof c.confidence === "number" && c.confidence >= 0 && c.confidence <= 1 ? c.confidence : 0.5,
    });
  }
  return out;
}

const SCOUT_SYSTEM = [
  "You are the WOBBLE research SOURCE SCOUT. From recent intelligence observations, propose NEW information sources worth tracking that we do NOT already track — competitor accounts, creator accounts, review sources, industry blogs/sites, ad libraries, keyword sets, trend topics.",
  "Only propose a source that is clearly IMPLIED by the observations (a rival named repeatedly, a site cited often, a recurring theme with an obvious feed). Never invent sources with no basis. Each proposal MUST cite the observation indices that justify it.",
  `Valid targetType values: ${RESEARCH_TARGET_TYPES.join(", ")}.`,
  'Return ONLY a JSON array: [{"name":"...","handleOrUrl":"https://... or @handle","targetType":"competitor_account","reason":"why it is worth tracking","evidenceIdx":[0,3],"expectedValue":"what it will tell us","collectionMethod":"web_scrape","risk":"low","confidence":0.6}]. No prose.',
].join("\n");

export interface DiscoverSourcesInput {
  scope?: "wobble" | "client" | "global";
  clientId?: string;
  maxProposals?: number;
  observationLimit?: number;
  model?: string;
}

/**
 * Read recent observations + the tracked set, ask the scout to propose NEW sources, and file each as a PENDING
 * research target (evidence-cited, never auto-active). Deduped against everything already tracked. Returns what
 * was proposed. Any failure (no credit, bad JSON, no observations) yields an empty proposal set — never throws
 * the scheduler tick.
 */
export async function discoverAndProposeSources(
  input: DiscoverSourcesInput = {},
  deps: SourceDiscoveryDeps = {},
): Promise<{ proposed: ResearchTargetRow[]; skipped: number; consideredObservations: number }> {
  const scope = input.scope ?? "wobble";
  const max = Math.max(1, Math.min(5, input.maxProposals ?? 3));
  try {
    const store = deps.store ?? intelligenceStore();
    const observations = await store.listIntelligenceItems({ limit: input.observationLimit ?? 40 });
    if (!observations.length) return { proposed: [], skipped: 0, consideredObservations: 0 };

    const targets = await listResearchTargets({ limit: 500 }, deps);
    const tracked = new Set(targets.map((t) => normRef(t.handleOrUrl)).filter(Boolean));

    const obsLines = observations
      .map((it, i) => `${i}: [${it.itemType}] ${it.title} — ${it.summary}${it.sourceUrl ? ` (src: ${it.sourceUrl})` : ""}${it.actorName ? ` (by: ${it.actorName})` : ""}`)
      .join("\n");
    const trackedLines = targets.slice(0, 60).map((t) => `- ${t.name}${t.handleOrUrl ? ` (${t.handleOrUrl})` : ""}`).join("\n") || "(none yet)";

    const run = deps.runProvider ?? runTextProvider;
    const { text } = await run({
      role: SOURCE_SCOUT_AGENT,
      module: SOURCE_MODULE,
      model: input.model,
      temperature: 0.4,
      maxTokens: 1400,
      messages: [
        { role: "system", content: SCOUT_SYSTEM },
        { role: "user", content: `Recent observations:\n${obsLines}\n\nAlready tracked (do NOT propose these):\n${trackedLines}\n\nPropose up to ${max} NEW sources as a JSON array now.` },
      ],
    });

    const candidates = parseSourceCandidates(text);
    const proposed: ResearchTargetRow[] = [];
    let skipped = 0;
    for (const c of candidates) {
      if (proposed.length >= max) break;
      const key = normRef(c.handleOrUrl);
      if (!key || tracked.has(key)) { skipped++; continue; }
      const evidence = c.evidenceIdx.map((i) => observations[i]?.id).filter((x): x is string => Boolean(x));
      if (!evidence.length) { skipped++; continue; } // the proposal schema requires ≥1 real evidence id
      const target = await proposeResearchSource(
        {
          targetType: c.targetType,
          name: c.name,
          handleOrUrl: c.handleOrUrl,
          scope,
          clientId: input.clientId,
          cadence: "weekly",
          addedBy: SOURCE_SCOUT_AGENT,
          proposal: {
            reason: c.reason,
            evidence,
            expectedValue: c.expectedValue,
            intendedDepartments: ["content", "proposal"],
            collectionMethod: c.collectionMethod,
            risk: c.risk,
            confidence: c.confidence,
          },
        },
        deps,
      );
      proposed.push(target);
      tracked.add(key);
    }
    return { proposed, skipped, consideredObservations: observations.length };
  } catch {
    return { proposed: [], skipped: 0, consideredObservations: 0 };
  }
}

/**
 * Flag APPROVED sources that have gone STALE (overdue on their cadence) so the founder is told a source stopped
 * producing fresh intelligence instead of it degrading silently. Raises ONE deduped escalation per stale source.
 * Uses the existing listStaleSources building block. Best-effort — never throws the tick.
 */
export async function flagStaleSources(
  deps: SourceDiscoveryDeps & { now?: Date } = {},
): Promise<{ flagged: number }> {
  try {
    const stale = await listStaleSources(deps);
    let flagged = 0;
    for (const { target, freshness } of stale) {
      const overdueDays = freshness.overdueBy > 0 ? Math.round(freshness.overdueBy / 86_400_000) : 0;
      await createEscalation(
        {
          departmentSlug: "research_intelligence",
          // Per-source dedup: one OPEN escalation per stale target (findOpen keys on dept+workflowId+reason).
          workflowId: target.id,
          taskId: null,
          clientWorkspaceId: target.clientId ?? null,
          sourceAgent: SOURCE_SCOUT_AGENT,
          reason: "stale_intelligence",
          severity: "medium",
          requiredDecision: `Source "${target.name}" is stale (${overdueDays > 0 ? `${overdueDays}d overdue` : "overdue on its cadence"}) — refresh its cadence, re-scout it, or retire it.`,
          evidence: { targetId: target.id, handleOrUrl: target.handleOrUrl, lastCheckedAt: target.lastCheckedAt, cadence: freshness.cadence, overdueBy: freshness.overdueBy },
        },
        { now: deps.now, recordAudit: deps.recordAudit },
      ).then((r) => { if (!r.deduped) flagged += 1; }).catch(() => {});
    }
    return { flagged };
  } catch {
    return { flagged: 0 };
  }
}
