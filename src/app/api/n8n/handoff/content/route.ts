import { NextResponse } from "next/server";
import { sendApprovedContentToN8n } from "@/lib/n8n";
import { sendContentHandoffSchema } from "@/lib/domain/n8n-handoff";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return dbUnavailable();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = sendContentHandoffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const result = await sendApprovedContentToN8n(parsed.data);
    const statusCode = result.status === "duplicate" ? 200 : result.status === "failed" ? 502 : 202;
    return NextResponse.json({ ok: result.status !== "failed", ...result }, { status: statusCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const statusCode =
      message.includes("not found") ||
      message.includes("disabled") ||
      message.includes("approved") ||
      message.includes("quality")
        ? 422
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status: statusCode });
  }
}
