import { NextResponse } from "next/server";
import { sendApprovedContentToN8n } from "@/lib/n8n";
import { sendContentHandoffSchema } from "@/lib/domain/n8n-handoff";
import { requireFounder, isAuthError } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

function dbUnavailable() {
  return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });
}

/**
 * POST /api/n8n/handoff/content — triggers an authenticated OUTBOUND dispatch to a DB-configured n8n
 * endpoint. This is a privileged action (it invokes an external URL with an approved content packet), so
 * it requires a founder session (WOB-AUD-005) and it is NOT public at the edge. `requestedBy` is bound to
 * the authenticated founder — never trusted from the client body.
 */
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

  const parsed = sendContentHandoffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    // Bind the requester to the authenticated founder (defense against a spoofed actor in the body).
    const result = await sendApprovedContentToN8n({ ...parsed.data, requestedBy: auth });
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
