import type { JobRow } from "@/lib/domain/jobs";
import { runCompetitorScout } from "@/lib/intelligence/scout";
import { runIntelligenceAnalyst } from "@/lib/intelligence/analyst";
import { runDreamer } from "@/lib/intelligence/dreamer";

/** Job handlers so scout + analyst can run from automations / schedules, not just a route. */

function asScope(v: unknown): "wobble" | "client" | "global" | undefined {
  return v === "wobble" || v === "client" || v === "global" ? v : undefined;
}

export async function runScoutJobHandler(job: JobRow): Promise<Record<string, unknown>> {
  const p = job.payload ?? {};
  const handleOrUrl = typeof p.handleOrUrl === "string" ? p.handleOrUrl : undefined;
  if (!handleOrUrl) return { skipped: "no handleOrUrl in payload" };
  const scope = asScope(p.scope);
  const clientId = typeof p.clientId === "string" ? p.clientId : undefined;
  const result = await runCompetitorScout({
    handleOrUrl,
    platform: typeof p.platform === "string" ? p.platform : undefined,
    limit: typeof p.limit === "number" ? p.limit : undefined,
    targetId: typeof p.targetId === "string" ? p.targetId : undefined,
    scope,
    clientId,
  });

  // Auto-chain scouting → analysis: fresh observations should become insight PROPOSALS without a
  // manual trigger. Enqueue an analyze job (deduped per scope/day) when the scout ingested anything.
  const created = Array.isArray(result.created) ? result.created.length : 0;
  if (created > 0 && process.env.DATABASE_URL) {
    try {
      const { enqueueJob } = await import("@/lib/jobs");
      const day = job.createdAt instanceof Date ? job.createdAt.toISOString().slice(0, 10) : "";
      await enqueueJob({
        queue: "general",
        type: "intelligence.analyze",
        payload: { scope, clientId },
        linkedModule: "intelligence",
        idempotencyKey: `intelligence.analyze:${scope ?? "wobble"}:${clientId ?? "all"}:${day}`,
      });
    } catch (error) {
      console.error("scout -> analyze chaining failed:", error instanceof Error ? error.message : error);
    }
  }
  return { ...result, analyzeChained: created > 0 };
}

export async function runAnalyzeJobHandler(job: JobRow): Promise<Record<string, unknown>> {
  const p = job.payload ?? {};
  const clientId = typeof p.clientId === "string" ? p.clientId : undefined;
  const scope = asScope(p.scope);
  const result = await runIntelligenceAnalyst(
    { scope, clientId, limit: typeof p.limit === "number" ? p.limit : undefined },
    {
      // Context OS: ground the analyst in the scope's APPROVED trusted context (client scope when client-scoped,
      // else WOBBLE company scope), telemetered.
      retrieveTrustedContext: async () => {
        const { retrieveTrustedContextBlock } = await import("@/lib/context-os");
        const ctxScope = clientId ? ({ type: "client", id: clientId } as const) : ({ type: "company", id: "wobble" } as const);
        return retrieveTrustedContextBlock(ctxScope, "intelligence_analysis", { agentSlug: "intelligence_analyst", label: clientId ? "APPROVED CLIENT CONTEXT" : "APPROVED WOBBLE CONTEXT" });
      },
    },
  );
  return { ...result };
}

export async function runDreamerJobHandler(job: JobRow): Promise<Record<string, unknown>> {
  const p = job.payload ?? {};
  const result = await runDreamer({
    scope: asScope(p.scope),
    clientId: typeof p.clientId === "string" ? p.clientId : undefined,
    limit: typeof p.limit === "number" ? p.limit : undefined,
  });
  return { ...result };
}
