import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { verifySession } from "@/lib/auth";

/**
 * A founder rotated their password, opened a tab, and saw the OS shell with "Guest" in the corner.
 * No data was served (every API verifies against the database on each request, and nothing is
 * server-rendered) but the PAGE returned 200, which is indistinguishable from a breach to the person
 * looking at it.
 *
 * Cause: the edge proxy can only check a JWT's signature and expiry, because the edge runtime has no
 * database, so a revoked session's cookie stayed valid-looking for the rest of its 30-day life.
 *
 * These pin the check the page render now performs. They exercise verifySession directly, since that
 * is the function the server layout calls and the only thing that can see a revocation.
 */
const SECRET = "test-secret-at-least-32-characters-long!!";
const FID = "founder_moiz";
const SID = "session_test";

async function tokenFor(sid = SID, expiresAt = new Date(Date.now() + 86_400_000)) {
  return new SignJWT({ sid, founder: "Moiz", fid: FID, sa: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(SECRET));
}

function storeWith(session: Partial<{ id: string; status: string; expiresAt: Date; sessionTokenHash: string; founderId: string }>, accountStatus = "active") {
  return {
    getSession: async () => (session ? { id: SID, founderId: FID, status: "active", expiresAt: new Date(Date.now() + 86_400_000), sessionTokenHash: "", ...session } : null),
    getAccountById: async () => ({ id: FID, displayName: "Moiz", email: "moiz@example.com", status: accountStatus, isSuperAdmin: true, passwordHash: "x" }),
  } as never;
}

describe("a revoked session must not pass the page gate", () => {
  it("refuses a session the database says is revoked, even though the token is perfectly signed", async () => {
    const token = await tokenFor();
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(token).digest("hex");
    const revoked = await verifySession(token, { secret: SECRET, store: storeWith({ status: "revoked", sessionTokenHash: hash }) });
    expect(revoked).toBeNull();
  });

  it("accepts the same token while the session is genuinely active", async () => {
    const token = await tokenFor();
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(token).digest("hex");
    const ok = await verifySession(token, { secret: SECRET, store: storeWith({ status: "active", sessionTokenHash: hash }) });
    expect(ok?.fid).toBe(FID);
  });

  it("refuses when the session row has expired, whatever the token says", async () => {
    const token = await tokenFor();
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(token).digest("hex");
    const stale = await verifySession(token, { secret: SECRET, store: storeWith({ status: "active", expiresAt: new Date(Date.now() - 1000), sessionTokenHash: hash }) });
    expect(stale).toBeNull();
  });

  it("refuses a token whose hash does not match the stored session", async () => {
    // Someone minting their own token against a leaked signing secret still fails here.
    const token = await tokenFor();
    const forged = await verifySession(token, { secret: SECRET, store: storeWith({ status: "active", sessionTokenHash: "some-other-hash" }) });
    expect(forged).toBeNull();
  });

  it("refuses when the founder account itself has been disabled", async () => {
    const token = await tokenFor();
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(token).digest("hex");
    const disabled = await verifySession(token, { secret: SECRET, store: storeWith({ status: "active", sessionTokenHash: hash }, "disabled") });
    expect(disabled).toBeNull();
  });

  it("refuses a token signed with the wrong secret", async () => {
    const token = await tokenFor();
    expect(await verifySession(token, { secret: "a-completely-different-secret-32chars!!", store: storeWith({ status: "active" }) })).toBeNull();
  });
});
