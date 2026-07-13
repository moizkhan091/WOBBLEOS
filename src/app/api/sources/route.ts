import { NextResponse } from "next/server";
import { z } from "zod";
import { createSource, listSources } from "@/lib/sources";
import { addSourceSchema, sourceFileInputSchema, SOURCE_APPROVAL_STATUSES, SOURCE_RECORD_STATUSES } from "@/lib/domain/sources";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

const apiCreateSourceSchema = addSourceSchema.extend({
  file: sourceFileInputSchema.extend({ path: z.string().trim().min(1) }).optional(),
});

/**
 * GET /api/sources
 * List sources. Filters: approvalStatus, status, trustLevel, sourceType, limit.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const approvalStatus = searchParams.get("approvalStatus");
  const status = searchParams.get("status");

  try {
    const items = await listSources({
      approvalStatus: SOURCE_APPROVAL_STATUSES.includes(approvalStatus as never)
        ? (approvalStatus as never)
        : undefined,
      status: SOURCE_RECORD_STATUSES.includes(status as never) ? (status as never) : undefined,
      trustLevel: searchParams.get("trustLevel") ?? undefined,
      sourceType: searchParams.get("sourceType") ?? undefined,
      limit: limitParam !== null ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ ok: true, count: items.length, sources: items });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/sources
 * Create a source and its founder approval item. New sources always start pending.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = apiCreateSourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    // EARNED AUTONOMY: a source.activation grant (scoped) AUTO-ACTIVATES the source instead of holding it for a
    // founder approval — source activation is reversible, so a grant genuinely releases it. No grant → pending.
    const result = await createSource(parsed.data, { enforceAutonomy: true });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const statusCode = message.includes("unsupported") || message.includes("unknown source trust level") ? 422 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: statusCode });
  }
}
