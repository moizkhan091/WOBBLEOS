import { NextResponse } from "next/server";
import { addSeoPlan, listSeoPlans } from "@/lib/seo";
import { createSeoPlanSchema } from "@/lib/domain/seo";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const u = new URL(request.url);
  try {
    const plans = await listSeoPlans({ status: u.searchParams.get("status") ?? undefined, limit: Number(u.searchParams.get("limit") ?? 100) });
    return NextResponse.json({ ok: true, plans });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = createSeoPlanSchema.omit({ createdBy: true }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const plan = await addSeoPlan({ ...parsed.data, createdBy: auth });
    return NextResponse.json({ ok: true, plan }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
