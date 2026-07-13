import { diagnose, buildAuditRow, SERVICE_BY_SLUG, FREE_AUDIT_MODULE, type RunAuditInput, type AuditReport, type AuditRow } from "@/lib/domain/free-audit";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { AuditStore } from "@/lib/free-audit";
import { defaultStore } from "@/lib/free-audit";

/**
 * Free Audit MULTI-AGENT enrichment. The deterministic `diagnose` grounds the team in REAL Wobble opportunities
 * (anti-hallucination: the team may only speak to opportunities the diagnosis actually surfaced). Three roles then
 * turn that grounding into a client-ready pitch: gap_analyst → opportunity_writer → pitch_composer. The provider is
 * INJECTABLE (deterministic in CI/proofs, the real text model in production). A provider failure DEGRADES to the
 * deterministic report (the free audit is never blocked by the enrichment).
 */

export interface FreeAuditProviderInput { role: string; module: string; prompt: string; grounding: string }
export type FreeAuditProvider = (input: FreeAuditProviderInput) => Promise<{ text: string }>;

export interface FreeAuditEnrichment {
  framedGaps: string;
  opportunityNarrative: string;
  finalPitch: string;
  /** The service slugs the enrichment is allowed to reference — EXACTLY the diagnosis's opportunities (grounded). */
  groundedServiceSlugs: string[];
  generated: boolean; // false when it degraded to the deterministic report (no provider / provider failed)
}

export interface FreeAuditTeamDeps {
  store?: AuditStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  /** Text provider. Defaults to the real OpenRouter text model in production; inject a deterministic one in proofs. */
  runProvider?: FreeAuditProvider;
  now?: Date;
}

/** The grounding block every role sees — the REAL opportunities the deterministic diagnosis surfaced. */
function groundingOf(report: AuditReport): string {
  const lines = report.opportunities.map((o) => {
    const svc = SERVICE_BY_SLUG.get(o.service);
    return `- [${o.service}] ${svc?.name ?? o.name} (${o.category}${o.quickWin ? ", quick win" : ""}, ${o.impact} impact): ${o.reason}`;
  });
  return `Business: ${report.businessName}${report.industry ? ` (${report.industry})` : ""}\nDiagnosis summary: ${report.summary}\nREAL opportunities (you may ONLY reference these — never invent a service):\n${lines.join("\n")}`;
}

/** Default production provider — the real OpenRouter text model. Imported lazily so tests never load it. In the
 *  CI deterministic-adapter mode (WOBBLE_JUDGMENT_ADAPTER=deterministic; NEVER a real deploy) it returns a grounded
 *  deterministic response so browser E2E exercises the real path without a paid LLM call. */
async function defaultProvider(input: FreeAuditProviderInput): Promise<{ text: string }> {
  if ((process.env.WOBBLE_JUDGMENT_ADAPTER ?? "").trim() === "deterministic") {
    return { text: `[${input.role}] (deterministic CI adapter)\n${input.grounding}` };
  }
  const { runTextProvider } = await import("@/lib/providers");
  const out = await runTextProvider({
    role: "content_strategy",
    module: input.module,
    messages: [
      { role: "system", content: `You are the WOBBLE ${input.role}. Use ONLY the grounded opportunities provided — never invent a service or a claim. Be concrete + concise.` },
      { role: "system", content: input.grounding },
      { role: "user", content: input.prompt },
    ],
    maxTokens: 500,
  });
  return { text: out.text };
}

async function runRole(deps: FreeAuditTeamDeps, input: FreeAuditProviderInput): Promise<string> {
  const provider = deps.runProvider ?? defaultProvider;
  const out = await provider(input);
  return (out.text ?? "").trim();
}

/**
 * Run the free-audit team: deterministic diagnosis → 3-agent enrichment → persist ONE audit row carrying BOTH the
 * grounded report and the enrichment. Returns the persisted row. If the enrichment fails (no/failed provider) the
 * audit still lands with the deterministic report + `enrichment.generated=false` — never blocked, never fabricated.
 */
export async function runFreeAuditTeam(input: RunAuditInput, deps: FreeAuditTeamDeps = {}): Promise<AuditRow> {
  const store = deps.store ?? defaultStore();
  const report = diagnose(input);
  const grounding = groundingOf(report);
  const groundedServiceSlugs = report.opportunities.map((o) => o.service);

  let enrichment: FreeAuditEnrichment;
  try {
    const framedGaps = await runRole(deps, { role: "free_audit_gap_analyst", module: FREE_AUDIT_MODULE, grounding, prompt: "Frame the 2-3 highest-impact gaps this business has, in the owner's language. One short paragraph." });
    const opportunityNarrative = await runRole(deps, { role: "free_audit_opportunity_writer", module: FREE_AUDIT_MODULE, grounding, prompt: "For each REAL opportunity above, write one persuasive sentence tying the Wobble service to the gap. Bulleted." });
    const finalPitch = await runRole(deps, { role: "free_audit_pitch_composer", module: FREE_AUDIT_MODULE, grounding, prompt: `Compose a tight, niche-customized pitch for ${report.businessName} from the framed gaps + opportunity lines. Open with the single biggest win. 120 words max.` });
    enrichment = { framedGaps, opportunityNarrative, finalPitch, groundedServiceSlugs, generated: Boolean(framedGaps || opportunityNarrative || finalPitch) };
  } catch {
    enrichment = { framedGaps: "", opportunityNarrative: "", finalPitch: report.summary, groundedServiceSlugs, generated: false };
  }

  const enrichedReport = { ...report, enrichment } as AuditReport & { enrichment: FreeAuditEnrichment };
  const row = buildAuditRow(input, enrichedReport, { now: deps.now, kind: "free" });
  await store.insertAudit(row);
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))({
    eventType: "audit.free_team_completed",
    module: FREE_AUDIT_MODULE,
    entityType: "audit",
    entityId: row.id,
    actor: row.createdBy ?? "system",
    metadata: { businessName: row.businessName, opportunities: report.serviceCount, enrichmentGenerated: enrichment.generated, groundedServiceSlugs },
  });
  return row;
}
