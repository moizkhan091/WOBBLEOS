import { eq } from "drizzle-orm";
import { contentPackets, qualityReviews } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { newId } from "@/lib/ids";
import { writeAuditEvent } from "@/lib/audit";
import type { AuditEventInput } from "@/lib/domain/audit";
import {
  gradeContentExcellence,
  type ContentDraft,
  type ExcellenceResult,
  type ExcellenceRules,
} from "@/lib/domain/content-excellence";
import type { QualityReviewRow } from "@/lib/domain/content-command";

/**
 * Chunk 17: Content Excellence Gate service.
 *
 * gateContentPacket grades a draft with the objective excellence gate, records
 * a `quality_reviews` row, sets the packet's qualityStatus, and reports whether
 * the packet is eligible for the approval queue. FAILED drafts are stored with
 * their rewrite reasons and are NOT eligible for approval - weak content never
 * clutters the founder's queue. Store + audit are injectable for tests.
 */

export interface QualityGateStore {
  insertQualityReview(row: QualityReviewRow): Promise<void>;
  updatePacketQualityStatus(packetId: string, qualityStatus: "passed" | "failed", now: Date): Promise<void>;
}

export interface QualityGateDeps {
  store?: QualityGateStore;
  recordAudit?: (input: AuditEventInput) => Promise<void>;
  now?: Date;
}

export interface GateContentPacketInput {
  entityId: string;
  draft: ContentDraft;
  rules?: Partial<ExcellenceRules>;
  /** persist the review + update packet status (default true) */
  record?: boolean;
}

export interface GateContentPacketResult {
  grade: ExcellenceResult;
  qualityReview: QualityReviewRow;
  eligibleForApproval: boolean;
}

export function buildQualityReviewFromGrade(
  entityId: string,
  grade: ExcellenceResult,
  opts: { id?: string; now?: Date } = {},
): QualityReviewRow {
  const now = opts.now ?? new Date();
  const notes = grade.passed ? "Passed Content Excellence Gate." : grade.rewriteInstructions.join(" | ");
  return {
    id: opts.id ?? newId("quality"),
    entityType: "content_packet",
    entityId,
    usefulness: Math.round(grade.scores.usefulness),
    originality: Math.round(grade.scores.originality),
    brandFit: Math.round(grade.scores.brandFit),
    clarity: Math.round(grade.scores.clarity),
    aggressionControl: Math.round(grade.scores.aggressionControl),
    proofStrength: Math.round(grade.scores.proofStrength),
    postWorthiness: grade.postWorthiness,
    passed: grade.passed,
    notes: notes.length ? notes : null,
    createdAt: now,
  };
}

async function defaultRecordAudit(input: AuditEventInput): Promise<void> {
  await writeAuditEvent(input);
}

function defaultStore(db: Db = getDb()): QualityGateStore {
  return {
    async insertQualityReview(row) {
      await db.insert(qualityReviews).values(row);
    },
    async updatePacketQualityStatus(packetId, qualityStatus, now) {
      await db.update(contentPackets).set({ qualityStatus, updatedAt: now }).where(eq(contentPackets.id, packetId));
    },
  };
}

export async function gateContentPacket(
  input: GateContentPacketInput,
  deps: QualityGateDeps = {},
): Promise<GateContentPacketResult> {
  const now = deps.now ?? new Date();
  const grade = gradeContentExcellence(input.draft, input.rules);
  const qualityReview = buildQualityReviewFromGrade(input.entityId, grade, { now });

  if (input.record !== false) {
    const store = deps.store ?? defaultStore();
    const recordAudit = deps.recordAudit ?? defaultRecordAudit;
    await store.insertQualityReview(qualityReview);
    await store.updatePacketQualityStatus(input.entityId, grade.qualityStatus, now);
    await recordAudit({
      eventType: grade.passed ? "content.quality_passed" : "content.quality_failed",
      module: "content_command",
      entityType: "content_packet",
      entityId: input.entityId,
      metadata: {
        passed: grade.passed,
        blocked: grade.blocked,
        scores: grade.scores,
        blockReasons: grade.blockReasons,
        fixes: grade.rewriteInstructions.length,
      },
    });
  }

  return { grade, qualityReview, eligibleForApproval: grade.passed };
}
