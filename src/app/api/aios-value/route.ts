import { NextResponse } from "next/server";
import { z } from "zod";
import { addTaskToInventory, getAiosValueSnapshot } from "@/lib/aios-value";
import { taskInventorySchema, type AiosValueScope } from "@/lib/domain/aios-value";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPE_TYPES = ["company", "department", "client", "project"] as const;

/** The evidence-tiered AIOS value snapshot for a scope. KPIs are honestly null until work is inventoried. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const u = new URL(request.url);
  const type = (u.searchParams.get("scope") ?? "company") as AiosValueScope["type"];
  if (!SCOPE_TYPES.includes(type)) return NextResponse.json({ ok: false, error: `invalid scope '${type}'` }, { status: 422 });
  const scope: AiosValueScope = { type, id: u.searchParams.get("id"), label: u.searchParams.get("label") ?? undefined };
  try {
    const snapshot = await getAiosValueSnapshot(scope);
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

/** Add (or upsert by id) a curated task-inventory item. Founder-gated — the inventory is a founder artifact. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = taskInventorySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const item = await addTaskToInventory(parsed.data);
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
