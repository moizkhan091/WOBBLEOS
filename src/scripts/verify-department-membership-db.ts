/**
 * Real-DB proof for department membership (Phase 3, Batch 2): memberships round-trip through live
 * Postgres, one membership per (department, type, ref) is enforced, an agent can join >1 department via
 * separate explicit memberships, and effective grants (intersection with the department policy) hold.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-department-membership-db.ts
 */
import { getDb, closeDb } from "@/db";
import { departments, departmentMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { buildDepartmentRow, type DepartmentPermissions } from "@/lib/domain/department";
import { buildDepartmentMemberRow, effectiveMemberTools, type DepartmentMemberRow } from "@/lib/domain/department-membership";

async function main() {
  const db = getDb();
  const now = new Date();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const ts = Date.now();
  const deptA = `verify_deptm_a_${ts}`;
  const deptB = `verify_deptm_b_${ts}`;
  const agent = `verify_agent_${ts}`;

  // Seed two departments; deptA allows run_node + denies apply_model_upgrade.
  const perms: DepartmentPermissions = { allowedTools: ["run_node", "retrieve_memory"], deniedTools: ["apply_model_upgrade"], authorizedMemoryScopes: ["company"], permittedDataClassifications: ["internal"] };
  for (const slug of [deptA, deptB]) {
    const d = buildDepartmentRow({ slug, name: slug, purpose: "verify", status: "active", permissions: slug === deptA ? perms : undefined }, { now });
    await db.insert(departments).values({ ...d, permissions: d.permissions as unknown as Record<string, unknown>, io: d.io as unknown as Record<string, unknown>, events: d.events as unknown as Record<string, unknown>, governance: d.governance as unknown as Record<string, unknown>, kpis: d.kpis as unknown as Record<string, unknown>[], budget: d.budget as unknown as Record<string, unknown>, limits: d.limits as unknown as Record<string, unknown> });
  }

  // Same agent joins BOTH departments via separate explicit memberships with different grants.
  const mA = buildDepartmentMemberRow({ departmentSlug: deptA, memberType: "agent", memberRef: agent, role: "discovery", responsibility: "map", priority: 10, capabilities: ["discovery"], toolGrants: ["run_node", "apply_model_upgrade"], memoryGrants: ["company"], allowedInputSchemas: ["current_state_map"], approvalAuthority: ["content_packet"] }, { now });
  const mB = buildDepartmentMemberRow({ departmentSlug: deptB, memberType: "agent", memberRef: agent, role: "advisor", responsibility: "advise", priority: 50 }, { now });
  const ins = (m: DepartmentMemberRow) => db.insert(departmentMembers).values({ ...m, capabilities: m.capabilities, toolGrants: m.toolGrants, memoryGrants: m.memoryGrants, allowedInputSchemas: m.allowedInputSchemas, expectedOutputs: m.expectedOutputs, approvalAuthority: m.approvalAuthority, budgetLimits: m.budgetLimits as unknown as Record<string, unknown> });
  await ins(mA);
  await ins(mB);

  const backA = (await db.select().from(departmentMembers).where(and(eq(departmentMembers.departmentSlug, deptA), eq(departmentMembers.memberRef, agent))))[0] as unknown as DepartmentMemberRow;
  assert(!!backA, "membership persisted and read back");
  assert(JSON.stringify(backA.toolGrants) === JSON.stringify(["run_node", "apply_model_upgrade"]), "tool grants jsonb round-trips");
  assert(backA.approvalAuthority[0] === "content_packet", "approval authority round-trips");

  const inBoth = await db.select().from(departmentMembers).where(eq(departmentMembers.memberRef, agent));
  assert(inBoth.length === 2, "the agent belongs to BOTH departments (2 explicit memberships)");

  // Effective tools against deptA's persisted policy: apply_model_upgrade is denied by the dept → dropped.
  const eff = effectiveMemberTools(perms, backA);
  assert(JSON.stringify(eff) === JSON.stringify(["run_node"]), "effective tools = dept-allowed ∩ grant (denied tool dropped)");

  // Unique (department, type, ref) holds.
  let dup = false;
  try { await ins({ ...mA, id: `${mA.id}_2` }); } catch { dup = true; }
  assert(dup, "duplicate membership for the same (department, type, ref) is rejected");

  // Cleanup.
  await db.delete(departmentMembers).where(eq(departmentMembers.memberRef, agent));
  await db.delete(departments).where(eq(departments.slug, deptA));
  await db.delete(departments).where(eq(departments.slug, deptB));

  console.log("\nALL REAL-DB DEPARTMENT-MEMBERSHIP CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
