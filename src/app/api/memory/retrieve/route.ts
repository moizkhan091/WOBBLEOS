import { NextResponse } from "next/server";
import { z } from "zod";
import { retrieveMemoryContext } from "@/lib/memory";
import { MEMORY_TIERS, MEMORY_TRUST_LEVELS } from "@/lib/domain/memory";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

const retrieveSchema = z.object({
  query: z.string().trim().min(1),
  queryMode: z.enum(["current", "historical", "include_archived"]).default("current"),
  tiers: z.array(z.enum(MEMORY_TIERS)).optional(),
  trustLevels: z.array(z.enum(MEMORY_TRUST_LEVELS)).optional(),
  bankSlugs: z.array(z.string().trim().min(1)).optional(),
  limit: z.number().int().positive().optional(),
});

/**
 * POST /api/memory/retrieve
 * Retrieve ranked, metadata-rich memory context for Ask WOBBLE/workers.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = retrieveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const chunks = await retrieveMemoryContext(parsed.data);
    return NextResponse.json({ ok: true, count: chunks.length, chunks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: message.includes("query is required") ? 422 : 500 });
  }
}
