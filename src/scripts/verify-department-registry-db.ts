/**
 * Real-DB proof for the Department Registry service (Phase 3, Batch 3): the DB-backed store performs
 * create / get / list / upsert (idempotent + version bump) for departments and add / upsert / list for
 * memberships against live Postgres.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-department-registry-db.ts
 */
import { getDb, closeDb } from "@/db";
import { departments, departmentMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createDepartment, getDepartment, listDepartments, upsertDepartment, addMember, upsertMember, listMembers, defaultStore } from "@/lib/departments/registry";

async function main() {
  const db = getDb();
  const now = new Date();
  const store = defaultStore(db);
  const deps = { store, recordAudit: async () => {}, now };
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const slug = `verify_reg_${Date.now()}`;

  // create + get
  const created = await createDepartment({ slug, name: "Verify Dept", purpose: "verify", status: "active", io: { outboundProducts: ["p1"], inboundCapabilities: [], acceptedHandoffSchemas: [], downstreamConsumers: [] } }, deps);
  assert(created.slug === slug, "createDepartment persisted");
  const got = await getDepartment(slug, deps);
  assert(got?.io.outboundProducts[0] === "p1", "getDepartment reads back jsonb policy");
  assert((await listDepartments({ status: "active" }, deps)).some((d) => d.slug === slug), "listDepartments filters by status");

  // upsert idempotent + version bump
  const u1 = await upsertDepartment({ slug, name: "Verify Dept", purpose: "verify", status: "active", io: { outboundProducts: ["p1"], inboundCapabilities: [], acceptedHandoffSchemas: [], downstreamConsumers: [] } }, deps);
  assert(u1.version === 1, "upsert with no change keeps version 1");
  const u2 = await upsertDepartment({ slug, name: "Verify Dept v2", purpose: "verify more", status: "active" }, deps);
  assert(u2.version === 2, "upsert with a change bumps version to 2");
  assert((await getDepartment(slug, deps))?.name === "Verify Dept v2", "the update landed in the DB");

  // memberships
  await addMember({ departmentSlug: slug, memberType: "agent", memberRef: "verify_specialist", role: "specialist", responsibility: "do work", priority: 10, toolGrants: ["run_node"] }, deps);
  await upsertMember({ departmentSlug: slug, memberType: "agent", memberRef: "verify_specialist", role: "specialist", responsibility: "do BETTER work", priority: 10 }, deps); // update in place
  const members = await listMembers(slug, deps);
  assert(members.length === 1, "upsertMember did not duplicate the (dept, ref) membership");
  assert(members[0].responsibility === "do BETTER work", "membership updated in place");

  // Cleanup.
  await db.delete(departmentMembers).where(eq(departmentMembers.departmentSlug, slug));
  await db.delete(departments).where(eq(departments.slug, slug));

  console.log("\nALL REAL-DB DEPARTMENT-REGISTRY CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
