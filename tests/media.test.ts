import { describe, expect, it } from "vitest";
import { validateMediaRequest, resolveMediaProvider, canTransitionMediaJob, canRetryMediaJob, dispatchDecision, falConfigured, type MediaProviderAdapter } from "@/lib/domain/media";

/** Media Studio provider-independent core (Phase 10): validation, budget, lifecycle, credential-gating. */
const falOn: MediaProviderAdapter = { slug: "fal", configured: () => true };
const falOff: MediaProviderAdapter = { slug: "fal", configured: () => false };

describe("media request validation + budget", () => {
  it("accepts a valid request within budget", () => {
    expect(validateMediaRequest({ kind: "image", prompt: "a logo", estimatedCostCents: 50, budgetCapCents: 100 }).ok).toBe(true);
  });
  it("rejects an empty prompt, an invalid kind, and an over-budget estimate", () => {
    expect(validateMediaRequest({ kind: "image", prompt: "  ", estimatedCostCents: 0, budgetCapCents: 100 }).ok).toBe(false);
    expect(validateMediaRequest({ kind: "hologram", prompt: "x", estimatedCostCents: 0, budgetCapCents: 100 }).ok).toBe(false);
    const over = validateMediaRequest({ kind: "video", prompt: "x", estimatedCostCents: 500, budgetCapCents: 100 });
    expect(over.ok).toBe(false);
    expect(over.errors.some((e) => e.includes("exceeds the budget cap"))).toBe(true);
  });
});

describe("credential-gated dispatch (no fake success without a provider)", () => {
  it("dispatches to a CONFIGURED provider", () => {
    const d = dispatchDecision({ provider: "fal" }, { fal: falOn });
    expect(d.status).toBe("generating");
    expect(resolveMediaProvider("fal", { fal: falOn })).not.toBeNull();
  });
  it("BLOCKS when the provider is unconfigured or unknown (truthful degraded, not a fake success)", () => {
    expect(dispatchDecision({ provider: "fal" }, { fal: falOff }).status).toBe("blocked");
    expect(dispatchDecision({ provider: "nope" }, { fal: falOn }).status).toBe("blocked");
    expect(resolveMediaProvider("fal", { fal: falOff })).toBeNull();
  });
});

describe("job lifecycle", () => {
  it("enforces legal transitions", () => {
    expect(canTransitionMediaJob("queued", "generating")).toBe(true);
    expect(canTransitionMediaJob("generating", "succeeded")).toBe(true);
    expect(canTransitionMediaJob("succeeded", "generating")).toBe(false); // terminal
    expect(canTransitionMediaJob("blocked", "queued")).toBe(true); // once a provider is configured
  });
  it("retries a failed job only within its attempt budget", () => {
    expect(canRetryMediaJob({ status: "failed", attempts: 1, maxAttempts: 3 })).toBe(true);
    expect(canRetryMediaJob({ status: "failed", attempts: 3, maxAttempts: 3 })).toBe(false);
    expect(canRetryMediaJob({ status: "succeeded", attempts: 0, maxAttempts: 3 })).toBe(false);
  });
});

describe("falConfigured resolves FAL_KEY vs FAL_API_KEY", () => {
  it("is true when EITHER canonical env var is set, false when neither is", () => {
    expect(falConfigured({ FAL_KEY: "k" })).toBe(true);
    expect(falConfigured({ FAL_API_KEY: "k" })).toBe(true);
    expect(falConfigured({})).toBe(false);
    expect(falConfigured({ FAL_KEY: "  " })).toBe(false);
  });
});

import { defaultMediaProvider } from "@/lib/media";
describe("default media provider (OpenRouter primary, fal optional)", () => {
  it("images default to OpenRouter (works with the existing OPENROUTER_API_KEY), other kinds to fal", () => {
    expect(defaultMediaProvider("image")).toBe("openrouter");
    expect(defaultMediaProvider("video")).toBe("fal");
    expect(defaultMediaProvider("audio")).toBe("fal");
    expect(defaultMediaProvider("3d")).toBe("fal");
  });
});
