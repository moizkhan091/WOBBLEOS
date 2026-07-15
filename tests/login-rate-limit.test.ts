import { describe, expect, it } from "vitest";
import { createLoginRateLimiter } from "@/lib/auth/rate-limit";

/** WOB-AUD-009: repeated failed logins from a client key are locked out for a cooldown. */
describe("login rate limiter", () => {
  it("locks out after maxAttempts failures and reports Retry-After", () => {
    let t = 1_000_000;
    const limiter = createLoginRateLimiter({ maxAttempts: 3, windowMs: 60_000, lockoutMs: 30_000 }, { now: () => t });
    const key = "1.2.3.4";
    expect(limiter.check(key).allowed).toBe(true);
    limiter.recordFailure(key);
    limiter.recordFailure(key);
    expect(limiter.check(key).allowed).toBe(true); // 2 failures — still allowed
    limiter.recordFailure(key); // 3rd failure trips the lockout
    const c = limiter.check(key);
    expect(c.allowed).toBe(false);
    expect(c.retryAfterSeconds).toBeGreaterThan(0);
    expect(c.retryAfterSeconds).toBeLessThanOrEqual(30);
  });

  it("clears the lockout after the cooldown elapses", () => {
    let t = 0;
    const limiter = createLoginRateLimiter({ maxAttempts: 2, windowMs: 60_000, lockoutMs: 10_000 }, { now: () => t });
    const key = "ip";
    limiter.recordFailure(key);
    limiter.recordFailure(key);
    expect(limiter.check(key).allowed).toBe(false);
    t += 10_001;
    expect(limiter.check(key).allowed).toBe(true);
  });

  it("a successful login resets the counter", () => {
    let t = 0;
    const limiter = createLoginRateLimiter({ maxAttempts: 3, windowMs: 60_000, lockoutMs: 10_000 }, { now: () => t });
    const key = "ip";
    limiter.recordFailure(key);
    limiter.recordFailure(key);
    limiter.recordSuccess(key);
    limiter.recordFailure(key); // counter restarted → not locked
    expect(limiter.check(key).allowed).toBe(true);
  });

  it("isolates client keys", () => {
    let t = 0;
    const limiter = createLoginRateLimiter({ maxAttempts: 1, windowMs: 60_000, lockoutMs: 10_000 }, { now: () => t });
    limiter.recordFailure("attacker");
    expect(limiter.check("attacker").allowed).toBe(false);
    expect(limiter.check("innocent").allowed).toBe(true);
  });
});
