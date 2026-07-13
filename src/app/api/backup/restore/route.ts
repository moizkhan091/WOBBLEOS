import { NextResponse } from "next/server";
import { z } from "zod";
import { restoreSnapshot, type BackupSnapshot } from "@/lib/backup";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  snapshot: z.object({
    generatedAt: z.string().optional(),
    version: z.string(),
    data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
    truncated: z.array(z.string()).optional(),
  }),
  mode: z.enum(["dry_run", "apply"]).default("dry_run"),
  tables: z.array(z.string()).optional(),
});

/**
 * POST /api/backup/restore — founder-gated. ADDITIVE + NON-DESTRUCTIVE restore: only inserts rows whose id is
 * missing; never deletes or overwrites. Defaults to `dry_run` (reports what WOULD be inserted, writes nothing);
 * pass `mode:"apply"` to perform the additive insert.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  try {
    const result = await restoreSnapshot(parsed.data.snapshot as BackupSnapshot, { mode: parsed.data.mode, tables: parsed.data.tables, actor: auth });
    if (!result.ok) return NextResponse.json({ ok: false, error: "snapshot validation failed", errors: result.errors }, { status: 422 });
    const { ok: _ok, ...rest } = result;
    return NextResponse.json({ ok: true, ...rest });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
