import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Route authorization coverage guard (WOB-AUD-004).
 *
 * Statically proves that EVERY mutating API handler (POST/PUT/PATCH/DELETE) either enforces a
 * DB-backed session via `requireFounder` (which rejects revoked/expired sessions — the edge proxy is
 * JWT-only and would still let a revoked token through) OR is on an explicit, reviewed PUBLIC allowlist
 * (routes that authenticate by their own HMAC signature, or the login surface itself). A NEW unguarded
 * mutation route fails this test — so the revoked-session gap cannot silently regress.
 */

const API_ROOT = path.join(process.cwd(), "src", "app", "api");

// Public-by-design mutation routes. Each authenticates by a mechanism OTHER than a founder session, or
// IS the login surface. Anything here must justify why a founder session is not required.
const PUBLIC_MUTATION_ROUTES = new Set<string>([
  "auth/login/route.ts", // establishes the session (password + founder)
  "auth/logout/route.ts", // clears the caller's own session
  "auth/session/route.ts", // reads/refreshes the caller's own session
  "webhooks/intelligence/route.ts", // raw-body HMAC verified
  "webhooks/zernio/route.ts", // raw-body HMAC verified
  "n8n/callback/route.ts", // timestamped raw-body HMAC verified
]);

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

  it("every mutation route enforces requireFounder or is an explicitly-allowlisted public route", () => {
    const unguarded: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const methods = [...src.matchAll(MUTATION_EXPORT)].map((m) => m[1]);
      if (methods.length === 0) continue; // read-only route (GET/HEAD only)
      const key = relKey(file);
      if (PUBLIC_MUTATION_ROUTES.has(key)) continue;
      // A guarded route references requireFounder (the DB-backed session/authorization gate).
      if (src.includes("requireFounder")) continue;
      unguarded.push(`${key} [${[...new Set(methods)].join(",")}]`);
    }
    expect(unguarded, `these mutation routes neither call requireFounder nor are allow-listed public:\n${unguarded.join("\n")}`).toEqual([]);
  });

  it("the public allowlist has no stale entries", () => {
    for (const key of PUBLIC_MUTATION_ROUTES) {
      const full = path.join(API_ROOT, key);
      expect(() => statSync(full), `allowlisted route ${key} no longer exists`).not.toThrow();
    }
  });
});
