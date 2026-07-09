import { NextResponse } from "next/server";
import { addContentAsset, listContentAssets } from "@/lib/library";
import { createAssetSchema } from "@/lib/domain/library";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/library/assets?status=&kind=&limit= — browse the content library. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const url = new URL(request.url);
  try {
    const assets = await listContentAssets({
      status: url.searchParams.get("status") ?? undefined,
      kind: url.searchParams.get("kind") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 100),
    });
    return NextResponse.json({ ok: true, assets });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** POST /api/library/assets — add a content asset to the library. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = createAssetSchema.omit({ createdBy: true }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const asset = await addContentAsset({ ...parsed.data, createdBy: auth });
    return NextResponse.json({ ok: true, asset }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
