import { NextResponse } from "next/server";
import { INTELLIGENCE_APPROVAL_STATUSES, INTELLIGENCE_SCOPES, intelligenceInboxQuerySchema } from "@/lib/domain/intelligence";
import { listIntelligenceInbox } from "@/lib/intelligence";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");
  const approvalStatus = searchParams.get("approvalStatus");
  const parsed = intelligenceInboxQuerySchema.safeParse({
    scope: INTELLIGENCE_SCOPES.includes(scope as never) ? scope : undefined,
    clientId: searchParams.get("clientId") ?? undefined,
    approvalStatus: INTELLIGENCE_APPROVAL_STATUSES.includes(approvalStatus as never) ? approvalStatus : undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await listIntelligenceInbox(parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
