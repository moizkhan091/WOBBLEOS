import { NextResponse } from "next/server";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { listSalesLessons, proposeSalesLesson } from "@/lib/sales-lessons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/revenue/lessons — what the OS has proposed changing about how we sell, and what you decided.
 * POST — look at the losses now and propose the next one, if there is an honest one to propose.
 *
 * A proposal is an APPROVAL. Nothing here changes how anything works; a founder decides, and their
 * name goes on the decision.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    return NextResponse.json({ ok: true, lessons: await listSalesLessons() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    return NextResponse.json({ ok: true, ...(await proposeSalesLesson()) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
