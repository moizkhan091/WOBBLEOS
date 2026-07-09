import { and, desc, eq, isNull } from "drizzle-orm";
import { meetings as meetingsTable } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { MEETING_MODULE, buildMeetingRow, canTransitionMeeting, type CreateMeetingInput, type MeetingRow, type MeetingStatus } from "@/lib/domain/meeting";

/** Meetings service (IO). Book/list/complete meetings, capture outcome. Soft-delete + audited. */

export interface MeetingStore {
  insertMeeting(row: MeetingRow): Promise<void>;
  listMeetings(q: { status?: string; companyId?: string; opportunityId?: string; includeArchived?: boolean; limit: number }): Promise<MeetingRow[]>;
  getMeeting(id: string): Promise<MeetingRow | null>;
  updateMeeting(id: string, fields: Partial<MeetingRow>): Promise<void>;
}
export interface MeetingDeps {
  store?: MeetingStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}
async function audit(deps: MeetingDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export async function addMeeting(input: CreateMeetingInput, deps: MeetingDeps = {}): Promise<MeetingRow> {
  const store = deps.store ?? defaultStore();
  const row = buildMeetingRow(input, { now: deps.now });
  await store.insertMeeting(row);
  await audit(deps, { eventType: "meeting.created", module: MEETING_MODULE, entityType: "meeting", entityId: row.id, actor: row.createdBy ?? "system", metadata: { title: row.title, type: row.meetingType, opportunityId: row.opportunityId } });
  return row;
}

export async function listMeetings(query: { status?: string; companyId?: string; opportunityId?: string; limit?: number } = {}, deps: MeetingDeps = {}): Promise<MeetingRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listMeetings({ ...query, limit: Math.min(Math.max(query.limit ?? 300, 1), 1000) });
}

/** Complete a meeting with its outcome (and whether follow-up is needed). */
export async function transitionMeeting(id: string, to: MeetingStatus, input: { actor?: string; outcome?: string; notes?: string; followUpRequired?: boolean } = {}, deps: MeetingDeps = {}): Promise<MeetingRow | null> {
  const store = deps.store ?? defaultStore();
  const m = await store.getMeeting(id);
  if (!m || !canTransitionMeeting(m.status, to)) return null;
  const now = deps.now ?? new Date();
  const fields: Partial<MeetingRow> = { status: to, updatedAt: now };
  if (input.outcome !== undefined) fields.outcome = input.outcome;
  if (input.notes !== undefined) fields.notes = input.notes;
  if (input.followUpRequired !== undefined) fields.followUpRequired = input.followUpRequired;
  await store.updateMeeting(id, fields);
  await audit(deps, { eventType: `meeting.${to}`, module: MEETING_MODULE, entityType: "meeting", entityId: id, actor: input.actor ?? "system", metadata: { from: m.status, to, followUp: fields.followUpRequired ?? m.followUpRequired } });
  return { ...m, ...fields };
}

export function defaultStore(db: Db = getDb()): MeetingStore {
  return {
    async insertMeeting(row) { await db.insert(meetingsTable).values(row); },
    async listMeetings(q) {
      const conds = [];
      if (q.status) conds.push(eq(meetingsTable.status, q.status));
      if (q.companyId) conds.push(eq(meetingsTable.companyId, q.companyId));
      if (q.opportunityId) conds.push(eq(meetingsTable.opportunityId, q.opportunityId));
      if (!q.includeArchived) conds.push(isNull(meetingsTable.archivedAt));
      const base = db.select().from(meetingsTable);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(meetingsTable.startAt)).limit(q.limit);
      return rows as MeetingRow[];
    },
    async getMeeting(id) { const r = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id)).limit(1); return (r[0] as MeetingRow) ?? null; },
    async updateMeeting(id, fields) { await db.update(meetingsTable).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() }).where(eq(meetingsTable.id, id)); },
  };
}
