import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Route authorization coverage guard (WOB-AUD-004).
 *
 * Statically proves that EVERY mutating API handler (POST/PUT/PATCH/DELETE) either enforces a
 * DB-backed session gate (which rejects revoked/expired sessions and disabled accounts — the edge proxy
 * is JWT-only and would still let a revoked token through) OR is on an explicit, reviewed PUBLIC
 * allowlist (routes that authenticate by their own HMAC signature, or the login surface itself). A NEW
 * unguarded mutation route fails this test — so the revoked-session gap cannot silently regress.
 */

const API_ROOT = path.join(process.cwd(), "src", "app", "api");

// Public-by-design mutation routes. Each authenticates by a mechanism OTHER than a founder session, or
// IS the login surface. Anything here must justify why a founder session is not required.
const PUBLIC_MUTATION_ROUTES = new Set<string>([
  "auth/login/route.ts", // establishes the session (a founder's own email + password)
  "auth/logout/route.ts", // clears the caller's own session
  "auth/session/route.ts", // reads/refreshes the caller's own session
  "webhooks/intelligence/route.ts", // raw-body HMAC verified
  "webhooks/zernio/route.ts", // raw-body HMAC verified
  "n8n/callback/route.ts", // timestamped raw-body HMAC verified
]);

/**
 * The accepted gates. All three resolve the caller through the SAME DB-backed `verifySession`, so all
 * three reject revoked/expired sessions and disabled accounts:
 *   requireFounder    → the acting founder's name (what most routes need)
 *   requireSession    → the full verified session (routes that need the account id, e.g. change my password)
 *   requireSuperAdmin → requireSession + the super-admin check (strictly stronger; account administration)
 * A route using any of them is guarded. Anything else is not.
 */
const SESSION_GATES = ["requireFounder", "requireSession", "requireSuperAdmin"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

const MUTATION_EXPORT = /export\s+(?:async\s+function|const)\s+(POST|PUT|PATCH|DELETE)\b/g;

function relKey(file: string): string {
  return path.relative(API_ROOT, file).split(path.sep).join("/");
}

describe("route authorization coverage (WOB-AUD-004)", () => {
  const files = walk(API_ROOT);

  it("finds API routes to scan", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("every mutation route enforces a DB-backed session gate or is an explicitly-allowlisted public route", () => {
    const unguarded: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const methods = [...src.matchAll(MUTATION_EXPORT)].map((m) => m[1]);
      if (methods.length === 0) continue; // read-only route (GET/HEAD only)
      const key = relKey(file);
      if (PUBLIC_MUTATION_ROUTES.has(key)) continue;
      if (SESSION_GATES.some((gate) => src.includes(gate))) continue;
      unguarded.push(`${key} [${[...new Set(methods)].join(",")}]`);
    }
    expect(
      unguarded,
      `these mutation routes neither call a session gate (${SESSION_GATES.join("/")}) nor are allow-listed public:\n${unguarded.join("\n")}`,
    ).toEqual([]);
  });

  it("account administration is super-admin gated, not merely founder gated", () => {
    // Disabling a founder / revoking their sessions is not something any founder may do to another.
    // requireFounder alone would be too weak here, so assert the stronger gate explicitly.
    const src = readFileSync(path.join(API_ROOT, "auth", "accounts", "[id]", "action", "route.ts"), "utf8");
    expect(src).toContain("requireSuperAdmin");
  });

  it("the public allowlist has no stale entries", () => {
    for (const key of PUBLIC_MUTATION_ROUTES) {
      const full = path.join(API_ROOT, key);
      expect(() => statSync(full), `allowlisted route ${key} no longer exists`).not.toThrow();
    }
  });
});
