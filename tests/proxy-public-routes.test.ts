import { describe, expect, it } from "vitest";
import { isPublic } from "@/proxy";

/**
 * Edge auth gate public-route matching (WOB-AUD-005 + WOB-AUD-020).
 * Only the narrowly-defined public routes are open; the n8n registry/handoff and any sibling-prefix
 * route require a session.
 */
describe("proxy isPublic", () => {
  it("keeps the login, auth, health, webhooks, public-media, and n8n CALLBACK routes public", () => {
    for (const p of [
      "/login",
      "/api/auth/login",
      "/api/auth/session",
      "/api/health",
      "/api/health/ready",
      "/api/webhooks/zernio",
      "/api/n8n/callback",
      "/api/public/media/abc",
      "/_next/static/chunk.js",
      "/favicon.ico",
      "/robots.txt",
    ]) {
      expect(isPublic(p), `${p} should be public`).toBe(true);
    }
  });

  it("does NOT expose the n8n registry or outbound handoff (WOB-AUD-005)", () => {
    expect(isPublic("/api/n8n")).toBe(false);
    expect(isPublic("/api/n8n/handoff/content")).toBe(false);
  });

  it("does NOT make a sibling prefix public (WOB-AUD-020)", () => {
    expect(isPublic("/api/n8nSomething")).toBe(false);
    expect(isPublic("/api/n8n-admin")).toBe(false);
    expect(isPublic("/api/authorizations")).toBe(false); // sibling of /api/auth
    expect(isPublic("/api/healthzzz")).toBe(false); // sibling of /api/health
  });

  it("keeps ordinary API + app routes private", () => {
    for (const p of ["/api/tasks", "/api/connections", "/api/memory/records", "/dashboard", "/"]) {
      expect(isPublic(p), `${p} should be private`).toBe(false);
    }
  });
});
