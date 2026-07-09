import { and, desc, eq, isNull } from "drizzle-orm";
import { offers as offersTable } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import { OFFER_MODULE, buildOfferRow, canTransitionOffer, type CreateOfferInput, type OfferExperiment, type OfferRow, type OfferStatus } from "@/lib/domain/offer";

/** Offer Lab service. Create/list offers, add experiments, transition status. Soft-delete + audited. */

export interface OfferStore {
  insertOffer(row: OfferRow): Promise<void>;
  listOffers(q: { status?: string; includeArchived?: boolean; limit: number }): Promise<OfferRow[]>;
  getOffer(id: string): Promise<OfferRow | null>;
  updateOffer(id: string, fields: Partial<OfferRow>): Promise<void>;
}
export interface OfferDeps {
  store?: OfferStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}
async function audit(deps: OfferDeps, input: AuditEventInput): Promise<void> {
  await (deps.recordAudit ?? ((i: AuditEventInput) => writeAuditEvent(i)))(input);
}

export async function addOffer(input: CreateOfferInput, deps: OfferDeps = {}): Promise<OfferRow> {
  const store = deps.store ?? defaultStore();
  const row = buildOfferRow(input, { now: deps.now });
  await store.insertOffer(row);
  await audit(deps, { eventType: "offer.created", module: OFFER_MODULE, entityType: "offer", entityId: row.id, actor: row.createdBy ?? "system", metadata: { name: row.name, priceCents: row.priceCents } });
  return row;
}

export async function listOffers(query: { status?: string; limit?: number } = {}, deps: OfferDeps = {}): Promise<OfferRow[]> {
  const store = deps.store ?? defaultStore();
  return store.listOffers({ ...query, limit: Math.min(Math.max(query.limit ?? 200, 1), 1000) });
}

export async function transitionOffer(id: string, to: OfferStatus, input: { actor?: string; resultNotes?: string; score?: number } = {}, deps: OfferDeps = {}): Promise<OfferRow | null> {
  const store = deps.store ?? defaultStore();
  const o = await store.getOffer(id);
  if (!o || !canTransitionOffer(o.status, to)) return null;
  const now = deps.now ?? new Date();
  const fields: Partial<OfferRow> = { status: to, updatedAt: now };
  if (input.resultNotes) fields.resultNotes = input.resultNotes;
  if (typeof input.score === "number") fields.score = Math.max(0, Math.min(100, Math.round(input.score)));
  await store.updateOffer(id, fields);
  await audit(deps, { eventType: `offer.${to}`, module: OFFER_MODULE, entityType: "offer", entityId: id, actor: input.actor ?? "system", metadata: { from: o.status, to } });
  return { ...o, ...fields };
}

export async function addExperiment(id: string, experiment: { name: string; metric?: string }, input: { actor?: string } = {}, deps: OfferDeps = {}): Promise<OfferRow | null> {
  const store = deps.store ?? defaultStore();
  const o = await store.getOffer(id);
  if (!o) return null;
  const now = deps.now ?? new Date();
  const exp: OfferExperiment = { id: `exp_${now.getTime().toString(36)}_${o.experiments.length}`, name: experiment.name.trim(), metric: experiment.metric, status: "running" };
  const experiments = [...o.experiments, exp];
  const status: OfferStatus = o.status === "draft" ? "testing" : o.status;
  await store.updateOffer(id, { experiments, status, updatedAt: now });
  await audit(deps, { eventType: "offer.experiment_added", module: OFFER_MODULE, entityType: "offer", entityId: id, actor: input.actor ?? "system", metadata: { experiment: exp.name } });
  return { ...o, experiments, status };
}

export function defaultStore(db: Db = getDb()): OfferStore {
  return {
    async insertOffer(row) { await db.insert(offersTable).values(row as typeof offersTable.$inferInsert); },
    async listOffers(q) {
      const conds = [];
      if (q.status) conds.push(eq(offersTable.status, q.status));
      if (!q.includeArchived) conds.push(isNull(offersTable.archivedAt));
      const base = db.select().from(offersTable);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(offersTable.createdAt)).limit(q.limit);
      return rows as OfferRow[];
    },
    async getOffer(id) { const r = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1); return (r[0] as OfferRow) ?? null; },
    async updateOffer(id, fields) { await db.update(offersTable).set({ ...fields, updatedAt: fields.updatedAt ?? new Date() } as Partial<typeof offersTable.$inferInsert>).where(eq(offersTable.id, id)); },
  };
}
