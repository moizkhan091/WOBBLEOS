import { NextResponse } from "next/server";
import { intelligenceReviewInputSchema } from "@/lib/domain/intelligence";
import { reviewIntelligenceRecord } from "@/lib/intelligence";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

export async function POST(request: Request, context: { params: Promise<{ recordType: string; id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { recordType, id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const bodyObject =
    body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  // Approver identity comes from the verified session — never trust a client-supplied reviewedBy.
  const parsed = intelligenceReviewInputSchema.safeParse({ ...bodyObject, recordType, id, reviewedBy: auth });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await reviewIntelligenceRecord(parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
