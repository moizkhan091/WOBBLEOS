import { NextResponse } from "next/server";
import { requireFounder, isAuthError } from "@/lib/auth/route";
import { getCommercialJourney, getArtifactLineage } from "@/lib/commercial-journey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/org/[companyId] — the Organisation Workspace payload: a company's full commercial journey (lineage +
 * furthest stage) and its artifact provenance graph, assembled from existing records. Founder-gated, read-only.
 */
export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { companyId } = await context.params;
  try {
    const [journey, lineage] = await Promise.all([getCommercialJourney(companyId), getArtifactLineage(companyId)]);
    return NextResponse.json({ ok: true, journey, lineage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
