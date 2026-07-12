/**
 * Real-DB proof for the canonical department seed (Phase 3, Batch 3b): seedDepartments establishes the
 * real org (departments + operational memberships) in live Postgres, idempotently, with truthful status.
 * This leaves the canonical org IN the dev DB (that is the intended state).
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-department-seed-db.ts
 */
import { getDb, closeDb } from "@/db";
import { seedDepartments, CANONICAL_DEPARTMENTS, CANONICAL_MEMBERSHIPS } from "@/lib/departments/seed";
import { getDepartment, listMembers, defaultStore } from "@/lib/departments/registry";

async function main() {
  const db = getDb();
  const store = defaultStore(db);
  const deps = { store, recordAudit: async () => {} };
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };

  // 1. Seed the org.
  const res = await seedDepartments(deps);
  assert(res.departments === CANONICAL_DEPARTMENTS.length, `seeded ${res.departments} departments`);
  assert(res.memberships === CANONICAL_MEMBERSHIPS.length, `seeded ${res.memberships} memberships`);

  // 2. Operational departments are active with real orchestrators + full teams.
  const pa = await getDepartment("paid_audit", deps);
  assert(pa?.status === "active" && pa?.orchestratorAgentSlug === "paid_audit_orchestrator", "paid_audit is active with its orchestrator");
  const paMembers = await listMembers("paid_audit", deps);
  assert(paMembers.length === 6, `paid_audit has its full team (5 specialists + 1 service) — got ${paMembers.length}`);
  assert(paMembers.some((m) => m.memberType === "service" && m.memberRef === "assemblePaidAuditReport"), "the deterministic assembler service is a member");

  const content = await getDepartment("content", deps);
  assert(content?.status === "active", "content is active");
  assert((await listMembers("content", deps)).length === 4, "content has its 4-agent team");

  // 3. Declared-but-unbuilt departments are HONESTLY draft.
  assert((await getDepartment("proposal", deps))?.status === "draft", "proposal is draft (not shallow-active)");
  assert((await getDepartment("delivery", deps))?.status === "draft", "delivery is draft");

  // 4. Downstream routing is declared and points at real departments.
  assert(pa!.io.downstreamConsumers.includes("proposal"), "paid_audit routes downstream to proposal");

  // 5. Idempotent re-seed: no version churn, no duplicate members.
  const versionBefore = pa!.version;
  await seedDepartments(deps);
  const paAfter = await getDepartment("paid_audit", deps);
  assert(paAfter!.version === versionBefore, `re-seed did not bump paid_audit version (stayed ${versionBefore})`);
  assert((await listMembers("paid_audit", deps)).length === 6, "re-seed did not duplicate memberships");

  console.log("\nALL REAL-DB DEPARTMENT-SEED CHECKS PASSED ✅ (canonical org left in the dev DB)");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
