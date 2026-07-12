import { NextResponse } from "next/server";
import { buildAndStoreDailyBrief, getLatestDailyBrief } from "@/lib/daily-brief";
import { BRIEF_CADENCES, BRIEF_SCOPE_TYPES, type BriefCadence, type BriefScope, type BriefScopeType } from "@/lib/domain/daily-brief";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function scopeFrom(url: URL): BriefScope {
  const type = (url.searchParams.get("scope") ?? "company") as BriefScopeType;
  const cadence = (url.searchParams.get("cadence") ?? "daily") as BriefCadence;
  return {
    type: BRIEF_SCOPE_TYPES.includes(type) ? type : "company",
    id: url.searchParams.get("id"),
    label: url.searchParams.get("label") ?? undefined,
    cadence: BRIEF_CADENCES.includes(cadence) ? cadence : "daily",
  };
}

/** The latest persisted Daily Founder Brief for a scope (progressive-disclosure, evidence-linked). */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const scope = scopeFrom(new URL(request.url));
  try {
    const latest = await getLatestDailyBrief(scope);
    return NextResponse.json({ ok: true, brief: latest?.brief ?? null, generatedAt: latest?.generatedAt ?? null });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** Generate + persist a fresh brief on demand (founder-gated). The scheduler also generates the daily one. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const scope = scopeFrom(new URL(request.url));
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const brief = await buildAndStoreDailyBrief(scope);
    return NextResponse.json({ ok: true, brief }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
