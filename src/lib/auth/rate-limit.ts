/**
 * Login rate limiting + lockout (WOB-AUD-009).
 *
 * The shared founder login is a deliberate product decision (one team password; the caller picks which
 * founder they act as — see docs). To reduce online brute-force against that single secret, failed login
 * attempts from a client key (IP) are counted in a sliding window; after `maxAttempts` failures the key is
 * locked out for `lockoutMs`. A successful login clears the counter. In-memory + per-process (the deploy
 * is a single app container); injectable clock/store keep it unit-testable and let a future deploy swap in
 * a shared store. This is defense-in-depth, not a replacement for per-user identities/MFA (see the doc).
 */

export interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
}

export const DEFAULT_LOGIN_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 8, // failures allowed within the window before lockout
  windowMs: 15 * 60_000, // 15 min sliding window
  lockoutMs: 15 * 60_000, // locked out for 15 min once tripped
};

interface Entry {
  fails: number;
  windowStart: number;
  lockedUntil: number;
}

export interface RateCheck {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface LoginRateLimiter {
  check(key: string): RateCheck;
  recordFailure(key: string): void;
  recordSuccess(key: string): void;
  /** test/maintenance helper */
  reset(key?: string): void;
}

export function createLoginRateLimiter(
  config: RateLimitConfig = DEFAULT_LOGIN_RATE_LIMIT,
  deps: { now?: () => number } = {},
): LoginRateLimiter {
  const now = deps.now ?? (() => Date.now());
  const store = new Map<string, Entry>();

  function current(key: string): Entry {
    const e = store.get(key);
    const t = now();
    if (!e || t - e.windowStart > config.windowMs) {
      const fresh: Entry = { fails: 0, windowStart: t, lockedUntil: e?.lockedUntil ?? 0 };
      store.set(key, fresh);
      return fresh;
    }
    return e;
  }

  return {
    check(key) {
      const e = store.get(key);
      const t = now();
      if (e && e.lockedUntil > t) {
        return { allowed: false, retryAfterSeconds: Math.ceil((e.lockedUntil - t) / 1000) };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
    recordFailure(key) {
      const e = current(key);
      e.fails += 1;
      if (e.fails >= config.maxAttempts) {
        e.lockedUntil = now() + config.lockoutMs;
        e.fails = 0;
        e.windowStart = now();
      }
    },
    recordSuccess(key) {
      store.delete(key);
    },
    reset(key) {
      if (key) store.delete(key);
      else store.clear();
    },
  };
}

/** Process-wide singleton used by the login route. */
export const loginRateLimiter = createLoginRateLimiter();

/** Best-effort client key from proxy headers (the app sits behind a TLS reverse proxy). */
export function clientKeyFromRequest(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
