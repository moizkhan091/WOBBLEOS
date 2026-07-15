import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { authSessions, founderProfiles } from "@/db/schema";
import { isSessionError, requireSuperAdmin } from "@/lib/auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/accounts — the founder account roster, super-admin only.
 *
 * Never selects `password_hash`: the roster exists to administer accounts, and a hash has no business
 * crossing the wire even to an admin.
 */
export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  const session = await requireSuperAdmin(request);
  if (isSessionError(session)) return session;

  const db = getDb();
  const rows = await db
    .select({
      id: founderProfiles.id,
      displayName: founderProfiles.displayName,
      email: founderProfiles.email,
      role: founderProfiles.role,
      status: founderProfiles.status,
      isSuperAdmin: founderProfiles.isSuperAdmin,
      passwordSet: sql<boolean>`(${founderProfiles.passwordHash} is not null)`,
      passwordChangedAt: founderProfiles.passwordChangedAt,
      lastLoginAt: founderProfiles.lastLoginAt,
      activeSessions: sql<number>`(
        select count(*)::int from ${authSessions}
        where ${authSessions.founderId} = ${founderProfiles.id}
          and ${authSessions.status} = 'active'
          and ${authSessions.expiresAt} > now()
      )`,
    })
    .from(founderProfiles)
    .orderBy(desc(founderProfiles.isSuperAdmin), founderProfiles.displayName);

  return NextResponse.json({ ok: true, accounts: rows });
}
