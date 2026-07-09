import { NextResponse } from "next/server";
import { archiveContentAsset, getContentAsset } from "@/lib/library";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

/** GET /api/library/assets/[id] — one library asset. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await params;
  try {
    const asset = await getContentAsset(id);
    if (!asset) return NextResponse.json({ ok: false, error: "asset not found" }, { status: 404 });
    return NextResponse.json({ ok: true, asset });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** DELETE /api/library/assets/[id] — archive an asset. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await params;
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const archived = await archiveContentAsset(id);
    if (!archived) return NextResponse.json({ ok: false, error: "asset not found or already archived" }, { status: 404 });
    return NextResponse.json({ ok: true, status: "archived" });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
