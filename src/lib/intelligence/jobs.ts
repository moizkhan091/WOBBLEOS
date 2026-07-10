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
  const result = await runCompetitorScout({
    handleOrUrl,
    platform: typeof p.platform === "string" ? p.platform : undefined,
    limit: typeof p.limit === "number" ? p.limit : undefined,
    targetId: typeof p.targetId === "string" ? p.targetId : undefined,
    scope: asScope(p.scope),
    clientId: typeof p.clientId === "string" ? p.clientId : undefined,
  });
  return { ...result };
}

export async function runAnalyzeJobHandler(job: JobRow): Promise<Record<string, unknown>> {
  const p = job.payload ?? {};
  const result = await runIntelligenceAnalyst({
    scope: asScope(p.scope),
    clientId: typeof p.clientId === "string" ? p.clientId : undefined,
    limit: typeof p.limit === "number" ? p.limit : undefined,
  });
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
