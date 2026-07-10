import { NextResponse } from "next/server";
import { askWobble, askWobbleSchema } from "@/lib/ask";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

/**
 * POST /api/ask — Ask WOBBLE. Answers from approved Brain + sources with
 * citations, confidence, and founder-judgment flags.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = askWobbleSchema.omit({ founder: true }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  try {
    const result = await askWobble({ ...parsed.data, founder: auth });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
