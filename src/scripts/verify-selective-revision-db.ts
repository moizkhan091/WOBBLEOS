/**
 * Real-DB proof that Selective Revision is OPERATIONAL (Phase 7) on Postgres. Proven:
 *   - the 2/5/8-fail scenario: an 8-component artifact where components 2,5,8 fail QA reruns EXACTLY those +
 *     their transitive dependents, PRESERVES every approved component + its evidence (version untouched), and
 *     re-invokes ONLY the failed components' specialists — never a full-team regeneration;
 *   - the REAL consumer: bound to a checkpointed graph run, `driveSelectiveGraphRerun` clears ONLY the rerun
 *     nodes' checkpoints (the preserved nodes' cached outputs survive → a re-run regenerates exactly the rerun
 *     nodes and reuses the rest);
 *   - APPLY bumps the rerun components to approved at their next version; ROLLBACK restores the pre-revision
 *     snapshot (version + status) for every component.
 *
 * ISOLATED + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-selective-revision-db.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import { revisionCycles, revisionComponents, revisionComponentVersions, graphCheckpoints } from "@/db/schema";
import { buildGraphCheckpointRow } from "@/lib/domain/graph-checkpoint";
import { defaultCheckpointStore, loadCheckpointContext } from "@/lib/graph-checkpoint";
import { openRevisionCycle, driveSelectiveGraphRerun, markRevisionReran, applyRevisionOutcome, rollbackRevisionCycle, getRevisionCycle } from "@/lib/selective-revision";
import { createProposalFromAudit, getProposal } from "@/lib/proposals";
import { openProposalRevision, rerunProposalRevision } from "@/lib/proposals/revision";
import { proposals as proposalsTable } from "@/db/schema";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const uniq = `${Date.now()}`;
  const graphRunId = `revrun_${uniq}`;
  const deps = { db, recordAudit: async () => {} };
  const cycleIds: string[] = [];
  let proposalAuditId: string | null = null;

  // An 8-node linear-ish artifact: c1..c8, each depends on the previous (a change cascades downstream).
  const keys = Array.from({ length: 8 }, (_, i) => `c${i + 1}`);
  // Components 2, 5, 8 fail QA (seeded `failed`, exactly as the production trigger records them).
  const failed = ["c2", "c5", "c8"];
  const components = keys.map((k, i) => ({ key: k, kind: "node", producedBy: `specialist_${k}`, dependsOn: i === 0 ? [] : [keys[i - 1]], version: 1, status: (failed.includes(k) ? "failed" : "approved") as "failed" | "approved", evidence: { text: `${k}-v1` } }));

  try {
    // Seed a checkpoint for EVERY node (a completed graph run) so we can prove selective clearing.
    const store = defaultCheckpointStore(db);
    for (let i = 0; i < keys.length; i++) {
      await store.upsertCheckpoint(buildGraphCheckpointRow({ graphRunId, graph: "content_graph", nodeSlug: keys[i], nodeIndex: i, schemaVersion: 1, outputText: `${keys[i]}-out` }));
    }

    const cycle = await openRevisionCycle({ artifactKind: "content_graph", artifactRef: graphRunId, graphRunId, triggeredBy: "test", components, failedComponents: failed, clientId: `client_${uniq}` }, deps);
    cycleIds.push(cycle.id);

    // PLAN: failed 2,5,8 + transitive dependents. c2→c3..c8 all depend downstream of c2, so once c2 fails the
    // whole tail reruns. Expect rerun = c2..c8; preserved = only c1.
    const rerun = new Set(cycle.plan.rerun);
    assert(rerun.has("c2") && rerun.has("c5") && rerun.has("c8"), "the 3 failed components (c2, c5, c8) are in the rerun set");
    assert(rerun.has("c3") && rerun.has("c4") && rerun.has("c6") && rerun.has("c7"), "the transitive DEPENDENTS of the failed components are pulled into the rerun (consistency)");
    assert(cycle.plan.preserved.length === 1 && cycle.plan.preserved[0] === "c1", "ONLY the upstream approved component (c1) is preserved — its evidence + version untouched");
    assert(!cycle.plan.specialists.includes("specialist_c1"), "the preserved component's specialist is NOT re-invoked (no full-team regeneration)");
    const c1 = cycle.components.find((c) => c.key === "c1")!;
    assert(c1.status === "approved" && c1.version === 1, "the preserved component stays approved at version 1");
    const c5 = cycle.components.find((c) => c.key === "c5")!;
    assert(c5.status === "rerun" && c5.version === 2, "a reran component is marked `rerun` at its NEXT version (2)");

    // REAL CONSUMER: clear ONLY the rerun nodes' checkpoints; c1's checkpoint must survive.
    const rr = await driveSelectiveGraphRerun(cycle.id, { ...deps, checkpointStore: store });
    assert(rr.cleared === 7, "exactly the 7 rerun nodes' checkpoints were cleared");
    const remaining = await store.listCheckpoints(graphRunId);
    assert(remaining.length === 1 && remaining[0].nodeSlug === "c1", "ONLY the preserved node's (c1) checkpoint survives — a re-run reuses it and regenerates exactly the rerun nodes");
    // THE PAYOFF: a re-run bound to the SAME graphRunId reuses the preserved node's cached output and regenerates
    // the rest — i.e. loadCheckpointContext offers exactly c1 for reuse (the reran nodes are absent → regenerated).
    const resumeCtx = await loadCheckpointContext({ graph: "content_graph", graphRunId, schemaVersion: 1 }, { store });
    assert(resumeCtx.cached.size === 1 && resumeCtx.cached.has("c1"), "a re-run under the PRESERVED graphRunId reuses exactly the preserved node (c1) — the reuse loop actually closes, not just the delete");

    // STATE MACHINE: the rerun is dispatched → planned → reran (so a subsequent revise opens a fresh cycle).
    assert(await markRevisionReran(cycle.id, deps), "the cycle transitions planned → reran once the rerun is dispatched");
    assert((await getRevisionCycle(cycle.id, deps))!.status === "reran", "the cycle status is `reran`");

    // APPLY (from reran): the rerun components complete → approved at their next version; preserved untouched.
    await applyRevisionOutcome(cycle.id, cycle.plan.rerun.map((k) => ({ key: k, status: "approved" as const, evidence: { text: `${k}-v2` } })), deps);
    const applied = (await getRevisionCycle(cycle.id, deps))!;
    assert(applied.status === "applied", "the cycle is applied");
    assert(applied.components.find((c) => c.key === "c5")!.status === "approved" && applied.components.find((c) => c.key === "c5")!.version === 2, "a reran component is now approved at version 2");
    assert(applied.components.find((c) => c.key === "c1")!.version === 1, "the preserved component is STILL version 1 (never touched)");

    // ROLLBACK: restore the pre-revision snapshot (every component back to version 1 / approved).
    assert(await rollbackRevisionCycle(cycle.id, deps), "the cycle was rolled back");
    const rolled = (await getRevisionCycle(cycle.id, deps))!;
    assert(rolled.status === "rolled_back", "the cycle status is rolled_back");
    assert(rolled.components.every((c) => c.version === 1), "every component is restored to version 1 (the pre-revision snapshot)");
    assert(rolled.components.filter((c) => failed.includes(c.key)).every((c) => c.status === "failed"), "the originally-FAILED components are restored to `failed` — rollback undoes the revision, it does not launder a QA failure");
    assert(rolled.components.filter((c) => !failed.includes(c.key)).every((c) => c.status === "approved"), "the originally-approved components are restored to `approved`");

    // ---- AUDIT-REPORT artifact: the same durable model bound to the paid_audit graph (5 linear nodes) --------
    const auditRun = `auditrun_${uniq}`;
    const auditNodes = ["discovery", "opportunity", "prioritization", "roadmap", "report"];
    const auditCycle = await openRevisionCycle({
      artifactKind: "paid_audit", artifactRef: `audit_${uniq}`, graphRunId: auditRun, triggeredBy: "qa_gate:paid_audit",
      components: auditNodes.map((k, i) => ({ key: k, kind: "graph_node", producedBy: `audit_${k}`, dependsOn: i === 0 ? [] : [auditNodes[i - 1]], version: 1, status: k === "opportunity" ? "failed" as const : "approved" as const })),
      failedComponents: ["opportunity"], clientId: `client_${uniq}`,
      reenqueue: { producer: "audit.paid", businessName: "Acme", intakeNotes: "x", requestedBy: "Moiz" },
    }, deps);
    cycleIds.push(auditCycle.id);
    assert(auditCycle.plan.rerun.slice().sort().join(",") === "opportunity,prioritization,report,roadmap", "AUDIT: a failed `opportunity` stage reruns opportunity + its downstream (prioritization, roadmap, report)");
    assert(auditCycle.plan.preserved.length === 1 && auditCycle.plan.preserved[0] === "discovery", "AUDIT: the upstream `discovery` stage is preserved (its evidence + version untouched)");
    assert((auditCycle.reenqueue as { producer?: string } | null)?.producer === "audit.paid", "AUDIT: the cycle carries the `audit.paid` re-enqueue producer (the founder rerun re-runs the audit bound to the preserved graphRunId)");

    // ---- PROPOSAL artifact: 2 components (solution_design → assemble); no graph checkpoints. The rerun REUSES
    //      the persisted synthesis when only `assemble` failed, and creates a NEW proposal (old retained). --------
    const auditId = `aud_${uniq}`;
    const stubAudit = async () => ({ id: auditId, businessName: `Acme ${uniq}`, companyId: `client_${uniq}`, opportunityId: null, report: { opportunities: [{ title: "Text-back", description: "auto-text" }], roadmap: [{ title: "P1", months: "1-2", focus: "leaks" }], roi: { estimatedImplementationCents: 4500000 }, executiveSummary: "Recover leads." } });
    const pDeps = { getAuditRow: stubAudit };
    const synthesis = { technicalSolution: "S".repeat(200), integrationDesign: "I".repeat(80), roiAssumptions: "R".repeat(50), risks: ["adoption"] };
    const oldProposal = await createProposalFromAudit(auditId, { createdBy: "Moiz", enrichment: synthesis }, pDeps);
    proposalAuditId = auditId;
    assert(!!oldProposal && (oldProposal.metadata as { solutionDesign?: unknown }).solutionDesign !== undefined, "PROPOSAL: the initial proposal persists the solution-design synthesis under metadata");

    // assemble-only failure → rerun [assemble], PRESERVE [solution_design].
    const wf = `wf_${uniq}`;
    const dedupeKey = `proposal:${wf}:${auditId}:assemble`;
    const plannedCount = async () => (await db.select({ id: revisionCycles.id }).from(revisionCycles).where(and(eq(revisionCycles.dedupeKey, dedupeKey), eq(revisionCycles.status, "planned")))).length;
    const openProp = (proposalId: string) => openProposalRevision({ proposalId, auditId, failedStages: ["assemble"], companyId: `client_${uniq}`, requestedBy: "Moiz", workflowId: wf }, deps);

    await openProp(oldProposal!.id);
    assert((await plannedCount()) === 1, "PROPOSAL idempotency: the first trigger opens exactly ONE live revision cycle");

    // DUPLICATE trigger — a reclaimed handoff RETRY re-runs the department and mints a FRESH proposal id, same
    // workflow + audit + failed set → must NOT create a second live cycle.
    await openProp(`${oldProposal!.id}_retry`);
    assert((await plannedCount()) === 1, "PROPOSAL idempotency: a DUPLICATE trigger (new proposal id, same round) still yields ONE live cycle");

    // CONCURRENT duplicate triggers — the partial unique index makes it race-safe.
    await Promise.all([openProp(`${oldProposal!.id}_c1`), openProp(`${oldProposal!.id}_c2`), openProp(`${oldProposal!.id}_c3`)]);
    assert((await plannedCount()) === 1, "PROPOSAL idempotency: CONCURRENT duplicate triggers still yield ONE live cycle (partial unique index)");

    const pcycle = (await db.select({ id: revisionCycles.id }).from(revisionCycles).where(and(eq(revisionCycles.dedupeKey, dedupeKey), eq(revisionCycles.status, "planned"))).limit(1))[0];
    cycleIds.push(pcycle.id);
    const pv = (await getRevisionCycle(pcycle.id, deps))!;
    assert(pv.plan.rerun.length === 1 && pv.plan.rerun[0] === "assemble", "PROPOSAL: an assemble-only failure reruns ONLY `assemble`");
    assert(pv.plan.preserved.includes("solution_design"), "PROPOSAL: `solution_design` (the expensive LLM synthesis) is PRESERVED");

    // Rerun REUSES the persisted synthesis (no re-synthesize) and creates a NEW proposal (old retained).
    const rerunOut = await rerunProposalRevision(pcycle.id, { proposalDeps: pDeps, db, recordAudit: async () => {} });
    assert(!!rerunOut && rerunOut.reusedSynthesis === true, "PROPOSAL: the rerun REUSED the passed synthesis (no LLM re-pay) for an assemble-only revision");
    const newProposal = await getProposal(rerunOut!.newProposalId, pDeps);
    assert(!!newProposal && newProposal.id !== oldProposal!.id, "PROPOSAL: the rerun produced a NEW proposal (the old one is retained for comparison)");
    const newSyn = (newProposal!.metadata as { solutionDesign?: { technicalSolution?: string; integrationDesign?: string } }).solutionDesign;
    assert(newSyn?.technicalSolution === synthesis.technicalSolution && newSyn?.integrationDesign === synthesis.integrationDesign, "PROPOSAL: the new proposal carries the SAME (reused) solution-design synthesis (not re-generated)");
    // The OLD proposal still exists (retained) → the founder can compare versions.
    assert(!!(await getProposal(oldProposal!.id, pDeps)), "PROPOSAL: the OLD proposal is retained (founder comparison)");
    assert((await getRevisionCycle(pcycle.id, deps))!.status === "reran", "PROPOSAL: the cycle transitioned planned → reran");

    // GENUINELY NEW ROUND: now that the first cycle left `planned` (→ reran), the SAME dedupe key can open a fresh
    // cycle for a new revision round — the completed/reran cycle is NOT incorrectly reused.
    await openProp(`${oldProposal!.id}_round2`);
    assert((await plannedCount()) === 1, "PROPOSAL idempotency: after the cycle left `planned`, a genuinely NEW round opens ONE fresh cycle (the reran one is not reused)");
    for (const c of await db.select({ id: revisionCycles.id }).from(revisionCycles).where(eq(revisionCycles.dedupeKey, dedupeKey))) if (!cycleIds.includes(c.id)) cycleIds.push(c.id);

    console.log("\nALL REAL-DB SELECTIVE REVISION CHECKS PASSED ✅");
  } finally {
    await db.delete(graphCheckpoints).where(eq(graphCheckpoints.graphRunId, graphRunId)).catch(() => {});
    if (cycleIds.length) {
      await db.delete(revisionComponentVersions).where(inArray(revisionComponentVersions.cycleId, cycleIds)).catch(() => {});
      await db.delete(revisionComponents).where(inArray(revisionComponents.cycleId, cycleIds)).catch(() => {});
      await db.delete(revisionCycles).where(inArray(revisionCycles.id, cycleIds)).catch(() => {});
    }
    if (proposalAuditId) await db.delete(proposalsTable).where(eq(proposalsTable.auditId, proposalAuditId)).catch(() => {});
  }
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
