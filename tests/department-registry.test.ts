import { describe, expect, it } from "vitest";
import type { DepartmentRow } from "@/lib/domain/department";
import type { DepartmentMemberRow } from "@/lib/domain/department-membership";
import {
  createDepartment,
  upsertDepartment,
  setDepartmentStatus,
  setDepartmentHealth,
  addMember,
  upsertMember,
  listMembers,
  listMembershipsForRef,
  type DepartmentRegistryStore,
} from "@/lib/departments/registry";

const now = new Date("2026-07-12T12:00:00.000Z");

function makeStore() {
  const depts = new Map<string, DepartmentRow>();
  const members = new Map<string, DepartmentMemberRow>();
  const mkey = (d: string, t: string, r: string) => `${d}::${t}::${r}`;
  const store: DepartmentRegistryStore = {
    insertDepartment: async (row) => {
      if (depts.has(row.slug)) throw new Error("duplicate key value violates unique constraint");
      depts.set(row.slug, row);
    },
    getDepartmentBySlug: async (slug) => depts.get(slug) ?? null,
    listDepartments: async (q) => [...depts.values()].filter((d) => (q.status ? d.status === q.status : true)),
    updateDepartment: async (slug, fields) => { const d = depts.get(slug); if (d) depts.set(slug, { ...d, ...fields } as DepartmentRow); },
    insertMember: async (row) => {
      const k = mkey(row.departmentSlug, row.memberType, row.memberRef);
      if ([...members.values()].some((m) => mkey(m.departmentSlug, m.memberType, m.memberRef) === k)) throw new Error("duplicate key value violates unique constraint");
      members.set(row.id, row);
    },
    getMember: async (d, t, r) => [...members.values()].find((m) => m.departmentSlug === d && m.memberType === t && m.memberRef === r) ?? null,
    listMembers: async (d) => [...members.values()].filter((m) => m.departmentSlug === d).sort((a, b) => a.priority - b.priority),
    listMembershipsForRef: async (r) => [...members.values()].filter((m) => m.memberRef === r),
    updateMember: async (id, fields) => { const m = members.get(id); if (m) members.set(id, { ...m, ...fields } as DepartmentMemberRow); },
  };
  return { store, depts, members };
}

const deps = (store: DepartmentRegistryStore) => ({ store, recordAudit: async () => {}, now });

describe("department registry — departments", () => {
  it("creates a department and reads it back", async () => {
    const { store } = makeStore();
    const d = await createDepartment({ slug: "paid_audit", name: "Paid Audit", purpose: "audits", status: "active" }, deps(store));
    expect(d.slug).toBe("paid_audit");
    expect((await store.getDepartmentBySlug("paid_audit"))?.name).toBe("Paid Audit");
  });

  it("upsert is idempotent: same input twice = one department, version unchanged", async () => {
    const { store, depts } = makeStore();
    const input = { slug: "content_strategy", name: "Content Strategy", purpose: "strategy", status: "active" as const };
    const a = await upsertDepartment(input, deps(store));
    const b = await upsertDepartment(input, deps(store));
    expect(depts.size).toBe(1);
    expect(a.version).toBe(1);
    expect(b.version).toBe(1); // no change → no version bump
    expect(b.id).toBe(a.id); // identity preserved
  });

  it("upsert bumps the version when the policy actually changes", async () => {
    const { store } = makeStore();
    await upsertDepartment({ slug: "sales", name: "Sales", purpose: "sell", status: "active" }, deps(store));
    const updated = await upsertDepartment({ slug: "sales", name: "Sales & CRM", purpose: "sell more", status: "active" }, deps(store));
    expect(updated.version).toBe(2);
    expect(updated.name).toBe("Sales & CRM");
  });

  it("setDepartmentStatus + setDepartmentHealth update in place", async () => {
    const { store } = makeStore();
    await createDepartment({ slug: "delivery", name: "Delivery", purpose: "deliver", status: "draft" }, deps(store));
    expect(await setDepartmentStatus("delivery", "active", "Moiz", deps(store))).toBe(true);
    expect((await store.getDepartmentBySlug("delivery"))?.status).toBe("active");
    await setDepartmentHealth("delivery", "degraded", deps(store));
    expect((await store.getDepartmentBySlug("delivery"))?.healthStatus).toBe("degraded");
    expect(await setDepartmentStatus("missing", "active", "Moiz", deps(store))).toBe(false);
  });
});

describe("department registry — memberships", () => {
  it("adds members and lists them by department (priority order)", async () => {
    const { store } = makeStore();
    await addMember({ departmentSlug: "paid_audit", memberType: "agent", memberRef: "audit_report_writer", role: "specialist", responsibility: "report", priority: 40 }, deps(store));
    await addMember({ departmentSlug: "paid_audit", memberType: "agent", memberRef: "audit_discovery_mapper", role: "specialist", responsibility: "discovery", priority: 10 }, deps(store));
    const members = await listMembers("paid_audit", deps(store));
    expect(members.map((m) => m.memberRef)).toEqual(["audit_discovery_mapper", "audit_report_writer"]);
  });

  it("upsertMember is idempotent and an agent can belong to two departments", async () => {
    const { store, members } = makeStore();
    await upsertMember({ departmentSlug: "paid_audit", memberType: "agent", memberRef: "shared_agent", role: "advisor", responsibility: "advise" }, deps(store));
    await upsertMember({ departmentSlug: "paid_audit", memberType: "agent", memberRef: "shared_agent", role: "advisor", responsibility: "advise better" }, deps(store)); // update in place
    await upsertMember({ departmentSlug: "proposal", memberType: "agent", memberRef: "shared_agent", role: "advisor", responsibility: "advise" }, deps(store)); // second dept
    expect(members.size).toBe(2); // one per (dept, ref), not three
    expect((await listMembershipsForRef("shared_agent", deps(store))).length).toBe(2);
    expect((await store.getMember("paid_audit", "agent", "shared_agent"))?.responsibility).toBe("advise better");
  });
});
