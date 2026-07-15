import { describe, expect, it } from "vitest";
import { computeVersionParity, getBuildId, shortBuildId, UNKNOWN_BUILD_ID, type ServiceVersion } from "@/lib/build/version";

/**
 * WOB-UAT-026 — automated proof that a service version mismatch is DETECTED and CLEARLY REPORTED.
 *
 * This regression-locks a defect that actually happened during the local UAT campaign:
 * `docker compose up -d --build app` rebuilt only the app, leaving `worker` and `worker-video` on the
 * previous image against an already-migrated schema. The symptom was silent — a seed run by the stale
 * worker reported success and simply did not write a column it had never heard of.
 *
 * The bar here is not "returns false". It is: names the exact stale service, and never claims parity
 * it cannot see.
 */

const APP = "abc123def456";
const OLD = "999888777666";

const fresh = (service: string, buildId: string): ServiceVersion => ({ service, buildId, fresh: true });
const stale = (service: string, buildId: string): ServiceVersion => ({ service, buildId, fresh: false });

describe("getBuildId", () => {
  it("reads the id stamped into the image", () => {
    expect(getBuildId({ WOBBLE_BUILD_ID: APP })).toBe(APP);
  });

  it("falls back to 'unknown' when unstamped, blank, or whitespace", () => {
    expect(getBuildId({})).toBe(UNKNOWN_BUILD_ID);
    expect(getBuildId({ WOBBLE_BUILD_ID: "" })).toBe(UNKNOWN_BUILD_ID);
    expect(getBuildId({ WOBBLE_BUILD_ID: "   " })).toBe(UNKNOWN_BUILD_ID);
  });
});

describe("computeVersionParity — the WOB-UAT-026 regression gate", () => {
  it("passes when every service reports the app's build id", () => {
    const r = computeVersionParity(APP, [fresh("worker", APP), fresh("worker-video", APP)]);
    expect(r.ok).toBe(true);
    expect(r.stale).toEqual([]);
    expect(r.reason).toBeNull();
  });

  it("REPRODUCES the exact defect: app rebuilt, workers left on the old image", () => {
    const r = computeVersionParity(APP, [fresh("worker", OLD), fresh("worker-video", OLD)]);
    expect(r.ok).toBe(false);
    // Names the exact stale services — an operator must not have to guess which to rebuild.
    expect(r.stale.map((s) => s.service).sort()).toEqual(["worker", "worker-video"]);
    expect(r.reason).toContain("version mismatch");
    expect(r.reason).toContain("worker is running");
    expect(r.reason).toContain("worker-video is running");
    // ...and tells them what to actually do about it.
    expect(r.reason).toContain("docker compose up -d --build");
  });

  it("identifies ONE stale service precisely when the rest are current", () => {
    const r = computeVersionParity(APP, [fresh("worker", APP), fresh("worker-video", OLD)]);
    expect(r.ok).toBe(false);
    expect(r.stale).toEqual([{ service: "worker-video", buildId: OLD }]);
    expect(r.reason).toContain("worker-video is running");
    expect(r.reason).not.toContain("worker is running " + shortBuildId(OLD) + "; worker-video");
  });

  it("an unstamped APP image fails — 'I don't know what I'm running' is not parity", () => {
    const r = computeVersionParity(UNKNOWN_BUILD_ID, [fresh("worker", UNKNOWN_BUILD_ID)]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("no WOBBLE_BUILD_ID");
  });

  it("an unstamped WORKER image is a mismatch, not a pass", () => {
    const r = computeVersionParity(APP, [fresh("worker", UNKNOWN_BUILD_ID)]);
    expect(r.ok).toBe(false);
    expect(r.stale).toEqual([{ service: "worker", buildId: UNKNOWN_BUILD_ID }]);
  });

  it("a service with no fresh heartbeat is 'unknown', never silently OK", () => {
    // A stale heartbeat proves nothing about what that worker is running RIGHT NOW.
    const r = computeVersionParity(APP, [fresh("worker", APP), stale("worker-video", APP)]);
    expect(r.ok).toBe(false);
    expect(r.unknown).toEqual(["worker-video"]);
    expect(r.stale).toEqual([]); // not accused of being stale — we simply cannot see it
    expect(r.reason).toContain("cannot verify version parity");
    expect(r.reason).toContain("worker-video");
  });

  it("an empty fleet is not parity", () => {
    const r = computeVersionParity(APP, []);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("empty fleet");
  });

  it("a real mismatch outranks an unverifiable service in the reported reason", () => {
    const r = computeVersionParity(APP, [fresh("worker", OLD), stale("worker-video", APP)]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("version mismatch"); // the actionable fact wins
    expect(r.unknown).toEqual(["worker-video"]); // still reported, not lost
  });

  it("compares the FULL build id, never the shortened display form", () => {
    // Two ids that share a 12-char prefix must still be detected as different.
    const a = "aaaaaaaaaaaa1111";
    const b = "aaaaaaaaaaaa2222";
    expect(shortBuildId(a)).toBe(shortBuildId(b)); // display collides...
    expect(computeVersionParity(a, [fresh("worker", b)]).ok).toBe(false); // ...comparison does not
  });
});
