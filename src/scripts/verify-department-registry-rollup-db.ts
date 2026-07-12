/**
 * Real-DB proof that the department roll-up + detail are now REGISTRY-driven (Phase 3, Batch 3c): the
 * seeded departments (identity, truthful status/health, products) and their teams come from the
 * departments + department_members tables — NOT a free-text `team` label — overlaid with live handoff
 * activity. Assumes the canonical org has been seeded (verify-department-seed-db.ts / db:seed).
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-department-registry-rollup-db.ts
 */
import { getDb, closeDb } from "@/db";
import { seedDepartments } from "@/lib/departments/seed";
import { getDepartmentRollups, getDepartmentDetail } from "@/lib/departments";
import { defaultStore as registryStore } from "@/lib/departments/registry";

async function main() {
  const db = getDb();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };

  // Ensure the org exists (idempotent).
  await seedDepartments({ store: registryStore(db), recordAudit: async () => {} });

  // 1. Roll-up is registry-driven: paid_audit appears with its identity + status + member count, even
  //    though its members come from department_members (not agents.team).
  const rollups = await getDepartmentRollups();
  const pa = rollups.find((d) => d.department === "paid_audit");
  assert(!!pa, "paid_audit appears in the roll-up (from the registry)");
  assert(pa!.name === "Paid Audit" && pa!.status === "active", "roll-up carries registry identity + truthful status");
  assert(pa!.members.total === 6, `roll-up member count comes from department_members (6) — got ${pa!.members.total}`);

  // Declared-but-draft departments also appear (registry-sourced), with zero activity.
  const proposal = rollups.find((d) => d.department === "proposal");
  assert(!!proposal && proposal.status === "draft", "a declared draft department appears in the roll-up");

  // 2. Detail is registry-driven: the team + products come from the registry, not a label.
  const detail = await getDepartmentDetail("paid_audit");
  assert(detail.registry?.name === "Paid Audit", "detail carries the registry record");
  assert(detail.registry?.downstreamConsumers.includes("proposal") ?? false, "detail shows downstream routing (paid_audit → proposal)");
  assert(detail.members.length === 6, `detail lists the full team from memberships — got ${detail.members.length}`);
  assert(detail.members.some((m) => m.memberType === "service"), "the deterministic service member is listed");
  assert(detail.members[0].role.length > 0 && detail.members[0].responsibility.length > 0, "each member carries role + responsibility (membership facts)");

  console.log("\nALL REAL-DB REGISTRY-DRIVEN ROLL-UP CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
