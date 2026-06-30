import { describe, expect, it, vi } from "vitest";
import {
  gradeContentExcellence,
  detectPhrases,
  capsRatio,
  DEFAULT_EXCELLENCE_RULES,
  type ContentDraft,
} from "@/lib/domain/content-excellence";
import { gateContentPacket, buildQualityReviewFromGrade, type QualityGateStore } from "@/lib/quality";
import type { QualityReviewRow } from "@/lib/domain/content-command";
import type { AuditEventInput } from "@/lib/domain/audit";

const strongDraft: ContentDraft = {
  hook: "Most agencies sell you tools. We ship you a digital employee that runs your content in 7 days.",
  mainCopy:
    "Here is the exact system: connect your sources, approve what the OS learns, and it drafts on-brand posts you sign off in minutes. No agency retainer, no guesswork — you keep control and the receipts.",
  caption: "Steal the workflow.",
  cta: "Reply 'OS' and I'll send the build checklist.",
  platform: "linkedin",
  format: "text",
  claimRiskLevel: "low",
  proofRequired: false,
};

describe("helpers", () => {
  it("detectPhrases finds case-insensitive substrings", () => {
    expect(detectPhrases("In Today's World we leverage AI", ["in today's world", "leverage"])).toEqual([
      "in today's world",
      "leverage",
    ]);
  });
  it("capsRatio measures shouting", () => {
    expect(capsRatio("hello")).toBe(0);
    expect(capsRatio("HELLO")).toBe(1);
  });
});

describe("gradeContentExcellence - strong draft", () => {
  it("passes a sharp, specific, on-voice draft", () => {
    const g = gradeContentExcellence(strongDraft);
    expect(g.passed).toBe(true);
    expect(g.qualityStatus).toBe("passed");
    expect(g.blocked).toBe(false);
    expect(g.scores.usefulness).toBeGreaterThanOrEqual(7);
    expect(g.scores.clarity).toBeGreaterThanOrEqual(7);
    expect(g.scores.brandFit).toBeGreaterThanOrEqual(7);
  });
});

describe("gradeContentExcellence - failures", () => {
  it("fails weak-hook + fluff + generic-agency content", () => {
    const g = gradeContentExcellence({
      hook: "In today's world, we are really just basically sharing very generic thoughts.",
      mainCopy: "Some words.",
      cta: "Let me know your thoughts",
      format: "text",
    });
    expect(g.passed).toBe(false);
    expect(g.issues.some((i) => i.code === "weak_hook_opener")).toBe(true);
    expect(g.issues.some((i) => i.code === "fluff_words")).toBe(true);
    expect(g.issues.some((i) => i.code === "generic_agency_language")).toBe(true);
    expect(g.rewriteInstructions.length).toBeGreaterThan(0);
  });

  it("BLOCKS a strong/risky claim with no proof", () => {
    const g = gradeContentExcellence({
      hook: "We are the #1 guaranteed best AI agency, proven to 10x you.",
      mainCopy: "Trust us, it is the best and fastest, guaranteed.",
      cta: "Book a call",
      claimRiskLevel: "high",
      hasSources: false,
      hasEvidence: false,
    });
    expect(g.blocked).toBe(true);
    expect(g.passed).toBe(false);
    expect(g.scores.proofStrength).toBeLessThan(7);
    expect(g.blockReasons.join(" ")).toMatch(/claim/i);
  });

  it("clears the proof block once an approved source + evidence are attached", () => {
    const g = gradeContentExcellence({
      hook: "We cut content time by 70% — here is the proven system you can copy.",
      mainCopy:
        "We measured 12 founders over 30 days: average drafting time dropped from 6 hours to under 2. You get the same playbook, step by step, with the receipts to back it.",
      cta: "Grab the playbook",
      claimRiskLevel: "high",
      hasSources: true,
      hasEvidence: true,
    });
    expect(g.scores.proofStrength).toBeGreaterThanOrEqual(7);
    expect(g.issues.some((i) => i.code === "unproven_claim")).toBe(false);
  });

  it("controls aggression (caps, exclamations, insults)", () => {
    const g = gradeContentExcellence({
      hook: "THIS IS GARBAGE!!! YOU IDIOT MARKETERS ARE STUPID!!!",
      mainCopy: "STOP BEING DUMB!!!",
      cta: "wake up",
      format: "text",
    });
    expect(g.scores.aggressionControl).toBeLessThan(6);
    expect(g.issues.some((i) => i.code === "insulting_language")).toBe(true);
    expect(g.passed).toBe(false);
  });

  it("honors custom banned phrases (rules are config, not hardcoded)", () => {
    const g = gradeContentExcellence(
      { hook: "We are cheap and fast and the best in town.", mainCopy: "Cheap and fast wins.", cta: "Buy now" },
      { bannedPhrases: ["cheap and fast"] },
    );
    expect(g.blocked).toBe(true);
    expect(g.issues.some((i) => i.code === "banned_phrase")).toBe(true);
  });
});

// ---- service ----
function fakeStore() {
  const reviews: QualityReviewRow[] = [];
  const statusUpdates: Array<{ id: string; status: string }> = [];
  const store: QualityGateStore = {
    insertQualityReview: async (r) => {
      reviews.push(r);
    },
    updatePacketQualityStatus: async (id, status) => {
      statusUpdates.push({ id, status });
    },
  };
  return { store, reviews, statusUpdates };
}

describe("gateContentPacket", () => {
  it("records a passing review, updates packet status, and marks it approval-eligible", async () => {
    const { store, reviews, statusUpdates } = fakeStore();
    const audit: AuditEventInput[] = [];
    const res = await gateContentPacket(
      { entityId: "content_1", draft: strongDraft },
      { store, recordAudit: async (i) => { audit.push(i); }, now: new Date("2026-06-30T00:00:00Z") },
    );
    expect(res.eligibleForApproval).toBe(true);
    expect(reviews[0]).toMatchObject({ entityId: "content_1", passed: true, postWorthiness: "pass" });
    expect(statusUpdates[0]).toEqual({ id: "content_1", status: "passed" });
    expect(audit.some((a) => a.eventType === "content.quality_passed")).toBe(true);
  });

  it("records a failing review with rewrite notes and blocks approval eligibility", async () => {
    const { store, reviews, statusUpdates } = fakeStore();
    const audit: AuditEventInput[] = [];
    const res = await gateContentPacket(
      {
        entityId: "content_2",
        draft: { hook: "In today's world we just share very generic stuff.", cta: "thoughts?" },
      },
      { store, recordAudit: async (i) => { audit.push(i); } },
    );
    expect(res.eligibleForApproval).toBe(false);
    expect(reviews[0].passed).toBe(false);
    expect(reviews[0].notes).toBeTruthy();
    expect(statusUpdates[0].status).toBe("failed");
    expect(audit.some((a) => a.eventType === "content.quality_failed")).toBe(true);
  });

  it("does not persist when record:false (on-demand scoring)", async () => {
    const store = { insertQualityReview: vi.fn(), updatePacketQualityStatus: vi.fn() };
    const res = await gateContentPacket({ entityId: "x", draft: strongDraft, record: false }, { store });
    expect(res.grade.passed).toBe(true);
    expect(store.insertQualityReview).not.toHaveBeenCalled();
  });

  it("maps grade scores to integer quality-review columns", () => {
    const g = gradeContentExcellence(strongDraft);
    const row = buildQualityReviewFromGrade("content_3", g);
    for (const k of ["usefulness", "originality", "brandFit", "clarity", "aggressionControl", "proofStrength"] as const) {
      expect(Number.isInteger(row[k])).toBe(true);
    }
  });
});
