import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createFalProvider, extractFalOutputUrls, type FalTransport } from "@/lib/media/fal-provider";

let storageRoot: string;
beforeAll(async () => {
  storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wob-fal-"));
});
afterAll(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true }).catch(() => {});
});

// A mock fal queue: submit → 1× IN_PROGRESS → COMPLETED → result with one output → downloadable bytes.
function mockTransport(overrides: { failStatus?: boolean; noOutputs?: boolean } = {}): FalTransport {
  let polls = 0;
  return async (url, init) => {
    if (init.method === "POST") {
      return { status: 200, json: { request_id: "req_1", status_url: "https://queue.fal.run/req_1/status", response_url: "https://queue.fal.run/req_1" } };
    }
    if (url.endsWith("/status")) {
      polls += 1;
      if (overrides.failStatus) return { status: 200, json: { status: "FAILED", error: "model error" } };
      return { status: 200, json: { status: polls >= 2 ? "COMPLETED" : "IN_PROGRESS" } };
    }
    if (init.expect === "bytes") {
      return { status: 200, json: null, bytes: new Uint8Array([137, 80, 78, 71]), contentType: "image/png" };
    }
    // response_url (json result)
    return { status: 200, json: overrides.noOutputs ? { images: [] } : { images: [{ url: "https://93.184.216.34/generated.png" }], cost: 0.03 } };
  };
}

describe("fal.ai provider adapter (WOB-AUD-014)", () => {
  it("runs the queue→poll→result→download flow and returns durable local refs + cost", async () => {
    const provider = createFalProvider({ transport: mockTransport(), apiKey: "test-key", storageRoot, pollIntervalMs: 0, sleep: async () => {} });
    const res = await provider.generate({ kind: "image" as never, prompt: "a cat", params: {} });
    expect(res.outputRefs).toHaveLength(1);
    expect(res.outputRefs[0]).toMatch(/^media\/[0-9a-f]{32}\.png$/);
    expect(res.actualCostCents).toBe(3); // 0.03 → 3 cents
    // the file was actually written to durable storage
    const written = await fs.readFile(path.join(storageRoot, res.outputRefs[0]));
    expect(written.byteLength).toBe(4);
  });

  it("throws (never fabricates) when the model reports FAILED", async () => {
    const provider = createFalProvider({ transport: mockTransport({ failStatus: true }), apiKey: "k", storageRoot, sleep: async () => {} });
    await expect(provider.generate({ kind: "image" as never, prompt: "x", params: {} })).rejects.toThrow(/fal generation failed/);
  });

  it("throws when the result has no output media (validation)", async () => {
    const provider = createFalProvider({ transport: mockTransport({ noOutputs: true }), apiKey: "k", storageRoot, pollIntervalMs: 0, sleep: async () => {} });
    await expect(provider.generate({ kind: "image" as never, prompt: "x", params: {} })).rejects.toThrow(/no output media/);
  });

  it("is BLOCKED (not configured) without a key", () => {
    const provider = createFalProvider({ transport: mockTransport(), apiKey: "" });
    expect(provider.configured()).toBe(false);
  });

  it("extractFalOutputUrls handles image/video/audio/url shapes", () => {
    expect(extractFalOutputUrls({ images: [{ url: "https://a/1.png" }] })).toEqual(["https://a/1.png"]);
    expect(extractFalOutputUrls({ video: { url: "https://a/v.mp4" } })).toEqual(["https://a/v.mp4"]);
    expect(extractFalOutputUrls({ url: "https://a/x.png" })).toEqual(["https://a/x.png"]);
    expect(extractFalOutputUrls({ nothing: true })).toEqual([]);
  });
});
