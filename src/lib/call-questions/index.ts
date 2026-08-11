import { and, eq } from "drizzle-orm";
import { crmCompanies, meetingIntelligence } from "@/db/schema";
import { getDb } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import { parseStructuredWithRepair, repairInstruction } from "@/lib/providers/structured";
import { WOBBLE_SERVICES } from "@/lib/domain/free-audit";
import { sanitizeDeep } from "@/lib/domain/house-style";
import { getClientIntakeContext } from "@/lib/intake/context";
import {
  CALL_QUESTIONS_MODULE,
  callQuestionSetSchema,
  coverageRepairInstruction,
  missingCoverage,
  questionSystemPrompt,
  type CallRound,
  questionUserPrompt,
  type CallQuestionSet,
} from "@/lib/domain/call-questions";

/**
 * Pre-call question engine (IO).
 *
 * Turns everything the OS knows about ONE client into the questions a founder should actually ask on
 * their first readiness call. This is the step the founder kept asking for: the form gets us in the
 * door, and this is what we do with it before the call rather than after.
 *
 * Generated fresh every time, never drawn from a bank — see the reasoning in the domain file. The one
 * thing that persists between clients is the coverage spine, which is enforced here with a single
 * repair round: if the model forgot to ask about, say, budget reality, it is told exactly which area
 * it missed and asked to fix its own output rather than us silently shipping a half-useful set.
 */

export interface GeneratedQuestionSet extends CallQuestionSet {
  companyId: string;
  companyName: string;
  generatedAt: string;
  /** Coverage areas still missing after the repair round — surfaced, never hidden. */
  gaps: string[];
  /** Which call this set was written for. A follow-up set builds on the last call rather than repeating it. */
  round: CallRound;
  modelRunId: string | null;
}

export interface CallQuestionsDeps {
  runProvider?: (input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number; temperature?: number }) => Promise<{ text: string; run: { id: string } }>;
  loadContext?: (companyId: string) => Promise<{ name: string; industry: string | null; approvedFacts: string[] } | null>;
  persist?: (companyId: string, set: GeneratedQuestionSet) => Promise<void>;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
  actor?: string;
  /** Override which call this is. Left unset, it is inferred from whether any findings are approved. */
  round?: CallRound;
}

async function defaultLoadContext(companyId: string) {
  const db = getDb();
  const [company] = await db
    .select({ name: crmCompanies.name, industry: crmCompanies.industry })
    .from(crmCompanies)
    .where(eq(crmCompanies.id, companyId))
    .limit(1);
  if (!company) return null;

  // Only FOUNDER-APPROVED facts. An unreviewed LLM reading of a call is a proposal, not knowledge, and
  // building the next call's questions on an unverified claim compounds the error.
  const facts = (await db
    .select({ kind: meetingIntelligence.kind, content: meetingIntelligence.content })
    .from(meetingIntelligence)
    .where(and(eq(meetingIntelligence.companyId, companyId), eq(meetingIntelligence.status, "approved")))
    .limit(40)) as Array<{ kind: string; content: string }>;

  return { name: company.name, industry: company.industry, approvedFacts: facts.map((f) => `[${f.kind}] ${f.content}`) };
}

/** Store the latest set on the company so the container can show it without regenerating (and paying) again. */
async function defaultPersist(companyId: string, set: GeneratedQuestionSet): Promise<void> {
  const db = getDb();
  const [row] = await db.select({ metadata: crmCompanies.metadata }).from(crmCompanies).where(eq(crmCompanies.id, companyId)).limit(1);
  const metadata = { ...((row?.metadata as Record<string, unknown>) ?? {}), callQuestions: set };
  await db.update(crmCompanies).set({ metadata, updatedAt: new Date() }).where(eq(crmCompanies.id, companyId));
}

/** Read back the last set generated for this client, if any. */
export async function getStoredQuestionSet(companyId: string): Promise<GeneratedQuestionSet | null> {
  if (!process.env.DATABASE_URL) return null;
  const db = getDb();
  const [row] = await db.select({ metadata: crmCompanies.metadata }).from(crmCompanies).where(eq(crmCompanies.id, companyId)).limit(1);
  const stored = (row?.metadata as Record<string, unknown> | undefined)?.callQuestions;
  return stored ? (stored as GeneratedQuestionSet) : null;
}

export async function generateCallQuestions(companyId: string, deps: CallQuestionsDeps = {}): Promise<GeneratedQuestionSet> {
  const now = deps.now ?? new Date();
  const actor = deps.actor ?? "system";
  const context = await (deps.loadContext ?? defaultLoadContext)(companyId);
  if (!context) throw new Error("company not found");

  const { snapshots } = await getClientIntakeContext(companyId).catch(() => ({ snapshots: [] }));
  const snapshot = snapshots[0];

  // Which call this is decides the whole job. Approved findings mean a call already happened, so asking
  // "tell me about your business" again would throw away what the founder earned on it.
  const round: CallRound = deps.round ?? ((context.approvedFacts?.length ?? 0) > 0 ? "follow_up" : "first");

  const messages: ProviderChatMessage[] = [
    { role: "system", content: questionSystemPrompt(round) },
    {
      role: "user",
      content: questionUserPrompt({
        companyName: context.name,
        industry: context.industry,
        snapshot,
        services: WOBBLE_SERVICES.map((s) => s.name),
        approvedFacts: context.approvedFacts,
        round,
      }),
    },
  ];

  const runProvider =
    deps.runProvider ??
    (async (input: { role: string; module: string; messages: ProviderChatMessage[]; maxTokens?: number; temperature?: number }) => {
      const r = await runTextProvider({ ...input, usageContext: { agentSlug: "call_question_engine", module: CALL_QUESTIONS_MODULE } });
      return { text: r.text, run: { id: r.run.id } };
    });

  const first = await runProvider({ role: "call_questions", module: CALL_QUESTIONS_MODULE, messages, maxTokens: 2600, temperature: 0.5 });
  const parsed = await parseStructuredWithRepair(first.text, callQuestionSetSchema, {
    repair: async (bad, error) => {
      const r = await runProvider({
        role: "call_questions",
        module: CALL_QUESTIONS_MODULE,
        messages: [...messages, { role: "assistant", content: bad }, { role: "user", content: repairInstruction(error) }],
        maxTokens: 2600,
        temperature: 0.2,
      });
      return r.text;
    },
  });
  if (!parsed.ok || !parsed.data) throw new Error(`question engine returned unusable output, ${parsed.error}`);

  // Coverage repair: the spine is the whole reason this beats a bank, so enforce it rather than hope.
  let set = parsed.data;
  let gaps = missingCoverage(set);
  let modelRunId = first.run.id;
  if (gaps.length) {
    const fix = await runProvider({
      role: "call_questions",
      module: CALL_QUESTIONS_MODULE,
      messages: [...messages, { role: "assistant", content: JSON.stringify(set) }, { role: "user", content: coverageRepairInstruction(gaps) }],
      maxTokens: 2600,
      temperature: 0.3,
    });
    const repaired = await parseStructuredWithRepair(fix.text, callQuestionSetSchema, {});
    if (repaired.ok && repaired.data) {
      set = repaired.data;
      modelRunId = fix.run.id;
      gaps = missingCoverage(set);
    }
  }

  // Deterministic net: the instruction gets it right most of the time, this makes it always.
  const result: GeneratedQuestionSet = {
    ...sanitizeDeep(set),
    companyId,
    companyName: context.name,
    generatedAt: now.toISOString(),
    gaps,
    round,
    modelRunId,
  };

  await (deps.persist ?? defaultPersist)(companyId, result).catch(() => {});
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))({
    eventType: "call_questions.generated",
    module: CALL_QUESTIONS_MODULE,
    entityType: "crm_company",
    entityId: companyId,
    actor,
    metadata: { questions: result.questions.length, gaps: result.gaps, round, usedFormAnswers: Boolean(snapshot), approvedFacts: context.approvedFacts.length },
  });

  return result;
}
