import { z } from "zod";
import type { ProviderMessage } from "@/lib/providers";
import { WOBBLE_SERVICES, diagnose, type RunAuditInput, type AuditReport } from "@/lib/domain/free-audit";

/**
 * Doc 1 — "What Wobble can do" pitch (pure domain). MERGES the Free-Audit gap diagnosis with a
 * niche-customized capability showcase: it leads with "what we noticed" (the gaps), then presents the
 * relevant Wobble services with descriptions + outcomes rewritten for THIS business's niche. Grounded
 * in the prospect's scraped website/social signals. One LLM node; falls back to a deterministic pitch
 * when no model key is set. Client-facing, top of funnel. Isolation: uses only this prospect's own data.
 */

export const PITCH_MODULE = "free_audit";
export const PITCH_ROLE = "pitch_writer";
export const PITCH_AGENT = "wobble_pitch_writer";

export const pitchSchema = z.object({
  headline: z.string().trim().min(1),
  situation: z.string().trim().default(""),
  whatWeNoticed: z.array(z.string().trim().min(1)).default([]),
  services: z.array(z.object({ name: z.string().trim().min(1), whatItDoes: z.string().trim().default(""), outcomeForYou: z.string().trim().default("") })).default([]),
  whyWobble: z.string().trim().default(""),
  cta: z.string().trim().default(""),
});
export type Pitch = z.infer<typeof pitchSchema>;

function extractJson(text: string): string | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start !== -1 && end > start ? body.slice(start, end + 1) : null;
}
export function parsePitch(text: string): Pitch | null {
  const raw = extractJson(text);
  if (!raw) return null;
  try {
    const r = pitchSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

const SERVICE_MENU = WOBBLE_SERVICES.map((s) => `${s.slug} (${s.name})`).join(", ");

export function buildPitchPrompt(input: { businessName: string; industry?: string | null; signalsText?: string; diagnosis: AuditReport }): ProviderMessage[] {
  const gaps = input.diagnosis.opportunities.map((o) => `${o.name} — ${o.reason}`).join("; ");
  const system = `You are Wobble's PITCH strategist. Write a customized "what Wobble can do for you" pitch for ${input.businessName}${input.industry ? `, a ${input.industry} business` : ""}. Lead with what we NOTICED about their business (gaps/opportunities), then present the relevant Wobble services — and REWRITE each service's description and outcome specifically for THIS niche (not generic). Pick 6-12 of the most relevant services. Be concrete, confident, and specific to their world. Respond with STRICT JSON only:
{"headline":"...","situation":"2-3 sentences on their market/niche","whatWeNoticed":["..."],"services":[{"name":"...","whatItDoes":"niche-specific","outcomeForYou":"the result for a ${input.industry ?? "business like theirs"}"}],"whyWobble":"...","cta":"..."}
WOBBLE SERVICE MENU: ${SERVICE_MENU}`;
  const user = [`BUSINESS: ${input.businessName}`, `WHAT OUR SCAN FOUND (gaps): ${gaps || "(run a call to learn more)"}`, input.signalsText ? `SCRAPED SIGNALS:\n${input.signalsText.slice(0, 5000)}` : null].filter(Boolean).join("\n\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

/** Deterministic fallback pitch (no LLM) — from the free-audit diagnosis + generic service blurbs. */
export function deterministicPitch(input: RunAuditInput, diagnosis: AuditReport): Pitch {
  return {
    headline: `What Wobble can do for ${input.businessName}`,
    situation: diagnosis.summary,
    whatWeNoticed: diagnosis.opportunities.map((o) => o.reason),
    services: diagnosis.opportunities.map((o) => ({ name: o.name, whatItDoes: o.reason, outcomeForYou: o.quickWin ? "A fast win with quick ROI." : "A durable improvement to how you operate." })),
    whyWobble: "One team, one operating system — we build, run, and improve the AI that drives your growth.",
    cta: "Book your free AI Readiness Call to see the numbers on your business.",
  };
}

/** A pitch renders through the shared audit-report/deck renderer, so map it to that shape. */
export function pitchToReportShape(pitch: Pitch, businessName: string, industry?: string | null): Record<string, unknown> {
  return {
    businessName,
    industry: industry ?? null,
    executiveSummary: `${pitch.headline}. ${pitch.situation}`,
    situationSummary: pitch.situation,
    summary: pitch.headline,
    opportunities: pitch.services.map((s) => ({ name: s.name, title: s.name, reason: s.whatItDoes, description: s.whatItDoes, expectedOutcome: s.outcomeForYou, impact: "high" })),
    nextSteps: [pitch.cta].filter(Boolean),
    recommendedTechStack: ["Wobble AI OS"],
    whatWeNoticed: pitch.whatWeNoticed,
    whyWobble: pitch.whyWobble,
  };
}

export { diagnose };
