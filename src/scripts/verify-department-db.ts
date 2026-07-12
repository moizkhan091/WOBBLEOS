/**
 * Real-DB proof for the department domain model (Phase 3, Batch 1): a full versioned department record —
 * permissions, io, events, governance, kpis, budget, limits (all jsonb) — round-trips through live
 * Postgres without loss, and the unique-slug constraint holds.
 *
 * Run:  DATABASE_URL=... npx tsx src/scripts/verify-department-db.ts
 */
import { getDb, closeDb } from "@/db";
import { departments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildDepartmentRow, departmentCanAccept } from "@/lib/domain/department";

async function main() {
  const db = getDb();
  const now = new Date();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const slug = `verify_dept_${Date.now()}`;

  const row = buildDepartmentRow(
    {
      slug,
      name: "Verify Paid Audit",
      purpose: "Deliver McKinsey-depth AI audits.",
      status: "active",
      orchestratorAgentSlug: "paid_audit_orchestrator",
      deterministicServices: ["assemblePaidAuditReport"],
      permissions: { authorizedMemoryScopes: ["company", "research", "offer", "brand"], permittedDataClassifications: ["internal", "client_confidential"], allowedTools: [], deniedTools: ["apply_model_upgrade"] },
      io: { inboundCapabilities: ["run_paid_audit"], acceptedHandoffSchemas: ["current_state_map"], outboundProducts: ["business_audit", "architecture", "roadmap"], downstreamConsumers: ["proposal"] },
      events: { subscribedEvents: ["audit.paid_requested"], scheduledResponsibilities: [] },
      governance: { requiredApprovals: [], escalationRules: [{ condition: "node_failure", escalateTo: "founder" }] },
      kpis: [{ key: "audit_completion_rate", target: 0.95, unit: "ratio" }],
      budget: { operatingBudgetCents: 200000, tokenBudget: 2_000_000, providerBudgets: { openrouter: 1_000_000 } },
      limits: { concurrencyLimit: 2, timeoutMs: 900000, retryPolicy: { maxRetries: 2, backoffMs: 3000 } },
      degradedBehaviour: "queue only; alert founder; no new client audits",
      owner: "Moiz",
    },
    { now },
  );

  await db.insert(departments).values({ ...row, permissions: row.permissions as unknown as Record<string, unknown>, io: row.io as unknown as Record<string, unknown>, events: row.events as unknown as Record<string, unknown>, governance: row.governance as unknown as Record<string, unknown>, kpis: row.kpis as unknown as Record<string, unknown>[], budget: row.budget as unknown as Record<string, unknown>, limits: row.limits as unknown as Record<string, unknown> });

  const back = (await db.select().from(departments).where(eq(departments.slug, slug)))[0] as unknown as typeof row;
  assert(!!back, "department persisted and read back");
  assert(back.status === "active" && back.version === 1, "scalars round-trip (status, version)");
  assert(back.orchestratorAgentSlug === "paid_audit_orchestrator", "orchestrator round-trips");
  assert(JSON.stringify(back.permissions.authorizedMemoryScopes) === JSON.stringify(["company", "research", "offer", "brand"]), "permissions jsonb round-trips");
  assert(back.io.downstreamConsumers[0] === "proposal", "io.downstreamConsumers round-trips");
  assert(back.governance.escalationRules[0].escalateTo === "founder", "governance escalation rule round-trips");
  assert(back.kpis[0].key === "audit_completion_rate", "kpis round-trip");
  assert(back.budget.operatingBudgetCents === 200000 && back.limits.retryPolicy.maxRetries === 2, "budget + limits round-trip");

  // The domain authorization gate works against the persisted record.
  const accept = departmentCanAccept(back, { expectedOutputSchema: "current_state_map", dataClassification: "client_confidential", authorizedMemoryScopes: ["company"] });
  assert(accept.ok, "departmentCanAccept authorizes a valid handoff against the persisted record");
  const reject = departmentCanAccept(back, { expectedOutputSchema: "current_state_map", authorizedMemoryScopes: ["secret_scope"] });
  assert(!reject.ok, "departmentCanAccept rejects an over-scoped handoff");

  // Unique slug holds.
  let dup = false;
  try { await db.insert(departments).values({ ...row, id: `${row.id}_2` } as never); } catch { dup = true; }
  assert(dup, "duplicate slug is rejected by the unique index");

  await db.delete(departments).where(eq(departments.slug, slug));
  console.log("\nALL REAL-DB DEPARTMENT-MODEL CHECKS PASSED ✅");
}

main().then(closeDb).then(() => process.exit(0)).catch(async (e) => { console.error(e instanceof Error ? e.message : e); await closeDb(); process.exit(1); });
