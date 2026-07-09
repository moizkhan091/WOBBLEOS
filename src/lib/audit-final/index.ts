import { getAudit } from "@/lib/free-audit";
import { runPaidAuditGraph, type PaidAuditDeps, type RunPaidAuditInput } from "@/lib/paid-audit-graph";

/**
 * Doc 3 — the final client-facing audit deck (IO). It does NOT invent a new agent team: it gathers
 * this client's own Doc 1 (pitch) + Doc 2 (roadmap) + the per-interview findings WE recorded, assembles
 * them into the intake, and runs the deep 5-agent paid-audit graph → the full McKinsey report + deck.
 * Data isolation: reads only this client's own prior docs (companyId must match), and the graph only
 * grounds in Wobble's shared brand Brain — never another client's audit.
 */

export interface InterviewFinding {
  stakeholder: string;
  notes: string;
}

export interface RunFinalAuditInput {
  businessName: string;
  industry?: string | null;
  companyId?: string;
  pitchAuditId?: string;
  roadmapAuditId?: string;
  findings?: InterviewFinding[];
  extraNotes?: string;
  requestedBy: string;
}

export interface FinalAuditDeps extends PaidAuditDeps {
  getDoc?: (id: string) => Promise<{ companyId: string | null; report: Record<string, unknown> } | null>;
}

async function readDoc(id: string, deps: FinalAuditDeps): Promise<{ companyId: string | null; report: Record<string, unknown> } | null> {
  if (deps.getDoc) return deps.getDoc(id);
  const a = await getAudit(id);
  return a ? { companyId: a.companyId, report: a.report as unknown as Record<string, unknown> } : null;
}

function assertSameCompany(doc: { companyId: string | null } | null, companyId?: string): void {
  if (doc && companyId && doc.companyId && doc.companyId !== companyId) {
    throw new Error("data isolation: a referenced document belongs to a different company");
  }
}

export async function runFinalAudit(input: RunFinalAuditInput, deps: FinalAuditDeps = {}): Promise<{ auditId: string; report: unknown }> {
  const pitch = input.pitchAuditId ? await readDoc(input.pitchAuditId, deps) : null;
  const roadmap = input.roadmapAuditId ? await readDoc(input.roadmapAuditId, deps) : null;
  assertSameCompany(pitch, input.companyId);
  assertSameCompany(roadmap, input.companyId);

  const pitchSummary = pitch ? String(pitch.report.executiveSummary ?? pitch.report.summary ?? "") : "";
  const roadmapOverview = roadmap ? String(roadmap.report.situationSummary ?? roadmap.report.summary ?? "") : "";
  const findingsText = (input.findings ?? []).filter((f) => f.notes.trim()).map((f) => `INTERVIEW — ${f.stakeholder}:\n${f.notes}`).join("\n\n");

  const intakeNotes = [
    findingsText || "(no interview notes provided yet)",
    input.extraNotes ? `ADDITIONAL NOTES:\n${input.extraNotes}` : "",
    roadmapOverview ? `OUR AUDIT APPROACH: ${roadmapOverview}` : "",
  ].filter(Boolean).join("\n\n");

  // Feed the deep paid-audit graph. It persists kind="paid" and grounds only in shared Brain.
  const graphInput: RunPaidAuditInput = { businessName: input.businessName, industry: input.industry, intakeNotes, freeAuditSummary: pitchSummary || undefined, companyId: input.companyId, requestedBy: input.requestedBy };
  const result = await runPaidAuditGraph(graphInput, deps);
  return { auditId: result.auditId, report: result.report };
}
