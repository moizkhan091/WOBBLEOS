import { audits as auditsTable } from "@/db/schema";
import { getDb } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider, type ProviderMessage } from "@/lib/providers";
import { recordAgentRun } from "@/lib/agents";
import { newId } from "@/lib/ids";
import {
  PITCH_AGENT,
  PITCH_MODULE,
  PITCH_ROLE,
  buildPitchPrompt,
  deterministicPitch,
  diagnose,
  parsePitch,
  pitchToReportShape,
  type Pitch,
} from "@/lib/domain/pitch-graph";
import { scrapeBusinessSignals, summarizeSignals, type BusinessSignals } from "@/lib/scraper/apify";
import type { RunAuditInput } from "@/lib/domain/free-audit";

/**
 * Doc 1 pitch service (IO). Diagnosis (deterministic) + scraped signals (Apify, gated) + an LLM that
 * customizes the pitch to the prospect's niche (falls back to a deterministic pitch when no model key
 * / on error). Persisted as an audit of kind="pitch", scoped to the prospect's company only.
 */

export interface RunPitchInput extends RunAuditInput {
  website?: string;
  instagram?: string;
}

export interface PitchDeps {
  scrape?: (input: { website?: string; instagram?: string }) => Promise<BusinessSignals>;
  runNode?: (messages: ProviderMessage[], entityId: string) => Promise<{ text: string; runId?: string }>;
  recordAgentRun?: (input: Record<string, unknown>) => Promise<unknown>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  persist?: (row: { id: string; kind: string; companyId: string | null; businessName: string; report: Record<string, unknown>; input: Record<string, unknown>; createdBy: string | null; now: Date }) => Promise<void>;
  now?: Date;
}

async function defaultRunNode(messages: ProviderMessage[], entityId: string): Promise<{ text: string; runId?: string }> {
  const r = await runTextProvider({ role: PITCH_ROLE, module: PITCH_MODULE, messages, maxTokens: 3500, temperature: 0.6, linkedEntityType: "audit", linkedEntityId: entityId });
  return { text: r.text, runId: r.run?.id };
}

async function defaultPersist(row: { id: string; kind: string; companyId: string | null; businessName: string; report: Record<string, unknown>; input: Record<string, unknown>; createdBy: string | null; now: Date }): Promise<void> {
  await getDb().insert(auditsTable).values({ id: row.id, kind: row.kind, companyId: row.companyId, businessName: row.businessName, status: "complete", report: row.report, input: row.input, createdBy: row.createdBy, createdAt: row.now, updatedAt: row.now });
}

export interface RunPitchResult {
  auditId: string;
  pitch: Pitch;
  usedLlm: boolean;
  scraped: boolean;
  report: Record<string, unknown>;
}

export async function runPitch(input: RunPitchInput, deps: PitchDeps = {}): Promise<RunPitchResult> {
  const now = deps.now ?? new Date();
  const actor = input.createdBy ?? "system";
  const entityId = input.companyId ?? input.businessName;

  // 1) deterministic gap diagnosis (only this prospect's stated problems/signals)
  const diagnosis = diagnose(input);

  // 2) scrape their website + socials (gated; degrades to nothing)
  const signals = deps.scrape ? await deps.scrape({ website: input.website, instagram: input.instagram }) : await scrapeBusinessSignals({ website: input.website, instagram: input.instagram });
  const signalsText = summarizeSignals(signals);

  // 3) LLM writes the niche-customized pitch; any failure (incl. no model key) -> deterministic fallback
  let pitch: Pitch;
  let usedLlm = false;
  let runId: string | undefined;
  try {
    const node = deps.runNode ?? defaultRunNode;
    const res = await node(buildPitchPrompt({ businessName: input.businessName, industry: input.industry, signalsText, diagnosis }), entityId);
    runId = res.runId;
    const parsed = parsePitch(res.text);
    if (parsed) {
      pitch = parsed;
      usedLlm = true;
    } else {
      pitch = deterministicPitch(input, diagnosis);
    }
  } catch {
    pitch = deterministicPitch(input, diagnosis);
  }

  if (usedLlm) {
    try {
      await (deps.recordAgentRun ?? ((i: Record<string, unknown>) => recordAgentRun(i as never)))({ agentSlug: PITCH_AGENT, status: "succeeded", inputSummary: input.businessName, outputSummary: pitch.headline.slice(0, 160), modelRunIds: runId ? [runId] : [] });
    } catch { /* logging never fails the pitch */ }
  }

  const report = { ...pitchToReportShape(pitch, input.businessName, input.industry), scrapedSignals: signals.scraped, usedLlm };
  const id = newId("audit");
  await (deps.persist ?? defaultPersist)({ id, kind: "pitch", companyId: input.companyId ?? null, businessName: input.businessName, report, input: { website: input.website, instagram: input.instagram, industry: input.industry, problems: input.problems, signals: input.signals }, createdBy: input.createdBy ?? null, now });

  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))({ eventType: "audit.pitch_completed", module: PITCH_MODULE, entityType: "audit", entityId: id, actor, metadata: { businessName: input.businessName, usedLlm, scraped: signals.scraped, services: pitch.services.length } });

  return { auditId: id, pitch, usedLlm, scraped: signals.scraped, report };
}
