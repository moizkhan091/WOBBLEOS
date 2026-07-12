// Daily Founder Brief — service (Doctrine 8).
//
// Orchestrates the injectable signal providers into a scoped, evidence-linked, progressive brief. This
// service owns NO data of its own: the lead wires each provider to a real WOBBLE store (escalations,
// department KPIs, intelligence, CRM, finance, handoff-delivery, connections health, approvals). A
// provider that throws degrades that ONE category (recorded honestly) rather than failing the brief; a
// signal that arrives without evidence is omitted-and-counted, never invented.
import {
  assembleFounderBrief,
  briefSignalDraftSchema,
  buildBriefSignal,
  SIGNAL_CATEGORIES,
  type BriefScope,
  type BriefSignal,
  type BriefSignalDraft,
  type FounderBrief,
  type SignalCategory,
} from "@/lib/domain/daily-brief";

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
