import { NextResponse } from "next/server";
import { INTELLIGENCE_APPROVAL_STATUSES, INTELLIGENCE_SCOPES, intelligenceItemInputSchema } from "@/lib/domain/intelligence";
import { listIntelligenceItems, recordIntelligenceItem } from "@/lib/intelligence";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");
  const approvalStatus = searchParams.get("approvalStatus");
  const limitParam = searchParams.get("limit");

  try {
    const items = await listIntelligenceItems({
      scope: INTELLIGENCE_SCOPES.includes(scope as never) ? (scope as never) : undefined,
      approvalStatus: INTELLIGENCE_APPROVAL_STATUSES.includes(approvalStatus as never) ? (approvalStatus as never) : undefined,
      clientId: searchParams.get("clientId") ?? undefined,
      limit: limitParam !== null ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ ok: true, count: items.length, items });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

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

  const parsed = intelligenceItemInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await recordIntelligenceItem(parsed.data);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
