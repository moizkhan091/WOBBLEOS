import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { founderProfiles } from "@/db/schema";
import { revokeFounderSessions, setFounderStatus } from "@/lib/auth";
import { isSessionError, requireSuperAdmin } from "@/lib/auth/route";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["disable", "enable", "revoke_sessions"]) });

/**
 * POST /api/auth/accounts/[id]/action — super-admin account control.
 *
 *   disable          switch the account off and revoke its live sessions
 *   enable           switch it back on (does NOT restore revoked sessions — they must log in again)
 *   revoke_sessions  force re-login without disabling the account
 *
 * Each action affects exactly ONE founder: `revokeFounderSessions` filters on `auth_sessions.founder_id`,
 * so other founders' sessions are untouched.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const session = await requireSuperAdmin(request);
  if (isSessionError(session)) return session;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });

  const db = getDb();
  const rows = await db
    .select({ id: founderProfiles.id, displayName: founderProfiles.displayName, isSuperAdmin: founderProfiles.isSuperAdmin })
    .from(founderProfiles)
    .where(eq(founderProfiles.id, id))
    .limit(1);
  const target = rows[0];
  if (!target) return NextResponse.json({ ok: false, error: "no such founder account" }, { status: 404 });

  // Guard against the admin locking themselves out and leaving the OS with no administrator.
  if (parsed.data.action === "disable" && target.id === session.fid) {
    return NextResponse.json({ ok: false, error: "you cannot disable your own account" }, { status: 409 });
  }

  let revoked = 0;
  if (parsed.data.action === "disable") {
    await setFounderStatus(id, "disabled");
    revoked = 1; // setFounderStatus revokes as part of disabling
  } else if (parsed.data.action === "enable") {
    await setFounderStatus(id, "active");
  } else {
    revoked = await revokeFounderSessions(id);
  }

  await writeAuditEvent({
    eventType: `auth.account_${parsed.data.action}`,
    module: "auth",
    entityType: "founder_profile",
    entityId: id,
    actor: session.founder, // the ADMIN who did it, from their session — not a request field
    surface: "api",
    metadata: { targetFounder: target.displayName, action: parsed.data.action },
  }).catch(() => {});

  return NextResponse.json({ ok: true, action: parsed.data.action, founder: target.displayName, sessionsRevoked: revoked });
}
