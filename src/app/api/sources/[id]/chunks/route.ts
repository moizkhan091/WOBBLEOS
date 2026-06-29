import { NextResponse } from "next/server";
import { z } from "zod";
import { attachSourceChunks, listSourceChunks } from "@/lib/sources";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

const attachChunksSchema = z.object({
  chunks: z.array(z.string().trim().min(1)).min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

/**
 * GET /api/sources/[id]/chunks
 * Read source chunks for the source detail page and workers.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");

  try {
    const chunks = await listSourceChunks(id, { limit: limitParam !== null ? Number(limitParam) : undefined });
    return NextResponse.json({ ok: true, count: chunks.length, chunks });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/sources/[id]/chunks
 * Attach parsed chunks to an approved source. Pending sources are rejected.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = attachChunksSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const chunks = await attachSourceChunks({ sourceId: id, ...parsed.data });
    return NextResponse.json({ ok: true, count: chunks.length, chunks }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = message.includes("not found") ? 404 : message.includes("must be approved") ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
