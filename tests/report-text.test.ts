import { describe, expect, it } from "vitest";

/**
 * These pin the rule that a model-generated report is never rendered raw.
 *
 * A paid audit's `risks` arrived as objects ({risk, mitigation}) where every neighbouring array was
 * strings. Rendering one directly threw "Objects are not valid as a React child" and took the client
 * container down on a live client. The coercion below is duplicated from the component deliberately:
 * this test exists to state the CONTRACT, so a future rewrite of the panel has something to satisfy.
 */
function reportText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(reportText).filter(Boolean).join(" · ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}: ${reportText(v)}`)
      .join(" — ");
  }
  return "";
}

describe("anything from a stored audit report renders as text", () => {
  it("passes a string through", () => {
    expect(reportText("Front desk is manual")).toBe("Front desk is manual");
  });

  it("renders the object shape that took the page down", () => {
    const risk = { risk: "Patient resistance to AI", mitigation: "Hybrid model with human escalation in 60 seconds." };
    const out = reportText(risk);
    expect(out).toContain("Patient resistance to AI");
    expect(out).toContain("Hybrid model");
  });

  it("splits a camelCase key into words a founder can read", () => {
    expect(reportText({ expectedOutcome: "20% fewer no-shows" })).toBe("expected outcome: 20% fewer no-shows");
  });

  it("joins a list", () => {
    expect(reportText(["a", "b", "c"])).toBe("a · b · c");
  });

  it("survives a nested mess without throwing", () => {
    expect(() => reportText({ a: [{ b: { c: [1, 2] } }], d: null, e: undefined })).not.toThrow();
    expect(reportText({ a: [{ b: 1 }] })).toContain("b: 1");
  });

  it("returns an empty string for nothing, so the caller can hide the row", () => {
    expect(reportText(null)).toBe("");
    expect(reportText(undefined)).toBe("");
    expect(reportText({})).toBe("");
  });

  it("never returns a non-string, whatever it is handed", () => {
    for (const v of [0, false, "", [], {}, { x: null }, [[]], new Date(0)]) {
      expect(typeof reportText(v), JSON.stringify(v)).toBe("string");
    }
  });
});
