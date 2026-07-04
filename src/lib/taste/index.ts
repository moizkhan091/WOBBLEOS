import { and, desc, eq, sql } from "drizzle-orm";
import { feedbackEvents, tasteProfiles } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  applyFeedbackToTasteProfile,
  buildFeedbackEventRow,
  buildTasteProfileRow,
  profileInputFromKey,
  tasteProfileInputSchema,
  type FeedbackEventInput,
  type FeedbackEventRow,
  type TasteProfileInput,
  type TasteProfileRow,
  type TasteProfileScope,
} from "@/lib/domain/taste";

export type { FeedbackEventRow, TasteProfileRow };

export interface ListTasteProfilesQuery {
  scope?: TasteProfileScope;
  subjectId?: string;
  limit?: number;
}

export interface ListFeedbackEventsQuery {
  profileKey?: string;
  targetType?: string;
  targetId?: string;
  actor?: string;
  limit?: number;
}

export const DEFAULT_TASTE_LIMIT = 100;
export const MAX_TASTE_LIMIT = 500;

export function clampTasteLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_TASTE_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_TASTE_LIMIT);
}

export interface TasteStore {
  insertProfile(row: TasteProfileRow): Promise<void>;
  getProfileByKey(profileKey: string): Promise<TasteProfileRow | null>;
  updateProfile(profileKey: string, fields: Partial<TasteProfileRow>): Promise<void>;
  insertFeedbackEvent(row: FeedbackEventRow): Promise<void>;
  listProfiles(query: Required<Pick<ListTasteProfilesQuery, "limit">> & Omit<ListTasteProfilesQuery, "limit">): Promise<TasteProfileRow[]>;
  listFeedbackEvents(query: Required<Pick<ListFeedbackEventsQuery, "limit">> & Omit<ListFeedbackEventsQuery, "limit">): Promise<FeedbackEventRow[]>;
}

export interface TasteDeps {
  store?: TasteStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

export async function ensureTasteProfile(input: TasteProfileInput, deps: TasteDeps = {}): Promise<TasteProfileRow> {
  const store = deps.store ?? defaultStore();
  const parsed = tasteProfileInputSchema.parse(input);
  const profile = buildTasteProfileRow(parsed, { now: deps.now });
  const existing = await store.getProfileByKey(profile.profileKey);
  if (existing) return existing;
  await store.insertProfile(profile);
  return profile;
}

export interface RecordFeedbackEventResult {
  event: FeedbackEventRow;
  profiles: TasteProfileRow[];
}

export async function recordFeedbackEvent(input: FeedbackEventInput, deps: TasteDeps = {}): Promise<RecordFeedbackEventResult> {
  const store = deps.store ?? defaultStore();
  const recordAudit = deps.recordAudit ?? defaultRecordAudit;
  const now = deps.now ?? new Date();
  const event = buildFeedbackEventRow(input, { now });

  await store.insertFeedbackEvent(event);
  await recordAudit({
    eventType: "feedback.recorded",
    module: "taste_learning",
    entityType: event.targetType,
    entityId: event.targetId,
    actor: event.actor,
    metadata: {
      decision: event.decision,
      reasonCategory: event.reasonCategory,
      profileKeys: event.profileKeys,
      agentSlug: event.agentSlug,
      module: event.module,
    },
  });

  const updatedProfiles: TasteProfileRow[] = [];
  for (const profileKey of event.profileKeys) {
    let profile = await store.getProfileByKey(profileKey);
    if (!profile) {
      profile = buildTasteProfileRow(profileInputFromKey(profileKey), { now });
      await store.insertProfile(profile);
    }

    const updated = applyFeedbackToTasteProfile(profile, event, { now });
    await store.updateProfile(profileKey, {
      hardConstraints: updated.hardConstraints,
      preferenceWeights: updated.preferenceWeights,
      positiveSignals: updated.positiveSignals,
      negativeSignals: updated.negativeSignals,
      confidence: updated.confidence,
      lastFeedbackAt: updated.lastFeedbackAt,
      provenanceEventIds: updated.provenanceEventIds,
      metadata: updated.metadata,
      updatedAt: updated.updatedAt,
    });
    updatedProfiles.push(updated);

    await recordAudit({
      eventType: "taste_profile.updated",
      module: "taste_learning",
      entityType: "taste_profile",
      entityId: profile.id,
      actor: event.actor,
      metadata: {
        profileKey,
        decision: event.decision,
        targetType: event.targetType,
        targetId: event.targetId,
        reasonCategory: event.reasonCategory,
      },
    });
  }

  return { event, profiles: updatedProfiles };
}

export async function listTasteProfiles(query: ListTasteProfilesQuery = {}, deps: TasteDeps = {}): Promise<TasteProfileRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listProfiles({ ...query, limit: clampTasteLimit(query.limit) });
}

export async function getTasteProfile(profileKey: string, deps: TasteDeps = {}): Promise<TasteProfileRow | null> {
  const store = deps.store ?? defaultStore();
  return store.getProfileByKey(profileKey);
}

export async function listFeedbackEvents(query: ListFeedbackEventsQuery = {}, deps: TasteDeps = {}): Promise<FeedbackEventRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listFeedbackEvents({ ...query, limit: clampTasteLimit(query.limit) });
}

export function defaultStore(db: Db = getDb()): TasteStore {
  return {
    async insertProfile(row) {
      await db.insert(tasteProfiles).values(row).onConflictDoNothing();
    },
    async getProfileByKey(profileKey) {
      const rows = await db.select().from(tasteProfiles).where(eq(tasteProfiles.profileKey, profileKey)).limit(1);
      return (rows[0] as TasteProfileRow | undefined) ?? null;
    },
    async updateProfile(profileKey, fields) {
      await db.update(tasteProfiles).set(fields).where(eq(tasteProfiles.profileKey, profileKey));
    },
    async insertFeedbackEvent(row) {
      await db.insert(feedbackEvents).values(row);
    },
    async listProfiles(query) {
      const conditions = [];
      if (query.scope) conditions.push(eq(tasteProfiles.scope, query.scope));
      if (query.subjectId) conditions.push(eq(tasteProfiles.subjectId, query.subjectId));
      const where = conditions.length ? and(...conditions) : undefined;
      return db.select().from(tasteProfiles).where(where).orderBy(desc(tasteProfiles.updatedAt)).limit(query.limit) as Promise<TasteProfileRow[]>;
    },
    async listFeedbackEvents(query) {
      const conditions = [];
      if (query.targetType) conditions.push(eq(feedbackEvents.targetType, query.targetType));
      if (query.targetId) conditions.push(eq(feedbackEvents.targetId, query.targetId));
      if (query.actor) conditions.push(eq(feedbackEvents.actor, query.actor));
      if (query.profileKey) conditions.push(sql`${feedbackEvents.profileKeys}::jsonb ? ${query.profileKey}`);
      const where = conditions.length ? and(...conditions) : undefined;
      return db.select().from(feedbackEvents).where(where).orderBy(desc(feedbackEvents.createdAt)).limit(query.limit) as Promise<FeedbackEventRow[]>;
    },
  };
}
