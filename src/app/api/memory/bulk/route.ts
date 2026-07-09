import { NextResponse } from "next/server";
import { z } from "zod";
import { bulkMemoryOperation } from "@/lib/memory";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

const schema = z.object({
  recordIds: z.array(z.string().trim().min(1)).min(1).max(200),
  operation: z.enum(["archive", "restore", "pin", "unpin"]),
  actor: z.string().trim().min(1).optional(),
  reason: z.string().trim().min(1).optional(),
});

/** POST /api/memory/bulk — apply archive/restore/pin/unpin to many memories at once. */
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
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    const result = await bulkMemoryOperation({ ...parsed.data, actor: auth });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
