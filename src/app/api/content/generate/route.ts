import { NextResponse } from "next/server";
import { enqueueContentGenerationJob } from "@/lib/content-worker";
import { contentGenerationRequestSchema } from "@/lib/domain/content-worker";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { killSwitchResponse } from "@/lib/security-governance/enforcement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = contentGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  try {
    const result = await enqueueContentGenerationJob({ ...parsed.data, requestedBy: auth });
    return NextResponse.json({ ok: true, ...result }, { status: result.deduped ? 200 : 202 });
  } catch (error) {
    // A kill switch is deliberate containment, not a server fault — 409, never 500 (WOB-UAT-034).
    const blocked = killSwitchResponse(error);
    if (blocked) return NextResponse.json(blocked.body, { status: blocked.status });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
