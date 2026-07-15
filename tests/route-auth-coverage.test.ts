import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Route authorization coverage guard (WOB-AUD-004, extended for reads by WOB-UAT-029).
 *
 * Statically proves that EVERY API handler — mutating AND reading — either enforces a DB-backed
 * session gate (which rejects revoked/expired sessions and disabled accounts — the edge proxy is
 * JWT-only and would still let a revoked token through) OR is on an explicit, reviewed PUBLIC
 * allowlist (routes that authenticate by their own HMAC signature, probes an orchestrator must reach
 * unauthenticated, or the login surface itself). A NEW unguarded route fails this test.
 *
 * READS were originally out of scope, and that omission was not theoretical. Proven live during the
 * local UAT campaign: after Moiz revoked Ali's sessions, Ali's revoked cookie got 401 on
 * `POST /api/memory/records` and **200 with real data** on `GET /api/memory` — including a private
 * canary out of Moiz's personal bank. Revocation that only stops writes is not revocation; a departed
 * or compromised founder kept read access for the 30-day JWT lifetime. A read gate is therefore a
 * security control of exactly the same standing as a write gate, and is enforced here as one.
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
 * Public-by-design READ routes (WOB-UAT-029). Deliberately much shorter than the set of reads that
 * were unguarded when this was written (39 of 105) — the rest were genuine exposure, not design.
 * Each entry must justify why a DB-backed session is not required:
 *
 *  - `health/*` — liveness/readiness probes. An orchestrator has no founder session, and gating these
 *    would make the stack unschedulable. They report status only, never business data.
 *  - `auth/session` — answers "am I logged in?" and must be reachable when the answer is no.
 *  - `public/media/[id]` — public by design (unguessable 122-bit id; assessed under WOB-UAT-016).
 */
const PUBLIC_READ_ROUTES = new Set<string>([
  "health/route.ts",
  "health/ready/route.ts",
  "health/web/route.ts",
  "health/worker/route.ts",
  "health/video-worker/route.ts",
  "health/storage/route.ts",
  "health/n8n/route.ts",
  "health/version/route.ts",
  "auth/session/route.ts",
  "public/media/[id]/route.ts",
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
const READ_EXPORT = /export\s+(?:async\s+function|const)\s+(GET|HEAD)\b/g;

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

  it("every read route enforces a DB-backed session gate or is an explicitly-allowlisted public read", () => {
    const unguarded: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const methods = [...src.matchAll(READ_EXPORT)].map((m) => m[1]);
      if (methods.length === 0) continue; // mutation-only route — covered by the test above
      const key = relKey(file);
      if (PUBLIC_READ_ROUTES.has(key)) continue;
      if (SESSION_GATES.some((gate) => src.includes(gate))) continue;
      unguarded.push(`${key} [${[...new Set(methods)].join(",")}]`);
    }
    expect(
      unguarded,
      `these read routes neither call a session gate (${SESSION_GATES.join("/")}) nor are allow-listed public.\n` +
        `A revoked session still reads them (the edge proxy is JWT-signature-only) — see WOB-UAT-029:\n${unguarded.join("\n")}`,
    ).toEqual([]);
  });

  it("the public READ allowlist has no stale entries", () => {
    for (const key of PUBLIC_READ_ROUTES) {
      const full = path.join(API_ROOT, key);
      expect(() => statSync(full), `allowlisted read route ${key} no longer exists`).not.toThrow();
    }
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
