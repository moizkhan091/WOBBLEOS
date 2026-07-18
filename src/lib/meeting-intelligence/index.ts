import { and, desc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { meetings as meetingsTable, meetingIntelligence } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import {
  MEETING_INTELLIGENCE_KINDS,
  parseExtraction,
  buildMeetingIntelligenceRow,
  type MeetingIntelligenceRow,
  type MeetingIntelligenceStatus,
} from "@/lib/domain/meeting-intelligence";

/**
 * Discovery & Meeting Intelligence service — reads a meeting's transcript/notes and extracts typed discovery
 * facts (each with confidence + source snippet), landing them `pending_review`. A founder then approves/rejects
 * each fact; only approved facts are trusted downstream. Provider + store + clock injectable for unit tests.
 */

export const MEETING_INTELLIGENCE_MODULE = "meeting_intelligence";
export const MEETING_INTELLIGENCE_AGENT = "meeting_intelligence_analyst";

export interface MeetingSubject {
  id: string;
  companyId: string | null;
  title: string;
  transcript: string;
}

export interface MeetingIntelligenceStore {
  getMeeting(id: string): Promise<MeetingSubject | null>;
  insertFacts(rows: MeetingIntelligenceRow[]): Promise<void>;
  listFacts(meetingId: string, status?: MeetingIntelligenceStatus): Promise<MeetingIntelligenceRow[]>;
  getFact(id: string): Promise<MeetingIntelligenceRow | null>;
  updateFact(id: string, fields: Partial<MeetingIntelligenceRow>): Promise<void>;
}

export type ExtractProvider = (input: { role: string; module: string; model?: string; messages: ProviderChatMessage[]; maxTokens?: number; temperature?: number }) => Promise<{ text: string }>;

export interface MeetingIntelligenceDeps {
  store?: MeetingIntelligenceStore;
  runProvider?: ExtractProvider;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
  actor?: string;
  model?: string;
}

async function audit(deps: MeetingIntelligenceDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export async function extractMeetingIntelligence(meetingId: string, deps: MeetingIntelligenceDeps = {}): Promise<MeetingIntelligenceRow[]> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const actor = deps.actor ?? MEETING_INTELLIGENCE_AGENT;

  const meeting = await store.getMeeting(meetingId);
  if (!meeting) throw new Error(`meeting '${meetingId}' not found`);
  if (!meeting.transcript.trim()) throw new Error(`meeting '${meetingId}' has no transcript/notes to extract from`);

  const runProvider = deps.runProvider ?? (async (i) => runTextProvider({ ...i, usageContext: { agentSlug: MEETING_INTELLIGENCE_AGENT, module: MEETING_INTELLIGENCE_MODULE } }));
  const messages: ProviderChatMessage[] = [
    { role: "system", content: `You extract DISCOVERY intelligence from a sales/discovery meeting for WOBBLE. Return STRICT JSON only: {"facts":[{"kind","content","confidence","sourceSnippet"}]}. kind ∈ ${JSON.stringify(MEETING_INTELLIGENCE_KINDS)}. confidence 0-100 = how clearly the transcript supports it. sourceSnippet = a SHORT verbatim quote from the transcript. Extract only what is actually said — never infer facts that are not supported. If nothing qualifies, return {"facts":[]}.` },
    { role: "user", content: `Meeting: ${meeting.title}\n\nTranscript / notes:\n${meeting.transcript.slice(0, 8000)}\n\nReturn STRICT JSON only.` },
  ];
  const r = await runProvider({ role: "default", module: MEETING_INTELLIGENCE_MODULE, model: deps.model ?? "openai/gpt-4o-mini", messages, maxTokens: 1200, temperature: 0.1 });
  const facts = parseExtraction(r.text);

  const rows = facts.map((f) => buildMeetingIntelligenceRow({ meetingId, companyId: meeting.companyId, kind: f.kind, content: f.content, confidence: f.confidence, sourceSnippet: f.sourceSnippet, model: deps.model ?? "openai/gpt-4o-mini", createdBy: actor }, { now }));
  await store.insertFacts(rows);
  await audit(deps, { eventType: "meeting_intelligence.extracted", module: MEETING_INTELLIGENCE_MODULE, entityType: "meeting", entityId: meetingId, actor, metadata: { count: rows.length, kinds: [...new Set(rows.map((x) => x.kind))] } });
  return rows;
}

export interface ReviewFactInput { factId: string; decision: "approved" | "rejected"; reviewedBy: string }

export async function reviewMeetingFact(input: ReviewFactInput, deps: MeetingIntelligenceDeps = {}): Promise<MeetingIntelligenceRow | null> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const fact = await store.getFact(input.factId);
  if (!fact) return null;
  if (fact.status !== "pending_review") return fact; // idempotent — already decided
  const fields: Partial<MeetingIntelligenceRow> = { status: input.decision, reviewedBy: input.reviewedBy, reviewedAt: now };
  await store.updateFact(input.factId, fields);
  await audit(deps, { eventType: `meeting_intelligence.${input.decision}`, module: MEETING_INTELLIGENCE_MODULE, entityType: "meeting_intelligence", entityId: input.factId, actor: input.reviewedBy, metadata: { meetingId: fact.meetingId, kind: fact.kind } });
  return { ...fact, ...fields };
}

export async function listMeetingFacts(meetingId: string, status?: MeetingIntelligenceStatus, deps: MeetingIntelligenceDeps = {}): Promise<MeetingIntelligenceRow[]> {
  return (deps.store ?? defaultStore()).listFacts(meetingId, status);
}

export function defaultStore(db: Db = getDb()): MeetingIntelligenceStore {
  return {
    async getMeeting(id) {
      const r = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id)).limit(1);
      const m = r[0];
      if (!m) return null;
      const transcript = [m.notes, m.description, m.outcome].filter(Boolean).join("\n\n");
      return { id: m.id, companyId: m.companyId ?? null, title: m.title, transcript };
    },
    async insertFacts(rows) { if (rows.length) await db.insert(meetingIntelligence).values(rows as unknown as (typeof meetingIntelligence.$inferInsert)[]); },
    async listFacts(meetingId, status) {
      const conds = [eq(meetingIntelligence.meetingId, meetingId)];
      if (status) conds.push(eq(meetingIntelligence.status, status));
      const r = await db.select().from(meetingIntelligence).where(and(...conds)).orderBy(desc(meetingIntelligence.confidence));
      return r as unknown as MeetingIntelligenceRow[];
    },
    async getFact(id) { const r = await db.select().from(meetingIntelligence).where(eq(meetingIntelligence.id, id)).limit(1); return (r[0] as unknown as MeetingIntelligenceRow) ?? null; },
    async updateFact(id, fields) { await db.update(meetingIntelligence).set(fields as Partial<typeof meetingIntelligence.$inferInsert>).where(eq(meetingIntelligence.id, id)); },
  };
}
