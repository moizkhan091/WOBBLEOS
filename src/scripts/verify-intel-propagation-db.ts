/**
 * Real-DB proof of APPROVED-ONLY intelligence propagation + tenant isolation (Phase 5, mandate F) on Postgres.
 *
 * Approved intelligence reaches downstream generators via `buildApprovedIntelligenceContext`; unapproved
 * intelligence must NOT influence protected workflows, and one client's intelligence must never leak into
 * another's context. Proven:
 *   - a client's APPROVED insights propagate into its context;
 *   - that client's PENDING insight does NOT propagate (unapproved cannot influence);
 *   - a DIFFERENT client's approved insight does NOT leak into this client's context (tenant isolation);
 *   - a global/org-wide approved insight DOES reach the client (brand rules reach every generator).
 *
 * ISOLATED by unique client ids + finally-cleanup. Run twice cleanly.
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-intel-propagation-db.ts
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { intelligenceInsights } from "@/db/schema";
import { createIntelligenceInsight, buildApprovedIntelligenceContext, defaultStore as intelligenceStore } from "@/lib/intelligence";
import type { IntelligenceApprovalStatus } from "@/lib/domain/intelligence";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const clientA = `verify_prop_a_${uniq}`;
  const clientB = `verify_prop_b_${uniq}`;
  const intel = { store: intelligenceStore(db), recordAudit: async () => {} };
  const ids: string[] = [];

  const mkInsight = async (title: string, scope: "client" | "global", clientId: string | undefined, approvalStatus: IntelligenceApprovalStatus): Promise<string> => {
    const { insight } = await createIntelligenceInsight({ insightType: "content_pattern", scope, clientId, title, summary: `${title} summary`, recommendation: "do it", evidenceItemIds: [], appliesToModules: ["content_command"], impactScore: 60, confidence: 0.7, approvalStatus, createdByAgent: "intelligence_analyst" }, intel);
    ids.push(insight.id);
    return insight.id;
  };

  try {
    const aApproved1 = await mkInsight("A approved one", "client", clientA, "approved");
    const aApproved2 = await mkInsight("A approved two", "client", clientA, "approved");
    const aPending = await mkInsight("A pending (should not propagate)", "client", clientA, "pending");
    const bApproved = await mkInsight("B approved (should not leak to A)", "client", clientB, "approved");
    const globalApproved = await mkInsight("Global approved (brand rule)", "global", undefined, "approved");

    const ctx = await buildApprovedIntelligenceContext({ task: "social_content", scope: "client", clientId: clientA, limit: 100 }, intel);
    const gotIds = new Set(ctx.insights.map((i) => i.id));

    assert(gotIds.has(aApproved1) && gotIds.has(aApproved2), "client A's APPROVED insights propagate into its context");
    assert(!gotIds.has(aPending), "client A's PENDING insight does NOT propagate (unapproved cannot influence a protected workflow)");
    assert(!gotIds.has(bApproved), "client B's approved insight does NOT leak into client A's context (tenant isolation)");
    assert(gotIds.has(globalApproved), "a global/org-wide approved insight DOES reach the client (brand rules reach every generator)");
    assert(ctx.insights.every((i) => i.approvalStatus === "approved"), "every propagated insight is approved (no unapproved intelligence in the context)");

    // The reverse scope: client B's context must not contain any of client A's insights either.
    const ctxB = await buildApprovedIntelligenceContext({ task: "social_content", scope: "client", clientId: clientB, limit: 100 }, intel);
    const gotB = new Set(ctxB.insights.map((i) => i.id));
    assert(gotB.has(bApproved) && !gotB.has(aApproved1) && !gotB.has(aApproved2), "client B sees ONLY its own approved insight (+ global), never client A's");

    console.log("\nALL REAL-DB INTELLIGENCE PROPAGATION CHECKS PASSED ✅");
  } finally {
    if (ids.length) await db.delete(intelligenceInsights).where(inArray(intelligenceInsights.id, ids)).catch(() => {});
    await db.delete(intelligenceInsights).where(eq(intelligenceInsights.clientId, clientA)).catch(() => {});
    await db.delete(intelligenceInsights).where(eq(intelligenceInsights.clientId, clientB)).catch(() => {});
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
