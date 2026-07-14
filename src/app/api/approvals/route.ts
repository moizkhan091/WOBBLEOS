import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import {
  createApproval,
  createApprovalSchema,
  listApprovals,
  countPendingApprovals,
} from "@/lib/approvals";
import type { ApprovalStatus } from "@/lib/domain/approval-flow";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/**
 * GET /api/approvals
 * List approval items. Filters: status, approvalType, entityType, limit.
 * Always returns the current pending count for the queue badge.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");

  try {
    const [items, pendingCount] = await Promise.all([
      listApprovals({
        status: (searchParams.get("status") as ApprovalStatus | null) ?? undefined,
        approvalType: searchParams.get("approvalType") ?? undefined,
        entityType: searchParams.get("entityType") ?? undefined,
        limit: limitParam !== null ? Number(limitParam) : undefined,
      }),
      countPendingApprovals(),
    ]);
    return NextResponse.json({ ok: true, pendingCount, count: items.length, items });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/approvals
 * Create a pending approval item (content, source, memory_update, n8n_handoff, media_clip, final_mp4, ...).
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = createApprovalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const approval = await createApproval(parsed.data);
    return NextResponse.json({ ok: true, approval }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
