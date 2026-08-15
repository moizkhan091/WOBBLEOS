import { desc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { approvals } from "@/db/schema";
import { createApproval } from "@/lib/approvals";
import { nextSalesLesson, type SalesLesson } from "@/lib/domain/sales-lessons";
import { getLossPattern } from "@/lib/loss-patterns";

/**
 * Propose one change to how WOBBLE sells, and let a founder decide.
 *
 * Stored as an APPROVAL rather than as its own table, because the approval machinery already does
 * everything this needs: a founder decides, the decision is attributed to them, and the whole thing is
 * audited. A parallel "suggestions" table would be the same feature with none of that.
 *
 * Nothing here changes anything. An approved lesson is a note a founder has agreed with, and the
 * measure travels with it so it can be judged later rather than merely believed.
 */

export const SALES_LESSON_APPROVAL = "sales_lesson";

/** Lesson keys already put in front of a founder, whatever they decided. Never propose one twice. */
export async function proposedLessonKeys(db: Db = getDb()): Promise<string[]> {
  const rows = await db
    .select({ metadata: approvals.metadata })
    .from(approvals)
    .where(eq(approvals.approvalType, SALES_LESSON_APPROVAL))
    .orderBy(desc(approvals.createdAt))
    .limit(200);
  return rows.map((r) => String(((r.metadata ?? {}) as Record<string, unknown>).lessonKey ?? "")).filter(Boolean);
}

export interface LessonProposalResult {
  lesson: SalesLesson | null;
  approvalId: string | null;
  /** Why nothing was proposed, when nothing was. Silence with no reason is indistinguishable from a bug. */
  because: string;
}

export async function proposeSalesLesson(db: Db = getDb()): Promise<LessonProposalResult> {
  const [pattern, alreadyProposed] = await Promise.all([getLossPattern({}, db), proposedLessonKeys(db)]);
  const lesson = nextSalesLesson({ pattern, alreadyProposed });

  if (!lesson) {
    return {
      lesson: null,
      approvalId: null,
      because: pattern.thin
        ? pattern.headline
        : "Every pattern with an honest move behind it has already been put in front of you. Nothing new to say until the losses change.",
    };
  }

  const approval = await createApproval({
    approvalType: SALES_LESSON_APPROVAL,
    entityType: "revenue_strategy",
    // Keyed by the lesson, so the same lesson can never open two approvals.
    entityId: lesson.key,
    riskLevel: "normal",
    requestedBy: "revenue_learning",
    notes: lesson.change,
    metadata: {
      lessonKey: lesson.key,
      theme: lesson.theme,
      change: lesson.change,
      because: lesson.because,
      measure: lesson.measure,
      losses: lesson.losses,
      evidence: lesson.evidence,
    },
  });

  return { lesson, approvalId: approval.id, because: "" };
}

/** What has been proposed and what a founder decided, for the Revenue desk to read back. */
export async function listSalesLessons(db: Db = getDb()): Promise<Array<{ id: string; status: string; change: string; because: string; measure: string; theme: string; losses: number; evidence: Array<{ clientName: string; reason: string }>; createdAt: string }>> {
  const rows = await db
    .select()
    .from(approvals)
    .where(eq(approvals.approvalType, SALES_LESSON_APPROVAL))
    .orderBy(desc(approvals.createdAt))
    .limit(50);
  return rows.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      status: r.status,
      change: String(m.change ?? r.notes ?? ""),
      because: String(m.because ?? ""),
      measure: String(m.measure ?? ""),
      theme: String(m.theme ?? ""),
      losses: Number(m.losses ?? 0),
      evidence: (m.evidence as Array<{ clientName: string; reason: string }>) ?? [],
      createdAt: (r.createdAt ?? new Date()).toISOString(),
    };
  });
}
