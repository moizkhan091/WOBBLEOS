import { NextResponse } from "next/server";
import { z } from "zod";
import { mergeMemoryRecords } from "@/lib/memory";

export const dynamic = "force-dynamic";

const schema = z.object({
  sourceIds: z.array(z.string().trim().min(1)).min(2),
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  area: z.string().trim().min(1).optional(),
  memoryTier: z.enum(["core", "working", "episodic"]).optional(),
  trustLevel: z.enum(["founder_core", "approved_expert", "monitored", "experimental", "blocked"]).optional(),
  bankSlugs: z.array(z.string().trim().min(1)).optional(),
  actor: z.string().trim().min(1),
});

/** POST /api/memory/merge — merge several memories into one; sources are archived. */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  try {
    const record = await mergeMemoryRecords(parsed.data);
    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = /personal memory bank/i.test(message) ? 403 : /not found/i.test(message) ? 404 : /requires/i.test(message) ? 422 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
