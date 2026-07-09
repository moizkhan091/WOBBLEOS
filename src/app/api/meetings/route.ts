import { NextResponse } from "next/server";
import { addMeeting, listMeetings } from "@/lib/meetings";
import { createMeetingSchema } from "@/lib/domain/meeting";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/meetings?status=&opportunityId=&companyId=&limit= */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const u = new URL(request.url);
  try {
    const meetings = await listMeetings({ status: u.searchParams.get("status") ?? undefined, opportunityId: u.searchParams.get("opportunityId") ?? undefined, companyId: u.searchParams.get("companyId") ?? undefined, limit: Number(u.searchParams.get("limit") ?? 300) });
    return NextResponse.json({ ok: true, meetings });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** POST /api/meetings — book a meeting. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = createMeetingSchema.omit({ createdBy: true }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const meeting = await addMeeting({ ...parsed.data, createdBy: auth });
    return NextResponse.json({ ok: true, meeting }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
