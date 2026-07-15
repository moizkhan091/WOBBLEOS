import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { and, eq } from "drizzle-orm";
import { authSessions, founderProfiles } from "@/db/schema";
import { getDb, type Db } from "@/db";
import { newId } from "@/lib/ids";
import { getSecretKey, readCookie, SESSION_COOKIE, verifyJwtOnly, type SessionClaims } from "@/lib/auth/edge";

/**
 * Founder auth — one real account per founder.
 *
 * Model: each founder has their OWN row in `founder_profiles` carrying `email` + `passwordHash`.
 * Login takes (email, password) and the acting founder is derived from THAT account — the caller
 * never names who they are. (The previous model was one shared team password plus a founder
 * dropdown, which meant anyone holding the password could act as any founder.)
 *
 * Identity is baked into a signed session token (jose JWT, HS256, SESSION_SECRET) and recorded in
 * `auth_sessions` with its `founderId`, so sessions are revocable per founder. `status` on the
 * account gates login AND live sessions: disabling an account rejects its next request.
 *
 * Runtime split: edge.ts holds jose-only primitives for the edge proxy; this file adds the Node-only
 * pieces (bcrypt + postgres).
 */

export { SESSION_COOKIE, verifyJwtOnly, readCookie, type SessionClaims } from "@/lib/auth/edge";

/**
 * The founders the OS attributes work to. This is display/reporting metadata (org metrics, taste
 * profiles) — it is NOT an authorization list. Whether someone may log in is decided solely by an
 * active `founder_profiles` row with a password hash.
 */
export const AUTH_FOUNDERS = ["Moiz", "Ali", "Ibrahim", "Haad"] as const;
export type AuthFounder = (typeof AUTH_FOUNDERS)[number];
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const BCRYPT_ROUNDS = 12;
/** Minimum length for a founder password. Enforced on bootstrap and on self-service change. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * A bcrypt hash of a throwaway value. When an email doesn't resolve to an account we still run a
 * bcrypt comparison against this, so a bad-email login costs the same time as a bad-password login
 * and the endpoint can't be used to enumerate which founder emails exist.
 */
const DUMMY_HASH = bcrypt.hashSync("wobble-os-nonexistent-account", BCRYPT_ROUNDS);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Auth requires only a session secret now. Founder credentials live in Postgres (per-account bcrypt
 * hashes set by `npm run auth:bootstrap`), never in the environment — so there is no shared password
 * hash to configure, mangle, or leak through a deploy env file.
 */
export function isAuthConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.SESSION_SECRET && env.SESSION_SECRET.length >= 16);
}

export interface FounderAccount {
  id: string;
  displayName: string;
  email: string | null;
  passwordHash: string | null;
  status: string;
  isSuperAdmin: boolean;
}

export interface SessionRow {
  id: string;
  founderId: string | null;
  sessionTokenHash: string;
  status: string;
  expiresAt: Date;
}

export interface AuthStore {
  insertSession(row: { id: string; founderId: string; sessionTokenHash: string; status: string; expiresAt: Date }): Promise<void>;
  getSession(id: string): Promise<SessionRow | null>;
  updateSession(id: string, fields: { status?: string; lastSeenAt?: Date }): Promise<void>;
  /** Look up a login account by normalized email. */
  getAccountByEmail(email: string): Promise<FounderAccount | null>;
  getAccountById(id: string): Promise<FounderAccount | null>;
  revokeSessionsForFounder(founderId: string): Promise<number>;
  setAccountStatus(founderId: string, status: string): Promise<void>;
  setAccountPassword(founderId: string, passwordHash: string, changedAt: Date): Promise<void>;
  markLogin(founderId: string, at: Date): Promise<void>;
}

export interface AuthDeps {
  store?: AuthStore;
  secret?: string;
  now?: Date;
}

export interface LoginResult {
  token: string;
  founder: string;
  founderId: string;
  isSuperAdmin: boolean;
  sid: string;
  expiresAt: Date;
}

/** Raised for any credential failure. Deliberately opaque — never says whether the email exists. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super("invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

/** Raised when the credentials are right but the account is switched off. */
export class AccountDisabledError extends Error {
  constructor() {
    super("this founder account is disabled");
    this.name = "AccountDisabledError";
  }
}

/**
 * Authenticate a founder by their OWN email + password, then mint a session bound to that account.
 *
 * The acting founder is taken from the account row, so it cannot be influenced by the request body.
 */
export async function login(input: { email: string; password: string }, deps: AuthDeps = {}): Promise<LoginResult> {
  const store = deps.store ?? defaultStore();
  const email = normalizeEmail(input.email);
  const account = await store.getAccountByEmail(email);

  // Always compare against SOME hash so a missing account and a wrong password are indistinguishable
  // in both result and timing.
  const hash = account?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await bcrypt.compare(input.password, hash);
  if (!account || !account.passwordHash || !passwordOk) throw new InvalidCredentialsError();

  // Check status only AFTER the password verifies, so "disabled" can't be probed anonymously.
  if (account.status !== "active") throw new AccountDisabledError();

  const now = deps.now ?? new Date();
  const sid = newId("session");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const token = await new SignJWT({
    sid,
    founder: account.displayName,
    fid: account.id,
    sa: account.isSuperAdmin,
  } satisfies SessionClaims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecretKey(deps.secret));

  await store.insertSession({ id: sid, founderId: account.id, sessionTokenHash: sha256(token), status: "active", expiresAt });
  await store.markLogin(account.id, now).catch(() => {});
  return { token, founder: account.displayName, founderId: account.id, isSuperAdmin: account.isSuperAdmin, sid, expiresAt };
}

/**
 * Full verification: the JWT must be valid AND the session row active/unexpired/token-hash-matched
 * AND the owning account still active. The account check is what makes "disable this founder" take
 * effect on existing sessions instead of only at next login.
 */
export async function verifySession(token: string, deps: AuthDeps = {}): Promise<SessionClaims | null> {
  const claims = await verifyJwtOnly(token, deps.secret);
  if (!claims) return null;
  const store = deps.store ?? defaultStore();
  const row = await store.getSession(claims.sid);
  if (!row || row.status !== "active") return null;
  const now = deps.now ?? new Date();
  if (row.expiresAt.getTime() <= now.getTime()) return null;
  if (row.sessionTokenHash !== sha256(token)) return null;

  const account = await store.getAccountById(claims.fid);
  if (!account || account.status !== "active") return null;
  // Trust the CURRENT account row over the token for identity — a renamed or de-privileged founder
  // must not keep old attribution/privilege for the life of a 30-day token.
  return { sid: claims.sid, founder: account.displayName, fid: account.id, sa: account.isSuperAdmin };
}

export async function logout(sid: string, deps: AuthDeps = {}): Promise<void> {
  const store = deps.store ?? defaultStore();
  await store.updateSession(sid, { status: "revoked" });
}

/** Revoke every session belonging to ONE founder. Other founders' sessions are untouched. */
export async function revokeFounderSessions(founderId: string, deps: AuthDeps = {}): Promise<number> {
  const store = deps.store ?? defaultStore();
  return store.revokeSessionsForFounder(founderId);
}

/**
 * Disable/enable an account. Disabling also revokes its live sessions so access stops immediately
 * rather than at token expiry.
 */
export async function setFounderStatus(founderId: string, status: "active" | "disabled", deps: AuthDeps = {}): Promise<void> {
  const store = deps.store ?? defaultStore();
  await store.setAccountStatus(founderId, status);
  if (status === "disabled") await store.revokeSessionsForFounder(founderId);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  return null;
}

/**
 * Self-service password change. Requires the CURRENT password (so a stolen session alone cannot
 * lock the real founder out), and revokes the founder's other sessions afterwards.
 */
export async function changePassword(
  input: { founderId: string; currentPassword: string; newPassword: string; keepSid?: string },
  deps: AuthDeps = {},
): Promise<void> {
  const store = deps.store ?? defaultStore();
  const account = await store.getAccountById(input.founderId);
  if (!account?.passwordHash) throw new InvalidCredentialsError();

  const ok = await bcrypt.compare(input.currentPassword, account.passwordHash);
  if (!ok) throw new InvalidCredentialsError();

  const weak = validatePasswordStrength(input.newPassword);
  if (weak) throw new Error(weak);

  const now = deps.now ?? new Date();
  await store.setAccountPassword(input.founderId, await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS), now);
  // A password change invalidates every other session for this founder (classic credential-rotation
  // semantics); the caller's own session is preserved so they aren't logged out mid-action.
  await store.revokeSessionsForFounder(input.founderId);
  if (input.keepSid) await store.updateSession(input.keepSid, { status: "active" });
}

/** Read + verify the session from a Request's cookie (server routes). */
export async function getSessionFromRequest(request: Request, deps: AuthDeps = {}): Promise<SessionClaims | null> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return null;
  return verifySession(token, deps);
}

/**
 * The acting founder for a mutating route. This is the ONLY trustworthy source of "who" — never a
 * client-supplied `actor`/`createdBy` field, which a caller could set to another founder. Uses the
 * full DB-backed verifySession, so it also rejects revoked/expired sessions and disabled accounts
 * that the edge proxy (JWT-only) would still let through.
 */
export async function getActingFounder(request: Request, deps: AuthDeps = {}): Promise<string | null> {
  const claims = await getSessionFromRequest(request, deps);
  return claims?.founder ?? null;
}

export function sessionCookie(token: string, opts: { secure?: boolean } = {}): string {
  // Secure in production, EXCEPT when an explicit test-only override disables it. The E2E browser gate
  // runs the production build over http://127.0.0.1, where a `Secure` cookie is accepted by the browser
  // (secure context) but NOT replayed by Playwright's APIRequestContext — so authed API reads would 401.
  // `SESSION_COOKIE_INSECURE=1` (set ONLY by the E2E harness, never in real deploys) issues a non-secure
  // cookie so both the browser and the API-request context authenticate. Defaults to secure.
  const secure = opts.secure ?? (process.env.SESSION_COOKIE_INSECURE === "1" ? false : process.env.NODE_ENV === "production");
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

const ACCOUNT_COLUMNS = {
  id: founderProfiles.id,
  displayName: founderProfiles.displayName,
  email: founderProfiles.email,
  passwordHash: founderProfiles.passwordHash,
  status: founderProfiles.status,
  isSuperAdmin: founderProfiles.isSuperAdmin,
};

export function defaultStore(db: Db = getDb()): AuthStore {
  return {
    async insertSession(row) {
      await db.insert(authSessions).values(row);
    },
    async getSession(id) {
      const rows = await db
        .select({
          id: authSessions.id,
          founderId: authSessions.founderId,
          sessionTokenHash: authSessions.sessionTokenHash,
          status: authSessions.status,
          expiresAt: authSessions.expiresAt,
        })
        .from(authSessions)
        .where(eq(authSessions.id, id))
        .limit(1);
      return rows[0] ?? null;
    },
    async updateSession(id, fields) {
      await db.update(authSessions).set({ ...fields, updatedAt: new Date() }).where(eq(authSessions.id, id));
    },
    async getAccountByEmail(email) {
      const rows = await db.select(ACCOUNT_COLUMNS).from(founderProfiles).where(eq(founderProfiles.email, email)).limit(1);
      return rows[0] ?? null;
    },
    async getAccountById(id) {
      const rows = await db.select(ACCOUNT_COLUMNS).from(founderProfiles).where(eq(founderProfiles.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async revokeSessionsForFounder(founderId) {
      const rows = await db
        .update(authSessions)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(and(eq(authSessions.founderId, founderId), eq(authSessions.status, "active")))
        .returning({ id: authSessions.id });
      return rows.length;
    },
    async setAccountStatus(founderId, status) {
      await db.update(founderProfiles).set({ status, updatedAt: new Date() }).where(eq(founderProfiles.id, founderId));
    },
    async setAccountPassword(founderId, passwordHash, changedAt) {
      await db
        .update(founderProfiles)
        .set({ passwordHash, passwordChangedAt: changedAt, updatedAt: changedAt })
        .where(eq(founderProfiles.id, founderId));
    },
    async markLogin(founderId, at) {
      await db.update(founderProfiles).set({ lastLoginAt: at }).where(eq(founderProfiles.id, founderId));
    },
  };
}
