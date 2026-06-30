import { NextResponse } from "next/server";
import { listContentTracks, updateContentTrack } from "@/lib/content";
import { updateContentTrackSchema } from "@/lib/domain/content-command";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { id } = await context.params;
  try {
    const tracks = await listContentTracks({ limit: 200 });
    const track = tracks.find((item) => item.id === id);
    if (!track) return NextResponse.json({ ok: false, error: `content track '${id}' not found` }, { status: 404 });
    return NextResponse.json({ ok: true, track });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = updateContentTrackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await updateContentTrack(id, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const statusCode = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: statusCode });
  }
}
