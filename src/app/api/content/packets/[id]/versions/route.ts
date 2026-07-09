import { NextResponse } from "next/server";
import { z } from "zod";
import { addContentPacketVersion } from "@/lib/content";
import { contentPacketPatchSchema } from "@/lib/domain/content-command";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

const apiAddVersionSchema = z.object({
  patch: contentPacketPatchSchema,
  changeReason: z.string().trim().min(1).optional(),
  createdBy: z.string().trim().min(1, "createdBy is required"),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = apiAddVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  const { id } = await context.params;
  try {
    const result = await addContentPacketVersion({ contentPacketId: id, ...parsed.data, createdBy: auth });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const statusCode = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: statusCode });
  }
}
