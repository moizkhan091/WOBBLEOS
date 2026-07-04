import { NextResponse } from "next/server";
import { z } from "zod";
import { listFeedbackEvents, recordFeedbackEvent } from "@/lib/taste";
import { feedbackEventInputSchema } from "@/lib/domain/taste";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  profileKey: z.string().trim().min(1).optional(),
  targetType: z.string().trim().min(1).optional(),
  targetId: z.string().trim().min(1).optional(),
  actor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().optional(),
});

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }
  const events = await listFeedbackEvents(parsed.data);
  return NextResponse.json({ ok: true, events });
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = feedbackEventInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await recordFeedbackEvent(parsed.data);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
