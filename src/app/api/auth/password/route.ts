import { NextResponse } from "next/server";
import { z } from "zod";
import { changePassword, InvalidCredentialsError } from "@/lib/auth";
import { isSessionError, requireSession } from "@/lib/auth/route";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) });

/**
 * POST /api/auth/password — change YOUR OWN password.
 *
 * The founder is taken from the session, so this endpoint can only ever change the caller's own
 * credential — there is no `founderId` parameter to point at someone else. The current password is
 * required as well, so a hijacked session alone cannot lock the real founder out.
 */
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const session = await requireSession(request);
  if (isSessionError(session)) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });

  try {
    await changePassword({
      founderId: session.fid,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      keepSid: session.sid, // don't log the caller out of the session they're using
    });
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return NextResponse.json({ ok: false, error: "current password is incorrect" }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "password change failed";
    // validatePasswordStrength failures are the caller's fault, not a server error.
    return NextResponse.json({ ok: false, error: message }, { status: /at least/.test(message) ? 422 : 500 });
  }

  await writeAuditEvent({
    eventType: "auth.password_changed",
    module: "auth",
    entityType: "founder_profile",
    entityId: session.fid,
    actor: session.founder,
    surface: "api",
    metadata: { sid: session.sid },
  }).catch(() => {});

  return NextResponse.json({ ok: true, otherSessionsRevoked: true });
}
