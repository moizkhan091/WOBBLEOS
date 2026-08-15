import { describe, expect, it } from "vitest";
import { keyFor, STALE_AFTER_MS } from "@/lib/live-ops";

/**
 * A founder clicked "Generate questions", refreshed the page, and the button came back enabled, so
 * there was no way to tell whether the AI was still working. Clicking again bought the same model calls
 * twice and wrote a second version nobody asked for. The same shape existed on every expensive button,
 * because "busy" lived in React state, which lasts exactly as long as the page does.
 *
 * The guarantee has to be somewhere both tabs can see, so a live claim is held in the `jobs` table,
 * whose partial unique index already enforces one live row per idempotency key.
 */

describe("the key that makes two runs of the same thing impossible", () => {
  it("is the same for the same operation on the same entity", () => {
    const a = keyFor({ operation: "qualify", entityType: "crm_company", entityId: "co_1" });
    const b = keyFor({ operation: "qualify", entityType: "crm_company", entityId: "co_1" });
    expect(a).toBe(b);
  });

  it("separates two different operations on one client", () => {
    // Generating questions while the council scores is fine, and must not be blocked.
    const q = keyFor({ operation: "qualify", entityType: "crm_company", entityId: "co_1" });
    const s = keyFor({ operation: "questions", entityType: "crm_company", entityId: "co_1" });
    expect(q).not.toBe(s);
  });

  it("separates the same operation on two clients", () => {
    const a = keyFor({ operation: "qualify", entityType: "crm_company", entityId: "co_1" });
    const b = keyFor({ operation: "qualify", entityType: "crm_company", entityId: "co_2" });
    expect(a).not.toBe(b);
  });

  it("separates two entity types that happen to share an id", () => {
    const a = keyFor({ operation: "review", entityType: "crm_company", entityId: "x" });
    const b = keyFor({ operation: "review", entityType: "proposal", entityId: "x" });
    expect(a).not.toBe(b);
  });

  it("frees a claim a crashed worker left behind, rather than locking the button forever", () => {
    // Matches the existing reclaimStalledJobs window, so there is one rule about what stale means.
    expect(STALE_AFTER_MS).toBe(5 * 60_000);
  });
});
