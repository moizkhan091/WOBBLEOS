import { describe, expect, it } from "vitest";
import { REVENUE_HEAD_TOOLS, REVENUE_HEAD_TOOL_NAMES } from "@/lib/revenue-head";
import { ASK_TOOLS } from "@/lib/ask-tools";

describe("revenue head — a narrow, deliberate tool set", () => {
  it("carries far fewer tools than the generalist", () => {
    // Narrowness is the point: selection accuracy falls as the count grows and every offered tool is
    // re-billed on every call. A head with the right dozen beats a generalist with forty.
    expect(REVENUE_HEAD_TOOLS.length).toBeLessThan(ASK_TOOLS.length);
    expect(REVENUE_HEAD_TOOLS.length).toBeGreaterThanOrEqual(15);
  });

  it("carries the commercial tools and none of the unrelated ones", () => {
    for (const t of ["read_client", "revise_proposal", "qualify_client", "generate_call_questions", "list_deals", "list_proposals", "get_finance_summary"]) {
      expect(REVENUE_HEAD_TOOL_NAMES, `missing ${t}`).toContain(t);
    }
    // Publishing, media and model administration are other departments' business.
    for (const t of ["schedule_post", "mark_posted", "generate_content", "apply_model_upgrade", "import_content_folder"]) {
      expect(REVENUE_HEAD_TOOL_NAMES, `should not carry ${t}`).not.toContain(t);
    }
  });

  it("every tool name is unique", () => {
    expect(REVENUE_HEAD_TOOL_NAMES.length).toBe(new Set(REVENUE_HEAD_TOOL_NAMES).size);
  });

  it("gates the actions that cost money or create client-facing artifacts", () => {
    const gated = (n: string) => REVENUE_HEAD_TOOLS.find((t) => t.name === n)?.requiresConfirmation;
    expect(gated("revise_proposal"), "a revision creates a client-facing version").toBe(true);
    expect(gated("move_deal_stage"), "moving to won fires invoicing and delivery").toBe(true);
    expect(gated("set_deal_value"), "the head proposes a price, the founder sets it").toBe(true);
  });

  it("leaves reads ungated so the head can actually think before it acts", () => {
    const readOnly = REVENUE_HEAD_TOOLS.filter((t) => !t.mutates);
    expect(readOnly.length).toBeGreaterThan(3);
    for (const t of readOnly) expect(t.requiresConfirmation, `${t.name} is a read and should not be gated`).toBe(false);
  });

  it("every tool declares a JSON schema the model can call", () => {
    for (const t of REVENUE_HEAD_TOOLS) {
      expect(t.jsonSchema, t.name).toBeTruthy();
      expect((t.jsonSchema as { type?: string }).type, t.name).toBe("object");
      expect(t.description.length, `${t.name} needs a real description`).toBeGreaterThan(20);
    }
  });
});

describe("revenue head — every offered tool must actually execute", () => {
  it("dispatches head-only tools instead of rejecting them as unknown", async () => {
    // This is the bug this test exists for: the model was OFFERED read_client, called it, and the
    // executor looked it up in the global registry and answered "Unknown tool 'read_client'". A tool
    // advertised to a model and then refused at execution is worse than not having it.
    const { runTool } = await import("@/lib/ask-tools");
    const registry = Object.fromEntries(REVENUE_HEAD_TOOLS.map((t) => [t.name, t]));
    for (const name of ["read_client", "qualify_client", "generate_call_questions", "list_stalled_deals"]) {
      const res = await runTool(name, { companyId: "co_does_not_exist", daysStalled: 7 }, {}, registry);
      // It may fail for lack of a database, but it must never fail because the tool is unknown.
      expect(res.error ?? "", name).not.toMatch(/Unknown tool/);
    }
  });

  it("still reports a genuinely unknown tool", async () => {
    const { runTool } = await import("@/lib/ask-tools");
    const registry = Object.fromEntries(REVENUE_HEAD_TOOLS.map((t) => [t.name, t]));
    const res = await runTool("delete_everything", {}, {}, registry);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Unknown tool/);
  });
});
