import { describe, expect, it, vi } from "vitest";
import {
  buildPromptSkillRow,
  nextVersion,
  pickLatestApproved,
  type PromptSkillRow,
} from "@/lib/domain/prompt-skills";
import {
  approveSkillVersion,
  createPromptSkill,
  listPromptSkills,
  loadApprovedSkill,
  proposeSkillVersion,
  rejectSkillVersion,
  type PromptSkillStore,
} from "@/lib/prompt-skills";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { ApprovalStore } from "@/lib/approvals";

const now = new Date("2026-07-01T12:00:00.000Z");

const baseInput = {
  slug: "content_generation",
  name: "Content Generation",
  module: "content_command",
  trigger: "content.generate",
  goal: "Make on-brand content packets.",
  promptBody: "Generate content grounded only in approved sources.",
};

function makeSkillStore(seed: PromptSkillRow[] = []) {
  const rows = new Map(seed.map((r) => [r.id, r]));
  const store: PromptSkillStore = {
    insert: async (row) => {
      rows.set(row.id, row);
    },
    getById: async (id) => rows.get(id) ?? null,
    listBySlug: async (slug) =>
      [...rows.values()].filter((r) => r.slug === slug).sort((a, b) => b.version - a.version),
    updateFields: async (id, fields) => {
      const c = rows.get(id);
      if (c) rows.set(id, { ...c, ...fields } as PromptSkillRow);
    },
    list: async (query) =>
      [...rows.values()]
        .filter((r) => (query.module ? r.module === query.module : true))
        .filter((r) => (query.slug ? r.slug === query.slug : true))
        .filter((r) => (query.status ? r.status === query.status : true))
        .slice(0, query.limit),
  };
  return { store, rows };
}

function fakeApprovalStore() {
  const store: ApprovalStore = {
    insert: vi.fn(async () => {}),
    getById: vi.fn(async () => ({ status: "pending" as never, approvalType: "skill" })),
    update: vi.fn(async () => {}),
  };
  return store;
}

function auditSink() {
  const events: AuditEventInput[] = [];
  return { recordAudit: async (e: AuditEventInput) => void events.push(e), events };
}

describe("prompt-skill domain", () => {
  it("builds a version-1 draft with defaults", () => {
    const row = buildPromptSkillRow(baseInput, { id: "skill_fixed", now });
    expect(row).toMatchObject({ id: "skill_fixed", version: 1, status: "draft", rules: [], referencePaths: [] });
    expect(row.approvedAt).toBeNull();
  });

  it("rejects an invalid slug", () => {
    expect(() => buildPromptSkillRow({ ...baseInput, slug: "Bad Slug" })).toThrow();
  });

  it("picks the highest approved version and computes next version", () => {
    const v1 = buildPromptSkillRow(baseInput, { id: "a", version: 1, status: "approved", now });
    const v2 = buildPromptSkillRow(baseInput, { id: "b", version: 2, status: "approved", now });
    const v3draft = buildPromptSkillRow(baseInput, { id: "c", version: 3, status: "draft", now });
    expect(pickLatestApproved([v1, v2, v3draft])?.id).toBe("b");
    expect(pickLatestApproved([v3draft])).toBeNull();
    expect(nextVersion([v1, v2, v3draft])).toBe(4);
  });
});

describe("prompt-skill service", () => {
  it("creates a draft skill and opens an approval", async () => {
    const { store } = makeSkillStore();
    const approvalStore = fakeApprovalStore();
    const { recordAudit, events } = auditSink();

    const { skill, approval } = await createPromptSkill(
      { ...baseInput, requestedBy: "Moiz" },
      { store, approvalStore, recordAudit, now },
    );

    expect(skill.version).toBe(1);
    expect(skill.status).toBe("draft");
    expect(approval).toBeDefined();
    expect(approvalStore.insert).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.eventType)).toContain("skill.created");
  });

  it("proposes a new version carrying prior fields plus the patch", async () => {
    const v1 = buildPromptSkillRow(baseInput, { id: "skill_v1", version: 1, status: "approved", now });
    const { store, rows } = makeSkillStore([v1]);
    const approvalStore = fakeApprovalStore();
    const { recordAudit, events } = auditSink();

    const { skill, previousVersion } = await proposeSkillVersion(
      "skill_v1",
      { promptBody: "Sharper hook rules.", requestedBy: "Moiz" },
      { store, approvalStore, recordAudit, now },
    );

    expect(previousVersion).toBe(1);
    expect(skill.version).toBe(2);
    expect(skill.status).toBe("draft");
    expect(skill.name).toBe(v1.name); // carried over
    expect(skill.promptBody).toBe("Sharper hook rules."); // patched
    expect(rows.get(skill.id)?.version).toBe(2);
    expect(events.map((e) => e.eventType)).toContain("skill.version_proposed");
  });

  it("approves a version, archives the previous approved, and the loader returns the new one", async () => {
    const v1 = buildPromptSkillRow(baseInput, { id: "skill_v1", version: 1, status: "approved", now });
    const v2 = buildPromptSkillRow(baseInput, { id: "skill_v2", version: 2, status: "draft", now });
    const { store, rows } = makeSkillStore([v1, v2]);
    const approvalStore = fakeApprovalStore();
    const { recordAudit, events } = auditSink();

    let recordedEffect: { effectType: string } | null = null;
    const approved = await approveSkillVersion(
      { skillId: "skill_v2", approvalId: "appr_1", approvedBy: "Moiz" },
      { store, approvalStore, recordAudit, now, claimAndRecordEffect: async (i) => { recordedEffect = i.effect; return { claimed: true, effectId: "eff_1" }; } },
    );

    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe("Moiz");
    expect(recordedEffect).toMatchObject({ effectType: "skill.activate" }); // outbox effect recorded atomically
    expect(rows.get("skill_v1")?.status).toBe("archived");
    expect(events.map((e) => e.eventType)).toContain("skill.approved");

    const loaded = await loadApprovedSkill("content_generation", { store });
    expect(loaded?.id).toBe("skill_v2");
  });

  it("rejects a version (archives it) and the loader ignores draft-only skills", async () => {
    const v1 = buildPromptSkillRow(baseInput, { id: "skill_v1", version: 1, status: "draft", now });
    const { store } = makeSkillStore([v1]);
    const approvalStore = fakeApprovalStore();
    const { recordAudit } = auditSink();

    const rejected = await rejectSkillVersion(
      { skillId: "skill_v1", approvalId: "appr_1", approvedBy: "Moiz", notes: "not sharp enough" },
      { store, approvalStore, recordAudit, now },
    );
    expect(rejected.status).toBe("archived");

    const loaded = await loadApprovedSkill("content_generation", { store });
    expect(loaded).toBeNull();
  });

  it("throws a not-found error for an unknown skill id", async () => {
    const { store } = makeSkillStore();
    await expect(
      proposeSkillVersion("missing", { promptBody: "x" }, { store, approvalStore: fakeApprovalStore(), recordAudit: async () => {}, now }),
    ).rejects.toThrow(/not found/);
  });

  it("lists skills with filters", async () => {
    const a = buildPromptSkillRow(baseInput, { id: "a", version: 1, status: "approved", now });
    const b = buildPromptSkillRow({ ...baseInput, slug: "prime", module: "ask_wobble" }, { id: "b", version: 1, status: "draft", now });
    const { store } = makeSkillStore([a, b]);
    const all = await listPromptSkills({}, { store });
    expect(all).toHaveLength(2);
    const askOnly = await listPromptSkills({ module: "ask_wobble" }, { store });
    expect(askOnly.map((s) => s.slug)).toEqual(["prime"]);
  });
});
