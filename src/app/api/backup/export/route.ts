import { NextResponse } from "next/server";
import { exportSnapshot } from "@/lib/backup";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/backup/export — download a full JSON snapshot of the business tables (founder-gated). */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const snapshot = await exportSnapshot(new Date().toISOString());
    const body = JSON.stringify(snapshot, null, 2);
    const stamp = snapshot.generatedAt.slice(0, 19).replace(/[:T]/g, "-");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="wobble-os-backup-${stamp}.json"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
