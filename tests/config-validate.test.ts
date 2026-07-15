import { describe, expect, it, vi } from "vitest";
import { validateRuntimeConfig, assertRuntimeConfig } from "@/lib/config/validate";

// A well-formed bcrypt hash shape ($2b$…) so isAuthConfigured passes.
const HASH = "$2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTU12345678";
const goodWeb = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://u:p@db:5432/wobble",
  SESSION_SECRET: "0123456789abcdef0123",
  SHARED_LOGIN_PASSWORD_HASH: HASH,
  STORAGE_ROOT: "/app/storage",
  PUBLIC_BASE_URL: "https://os.example.com",
};

describe("validateRuntimeConfig (WOB-AUD-017)", () => {
  it("passes a fully-configured production web env", () => {
    const r = validateRuntimeConfig(goodWeb, { context: "web" });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("errors in production on missing DATABASE_URL and unconfigured auth", () => {
    const r = validateRuntimeConfig({ NODE_ENV: "production" }, { context: "web" });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("DATABASE_URL"))).toBe(true);
    expect(r.errors.some((e) => e.toLowerCase().includes("auth"))).toBe(true);
  });

  it("warns (not errors) on missing durable storage + public base url", () => {
    const r = validateRuntimeConfig({ ...goodWeb, STORAGE_ROOT: "", PUBLIC_BASE_URL: "" }, { context: "web" });
    expect(r.ok).toBe(true); // soft config → warnings only
    expect(r.warnings.some((w) => w.includes("STORAGE_ROOT"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("PUBLIC_BASE_URL"))).toBe(true);
  });

  it("does not require web auth for the worker context", () => {
    const r = validateRuntimeConfig({ NODE_ENV: "production", DATABASE_URL: goodWeb.DATABASE_URL, STORAGE_ROOT: "/app/storage", PUBLIC_BASE_URL: "https://x" }, { context: "worker" });
    expect(r.ok).toBe(true);
  });

  it("downgrades hard errors to warnings outside production", () => {
    const r = validateRuntimeConfig({ NODE_ENV: "development" }, { context: "web" });
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("assertRuntimeConfig throws on hard errors and logs", () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    expect(() => assertRuntimeConfig({ NODE_ENV: "production" }, { context: "web" }, log)).toThrowError(/invalid runtime configuration/);
    expect(log.error).toHaveBeenCalled();
  });

  it("assertRuntimeConfig returns cleanly on a good env", () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    const r = assertRuntimeConfig(goodWeb, { context: "web" }, log);
    expect(r.ok).toBe(true);
    expect(log.error).not.toHaveBeenCalled();
  });
});
