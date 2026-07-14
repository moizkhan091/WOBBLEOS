import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureTasteProfile, listTasteProfiles } from "@/lib/taste";
import { TASTE_PROFILE_SCOPES } from "@/lib/domain/taste";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

const createProfileSchema = z.object({
  scope: z.enum(TASTE_PROFILE_SCOPES),
  subjectId: z.string().trim().min(1).optional(),
  profileKey: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1),
  hardConstraints: z.array(z.string().trim().min(1)).default([]),
  preferenceWeights: z.record(z.string(), z.number()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

function limitFrom(url: URL): number | undefined {
  const raw = url.searchParams.get("limit");
  return raw ? Number(raw) : undefined;
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const url = new URL(request.url);
  const scopeRaw = url.searchParams.get("scope");
  const scope = TASTE_PROFILE_SCOPES.includes(scopeRaw as (typeof TASTE_PROFILE_SCOPES)[number]) ? (scopeRaw as (typeof TASTE_PROFILE_SCOPES)[number]) : undefined;
  const profiles = await listTasteProfiles({
    scope,
    subjectId: url.searchParams.get("subjectId") ?? undefined,
    limit: limitFrom(url),
  });
  return NextResponse.json({ ok: true, profiles });
}

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

  const parsed = createProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const profile = await ensureTasteProfile(parsed.data);
    return NextResponse.json({ ok: true, profile }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
