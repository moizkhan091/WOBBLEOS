import { NextResponse } from "next/server";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { liveOperationsFor } from "@/lib/live-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/operations?entity=<id>&entity=<id> — what is running right now.
 *
 * This is what makes a page refresh honest. A button used to be enabled again the moment you reloaded,
 * because "busy" lived in component state, so a founder could not tell whether the AI was still working
 * and would start it a second time. The page asks now instead of remembering.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  const ids = new URL(request.url).searchParams.getAll("entity").filter(Boolean).slice(0, 50);
  try {
    return NextResponse.json({ ok: true, operations: await liveOperationsFor(ids) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
