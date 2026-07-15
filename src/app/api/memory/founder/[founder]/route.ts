import { NextResponse } from "next/server";
import { getFounderMemory } from "@/lib/memory";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

/**
 * GET /api/memory/founder/[founder] — a founder's company memory. Readable by ANY authenticated
 * founder, by design: WOBBLE runs on founder transparency, so Ali reading Moiz's profile ("what has
 * Moiz decided lately?") is the product working, not a leak. The `editable` flag in the response
 * distinguishes your own profile from a colleague's read-only one; editing stays owner-only.
 *
 * `requireFounder` is what this route was actually missing (WOB-UAT-029). The edge proxy verifies the
 * JWT SIGNATURE ONLY, so before this gate an unauthenticated caller was rejected but a REVOKED session
 * or a DISABLED account still read founder memory for the JWT's remaining lifetime — proven live.
 * Resolving the founder through the DB-backed `verifySession` is what actually rejects them.
 */
export async function GET(request: Request, { params }: { params: Promise<{ founder: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const { founder } = await params;
  try {
    const memory = await getFounderMemory(founder, auth);
    return NextResponse.json({ ok: true, ...memory });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
