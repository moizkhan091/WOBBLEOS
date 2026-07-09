import { NextResponse } from "next/server";
import { addAutomation, listAutomations } from "@/lib/automations";
import { createAutomationSchema } from "@/lib/domain/automation";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const u = new URL(request.url);
  try {
    const enabledParam = u.searchParams.get("enabled");
    const rules = await listAutomations({ enabled: enabledParam == null ? undefined : enabledParam === "true", limit: Number(u.searchParams.get("limit") ?? 200) });
    return NextResponse.json({ ok: true, rules });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = createAutomationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const rule = await addAutomation({ ...parsed.data, createdBy: auth });
    return NextResponse.json({ ok: true, rule }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
