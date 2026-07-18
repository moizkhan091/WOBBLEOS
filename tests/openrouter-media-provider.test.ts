import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createOpenRouterMediaProvider,
  extractOpenRouterImageDataUrls,
  decodeDataUrl,
  type OpenRouterMediaTransport,
} from "@/lib/media/openrouter-provider";

// 1x1 transparent PNG.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const DATA_URL = `data:image/png;base64,${PNG_B64}`;

let storageRoot: string;
beforeAll(async () => { storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wob-orimg-")); });
afterAll(async () => { await fs.rm(storageRoot, { recursive: true, force: true }).catch(() => {}); });

function mockTransport(opts: { failStatus?: boolean; noImages?: boolean; cost?: number } = {}): OpenRouterMediaTransport {
  return async () => {
    if (opts.failStatus) return { status: 429, json: { error: { message: "rate limited" } } };
    const message = opts.noImages
      ? { role: "assistant", content: "no image", images: [] }
      : { role: "assistant", content: "", images: [{ type: "image_url", image_url: { url: DATA_URL } }] };
    return { status: 200, json: { choices: [{ message }], usage: { cost: opts.cost ?? 0.0387 } } };
  };
}

describe("OpenRouter media provider adapter (image generation)", () => {
  it("generates an image: extracts the inline data URL, writes it to storage, meters the cost", async () => {
    const provider = createOpenRouterMediaProvider({ transport: mockTransport({ cost: 0.0387 }), apiKey: "test-key", storageRoot });
    const res = await provider.generate({ kind: "image", prompt: "a lime orb", params: {} });
    expect(res.outputRefs).toHaveLength(1);
    expect(res.outputRefs[0]).toMatch(/^media\/[0-9a-f]{32}\.png$/);
    const written = await fs.readFile(path.join(storageRoot, res.outputRefs[0]));
    expect(written.byteLength).toBeGreaterThan(0);
    expect(res.actualCostCents).toBe(4); // ceil(0.0387 * 100)
  });

  it("is configured only when a key is present", () => {
    expect(createOpenRouterMediaProvider({ apiKey: "k" }).configured()).toBe(true);
    expect(createOpenRouterMediaProvider({ apiKey: "" }).configured()).toBe(false);
  });

  it("blocks (throws) when no key is set", async () => {
    const provider = createOpenRouterMediaProvider({ transport: mockTransport(), apiKey: "" });
    await expect(provider.generate({ kind: "image", prompt: "x", params: {} })).rejects.toThrow(/not configured/i);
  });

  it("refuses unsupported kinds truthfully (video stays with fal)", async () => {
    const provider = createOpenRouterMediaProvider({ transport: mockTransport(), apiKey: "k", storageRoot });
    await expect(provider.generate({ kind: "video", prompt: "x", params: {} })).rejects.toThrow(/does not support kind 'video'/i);
  });

  it("throws on an HTTP error from OpenRouter", async () => {
    const provider = createOpenRouterMediaProvider({ transport: mockTransport({ failStatus: true }), apiKey: "k", storageRoot });
    await expect(provider.generate({ kind: "image", prompt: "x", params: {} })).rejects.toThrow(/HTTP 429/);
  });

  it("throws when the response contains no generated image (never a fabricated success)", async () => {
    const provider = createOpenRouterMediaProvider({ transport: mockTransport({ noImages: true }), apiKey: "k", storageRoot });
    await expect(provider.generate({ kind: "image", prompt: "x", params: {} })).rejects.toThrow(/no generated image/i);
  });

  it("extractOpenRouterImageDataUrls pulls data URLs from message.images, ignores non-data urls", () => {
    const json = { choices: [{ message: { images: [{ image_url: { url: DATA_URL } }, { image_url: { url: "https://cdn/x.png" } }] } }] };
    expect(extractOpenRouterImageDataUrls(json)).toEqual([DATA_URL]);
    expect(extractOpenRouterImageDataUrls({ choices: [] })).toEqual([]);
  });

  it("decodeDataUrl decodes a base64 image payload", () => {
    const decoded = decodeDataUrl(DATA_URL);
    expect(decoded?.contentType).toBe("image/png");
    expect(decoded?.bytes.byteLength).toBeGreaterThan(0);
    expect(decodeDataUrl("not-a-data-url")).toBeNull();
  });
});
