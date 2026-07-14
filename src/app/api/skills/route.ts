import { NextResponse } from "next/server";
import { createPromptSkill, listPromptSkills } from "@/lib/prompt-skills";
import { createPromptSkillSchema, PROMPT_SKILL_STATUSES } from "@/lib/domain/prompt-skills";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/** GET /api/skills - list skills. Filters: module, slug, status, limit. */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limitParam = searchParams.get("limit");

  try {
    const skills = await listPromptSkills({
      module: searchParams.get("module") ?? undefined,
      slug: searchParams.get("slug") ?? undefined,
      status: PROMPT_SKILL_STATUSES.includes(status as never) ? (status as never) : undefined,
      limit: limitParam !== null ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ ok: true, count: skills.length, skills });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}

/** POST /api/skills - create a new skill (version 1, draft) + approval. */
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

  const parsed = createPromptSkillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await createPromptSkill(parsed.data);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
