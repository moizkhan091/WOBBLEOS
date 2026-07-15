import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import {
  AccountDisabledError,
  InvalidCredentialsError,
  changePassword,
  isAuthConfigured,
  login,
  logout,
  revokeFounderSessions,
  setFounderStatus,
  verifyJwtOnly,
  verifySession,
  type AuthStore,
  type FounderAccount,
  type SessionRow,
} from "@/lib/auth";

/**
 * Founder auth — separate accounts.
 *
 * The property under test throughout: the acting founder comes from the AUTHENTICATED ACCOUNT and
 * nothing else. There is no longer any request-supplied founder to spoof, and one founder's account
 * state (disabled, revoked, rotated password) must never affect another's.
 */

const SECRET = "test-secret-at-least-16-chars-long";
const now = new Date("2026-07-09T12:00:00.000Z");

const PASSWORDS = { moiz: "moiz-password-123", ali: "ali-password-456" };

function makeStore() {
  const sessions = new Map<string, SessionRow>();
  const accounts = new Map<string, FounderAccount>([
    [
      "founder_moiz",
      { id: "founder_moiz", displayName: "Moiz", email: "moiz@wobble.local", passwordHash: bcrypt.hashSync(PASSWORDS.moiz, 4), status: "active", isSuperAdmin: true },
    ],
    [
      "founder_ali",
      { id: "founder_ali", displayName: "Ali", email: "ali@wobble.local", passwordHash: bcrypt.hashSync(PASSWORDS.ali, 4), status: "active", isSuperAdmin: false },
    ],
    [
      "founder_nopass",
      { id: "founder_nopass", displayName: "Ibrahim", email: "ibrahim@wobble.local", passwordHash: null, status: "active", isSuperAdmin: false },
    ],
  ]);

  const store: AuthStore = {
    insertSession: async (row) => void sessions.set(row.id, row),
    getSession: async (id) => sessions.get(id) ?? null,
    updateSession: async (id, fields) => {
      const s = sessions.get(id);
      if (s) sessions.set(id, { ...s, ...fields });
    },
    getAccountByEmail: async (email) => [...accounts.values()].find((a) => a.email === email) ?? null,
    getAccountById: async (id) => accounts.get(id) ?? null,
    revokeSessionsForFounder: async (founderId) => {
      let n = 0;
      for (const [id, s] of sessions) {
        if (s.founderId === founderId && s.status === "active") {
          sessions.set(id, { ...s, status: "revoked" });
          n++;
        }
      }
      return n;
    },
    setAccountStatus: async (founderId, status) => {
      const a = accounts.get(founderId);
      if (a) accounts.set(founderId, { ...a, status });
    },
    setAccountPassword: async (founderId, passwordHash) => {
      const a = accounts.get(founderId);
      if (a) accounts.set(founderId, { ...a, passwordHash });
    },
    markLogin: async () => {},
  };
  return { store, sessions, accounts };
}

const deps = (store: AuthStore) => ({ store, secret: SECRET, now });

describe("login", () => {
  it("authenticates a founder with their OWN email + password", async () => {
    const { store, sessions } = makeStore();
    const res = await login({ email: "moiz@wobble.local", password: PASSWORDS.moiz }, deps(store));
    expect(res.founder).toBe("Moiz");
    expect(res.founderId).toBe("founder_moiz");
    expect(res.isSuperAdmin).toBe(true);
    expect(res.token.split(".")).toHaveLength(3); // a JWT
    expect(sessions.size).toBe(1);
  });

  it("binds the session row to the authenticated founder (enables per-founder revocation)", async () => {
    const { store, sessions } = makeStore();
    const res = await login({ email: "ali@wobble.local", password: PASSWORDS.ali }, deps(store));
    expect(sessions.get(res.sid)?.founderId).toBe("founder_ali");
  });

  it("is case-insensitive on email", async () => {
    const { store } = makeStore();
    const res = await login({ email: "  MOIZ@Wobble.Local  ", password: PASSWORDS.moiz }, deps(store));
    expect(res.founder).toBe("Moiz");
  });

  it("rejects a wrong password", async () => {
    const { store } = makeStore();
    await expect(login({ email: "moiz@wobble.local", password: "nope" }, deps(store))).rejects.toThrow(InvalidCredentialsError);
  });

  it("rejects an unknown email with the SAME error as a wrong password (no account enumeration)", async () => {
    const { store } = makeStore();
    const unknown = await login({ email: "ghost@wobble.local", password: "whatever" }, deps(store)).catch((e) => e);
    const wrongPw = await login({ email: "moiz@wobble.local", password: "nope" }, deps(store)).catch((e) => e);
    expect(unknown).toBeInstanceOf(InvalidCredentialsError);
    expect(wrongPw).toBeInstanceOf(InvalidCredentialsError);
    expect(unknown.message).toBe(wrongPw.message);
  });

  it("refuses an account that has no password set", async () => {
    const { store } = makeStore();
    await expect(login({ email: "ibrahim@wobble.local", password: "" }, deps(store))).rejects.toThrow(InvalidCredentialsError);
  });

  it("refuses a disabled account even with the correct password", async () => {
    const { store } = makeStore();
    await setFounderStatus("founder_ali", "disabled", { store });
    await expect(login({ email: "ali@wobble.local", password: PASSWORDS.ali }, deps(store))).rejects.toThrow(AccountDisabledError);
  });
});

/**
 * The headline requirement: one founder must not be able to act as another. Under the old shared
 * password + founder dropdown this was trivially violated.
 */
describe("founder isolation", () => {
  it("Ali's credentials can only ever produce an Ali session", async () => {
    const { store } = makeStore();
    const res = await login({ email: "ali@wobble.local", password: PASSWORDS.ali }, deps(store));
    const claims = await verifySession(res.token, deps(store));
    expect(claims?.founder).toBe("Ali");
    expect(claims?.fid).toBe("founder_ali");
    expect(claims?.sa).toBe(false); // and Ali does not inherit Moiz's super-admin
  });

  it("Moiz's password cannot open Ali's account", async () => {
    const { store } = makeStore();
    await expect(login({ email: "ali@wobble.local", password: PASSWORDS.moiz }, deps(store))).rejects.toThrow(InvalidCredentialsError);
  });

  it("there is no request field that can change who you are", async () => {
    const { store } = makeStore();
    // Cast through unknown to simulate a hostile caller smuggling extra fields — the shape the OLD
    // model accepted. login() must ignore them entirely and attribute to the credential owner.
    const hostile = { email: "ali@wobble.local", password: PASSWORDS.ali, founder: "Moiz", actor: "Moiz", fid: "founder_moiz", sa: true } as unknown as {
      email: string;
      password: string;
    };
    const res = await login(hostile, deps(store));
    expect(res.founder).toBe("Ali");
    expect(res.founderId).toBe("founder_ali");
    expect(res.isSuperAdmin).toBe(false);
    const claims = await verifySession(res.token, deps(store));
    expect(claims?.founder).toBe("Ali");
  });

  it("simultaneous founder sessions stay independent", async () => {
    const { store } = makeStore();
    const a = await login({ email: "moiz@wobble.local", password: PASSWORDS.moiz }, deps(store));
    const b = await login({ email: "ali@wobble.local", password: PASSWORDS.ali }, deps(store));
    expect((await verifySession(a.token, deps(store)))?.founder).toBe("Moiz");
    expect((await verifySession(b.token, deps(store)))?.founder).toBe("Ali");
  });
});

describe("session verification", () => {
  it("verifies a fresh session and returns the acting founder", async () => {
    const { store } = makeStore();
    const res = await login({ email: "ali@wobble.local", password: PASSWORDS.ali }, deps(store));
    expect(await verifySession(res.token, deps(store))).toMatchObject({ founder: "Ali", sid: res.sid, fid: "founder_ali" });
  });

  it("rejects a revoked (logged-out) session", async () => {
    const { store } = makeStore();
    const res = await login({ email: "moiz@wobble.local", password: PASSWORDS.moiz }, deps(store));
    await logout(res.sid, { store });
    expect(await verifySession(res.token, deps(store))).toBeNull();
  });

  it("rejects an expired session", async () => {
    const { store } = makeStore();
    const res = await login({ email: "moiz@wobble.local", password: PASSWORDS.moiz }, deps(store));
    const later = new Date(now.getTime() + 40 * 24 * 60 * 60 * 1000); // past the 30d TTL
    expect(await verifySession(res.token, { store, secret: SECRET, now: later })).toBeNull();
  });

  it("rejects a tampered / wrong-secret token", async () => {
    const { store } = makeStore();
    const res = await login({ email: "moiz@wobble.local", password: PASSWORDS.moiz }, deps(store));
    expect(await verifyJwtOnly(res.token, "a-totally-different-secret-key")).toBeNull();
    expect(await verifyJwtOnly(res.token + "x", SECRET)).toBeNull();
  });

  it("rejects a live session the moment its account is disabled (not at token expiry)", async () => {
    const { store } = makeStore();
    const res = await login({ email: "ali@wobble.local", password: PASSWORDS.ali }, deps(store));
    expect(await verifySession(res.token, deps(store))).not.toBeNull();
    await setFounderStatus("founder_ali", "disabled", { store });
    expect(await verifySession(res.token, deps(store))).toBeNull();
  });

  it("reflects the CURRENT account row, not the identity frozen in the token", async () => {
    const { store, accounts } = makeStore();
    const res = await login({ email: "moiz@wobble.local", password: PASSWORDS.moiz }, deps(store));
    expect((await verifySession(res.token, deps(store)))?.sa).toBe(true);
    // De-privilege the account; the 30-day token still claims sa:true.
    accounts.set("founder_moiz", { ...accounts.get("founder_moiz")!, isSuperAdmin: false, displayName: "Moiz K" });
    const claims = await verifySession(res.token, deps(store));
    expect(claims?.sa).toBe(false);
    expect(claims?.founder).toBe("Moiz K");
  });
});

describe("per-founder session control", () => {
  it("revoking one founder's sessions leaves other founders signed in", async () => {
    const { store } = makeStore();
    const moiz1 = await login({ email: "moiz@wobble.local", password: PASSWORDS.moiz }, deps(store));
    const moiz2 = await login({ email: "moiz@wobble.local", password: PASSWORDS.moiz }, deps(store));
    const ali = await login({ email: "ali@wobble.local", password: PASSWORDS.ali }, deps(store));

    const revoked = await revokeFounderSessions("founder_moiz", { store });
    expect(revoked).toBe(2); // both of Moiz's, and only Moiz's

    expect(await verifySession(moiz1.token, deps(store))).toBeNull();
    expect(await verifySession(moiz2.token, deps(store))).toBeNull();
    expect((await verifySession(ali.token, deps(store)))?.founder).toBe("Ali");
  });

  it("disabling one account does not disable the others", async () => {
    const { store } = makeStore();
    const ali = await login({ email: "ali@wobble.local", password: PASSWORDS.ali }, deps(store));
    await setFounderStatus("founder_ali", "disabled", { store });

    expect(await verifySession(ali.token, deps(store))).toBeNull();
    // Moiz is entirely unaffected and can still log in.
    const moiz = await login({ email: "moiz@wobble.local", password: PASSWORDS.moiz }, deps(store));
    expect((await verifySession(moiz.token, deps(store)))?.founder).toBe("Moiz");
  });

  it("re-enabling an account does NOT resurrect its revoked sessions", async () => {
    const { store } = makeStore();
    const ali = await login({ email: "ali@wobble.local", password: PASSWORDS.ali }, deps(store));
    await setFounderStatus("founder_ali", "disabled", { store });
    await setFounderStatus("founder_ali", "active", { store });
    expect(await verifySession(ali.token, deps(store))).toBeNull(); // must log in again
    await expect(login({ email: "ali@wobble.local", password: PASSWORDS.ali }, deps(store))).resolves.toMatchObject({ founder: "Ali" });
  });
});

describe("password change", () => {
  it("requires the current password", async () => {
    const { store } = makeStore();
    await expect(
      changePassword({ founderId: "founder_moiz", currentPassword: "wrong", newPassword: "a-brand-new-password" }, { store, now }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("enforces a minimum length", async () => {
    const { store } = makeStore();
    await expect(
      changePassword({ founderId: "founder_moiz", currentPassword: PASSWORDS.moiz, newPassword: "short" }, { store, now }),
    ).rejects.toThrow(/at least/);
  });

  it("rotates the credential: the old password stops working, the new one works", async () => {
    const { store } = makeStore();
    await changePassword({ founderId: "founder_moiz", currentPassword: PASSWORDS.moiz, newPassword: "a-brand-new-password" }, { store, now });
    await expect(login({ email: "moiz@wobble.local", password: PASSWORDS.moiz }, deps(store))).rejects.toThrow(InvalidCredentialsError);
    await expect(login({ email: "moiz@wobble.local", password: "a-brand-new-password" }, deps(store))).resolves.toMatchObject({ founder: "Moiz" });
  });

  it("revokes the founder's other sessions but keeps the caller's own", async () => {
    const { store } = makeStore();
    const stale = await login({ email: "moiz@wobble.local", password: PASSWORDS.moiz }, deps(store));
    const mine = await login({ email: "moiz@wobble.local", password: PASSWORDS.moiz }, deps(store));
    const ali = await login({ email: "ali@wobble.local", password: PASSWORDS.ali }, deps(store));

    await changePassword(
      { founderId: "founder_moiz", currentPassword: PASSWORDS.moiz, newPassword: "a-brand-new-password", keepSid: mine.sid },
      { store, now },
    );

    expect(await verifySession(stale.token, deps(store))).toBeNull(); // other session dropped
    expect((await verifySession(mine.token, deps(store)))?.founder).toBe("Moiz"); // caller stays in
    expect((await verifySession(ali.token, deps(store)))?.founder).toBe("Ali"); // other founder untouched
  });
});

describe("isAuthConfigured", () => {
  it("requires only a session secret — credentials live in Postgres, not the env", () => {
    expect(isAuthConfigured({ SESSION_SECRET: SECRET })).toBe(true);
    expect(isAuthConfigured({ SESSION_SECRET: "too-short" })).toBe(false);
    expect(isAuthConfigured({})).toBe(false);
  });
});
