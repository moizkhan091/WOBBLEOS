import { describe, expect, it, vi } from "vitest";
import {
  evaluateApprovalAction,
  allowedActionsFor,
  actionRequiresConfirmation,
} from "@/lib/domain/approval-flow";
import {
  applyApprovalAction,
  buildApprovalRow,
  clampApprovalLimit,
  type ApprovalStore,
} from "@/lib/approvals";
import type { AuditEventInput } from "@/lib/domain/audit";

const now = new Date("2026-06-29T12:00:00.000Z");

describe("evaluateApprovalAction", () => {
  it("approves from pending", () => {
    const r = evaluateApprovalAction({ currentStatus: "pending", action: "approve", confirmationProvided: false });
    expect(r).toMatchObject({ ok: true, nextStatus: "approved", isApproval: true, isRejection: false });
  });

  it("rejects an action not allowed from the current status", () => {
    const r = evaluateApprovalAction({ currentStatus: "archived", action: "approve", confirmationProvided: false });
    expect(r.ok).toBe(false);
    expect(r.nextStatus).toBe("archived");
    expect(r.reason).toContain("not allowed");
  });

  it("blocks a high-risk action without confirmation", () => {
    const r = evaluateApprovalAction({ currentStatus: "approved", action: "send_to_n8n", confirmationProvided: false });
    expect(r.ok).toBe(false);
    expect(r.requiresConfirmation).toBe(true);
    expect(r.reason).toContain("confirmation");
  });

  it("allows a high-risk action when confirmation is provided", () => {
    const r = evaluateApprovalAction({ currentStatus: "approved", action: "send_to_n8n", confirmationProvided: true });
    expect(r.ok).toBe(true);
    // send_to_n8n does not change lifecycle status
    expect(r.nextStatus).toBe("approved");
    expect(r.requiresConfirmation).toBe(true);
  });

  it("maps request_revision and reject to the right statuses", () => {
    expect(evaluateApprovalAction({ currentStatus: "pending", action: "request_revision", confirmationProvided: false }).nextStatus).toBe("revision_requested");
    expect(evaluateApprovalAction({ currentStatus: "pending", action: "reject", confirmationProvided: false })).toMatchObject({ nextStatus: "rejected", isRejection: true });
  });

  it("exposes allowed actions and confirmation flags", () => {
    expect(allowedActionsFor("archived")).toEqual([]);
    expect(actionRequiresConfirmation("approve_final_mp4")).toBe(true);
    expect(actionRequiresConfirmation("approve")).toBe(false);
  });
});

describe("buildApprovalRow", () => {
  it("creates a pending row with attribution defaults", () => {
    const row = buildApprovalRow(
      { approvalType: "content", entityType: "content_packet", entityId: "packet_1", requestedBy: "Moiz" },
      { id: "approval_fixed", now },
    );
    expect(row).toMatchObject({
      id: "approval_fixed",
      approvalType: "content",
      status: "pending",
      riskLevel: "normal",
      requestedBy: "Moiz",
      confirmationCompleted: false,
      createdAt: now,
    });
  });

  it("rejects missing required fields", () => {
    expect(() => buildApprovalRow({ approvalType: "", entityType: "x", entityId: "y" })).toThrowError();
  });
});

function fakeStore(initial: { status: string; approvalType: string } | null) {
  const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const store: ApprovalStore = {
    insert: vi.fn(async () => undefined),
    getById: vi.fn(async () => (initial ? { status: initial.status as never, approvalType: initial.approvalType } : null)),
    update: vi.fn(async (id, fields) => {
      updates.push({ id, fields });
    }),
  };
  return { store, updates };
}

describe("applyApprovalAction", () => {
  it("applies a valid action, sets approver attribution, and writes an audit event", async () => {
    const { store, updates } = fakeStore({ status: "pending", approvalType: "source" });
    const audit: AuditEventInput[] = [];
    const recordAudit = async (input: AuditEventInput) => {
      audit.push(input);
    };

    const result = await applyApprovalAction(
      { approvalId: "approval_1", action: "approve", approvedBy: "Moiz" },
      { store, recordAudit, now },
    );

    expect(result).toEqual({ id: "approval_1", status: "approved", action: "approve", actor: "Moiz" });
    expect(updates).toHaveLength(1);
    expect(updates[0].fields).toMatchObject({ status: "approved", approvedBy: "Moiz", approvalAction: "approve" });
    expect(audit[0]).toMatchObject({
      eventType: "approval.approve",
      module: "approvals",
      actor: "Moiz",
      metadata: { fromStatus: "pending", toStatus: "approved", approvalType: "source" },
    });
  });

  it("throws and does not update on an invalid transition", async () => {
    const { store, updates } = fakeStore({ status: "archived", approvalType: "content" });
    const recordAudit = vi.fn();
    await expect(
      applyApprovalAction({ approvalId: "a1", action: "approve", approvedBy: "Moiz" }, { store, recordAudit }),
    ).rejects.toThrowError(/not allowed/);
    expect(updates).toHaveLength(0);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("requires confirmation for high-risk actions", async () => {
    const { store } = fakeStore({ status: "approved", approvalType: "n8n_handoff" });
    await expect(
      applyApprovalAction({ approvalId: "a1", action: "send_to_n8n", approvedBy: "Moiz" }, { store }),
    ).rejects.toThrowError(/confirmation/);
  });

  it("requires an approver (approvedBy)", async () => {
    const { store } = fakeStore({ status: "pending", approvalType: "content" });
    await expect(
      applyApprovalAction({ approvalId: "a1", action: "approve", approvedBy: "" }, { store }),
    ).rejects.toThrowError();
  });

  it("throws when the approval does not exist", async () => {
    const { store } = fakeStore(null);
    await expect(
      applyApprovalAction({ approvalId: "missing", action: "approve", approvedBy: "Moiz" }, { store }),
    ).rejects.toThrowError(/not found/);
  });
});

describe("clampApprovalLimit", () => {
  it("defaults and clamps", () => {
    expect(clampApprovalLimit(undefined)).toBe(50);
    expect(clampApprovalLimit(0)).toBe(1);
    expect(clampApprovalLimit(9999)).toBe(200);
  });
});
