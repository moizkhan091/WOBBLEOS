import { audits as auditsTable } from "@/db/schema";
import { getDb } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider, type ProviderMessage } from "@/lib/providers";
import { recordAgentRun } from "@/lib/agents";
import { newId } from "@/lib/ids";
import { getAudit } from "@/lib/free-audit";
import {
  ROADMAP_AGENT,
  ROADMAP_MODULE,
  ROADMAP_ROLE,
  buildRoadmapPrompt,
  deterministicRoadmap,
  parseRoadmapPlan,
  roadmapToReportShape,
  type RoadmapPlan,
} from "@/lib/domain/roadmap-graph";

/**
 * Doc 2 service (IO) — the INTERNAL audit interview roadmap. Reads ONLY this client's Doc 1 pitch
 * (data isolation: if a companyId is supplied, the pitch must belong to it), then an LLM plans who to
 * interview + what to ask (deterministic fallback with no key). Persisted as kind="roadmap".
 */

export interface RunRoadmapInput {
  businessName: string;
  industry?: string | null;
  companyId?: string;
  pitchAuditId?: string;
  stakeholders?: Array<{ name?: string; role: string }>;
  freeCallNotes?: string;
  createdBy?: string;
}

export interface RoadmapDeps {
  getPitch?: (id: string) => Promise<{ companyId: string | null; report: Record<string, unknown> } | null>;
  runNode?: (messages: ProviderMessage[], entityId: string) => Promise<{ text: string; runId?: string }>;
  recordAgentRun?: (input: Record<string, unknown>) => Promise<unknown>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  persist?: (row: { id: string; companyId: string | null; businessName: string; report: Record<string, unknown>; input: Record<string, unknown>; createdBy: string | null; now: Date }) => Promise<void>;
  now?: Date;
}

async function defaultRunNode(messages: ProviderMessage[], entityId: string): Promise<{ text: string; runId?: string }> {
  const r = await runTextProvider({ role: ROADMAP_ROLE, module: ROADMAP_MODULE, messages, maxTokens: 4000, temperature: 0.5, linkedEntityType: "audit", linkedEntityId: entityId });
  return { text: r.text, runId: r.run?.id };
}

async function defaultPersist(row: { id: string; companyId: string | null; businessName: string; report: Record<string, unknown>; input: Record<string, unknown>; createdBy: string | null; now: Date }): Promise<void> {
  await getDb().insert(auditsTable).values({ id: row.id, kind: "roadmap", companyId: row.companyId, businessName: row.businessName, status: "complete", report: row.report, input: row.input, createdBy: row.createdBy, createdAt: row.now, updatedAt: row.now });
}

export interface RunRoadmapResult {
  auditId: string;
  plan: RoadmapPlan;
  usedLlm: boolean;
  report: Record<string, unknown>;
}

export async function runAuditRoadmap(input: RunRoadmapInput, deps: RoadmapDeps = {}): Promise<RunRoadmapResult> {
  const now = deps.now ?? new Date();
  const actor = input.createdBy ?? "system";
  const entityId = input.companyId ?? input.businessName;
  const stakeholders = input.stakeholders ?? [];

  // Read the client's own pitch (Doc 1) — DATA ISOLATION: only this client's document.
  let pitchSummary = "";
  let whatWeNoticed: string[] = [];
  if (input.pitchAuditId) {
    const getPitch = deps.getPitch ?? (async (id: string) => { const a = await getAudit(id); return a ? { companyId: a.companyId, report: a.report as unknown as Record<string, unknown> } : null; });
    const pitch = await getPitch(input.pitchAuditId);
    if (pitch) {
      // Fail closed: if a company is asserted, the pitch MUST belong to it — a null/absent
      // pitch company counts as a mismatch (never bleed one client's pitch into another's roadmap).
      if (input.companyId && pitch.companyId !== input.companyId) {
        throw new Error("data isolation: pitch belongs to a different company");
      }
      pitchSummary = String(pitch.report.executiveSummary ?? pitch.report.summary ?? "");
      whatWeNoticed = Array.isArray(pitch.report.whatWeNoticed) ? (pitch.report.whatWeNoticed as string[]) : [];
    }
  }

  let plan: RoadmapPlan;
  let usedLlm = false;
  let runId: string | undefined;
  try {
    const node = deps.runNode ?? defaultRunNode;
    const res = await node(buildRoadmapPrompt({ businessName: input.businessName, industry: input.industry, pitchSummary, whatWeNoticed, stakeholders, freeCallNotes: input.freeCallNotes }), entityId);
    runId = res.runId;
    const parsed = parseRoadmapPlan(res.text);
    if (parsed) { plan = parsed; usedLlm = true; } else { plan = deterministicRoadmap(input.businessName, stakeholders); }
  } catch {
    plan = deterministicRoadmap(input.businessName, stakeholders);
  }

  if (usedLlm) {
    try { await (deps.recordAgentRun ?? ((i: Record<string, unknown>) => recordAgentRun(i as never)))({ agentSlug: ROADMAP_AGENT, status: "succeeded", inputSummary: input.businessName, outputSummary: `${plan.interviewPlan.length} interviews`, modelRunIds: runId ? [runId] : [] }); } catch { /* never fail */ }
  }

  const report = { ...roadmapToReportShape(plan, input.businessName), internal: true, usedLlm };
  const id = newId("audit");
  await (deps.persist ?? defaultPersist)({ id, companyId: input.companyId ?? null, businessName: input.businessName, report, input: { pitchAuditId: input.pitchAuditId, stakeholders, freeCallNotes: input.freeCallNotes }, createdBy: input.createdBy ?? null, now });

  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))({ eventType: "audit.roadmap_completed", module: ROADMAP_MODULE, entityType: "audit", entityId: id, actor, metadata: { businessName: input.businessName, usedLlm, interviews: plan.interviewPlan.length } });

  return { auditId: id, plan, usedLlm, report };
}
