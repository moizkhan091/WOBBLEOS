import { NextResponse } from "next/server";
import { z } from "zod";
import { INTELLIGENCE_SCOPES, INTELLIGENCE_TASKS } from "@/lib/domain/intelligence";
import { buildApprovedIntelligenceContext } from "@/lib/intelligence";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

const contextRequestSchema = z.object({
  task: z.enum(INTELLIGENCE_TASKS),
  scope: z.enum(INTELLIGENCE_SCOPES).default("wobble"),
  clientId: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(200).optional(),
});

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = contextRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const context = await buildApprovedIntelligenceContext(parsed.data);
    return NextResponse.json({ ok: true, ...context });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
