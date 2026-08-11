import { describe, expect, it } from "vitest";
import {
  MODEL_ROLE_CATALOG,
  applyModelChangeSchema,
  detectPreset,
  downgradeWarnings,
  presetModel,
  resolveChanges,
  ROLE_BY_NAME,
} from "@/lib/domain/model-control";

const CHEAP = "openai/gpt-4o-mini";
const STRONG = "anthropic/claude-sonnet-4.5";

describe("model control — the catalog is the single source of truth", () => {
  it("every role is unique and belongs to a department", () => {
    const roles = MODEL_ROLE_CATALOG.map((r) => r.role);
    expect(roles.length).toBe(new Set(roles).size);
    for (const r of MODEL_ROLE_CATALOG) {
      expect(r.department, r.role).toBeTruthy();
      expect(r.purpose.length, `${r.role} needs a real purpose`).toBeGreaterThan(20);
    }
  });

  it("includes the roles that used to be hardcoded at their call sites", () => {
    // These six bypassed the role map entirely, which would have made this whole page a lie.
    for (const role of ["qualification", "meeting_intelligence", "offer_validation", "content_render", "revenue_head", "call_questions"]) {
      expect(ROLE_BY_NAME.has(role), `${role} missing from the catalog`).toBe(true);
    }
  });

  it("keeps the fallback role cheap, since anything unmapped lands on it", () => {
    expect(ROLE_BY_NAME.get("default")?.defaultModel).toBe(CHEAP);
    expect(ROLE_BY_NAME.get("default")?.needsJudgment).toBe(false);
  });
});

describe("model control — presets", () => {
  it("economy puts everything on the cheap model", () => {
    for (const r of MODEL_ROLE_CATALOG) expect(presetModel("economy", r), r.role).toBe(CHEAP);
  });

  it("premium puts everything on the strong model", () => {
    for (const r of MODEL_ROLE_CATALOG) expect(presetModel("premium", r), r.role).toBe(STRONG);
  });

  it("balanced spends only where a cheap model measurably fails", () => {
    // Transcript extraction dropped every money figure on mini, so it must be strong.
    expect(presetModel("balanced", ROLE_BY_NAME.get("meeting_intelligence")!)).toBe(STRONG);
    // Sorting a list by two labels does not need reasoning.
    expect(presetModel("balanced", ROLE_BY_NAME.get("audit_prioritization")!)).toBe(CHEAP);
    expect(presetModel("balanced", ROLE_BY_NAME.get("qualification")!)).toBe(CHEAP);
  });

  it("detects which preset the current map matches, or reports custom", () => {
    const all = (fn: (r: (typeof MODEL_ROLE_CATALOG)[number]) => string) =>
      Object.fromEntries(MODEL_ROLE_CATALOG.map((r) => [r.role, fn(r)]));
    expect(detectPreset(all(() => CHEAP))).toBe("economy");
    expect(detectPreset(all(() => STRONG))).toBe("premium");
    expect(detectPreset(all((r) => presetModel("balanced", r)))).toBe("balanced");
    expect(detectPreset({ ...all(() => CHEAP), audit_report: STRONG })).toBe("custom");
  });
});

describe("model control — resolving a change request", () => {
  it("a preset touches every role", () => {
    expect(resolveChanges({ preset: "economy" })).toHaveLength(MODEL_ROLE_CATALOG.length);
  });

  it("a department preset touches only that department", () => {
    const changes = resolveChanges({ preset: "economy", department: "revenue_crm" });
    const revenueRoles = MODEL_ROLE_CATALOG.filter((r) => r.department === "revenue_crm").length;
    expect(changes).toHaveLength(revenueRoles);
    for (const c of changes) expect(ROLE_BY_NAME.get(c.role)?.department).toBe("revenue_crm");
  });

  it("a single role change touches exactly one", () => {
    expect(resolveChanges({ role: "audit_report", model: CHEAP })).toEqual([{ role: "audit_report", model: CHEAP }]);
  });

  it("rejects a request that names neither a preset nor a model", () => {
    expect(applyModelChangeSchema.safeParse({ role: "audit_report" }).success).toBe(false);
  });

  it("rejects a model with nothing to apply it to", () => {
    expect(applyModelChangeSchema.safeParse({ model: CHEAP }).success).toBe(false);
  });
});

describe("model control — warns before a founder degrades real work", () => {
  it("names the roles where cheap will hurt, and says why", () => {
    const warnings = downgradeWarnings(
      [
        { role: "meeting_intelligence", model: CHEAP },
        { role: "audit_prioritization", model: CHEAP },
      ],
      new Set([CHEAP]),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Call transcript extraction");
    expect(warnings[0]).toMatch(/drops the figures/);
  });

  it("says nothing when the change is an upgrade", () => {
    expect(downgradeWarnings([{ role: "meeting_intelligence", model: STRONG }], new Set([CHEAP]))).toEqual([]);
  });
});
