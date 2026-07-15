import { NextResponse } from "next/server";
import { z } from "zod";
import { listMemoryProposals, proposeMemoryUpdate } from "@/lib/memory";
import { memoryUpdateProposalInputSchema, MEMORY_PROPOSAL_STATUSES, type MemoryProposalStatus } from "@/lib/domain/memory";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

const proposeSchema = memoryUpdateProposalInputSchema.extend({
  proposedBy: z.string().trim().min(1).optional(),
});

/**
 * GET /api/memory/proposals
 * List memory update proposals.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limitParam = searchParams.get("limit");

  try {
    const proposals = await listMemoryProposals({
      status: MEMORY_PROPOSAL_STATUSES.includes(status as MemoryProposalStatus)
        ? (status as MemoryProposalStatus)
        : undefined,
      affectedArea: searchParams.get("affectedArea") ?? undefined,
      limit: limitParam !== null ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ ok: true, count: proposals.length, proposals });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/memory/proposals
 * Propose a memory/Brain update. This creates an approval and does not mutate memory.
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

  const parsed = proposeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await proposeMemoryUpdate(parsed.data);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
