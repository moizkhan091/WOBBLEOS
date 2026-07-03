import { NextResponse } from "next/server";
import { routeMemoryPlacement } from "@/lib/memory";
import { memoryBankRoutingInputSchema } from "@/lib/domain/memory";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/**
 * POST /api/memory/route-placement
 * Suggest memory bank placement for extracted knowledge. This only proposes;
 * founder approval is still required before memory is stored.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = memoryBankRoutingInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const suggestion = await routeMemoryPlacement(parsed.data);
    return NextResponse.json({ ok: true, suggestion });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
