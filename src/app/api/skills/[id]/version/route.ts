import { NextResponse } from "next/server";
import { proposeSkillVersion } from "@/lib/prompt-skills";
import { proposeSkillVersionSchema } from "@/lib/domain/prompt-skills";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/** POST /api/skills/[id]/version - propose a new version of an existing skill (-> approval). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = proposeSkillVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await proposeSkillVersion(id, parsed.data);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: message.includes("not found") ? 404 : 500 });
  }
}
