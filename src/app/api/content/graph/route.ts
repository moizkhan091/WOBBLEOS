import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueContentGraphJob } from "@/lib/content-graph";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  contentTrackId: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  platformFocus: z.array(z.string().trim().min(1)).optional(),
  formatFocus: z.array(z.string().trim().min(1)).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

/**
 * POST /api/content/graph — run the multi-agent content graph (Strategy → Research →
 * Copywriting → Scoring → Assemble) for a track. Async job; the acting founder comes from
 * the verified session, never the client body.
 */
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
    const job = await enqueueContentGraphJob({ ...parsed.data, requestedBy: auth });
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
