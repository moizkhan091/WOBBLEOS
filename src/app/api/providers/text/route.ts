import { NextResponse } from "next/server";
import { z } from "zod";
import { runTextProvider } from "@/lib/providers";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

const textProviderSchema = z.object({
  role: z.string().trim().min(1),
  module: z.string().trim().min(1),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string().trim().min(1),
    }),
  ).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  linkedEntityType: z.string().trim().min(1).optional(),
  linkedEntityId: z.string().trim().min(1).optional(),
});

/**
 * POST /api/providers/text
 * Run a text provider by model role. Used by Ask WOBBLE/Content workers.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = textProviderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }
  // Gate the raw LLM proxy — it spends the OpenRouter key; only founders may call it directly.
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  try {
    const result = await runTextProvider(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status =
      message.includes("not configured") || message.includes("disabled") || message.includes("not allowed") ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
