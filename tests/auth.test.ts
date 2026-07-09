import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { login, verifySession, verifyJwtOnly, logout, isAuthConfigured, resolvePasswordHash, type AuthStore } from "@/lib/auth";

const SECRET = "test-secret-at-least-16-chars-long";
const passwordHash = bcrypt.hashSync("team-pw", 4);
const now = new Date("2026-07-09T12:00:00.000Z");

function makeStore() {
  const sessions = new Map<string, { id: string; sessionTokenHash: string; status: string; expiresAt: Date }>();
  const store: AuthStore = {
    insertSession: async (row) => void sessions.set(row.id, row),
    getSession: async (id) => sessions.get(id) ?? null,
    updateSession: async (id, fields) => {
      const s = sessions.get(id);
      if (s) sessions.set(id, { ...s, ...fields });
    },
  };
  return { store, sessions };
}

describe("auth login", () => {
  it("issues a session for the right password + a known founder", async () => {
    const { store, sessions } = makeStore();
    const res = await login({ password: "team-pw", founder: "Moiz" }, { store, secret: SECRET, passwordHash, now });
    expect(res.founder).toBe("Moiz");
    expect(res.token.split(".")).toHaveLength(3); // a JWT
    expect(sessions.size).toBe(1);
  });

  it("rejects a wrong password", async () => {
    const { store } = makeStore();
    await expect(login({ password: "nope", founder: "Moiz" }, { store, secret: SECRET, passwordHash, now })).rejects.toThrow(/invalid password/);
  });

  it("rejects an unknown founder", async () => {
    const { store } = makeStore();
    await expect(login({ password: "team-pw", founder: "Hacker" }, { store, secret: SECRET, passwordHash, now })).rejects.toThrow(/unknown founder/);
  });
});

describe("session verification", () => {
  it("verifies a fresh session and returns the acting founder", async () => {
    const { store } = makeStore();
    const res = await login({ password: "team-pw", founder: "Ali" }, { store, secret: SECRET, passwordHash, now });
    const claims = await verifySession(res.token, { store, secret: SECRET, now });
    expect(claims).toMatchObject({ founder: "Ali", sid: res.sid });
  });

  it("rejects a revoked (logged-out) session", async () => {
    const { store } = makeStore();
    const res = await login({ password: "team-pw", founder: "Moiz" }, { store, secret: SECRET, passwordHash, now });
    await logout(res.sid, { store });
    expect(await verifySession(res.token, { store, secret: SECRET, now })).toBeNull();
  });

  it("rejects an expired session", async () => {
    const { store } = makeStore();
    const res = await login({ password: "team-pw", founder: "Moiz" }, { store, secret: SECRET, passwordHash, now });
    const later = new Date(now.getTime() + 40 * 24 * 60 * 60 * 1000); // past the 30d TTL
    // jose exp is also enforced; both the JWT and the DB row should reject.
    expect(await verifySession(res.token, { store, secret: SECRET, now: later })).toBeNull();
  });

  it("rejects a tampered / wrong-secret token", async () => {
    const { store } = makeStore();
    const res = await login({ password: "team-pw", founder: "Moiz" }, { store, secret: SECRET, passwordHash, now });
    expect(await verifyJwtOnly(res.token, "a-totally-different-secret-key")).toBeNull();
    expect(await verifyJwtOnly(res.token + "x", SECRET)).toBeNull();
  });
});

describe("isAuthConfigured", () => {
  it("is true only with a secret + a bcrypt hash", () => {
    expect(isAuthConfigured({ SESSION_SECRET: SECRET, SHARED_LOGIN_PASSWORD_HASH: passwordHash })).toBe(true);
    expect(isAuthConfigured({ SESSION_SECRET: SECRET, SHARED_LOGIN_PASSWORD_HASH: "not-a-hash" })).toBe(false);
    expect(isAuthConfigured({})).toBe(false);
  });

  it("accepts a base64-encoded hash (SHARED_LOGIN_PASSWORD_HASH_B64)", () => {
    const b64 = Buffer.from(passwordHash, "utf8").toString("base64");
    expect(isAuthConfigured({ SESSION_SECRET: SECRET, SHARED_LOGIN_PASSWORD_HASH_B64: b64 })).toBe(true);
  });
});

// Regression: a bcrypt hash's `$` signs get mangled by dotenv-expand in .env. The base64 var
// (SHARED_LOGIN_PASSWORD_HASH_B64) is the mangle-proof canonical form. These lock in resolution.
describe("resolvePasswordHash", () => {
  it("decodes the base64 var back to the exact bcrypt hash", () => {
    const b64 = Buffer.from(passwordHash, "utf8").toString("base64");
    expect(resolvePasswordHash({ SHARED_LOGIN_PASSWORD_HASH_B64: b64 })).toBe(passwordHash);
  });

  it("prefers the base64 var over the raw var", () => {
    const b64 = Buffer.from(passwordHash, "utf8").toString("base64");
    expect(resolvePasswordHash({ SHARED_LOGIN_PASSWORD_HASH_B64: b64, SHARED_LOGIN_PASSWORD_HASH: "junk" })).toBe(passwordHash);
  });

  it("strips surrounding quotes from the raw fallback var", () => {
    expect(resolvePasswordHash({ SHARED_LOGIN_PASSWORD_HASH: `'${passwordHash}'` })).toBe(passwordHash);
    expect(resolvePasswordHash({ SHARED_LOGIN_PASSWORD_HASH: `"${passwordHash}"` })).toBe(passwordHash);
  });

  it("returns undefined when neither var is set", () => {
    expect(resolvePasswordHash({})).toBeUndefined();
  });

  it("lets login authenticate using only the base64 var", async () => {
    const { store } = makeStore();
    const b64 = Buffer.from(passwordHash, "utf8").toString("base64");
    const prev = process.env.SHARED_LOGIN_PASSWORD_HASH_B64;
    process.env.SHARED_LOGIN_PASSWORD_HASH_B64 = b64;
    try {
      const res = await login({ password: "team-pw", founder: "Moiz" }, { store, secret: SECRET, now });
      expect(res.founder).toBe("Moiz");
    } finally {
      if (prev === undefined) delete process.env.SHARED_LOGIN_PASSWORD_HASH_B64;
      else process.env.SHARED_LOGIN_PASSWORD_HASH_B64 = prev;
    }
  });
});
