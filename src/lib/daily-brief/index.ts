// Daily Founder Brief — service (Doctrine 8).
//
// Orchestrates the injectable signal providers into a scoped, evidence-linked, progressive brief. This
// service owns NO data of its own: the lead wires each provider to a real WOBBLE store (escalations,
// department KPIs, intelligence, CRM, finance, handoff-delivery, connections health, approvals). A
// provider that throws degrades that ONE category (recorded honestly) rather than failing the brief; a
// signal that arrives without evidence is omitted-and-counted, never invented.
import { and, desc, eq, isNull } from "drizzle-orm";
import { dailyBriefs as dailyBriefsTable } from "@/db/schema";
import { getDb, type Db } from "@/db";
import {
  assembleFounderBrief,
  briefSignalDraftSchema,
  buildBriefSignal,
  SIGNAL_CATEGORIES,
  type BriefScope,
  type BriefSignal,
  type BriefSignalDraft,
  type ConfidenceLabel,
  type FounderBrief,
  type SignalCategory,
} from "@/lib/domain/daily-brief";
import { defaultBriefProviders } from "@/lib/daily-brief/providers";

/** Context handed to every provider so DB queries can scope by time consistently. */
export interface BriefProviderContext {
  now: Date;
  /** How far back the cadence looks (ms) — daily=1d, weekly=7d, etc. The lead's providers honor this. */
  lookbackMs: number;
}

/** A provider fetches drafts for ONE category, already scoped. Returns [] when it has nothing to report. */
export type SignalFetcher = (scope: BriefScope, ctx: BriefProviderContext) => Promise<BriefSignalDraft[]>;

/** The eight injectable providers. Each is optional — a brief assembles from whatever is wired. */
export interface BriefProviders {
  escalations?: SignalFetcher;
  approvalsDue?: SignalFetcher;
  financeAlerts?: SignalFetcher;
  deliveryRisks?: SignalFetcher;
  providerHealth?: SignalFetcher;
  kpis?: SignalFetcher;
  crmMovement?: SignalFetcher;
  intelligence?: SignalFetcher;
}

const PROVIDER_CATEGORY: Record<keyof BriefProviders, SignalCategory> = {
  escalations: "escalation",
  approvalsDue: "approval_due",
  financeAlerts: "finance_alert",
  deliveryRisks: "delivery_risk",
  providerHealth: "provider_health",
  kpis: "kpi",
  crmMovement: "crm_movement",
  intelligence: "intelligence",
};

/** Default cadence → lookback window. */
const CADENCE_LOOKBACK_MS: Record<BriefScope["cadence"], number> = {
  daily: 24 * 60 * 60_000,
  weekly: 7 * 24 * 60 * 60_000,
  monthly: 30 * 24 * 60 * 60_000,
  on_demand: 24 * 60 * 60_000,
};

export interface DailyBriefDeps {
  providers?: BriefProviders;
  now?: Date;
  topN?: number;
  halfLifeHours?: number;
  /** Override the cadence-derived lookback if the caller wants a custom window. */
  lookbackMs?: number;
}

/**
 * Assemble the Daily Founder Brief for a scope. Runs all wired providers concurrently, isolates failures
 * per-category, validates every draft (dropping unevidenced ones honestly), then ranks + composes.
 */
export async function buildDailyFounderBrief(scope: BriefScope, deps: DailyBriefDeps = {}): Promise<FounderBrief> {
  const now = deps.now ?? new Date();
  const providers = deps.providers ?? {};
  const ctx: BriefProviderContext = { now, lookbackMs: deps.lookbackMs ?? CADENCE_LOOKBACK_MS[scope.cadence] };

  const degraded: SignalCategory[] = [];
  let omitted = 0;
  const signals: BriefSignal[] = [];

  const keys = Object.keys(PROVIDER_CATEGORY) as (keyof BriefProviders)[];
  const results = await Promise.all(
    keys.map(async (key) => {
      const fetcher = providers[key];
      if (!fetcher) return { key, drafts: null as BriefSignalDraft[] | null, failed: false };
      try {
        const drafts = await fetcher(scope, ctx);
        return { key, drafts, failed: false };
      } catch {
        return { key, drafts: null, failed: true };
      }
    }),
  );

  for (const { key, drafts, failed } of results) {
    const category = PROVIDER_CATEGORY[key];
    if (failed) {
      degraded.push(category);
      continue;
    }
    if (!drafts) continue; // provider not wired
    for (const draft of drafts) {
      // The provider is responsible for its own category; guard against mislabeled drafts.
      const parsed = briefSignalDraftSchema.safeParse({ ...draft, category });
      if (!parsed.success) {
        omitted += 1; // unevidenced or malformed — omitted, never fabricated
        continue;
      }
      signals.push(buildBriefSignal({ ...draft, category }));
    }
  }

  return assembleFounderBrief(scope, signals, {
    now,
    topN: deps.topN,
    halfLifeHours: deps.halfLifeHours,
    degradedCategories: dedupeCategories(degraded),
    omittedSignals: omitted,
  });
}

function dedupeCategories(cats: SignalCategory[]): SignalCategory[] {
  const seen = new Set(cats);
  return SIGNAL_CATEGORIES.filter((c) => seen.has(c));
}

// ---------------------------------------------------------------- durable persistence (daily_briefs)

/** A persisted brief row (the full FounderBrief lives in `brief`; the columns are queryable projections). */
export interface StoredDailyBrief {
  id: string;
  scopeType: string;
  scopeId: string | null;
  cadence: string;
  generatedAt: Date;
  isEmpty: boolean;
  totalSignals: number;
  lowestConfidence: ConfidenceLabel | null;
  degradedCategories: string[];
  omittedSignals: number;
  note: string;
  brief: FounderBrief;
  createdAt: Date;
}

export interface DailyBriefStore {
  insertBrief(brief: FounderBrief): Promise<void>;
  getLatestForScope(scopeType: string, scopeId: string | null): Promise<StoredDailyBrief | null>;
  listBriefs(query: { scopeType?: string; limit: number }): Promise<StoredDailyBrief[]>;
}

function rowToStored(row: typeof dailyBriefsTable.$inferSelect): StoredDailyBrief {
  return {
    id: row.id, scopeType: row.scopeType, scopeId: row.scopeId, cadence: row.cadence, generatedAt: row.generatedAt,
    isEmpty: row.isEmpty, totalSignals: row.totalSignals, lowestConfidence: (row.lowestConfidence as ConfidenceLabel | null) ?? null,
    degradedCategories: row.degradedCategories, omittedSignals: row.omittedSignals, note: row.note,
    brief: row.brief as unknown as FounderBrief, createdAt: row.createdAt,
  };
}

/** DB-backed brief store. Append-only history (one row per generated brief); reads take the latest per scope. */
export function createDbDailyBriefStore(db: Db = getDb()): DailyBriefStore {
  return {
    async insertBrief(brief) {
      await db.insert(dailyBriefsTable).values({
        id: brief.id, scopeType: brief.scope.type, scopeId: brief.scope.id ?? null, cadence: brief.scope.cadence,
        generatedAt: brief.generatedAt, isEmpty: brief.isEmpty, totalSignals: brief.totalSignals,
        lowestConfidence: brief.lowestConfidence, degradedCategories: brief.degradedCategories, omittedSignals: brief.omittedSignals,
        note: brief.note, brief: brief as never,
      } as never);
    },
    async getLatestForScope(scopeType, scopeId) {
      const cond = scopeId === null ? and(eq(dailyBriefsTable.scopeType, scopeType), isNull(dailyBriefsTable.scopeId)) : and(eq(dailyBriefsTable.scopeType, scopeType), eq(dailyBriefsTable.scopeId, scopeId));
      const rows = await db.select().from(dailyBriefsTable).where(cond).orderBy(desc(dailyBriefsTable.generatedAt)).limit(1);
      return rows[0] ? rowToStored(rows[0]) : null;
    },
    async listBriefs(query) {
      const base = db.select().from(dailyBriefsTable);
      const rows = await (query.scopeType ? base.where(eq(dailyBriefsTable.scopeType, query.scopeType)) : base).orderBy(desc(dailyBriefsTable.generatedAt)).limit(query.limit);
      return rows.map(rowToStored);
    },
  };
}

export interface BuildAndStoreDeps extends DailyBriefDeps {
  /** Persistence for the assembled brief. Defaults to the DB store when DATABASE_URL is set; omit in tests. */
  store?: DailyBriefStore;
}

/**
 * Build the founder brief from the REAL wired providers (default) and PERSIST it durably. This is the
 * cadence trigger's unit of work: the scheduler calls it daily; the founder surface reads the latest row.
 * Providers default to the live-store providers unless the caller injects their own (tests/proofs).
 */
export async function buildAndStoreDailyBrief(scope: BriefScope, deps: BuildAndStoreDeps = {}): Promise<FounderBrief> {
  const providers = deps.providers ?? defaultBriefProviders();
  const brief = await buildDailyFounderBrief(scope, { ...deps, providers });
  const store = deps.store ?? (process.env.DATABASE_URL ? createDbDailyBriefStore() : undefined);
  if (store) await store.insertBrief(brief);
  return brief;
}

/** Read the latest persisted brief for a scope (the founder surface's default read). */
export async function getLatestDailyBrief(scope: BriefScope, deps: { store?: DailyBriefStore } = {}): Promise<StoredDailyBrief | null> {
  const store = deps.store ?? createDbDailyBriefStore();
  return store.getLatestForScope(scope.type, scope.id ?? null);
}
