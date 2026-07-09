import { describe, expect, it } from "vitest";
import { buildProjectRow, canTransitionProject, computeHealthScore, type ProjectRow } from "@/lib/domain/project";
import { addProject, transitionProject, updateProgress, listProjects, type ProjectStore } from "@/lib/projects";

const now = new Date("2026-07-10T12:00:00Z");

describe("project domain", () => {
  it("builds a not_started project from a won deal", () => {
    const p = buildProjectRow({ name: "Acme AI Rollout", opportunityId: "opp_1", companyId: "co_1", createdBy: "Moiz" }, { now, id: "proj_1" });
    expect(p).toMatchObject({ id: "proj_1", status: "not_started", name: "Acme AI Rollout", opportunityId: "opp_1" });
    expect(p.healthScore).toBeGreaterThan(0);
  });
  it("enforces the status machine", () => {
    expect(canTransitionProject("not_started", "in_progress")).toBe(true);
    expect(canTransitionProject("in_progress", "completed")).toBe(true);
    expect(canTransitionProject("completed", "in_progress")).toBe(false);
  });
  it("scores health from progress + status", () => {
    const done = computeHealthScore({ status: "completed", milestones: [], deliverables: [], endDate: null }, now);
    expect(done).toBe(100);
    const atRisk = computeHealthScore({ status: "at_risk", milestones: [{ title: "a", done: false }], deliverables: [], endDate: null }, now);
    expect(atRisk).toBeLessThan(80);
  });
});

function makeStore() {
  const projects = new Map<string, ProjectRow>();
  const store: ProjectStore = {
    insertProject: async (r) => void projects.set(r.id, r),
    listProjects: async (q) => [...projects.values()].filter((p) => (!q.status || p.status === q.status) && (!q.companyId || p.companyId === q.companyId) && (q.includeArchived || !p.archivedAt)).slice(0, q.limit),
    getProject: async (id) => projects.get(id) ?? null,
    updateProject: async (id, f) => { const p = projects.get(id); if (p) projects.set(id, { ...p, ...f }); },
  };
  return { store, projects };
}

describe("project service", () => {
  it("creates, advances, and tracks progress", async () => {
    const { store } = makeStore();
    const p = await addProject({ name: "Delivery", companyId: "co_1" }, { store, now, recordAudit: async () => {} });
    const moved = await transitionProject(p.id, "in_progress", {}, { store, now, recordAudit: async () => {} });
    expect(moved?.status).toBe("in_progress");
    const withProgress = await updateProgress(p.id, { deliverables: [{ title: "Kickoff", done: true }, { title: "Build", done: false }] }, {}, { store, now, recordAudit: async () => {} });
    expect(withProgress?.deliverables).toHaveLength(2);
    expect(await listProjects({ companyId: "co_1" }, { store })).toHaveLength(1);
  });
  it("blocks an invalid transition", async () => {
    const { store } = makeStore();
    const p = await addProject({ name: "X" }, { store, now, recordAudit: async () => {} });
    await transitionProject(p.id, "in_progress", {}, { store, now, recordAudit: async () => {} });
    await transitionProject(p.id, "completed", {}, { store, now, recordAudit: async () => {} });
    const bad = await transitionProject(p.id, "in_progress", {}, { store, now, recordAudit: async () => {} });
    expect(bad).toBeNull();
  });
});
