import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { OPENROUTER_MEDIA_KINDS, type MediaKind } from "@/lib/domain/media";
import type { MediaProvider, MediaGenerationResult } from "@/lib/media";

/**
 * Live OpenRouter media provider — the founder's "OpenRouter as the unified provider" for IMAGE generation
 * (fal stays registered for video/audio/3d and is truthfully blocked without FAL_KEY). OpenRouter returns
 * generated images inline as base64 data URLs on `choices[0].message.images[].image_url.url` (verified
 * live), so there is NO CDN download / SSRF surface — the bytes are in the JSON response. The HTTP transport
 * + filesystem are injectable so the extract/decode/store flow is unit-tested WITHOUT a live paid call; the
 * real call fires only when OPENROUTER_API_KEY is set. `configured()` gates it → unconfigured stays BLOCKED.
 */

export interface OpenRouterMediaResponse {
  status: number;
  json: Record<string, unknown> | null;
}
export type OpenRouterMediaTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<OpenRouterMediaResponse>;

export interface OpenRouterMediaOptions {
  transport?: OpenRouterMediaTransport;
  apiKey?: string;
  baseUrl?: string;
  /** model id per kind; image → a cheap OpenRouter image-output model. Overridable via job params.model. */
  modelForKind?: (kind: MediaKind) => string;
  maxOutputBytes?: number;
  storageRoot?: string;
  timeoutMs?: number;
}

const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image";
const MAX_OUTPUT_BYTES = 50_000_000; // 50 MB per output file
const EXT_BY_CT: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif" };

function resolveKey(opts: OpenRouterMediaOptions): string {
  return (opts.apiKey ?? process.env.OPENROUTER_API_KEY ?? "").trim();
}

// Image models can take minutes (GPT-Image-2 in particular). Default 5 min, tunable via env.
const MEDIA_TIMEOUT_MS = Number(process.env.OPENROUTER_MEDIA_TIMEOUT_MS ?? 300_000) || 300_000;

async function defaultTransport(url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<OpenRouterMediaResponse> {
  const res = await fetch(url, { method: init.method, headers: init.headers, body: init.body, redirect: "manual", signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS) });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = text ? (JSON.parse(text) as Record<string, unknown>) : null; } catch { json = null; }
  return { status: res.status, json };
}

/** Pull inline base64 image data URLs out of an OpenRouter chat-completion response (message.images[].image_url.url). */
export function extractOpenRouterImageDataUrls(json: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const choices = Array.isArray(json.choices) ? json.choices : [];
  for (const choice of choices) {
    const message = (choice as { message?: unknown }).message;
    if (!message || typeof message !== "object") continue;
    const images = (message as { images?: unknown }).images;
    if (!Array.isArray(images)) continue;
    for (const img of images) {
      const url = (img as { image_url?: { url?: unknown } })?.image_url?.url;
      if (typeof url === "string" && url.startsWith("data:")) urls.push(url);
    }
  }
  return urls;
}

/** Parse a `data:image/png;base64,....` URL into its content-type + raw bytes. Returns null if malformed. */
export function decodeDataUrl(dataUrl: string): { contentType: string; bytes: Buffer } | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const bytes = isBase64 ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]), "utf8");
  return { contentType, bytes };
}

export function createOpenRouterMediaProvider(opts: OpenRouterMediaOptions = {}): MediaProvider {
  const transport = opts.transport ?? defaultTransport;
  const baseUrl = opts.baseUrl ?? "https://openrouter.ai/api/v1";
  const modelForKind = opts.modelForKind ?? ((k: MediaKind) => (k === "image" ? DEFAULT_IMAGE_MODEL : ""));
  const maxOutputBytes = opts.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  const storageRoot = () => opts.storageRoot ?? process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");

  return {
    slug: "openrouter",
    // resolveKey() already falls back to OPENROUTER_API_KEY, so this is Boolean(env key) in production and
    // also honours an injected key for tests/DI (an unconfigured env → configured() false → job BLOCKED).
    configured: () => Boolean(resolveKey(opts)),
    async generate({ kind, prompt, params }): Promise<MediaGenerationResult> {
      const key = resolveKey(opts);
      if (!key) throw new Error("OpenRouter is not configured (OPENROUTER_API_KEY missing) — generation blocked");
      if (!OPENROUTER_MEDIA_KINDS.includes(kind)) {
        throw new Error(`OpenRouter media adapter does not support kind '${kind}' yet (image only) — use the fal provider`);
      }
      const model = (typeof params.model === "string" && params.model) || modelForKind(kind);
      const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
      // Reference images (params.referenceImages = data: URLs) turn the request MULTIMODAL: the prompt + the
      // reference frames guide the generation/edit (the founder's "send reference images along with the prompt").
      // Image→image regen is just this with the image-to-change as the reference. Non-data URLs are ignored
      // (no SSRF/remote fetch — only inline data is accepted).
      const refs = Array.isArray(params.referenceImages)
        ? (params.referenceImages as unknown[]).filter((x): x is string => typeof x === "string" && x.startsWith("data:"))
        : [];
      const content = refs.length
        ? [{ type: "text", text: prompt }, ...refs.map((url) => ({ type: "image_url", image_url: { url } }))]
        : prompt;
      const body = JSON.stringify({ model, messages: [{ role: "user", content }], modalities: ["image", "text"] });

      const res = await transport(`${baseUrl}/chat/completions`, { method: "POST", headers, body });
      if (res.status >= 400 || !res.json) {
        const detail = res.json ? JSON.stringify((res.json as { error?: unknown }).error ?? res.json).slice(0, 300) : "";
        throw new Error(`OpenRouter image generation failed (HTTP ${res.status}) ${detail}`);
      }
      const dataUrls = extractOpenRouterImageDataUrls(res.json);
      if (dataUrls.length === 0) throw new Error("OpenRouter response contained no generated image (validation failed)");

      const mediaDir = path.join(storageRoot(), "media");
      await fs.mkdir(mediaDir, { recursive: true });
      const outputRefs: string[] = [];
      for (const dataUrl of dataUrls) {
        const decoded = decodeDataUrl(dataUrl);
        if (!decoded || decoded.bytes.byteLength === 0) throw new Error("OpenRouter image data URL could not be decoded");
        if (decoded.bytes.byteLength > maxOutputBytes) throw new Error(`OpenRouter image too large (${decoded.bytes.byteLength} > ${maxOutputBytes} bytes)`);
        const ext = EXT_BY_CT[decoded.contentType] ?? ".png";
        const name = `${createHash("sha256").update(decoded.bytes).digest("hex").slice(0, 32)}${ext}`;
        await fs.writeFile(path.join(mediaDir, name), decoded.bytes);
        outputRefs.push(`media/${name}`);
      }

      // OpenRouter reports the real dollar cost on usage.cost — convert to cents (rounded up so a sub-cent
      // charge is never recorded as free).
      const usage = (res.json.usage ?? {}) as { cost?: unknown };
      const meteredCents = typeof usage.cost === "number" ? Math.max(1, Math.ceil(usage.cost * 100)) : undefined;
      return { outputRefs, actualCostCents: meteredCents };
    },
  };
}

/** Production OpenRouter media provider (real fetch, real FS). Registered only when OPENROUTER_API_KEY is present via configured(). */
export const openrouterMediaProvider: MediaProvider = createOpenRouterMediaProvider();
