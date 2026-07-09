import { describe, expect, it, vi } from "vitest";
import { buildAuditEvent } from "@/lib/domain/audit";
import {
  clampLimit,
  writeAuditEvent,
  DEFAULT_AUDIT_LIMIT,
  MAX_AUDIT_LIMIT,
  type AuditWriter,
} from "@/lib/audit";
import type { AuditEventRow } from "@/lib/domain/audit";

const now = new Date("2026-06-29T12:00:00.000Z");

describe("buildAuditEvent", () => {
  it("normalizes a full event and defaults optionals to null", () => {
    const row = buildAuditEvent(
      {
        eventType: "approval.approved",
        module: "approvals",
        entityType: "content_packet",
        entityId: "packet_1",
        actor: "Moiz",
        costEstimate: 0.42,
      },
      { now, id: "audit_fixed" },
    );

    expect(row).toEqual({
      id: "audit_fixed",
      eventType: "approval.approved",
      category: "approval",
      module: "approvals",
      entityType: "content_packet",
      entityId: "packet_1",
      actor: "Moiz",
      surface: null,
      modelRunId: null,
      costEstimate: "0.42",
      metadata: {},
      createdAt: now,
    });
  });

  it("generates an audit-prefixed id and uses provided timestamp", () => {
    const row = buildAuditEvent({ eventType: "source.added", module: "source_library" }, { now });
    expect(row.id.startsWith("audit_")).toBe(true);
    expect(row.createdAt).toBe(now);
    expect(row.metadata).toEqual({});
  });

  it("rejects events missing eventType", () => {
    expect(() => buildAuditEvent({ eventType: "", module: "approvals" })).toThrowError();
  });

  it("rejects events missing module", () => {
    expect(() => buildAuditEvent({ eventType: "x", module: "  " })).toThrowError();
  });

  it("rejects negative cost estimates", () => {
    expect(() =>
      buildAuditEvent({ eventType: "model.run", module: "ask_wobble", costEstimate: -1 }),
    ).toThrowError();
  });
});

describe("writeAuditEvent", () => {
  it("passes the normalized row to the injected writer and returns it", async () => {
    const captured: AuditEventRow[] = [];
    const writer: AuditWriter = {
      async insertAudit(row) {
        captured.push(row);
      },
    };

    const result = await writeAuditEvent(
      { eventType: "webhook.received", module: "handoff", actor: "system" },
      { writer, now },
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]).toBe(result);
    expect(result.eventType).toBe("webhook.received");
    expect(result.module).toBe("handoff");
    expect(result.createdAt).toBe(now);
  });

  it("does not swallow validation errors before writing", async () => {
    const writer: AuditWriter = { insertAudit: vi.fn() };
    await expect(
      writeAuditEvent({ eventType: "", module: "handoff" }, { writer }),
    ).rejects.toThrowError();
    expect(writer.insertAudit).not.toHaveBeenCalled();
  });
});

describe("clampLimit", () => {
  it("defaults when undefined or NaN", () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_AUDIT_LIMIT);
    expect(clampLimit(Number.NaN)).toBe(DEFAULT_AUDIT_LIMIT);
  });

  it("clamps to the 1..MAX range and truncates floats", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
    expect(clampLimit(10.9)).toBe(10);
    expect(clampLimit(9999)).toBe(MAX_AUDIT_LIMIT);
  });
});
