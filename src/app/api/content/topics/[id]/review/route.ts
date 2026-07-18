import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { reviewTopic } from "@/lib/content-topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().trim().max(2000).optional(),
});

/**
 * POST /api/content/topics/[id]/review — the HUMAN GATE. A founder approves or rejects a topic; only an
 * approved topic can be promoted to production. Idempotent (a re-decide is a no-op). Founder-gated.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });

  try {
    const topic = await reviewTopic({ topicId: id, decision: parsed.data.decision, reviewedBy: auth, notes: parsed.data.notes }, {});
    if (!topic) return NextResponse.json({ ok: false, error: "topic not found" }, { status: 404 });
    return NextResponse.json({ ok: true, topic });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
