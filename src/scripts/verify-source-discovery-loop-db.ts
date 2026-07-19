/**
 * Real-DB proof for the SOURCE DISCOVERY LOOP (the founder's "suggest new sources to approve" + stale-source
 * surfacing). Distinct from verify-source-discovery-db.ts (which proves the proposeResearchSource primitive):
 * this proves the AUTONOMOUS producers wired into the scheduler —
 *   1) discoverAndProposeSources reads recent observations + the tracked set, and files a NEW source as a
 *      PENDING, evidence-cited proposal, while DEDUPING one already tracked (never a duplicate / never active);
 *   2) flagStaleSources raises exactly one deduped founder escalation for an approved source overdue on cadence.
 * The scout LLM is a canned provider so the loop is proven without paid credit. ISOLATED (unique client scope)
 * + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-source-discovery-loop-db.ts
 */
import { discoverAndProposeSources, flagStaleSources, type SourceDiscoveryProvider } from "@/lib/source-discovery";
import { recordIntelligenceItem, createResearchTarget, listResearchTargets, reviewResearchTarget } from "@/lib/intelligence";
import { listEscalations } from "@/lib/departments/escalation";
import { getDb } from "@/db";
import { newId } from "@/lib/ids";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const db = getDb();
  const scope = "client" as const;
  const clientId = newId("cli"); // isolate this proof's data

  try {
    // Two observations that reference a rival not yet tracked.
    await recordIntelligenceItem({ itemType: "competitor_post", scope, clientId, title: "Rival X launched pricing", summary: "Competitor rival-x.com pushed a new pricing page", approvalStatus: "approved", observedAt: new Date() } as never);
    await recordIntelligenceItem({ itemType: "market_trend", scope, clientId, title: "rival-x.com ships weekly", summary: "rival-x.com weekly updates", approvalStatus: "approved", observedAt: new Date() } as never);

    // Already track one source so the scout's duplicate proposal is deduped.
    await createResearchTarget({ targetType: "website", name: "Tracked", handleOrUrl: "https://tracked.com", scope, clientId, cadence: "weekly", addedBy: "test" } as never);

    // Canned scout: one NEW source (rival-x.com) citing both observations, one already-tracked duplicate.
    const canned: SourceDiscoveryProvider = async () => ({
      text: JSON.stringify([
        { name: "Rival X", handleOrUrl: "https://rival-x.com", targetType: "website", reason: "named across 2 observations", evidenceIdx: [0, 1], expectedValue: "pricing moves", confidence: 0.7 },
        { name: "Tracked", handleOrUrl: "https://tracked.com", targetType: "website", reason: "dup", evidenceIdx: [0], expectedValue: "x", confidence: 0.5 },
      ]),
    });

    const r = await discoverAndProposeSources({ scope, clientId, observationLimit: 50 }, { runProvider: canned });
    assert(r.proposed.length === 1, `exactly one NEW source proposed (got ${r.proposed.length})`);
    assert(r.skipped === 1, `the already-tracked duplicate is skipped (got skipped=${r.skipped})`);
    assert(r.proposed[0].approvalStatus === "pending", "a proposed source lands PENDING (a proposal, never auto-active)");
    const proposalMeta = (r.proposed[0].metadata as { proposal?: { evidence?: unknown[] } }).proposal;
    assert(Array.isArray(proposalMeta?.evidence) && proposalMeta!.evidence!.length >= 1, "the proposal cites ≥1 real observation as evidence");

    const pending = (await listResearchTargets({ approvalStatus: "pending", limit: 200 })).filter((t) => t.clientId === clientId);
    assert(pending.some((t) => t.name === "Rival X"), "the new source is visible in the founder's PENDING approval list");

    // Founder APPROVES the suggested source → it becomes approved (enters the scheduler's scout set).
    const review = await reviewResearchTarget(r.proposed[0].id, { decision: "approved", reviewedBy: "Moiz" });
    assert(review.ok && review.target?.approvalStatus === "approved", "founder review approves the suggested source");
    const scoutSet = (await listResearchTargets({ approvalStatus: "approved", limit: 200 })).filter((t) => t.clientId === clientId);
    assert(scoutSet.some((t) => t.id === r.proposed[0].id), "after approval the source enters the scout set (now scouted on its cadence)");

    // STALE: an approved source overdue on its daily cadence must raise exactly one deduped escalation.
    const staleId = newId("rt");
    await db.execute(`insert into research_targets (id, target_type, name, handle_or_url, scope, client_id, cadence, approval_status, trust_level, last_checked_at, next_run_at, created_at, updated_at) values ('${staleId}','website','Stale Src','https://stale.com','client','${clientId}','daily','approved','tier_4_experimental', now() - interval '30 days', now() - interval '20 days', now(), now())`);
    const first = await flagStaleSources({});
    const second = await flagStaleSources({}); // idempotent — a second sweep must NOT raise a duplicate
    const esc = (await listEscalations({ reason: "stale_intelligence" })).filter((e) => e.workflowId === staleId);
    assert(first.flagged >= 1, `the stale source is flagged (got ${first.flagged})`);
    assert(esc.length === 1, `exactly one OPEN escalation for the stale source, deduped across sweeps (got ${esc.length}, second sweep flagged ${second.flagged})`);

    console.log("✅ source-discovery loop DB proof passed");
  } finally {
    await db.execute(`delete from escalations where workflow_id in (select id from research_targets where client_id='${clientId}')`).catch(() => {});
    await db.execute(`delete from research_targets where client_id='${clientId}'`).catch(() => {});
    await db.execute(`delete from intelligence_items where client_id='${clientId}'`).catch(() => {});
  }
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
