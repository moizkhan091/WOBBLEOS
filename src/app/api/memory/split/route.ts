import { NextResponse } from "next/server";
import { z } from "zod";
import { splitMemoryRecord } from "@/lib/memory";

export const dynamic = "force-dynamic";

const schema = z.object({
  recordId: z.string().trim().min(1),
  parts: z.array(z.object({ title: z.string().trim().min(1), content: z.string().trim().min(1) })).min(2),
  actor: z.string().trim().min(1),
});

/** POST /api/memory/split — split one memory into several; the original is archived. */
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
    const records = await splitMemoryRecord(parsed.data);
    return NextResponse.json({ ok: true, records }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = /personal memory bank/i.test(message) ? 403 : /not found/i.test(message) ? 404 : /requires/i.test(message) ? 422 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
