import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { authSessions } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { newId } from "@/lib/ids";
import { getSecretKey, readCookie, SESSION_COOKIE, verifyJwtOnly, type SessionClaims } from "@/lib/auth/edge";

/**
 * Chunk 02: Shared team auth + founder attribution.
 *
 * Model: ONE shared private login (a team password). On login the user picks WHICH founder
 * they act as; that founder is baked into a signed session token (jose JWT, HS256,
 * SESSION_SECRET) and recorded in auth_sessions (revocable, expiring). Server routes derive
 * the acting founder from the verified session instead of trusting a client-supplied name.
 *
 * Runtime split: edge.ts holds jose-only primitives for middleware; this file adds the
 * Node-only pieces (bcrypt + postgres): login, DB-backed verification, logout.
 */

export { SESSION_COOKIE, verifyJwtOnly, readCookie, type SessionClaims } from "@/lib/auth/edge";

export const AUTH_FOUNDERS = ["Moiz", "Ali", "Ibrahim", "Haad"] as const;
export type AuthFounder = (typeof AUTH_FOUNDERS)[number];
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Resolve the shared-login bcrypt hash from the environment.
 *
 * A bcrypt hash contains `$` signs (`$2b$12$…`). Next.js loads `.env` through dotenv +
 * dotenv-expand, which treats `$…` as variable interpolation and silently MANGLES the hash
 * (even single-quoting doesn't help — the quotes are stripped before expansion). To make setup
 * bullet-proof on any host/shell, the canonical form is base64 (`SHARED_LOGIN_PASSWORD_HASH_B64`),
 * which has no `$`. The raw `SHARED_LOGIN_PASSWORD_HASH` is still honored as a fallback (with
 * surrounding quotes stripped) for anyone who escaped it correctly.
 */
export function resolvePasswordHash(env: Record<string, string | undefined> = process.env): string | undefined {
  const b64 = env.SHARED_LOGIN_PASSWORD_HASH_B64?.trim();
  if (b64) {
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf8").trim();
      if (decoded) return decoded;
    } catch {
      /* fall through to the raw var */
    }
  }
  const raw = env.SHARED_LOGIN_PASSWORD_HASH?.replace(/^\s*['"]|['"]\s*$/g, "").trim();
  return raw || undefined;
}

export function isAuthConfigured(env: Record<string, string | undefined> = process.env): boolean {
  const hash = resolvePasswordHash(env);
  return Boolean(env.SESSION_SECRET && env.SESSION_SECRET.length >= 16 && hash && hash.startsWith("$2"));
}

export interface AuthStore {
  insertSession(row: { id: string; sessionTokenHash: string; status: string; expiresAt: Date }): Promise<void>;
  getSession(id: string): Promise<{ id: string; sessionTokenHash: string; status: string; expiresAt: Date } | null>;
  updateSession(id: string, fields: { status?: string; lastSeenAt?: Date }): Promise<void>;
}

export interface AuthDeps {
  store?: AuthStore;
  secret?: string;
  passwordHash?: string;
  now?: Date;
}

export interface LoginResult {
  token: string;
  founder: string;
  sid: string;
  expiresAt: Date;
}

/** Verify the shared password + chosen founder, mint a session token, and record it. */
export async function login(input: { password: string; founder: string }, deps: AuthDeps = {}): Promise<LoginResult> {
  const passwordHash = deps.passwordHash ?? resolvePasswordHash();
  if (!passwordHash) throw new Error("SHARED_LOGIN_PASSWORD_HASH is not configured");
  if (!(AUTH_FOUNDERS as readonly string[]).includes(input.founder)) throw new Error("unknown founder");

  const ok = await bcrypt.compare(input.password, passwordHash);
  if (!ok) throw new Error("invalid password");

  const now = deps.now ?? new Date();
  const sid = newId("session");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const token = await new SignJWT({ sid, founder: input.founder } satisfies SessionClaims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecretKey(deps.secret));

  const store = deps.store ?? defaultStore();
  await store.insertSession({ id: sid, sessionTokenHash: sha256(token), status: "active", expiresAt });
  return { token, founder: input.founder, sid, expiresAt };
}

/** Full verification: JWT + the session row must be active, unexpired, token-hash-matched. */
export async function verifySession(token: string, deps: AuthDeps = {}): Promise<SessionClaims | null> {
  const claims = await verifyJwtOnly(token, deps.secret);
  if (!claims) return null;
  const store = deps.store ?? defaultStore();
  const row = await store.getSession(claims.sid);
  if (!row || row.status !== "active") return null;
  const now = deps.now ?? new Date();
  if (row.expiresAt.getTime() <= now.getTime()) return null;
  if (row.sessionTokenHash !== sha256(token)) return null;
  return claims;
}

export async function logout(sid: string, deps: AuthDeps = {}): Promise<void> {
  const store = deps.store ?? defaultStore();
  await store.updateSession(sid, { status: "revoked" });
}

/** Read + verify the session from a Request's cookie (server routes). Returns the acting founder. */
export async function getSessionFromRequest(request: Request, deps: AuthDeps = {}): Promise<SessionClaims | null> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return null;
  return verifySession(token, deps);
}

/**
 * The acting founder for a mutating route. This is the ONLY trustworthy source of "who" — never
 * a client-supplied `actor`/`createdBy` field, which a caller could spoof to another founder.
 * Uses full DB-backed verifySession, so it also rejects revoked/expired sessions that the edge
 * proxy (JWT-only) would still let through.
 */
export async function getActingFounder(request: Request, deps: AuthDeps = {}): Promise<string | null> {
  const claims = await getSessionFromRequest(request, deps);
  return claims?.founder ?? null;
}

export function sessionCookie(token: string, opts: { secure?: boolean } = {}): string {
  const secure = opts.secure ?? process.env.NODE_ENV === "production";
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function defaultStore(db: Db = getDb()): AuthStore {
  return {
    async insertSession(row) {
      await db.insert(authSessions).values(row);
    },
    async getSession(id) {
      const rows = await db
        .select({ id: authSessions.id, sessionTokenHash: authSessions.sessionTokenHash, status: authSessions.status, expiresAt: authSessions.expiresAt })
        .from(authSessions)
        .where(eq(authSessions.id, id))
        .limit(1);
      return rows[0] ?? null;
    },
    async updateSession(id, fields) {
      await db.update(authSessions).set({ ...fields, updatedAt: new Date() }).where(eq(authSessions.id, id));
    },
  };
}
