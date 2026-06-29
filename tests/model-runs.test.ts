import { describe, expect, it, vi } from "vitest";
import {
  buildModelRunRow,
  logModelRun,
  recordModelCall,
  clampRunLimit,
  type ModelRunRow,
  type ModelRunWriter,
} from "@/lib/model-runs";
import type { AuditEventInput } from "@/lib/domain/audit";

const now = new Date("2026-06-29T12:00:00.000Z");

function fakeWriter() {
  const rows: ModelRunRow[] = [];
  const writer: ModelRunWriter = {
    insertModelRun: async (r) => {
      rows.push(r);
    },
  };
  return { rows, writer };
}

/** clock that advances 50ms per call, for deterministic latency */
function fakeClock(startMs = 1000) {
  let t = startMs;
  return () => {
    const v = t;
    t += 50;
    return v;
  };
}

describe("buildModelRunRow", () => {
  it("computes estimated cost from tokens and normalizes nulls", () => {
    const row = buildModelRunRow(
      { provider: "openrouter", model: "openai/gpt-4o-mini", role: "writer", module: "content", status: "succeeded", inputTokens: 1000, outputTokens: 1000 },
      { id: "modelrun_fixed", now },
    );
    expect(row).toMatchObject({
      id: "modelrun_fixed",
      provider: "openrouter",
      status: "succeeded",
      estimatedCost: "0.00075",
      actualCost: null,
      error: null,
      createdAt: now,
    });
  });

  it("generates a modelrun-prefixed id", () => {
    const row = buildModelRunRow({ provider: "p", model: "m", role: "r", module: "mod", status: "error", error: "x" });
    expect(row.id.startsWith("modelrun_")).toBe(true);
    expect(row.status).toBe("error");
  });
});

describe("logModelRun", () => {
  it("writes the run and a cost audit event", async () => {
    const { rows, writer } = fakeWriter();
    const audit: AuditEventInput[] = [];
    const run = await logModelRun(
      { provider: "openrouter", model: "openai/gpt-4o", role: "ask", module: "ask_wobble", status: "succeeded", inputTokens: 100, outputTokens: 50 },
      { writer, recordAudit: async (i) => { audit.push(i); }, now },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toBe(run);
    expect(audit[0]).toMatchObject({ eventType: "model.run.succeeded", module: "costs", modelRunId: run.id });
  });
});

describe("recordModelCall", () => {
  it("logs a succeeded run with latency and returns the result", async () => {
    const { rows, writer } = fakeWriter();
    const { result, run } = await recordModelCall(
      { provider: "openrouter", model: "openai/gpt-4o", role: "ask", module: "ask_wobble" },
      async () => ({ inputTokens: 10, outputTokens: 20, text: "hello" }),
      { writer, recordAudit: async () => {}, clock: fakeClock() },
    );
    expect(result.text).toBe("hello");
    expect(rows).toHaveLength(1);
    expect(run.status).toBe("succeeded");
    expect(run.latencyMs).toBe(50);
    expect(run.inputTokens).toBe(10);
  });

  it("logs an error run AND rethrows when the call fails", async () => {
    const { rows, writer } = fakeWriter();
    await expect(
      recordModelCall(
        { provider: "openrouter", model: "openai/gpt-4o", role: "ask", module: "ask_wobble" },
        async () => {
          throw new Error("provider exploded");
        },
        { writer, recordAudit: async () => {}, clock: fakeClock() },
      ),
    ).rejects.toThrowError(/provider exploded/);

    // logging must still have happened
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("error");
    expect(rows[0].error).toBe("provider exploded");
    expect(rows[0].latencyMs).toBe(50);
  });
});

describe("clampRunLimit", () => {
  it("defaults and clamps", () => {
    expect(clampRunLimit(undefined)).toBe(50);
    expect(clampRunLimit(0)).toBe(1);
    expect(clampRunLimit(9999)).toBe(200);
  });
});
