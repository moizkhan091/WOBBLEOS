import { describe, expect, it } from "vitest";
import { validateSnapshot } from "@/lib/backup";

describe("backup snapshot validation (pure)", () => {
  it("accepts a well-formed snapshot", () => {
    const v = validateSnapshot({ version: "wobble-os-backup-1", data: { offers: [{ id: "o1", name: "x" }] }, truncated: [] });
    expect(v.ok).toBe(true);
    expect(v.errors).toHaveLength(0);
    expect(v.tableKeys).toContain("offers");
  });

  it("rejects a non-object / wrong-version / missing-data snapshot", () => {
    expect(validateSnapshot(null).ok).toBe(false);
    expect(validateSnapshot({ version: "nope", data: {} }).ok).toBe(false);
    expect(validateSnapshot({ version: "wobble-os-backup-1" }).ok).toBe(false); // no data
  });

  it("rejects a table whose rows are not arrays or lack a string id", () => {
    expect(validateSnapshot({ version: "wobble-os-backup-1", data: { offers: "nope" } }).ok).toBe(false);
    expect(validateSnapshot({ version: "wobble-os-backup-1", data: { offers: [{ name: "no id" }] } }).ok).toBe(false);
  });

  it("warns (not errors) on an unknown table and on truncation", () => {
    const v = validateSnapshot({ version: "wobble-os-backup-1", data: { not_a_real_table: [{ id: "x" }] }, truncated: ["offers"] });
    expect(v.ok).toBe(true); // unknown table is a warning, ignored on restore
    expect(v.warnings.some((w) => w.includes("not_a_real_table"))).toBe(true);
    expect(v.warnings.some((w) => w.includes("TRUNCATED"))).toBe(true);
  });
});
