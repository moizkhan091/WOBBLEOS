import { NextResponse } from "next/server";
import { isAuthError, requireFounder } from "@/lib/auth/route";
import { mergeCompanies, suggestDuplicates } from "@/lib/client-merge";
import { mergeRequestSchema } from "@/lib/domain/client-merge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/crm/duplicates — likely twin containers, with the evidence for each.
 * POST /api/crm/duplicates — merge one into the other. Never automatic, never destructive: the loser
 *      is archived with a pointer to the winner.
 */

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;
  try {
    return NextResponse.json({ ok: true, duplicates: await suggestDuplicates() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = mergeRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "validation failed" }, { status: 422 });

  try {
    return NextResponse.json({ ok: true, ...(await mergeCompanies({ ...parsed.data, actor: auth })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: /not found|already been merged/.test(message) ? 422 : 500 });
  }
}
