import { describe, expect, it } from "vitest";
import type { DepartmentRow } from "@/lib/domain/department";
import type { DepartmentMemberRow } from "@/lib/domain/department-membership";
import type { DepartmentRegistryStore } from "@/lib/departments/registry";
import { seedDepartments, CANONICAL_DEPARTMENTS, CANONICAL_MEMBERSHIPS } from "@/lib/departments/seed";

const now = new Date("2026-07-12T12:00:00.000Z");

function makeStore() {
  const depts = new Map<string, DepartmentRow>();
  const members = new Map<string, DepartmentMemberRow>();
  const mkey = (d: string, t: string, r: string) => `${d}::${t}::${r}`;
  const store: DepartmentRegistryStore = {
    insertDepartment: async (row) => { depts.set(row.slug, row); },
    getDepartmentBySlug: async (slug) => depts.get(slug) ?? null,
    listDepartments: async (q) => [...depts.values()].filter((d) => (q.status ? d.status === q.status : true)),
    updateDepartment: async (slug, fields) => { const d = depts.get(slug); if (d) depts.set(slug, { ...d, ...fields } as DepartmentRow); },
    insertMember: async (row) => { members.set(mkey(row.departmentSlug, row.memberType, row.memberRef), row); },
    getMember: async (d, t, r) => members.get(mkey(d, t, r)) ?? null,
    listMembers: async (d) => [...members.values()].filter((m) => m.departmentSlug === d).sort((a, b) => a.priority - b.priority),
    listMembershipsForRef: async (r) => [...members.values()].filter((m) => m.memberRef === r),
    updateMember: async (id, fields) => { for (const [k, m] of members) if (m.id === id) members.set(k, { ...m, ...fields } as DepartmentMemberRow); },
  };
  return { store, depts, members };
}

const deps = (store: DepartmentRegistryStore) => ({ store, recordAudit: async () => {}, now });

describe("seedDepartments", () => {
  it("seeds the full canonical org and its operational memberships", async () => {
    const { store, depts, members } = makeStore();
    const res = await seedDepartments(deps(store));
    expect(res.departments).toBe(CANONICAL_DEPARTMENTS.length);
    expect(res.memberships).toBe(CANONICAL_MEMBERSHIPS.length);
    expect(depts.size).toBe(CANONICAL_DEPARTMENTS.length);
    expect(members.size).toBe(CANONICAL_MEMBERSHIPS.length);

    // Paid audit + content + proposal are the operational departments (real teams + orchestrators).
    expect(depts.get("paid_audit")?.status).toBe("active");
    expect(depts.get("paid_audit")?.orchestratorAgentSlug).toBe("paid_audit_orchestrator");
    expect(depts.get("content")?.status).toBe("active");
    expect(depts.get("proposal")?.status).toBe("active");
    expect(depts.get("proposal")?.orchestratorAgentSlug).toBe("proposal_orchestrator");
    expect(depts.get("research_intelligence")?.status).toBe("active");
    expect(depts.get("research_intelligence")?.orchestratorAgentSlug).toBe("research_intelligence_orchestrator");

    // Declared-but-not-yet-built departments are HONESTLY draft, not shallow-active.
    expect(depts.get("delivery")?.status).toBe("draft");
    expect(depts.get("sales_crm")?.status).toBe("draft");

    // Downstream routing is declared (paid_audit → proposal).
    expect(depts.get("paid_audit")?.io.downstreamConsumers).toContain("proposal");
  });

  it("is idempotent: re-seeding does not duplicate and does not churn versions", async () => {
    const { store, depts, members } = makeStore();
    await seedDepartments(deps(store));
    const versionsBefore = [...depts.values()].map((d) => d.version);
    await seedDepartments(deps(store)); // second run
    expect(depts.size).toBe(CANONICAL_DEPARTMENTS.length); // no duplicates
    expect(members.size).toBe(CANONICAL_MEMBERSHIPS.length);
    expect([...depts.values()].map((d) => d.version)).toEqual(versionsBefore); // no version bump (no change)
  });

  it("every declared downstream consumer is itself a declared department (no dangling routes)", async () => {
    const slugs = new Set(CANONICAL_DEPARTMENTS.map((d) => d.slug));
    for (const d of CANONICAL_DEPARTMENTS) {
      for (const consumer of d.io?.downstreamConsumers ?? []) {
        expect(slugs.has(consumer)).toBe(true);
      }
    }
  });

  it("every canonical membership points at a declared department", async () => {
    const slugs = new Set(CANONICAL_DEPARTMENTS.map((d) => d.slug));
    for (const m of CANONICAL_MEMBERSHIPS) expect(slugs.has(m.departmentSlug)).toBe(true);
  });
});
