import { describe, expect, it } from "vitest";
import { buildTaskRow, canTransitionTask, isOverdue, type TaskRow } from "@/lib/domain/task";
import { addTask, transitionTask, assignTask, listOverdueTasks, type TaskStore } from "@/lib/tasks";

const now = new Date("2026-07-09T12:00:00Z");

describe("task domain", () => {
  it("builds a task with defaults", () => {
    const t = buildTaskRow({ title: "Call client", taskType: "call", createdBy: "Moiz" }, { now, id: "task_1" });
    expect(t).toMatchObject({ id: "task_1", title: "Call client", status: "not_started", taskType: "call", assignedBy: "Moiz" });
  });
  it("enforces the status machine", () => {
    expect(canTransitionTask("not_started", "in_progress")).toBe(true);
    expect(canTransitionTask("in_progress", "completed")).toBe(true);
    expect(canTransitionTask("completed", "waiting")).toBe(false);
  });
  it("flags overdue tasks", () => {
    expect(isOverdue({ status: "in_progress", dueDate: new Date("2026-07-01T00:00:00Z") }, now)).toBe(true);
    expect(isOverdue({ status: "completed", dueDate: new Date("2026-07-01T00:00:00Z") }, now)).toBe(false);
    expect(isOverdue({ status: "in_progress", dueDate: new Date("2026-08-01T00:00:00Z") }, now)).toBe(false);
  });
});

function makeStore() {
  const tasks = new Map<string, TaskRow>();
  const store: TaskStore = {
    insertTask: async (r) => void tasks.set(r.id, r),
    listTasks: async (q) => [...tasks.values()].filter((t) => (!q.status || t.status === q.status) && (!q.assignedTo || t.assignedTo === q.assignedTo) && (!q.opportunityId || t.opportunityId === q.opportunityId) && (q.includeArchived || !t.archivedAt)).slice(0, q.limit),
    getTask: async (id) => tasks.get(id) ?? null,
    updateTask: async (id, f) => { const t = tasks.get(id); if (t) tasks.set(id, { ...t, ...f }); },
  };
  return { store, tasks };
}

describe("task service", () => {
  it("creates, transitions, and completes a task", async () => {
    const { store } = makeStore();
    const t = await addTask({ title: "Follow up", opportunityId: "opp_1" }, { store, now, recordAudit: async () => {} });
    expect((await transitionTask(t.id, "in_progress", {}, { store, now, recordAudit: async () => {} }))?.status).toBe("in_progress");
    const done = await transitionTask(t.id, "completed", {}, { store, now, recordAudit: async () => {} });
    expect(done?.status).toBe("completed");
    expect(done?.completedAt).toEqual(now);
    expect(await transitionTask(t.id, "waiting", {}, { store, now, recordAudit: async () => {} })).toBeNull(); // invalid
  });
  it("reassigns a task", async () => {
    const { store } = makeStore();
    const t = await addTask({ title: "x", assignedTo: "Ali" }, { store, now, recordAudit: async () => {} });
    expect((await assignTask(t.id, "Ibrahim", {}, { store, now, recordAudit: async () => {} }))?.assignedTo).toBe("Ibrahim");
  });
  it("lists overdue tasks", async () => {
    const { store } = makeStore();
    await addTask({ title: "late", dueDate: "2026-07-01T00:00:00Z" }, { store, now, recordAudit: async () => {} });
    await addTask({ title: "future", dueDate: "2026-08-01T00:00:00Z" }, { store, now, recordAudit: async () => {} });
    const overdue = await listOverdueTasks({ store, now });
    expect(overdue).toHaveLength(1);
    expect(overdue[0].title).toBe("late");
  });
});
