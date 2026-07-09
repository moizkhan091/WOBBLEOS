import { NextResponse } from "next/server";
import { z } from "zod";
import { restoreMemoryRecord } from "@/lib/memory";

export const dynamic = "force-dynamic";

const restoreSchema = z.object({ restoredBy: z.string().trim().min(1) });

/** POST /api/memory/records/[id]/restore — un-archive a soft-deleted memory. Audited. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = restoreSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  try {
    await restoreMemoryRecord({ id, ...parsed.data });
    return NextResponse.json({ ok: true, status: "active" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = /personal memory bank/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
