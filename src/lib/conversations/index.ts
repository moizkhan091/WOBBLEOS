import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { conversations, conversationMessages } from "@/db/schema";
import { getDb, type Db } from "@/db";
import {
  buildConversationMessageRow,
  buildConversationRow,
  type AppendMessageInput,
  type ConversationMessageRow,
  type ConversationRow,
  type StartConversationInput,
} from "@/lib/domain/conversations";

/**
 * Conversation logging service — records every chat so the Memory Harvester can
 * learn from it later. Injectable store so it is testable without a DB.
 */

export interface ConversationStore {
  insertConversation(row: ConversationRow): Promise<void>;
  insertMessage(row: ConversationMessageRow): Promise<void>;
  touchConversation(id: string, lastMessageAt: Date): Promise<void>;
  getConversation(id: string): Promise<ConversationRow | null>;
  listMessages(conversationId: string): Promise<ConversationMessageRow[]>;
  listPendingHarvest(input: { idleBefore: Date; limit: number }): Promise<ConversationRow[]>;
  setHarvestStatus(id: string, status: "pending" | "harvested" | "skipped", harvestedAt: Date | null): Promise<void>;
}

export interface ConversationDeps {
  store?: ConversationStore;
  now?: Date;
}

export async function startConversation(input: StartConversationInput, deps: ConversationDeps = {}): Promise<ConversationRow> {
  const store = deps.store ?? defaultStore();
  const row = buildConversationRow(input, { now: deps.now });
  await store.insertConversation(row);
  return row;
}

export async function appendMessage(input: AppendMessageInput, deps: ConversationDeps = {}): Promise<ConversationMessageRow> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const row = buildConversationMessageRow(input, { now });
  await store.insertMessage(row);
  await store.touchConversation(row.conversationId, now);
  return row;
}

export async function getConversationMessages(conversationId: string, deps: ConversationDeps = {}): Promise<ConversationMessageRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listMessages(conversationId);
}

export async function getConversation(conversationId: string, deps: ConversationDeps = {}): Promise<ConversationRow | null> {
  const store = deps.store ?? defaultStore();
  return store.getConversation(conversationId);
}

export async function listConversationsPendingHarvest(
  input: { idleMinutes?: number; limit?: number } = {},
  deps: ConversationDeps = {},
): Promise<ConversationRow[]> {
  const store = deps.store ?? defaultStore();
  const now = deps.now ?? new Date();
  const idleBefore = new Date(now.getTime() - (input.idleMinutes ?? 10) * 60_000);
  return store.listPendingHarvest({ idleBefore, limit: input.limit ?? 25 });
}

export async function markConversationHarvested(id: string, deps: ConversationDeps = {}): Promise<void> {
  const store = deps.store ?? defaultStore();
  await store.setHarvestStatus(id, "harvested", deps.now ?? new Date());
}

export async function markConversationSkipped(id: string, deps: ConversationDeps = {}): Promise<void> {
  const store = deps.store ?? defaultStore();
  await store.setHarvestStatus(id, "skipped", deps.now ?? new Date());
}

export function defaultStore(db: Db = getDb()): ConversationStore {
  return {
    async insertConversation(row) {
      await db.insert(conversations).values(row);
    },
    async insertMessage(row) {
      await db.insert(conversationMessages).values(row);
    },
    async touchConversation(id, lastMessageAt) {
      await db
        .update(conversations)
        .set({ lastMessageAt, messageCount: sql`${conversations.messageCount} + 1`, updatedAt: lastMessageAt })
        .where(eq(conversations.id, id));
    },
    async getConversation(id) {
      const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
      return (rows[0] as ConversationRow | undefined) ?? null;
    },
    async listMessages(conversationId) {
      return db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversationId))
        .orderBy(asc(conversationMessages.createdAt)) as Promise<ConversationMessageRow[]>;
    },
    async listPendingHarvest({ idleBefore, limit }) {
      return db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.harvestStatus, "pending"),
            lt(conversations.lastMessageAt, idleBefore),
          ),
        )
        .orderBy(desc(conversations.lastMessageAt))
        .limit(limit) as Promise<ConversationRow[]>;
    },
    async setHarvestStatus(id, status, harvestedAt) {
      await db.update(conversations).set({ harvestStatus: status, harvestedAt, updatedAt: new Date() }).where(eq(conversations.id, id));
    },
  };
}
