import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { falConfigured, type MediaKind } from "@/lib/domain/media";
import { assertFetchableUrl } from "@/lib/security/url-guard";
import type { MediaProvider, MediaGenerationResult } from "@/lib/media";

/**
 * Live fal.ai media provider (WOB-AUD-014). Implements the fal QUEUE flow: submit → poll status →
 * fetch result → validate + download outputs to durable storage → return refs + cost. Every network
 * boundary is bounded (submit/poll/result timeouts, a max poll count, a per-output download size cap and
 * SSRF guard). The HTTP transport + filesystem + clock are injectable so the whole flow is unit-tested
 * WITHOUT a live paid call; the real call fires only when FAL_KEY is set. `configured()` gates it, so an
 * unconfigured environment keeps a job truthfully BLOCKED (never a fabricated success).
 */

export interface FalTransportResponse {
  status: number;
  json: Record<string, unknown> | null;
  bytes?: Uint8Array;
  contentType?: string;
}
export type FalTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; expect: "json" | "bytes" },
) => Promise<FalTransportResponse>;

export interface FalProviderOptions {
  transport?: FalTransport;
  apiKey?: string;
  queueBase?: string;
  /** model id per kind, e.g. image → "fal-ai/flux/schnell". Overridable via job params.model. */
  modelForKind?: (kind: MediaKind) => string;
  submitTimeoutMs?: number;
  pollIntervalMs?: number;
  maxPolls?: number;
  downloadTimeoutMs?: number;
  maxOutputBytes?: number;
  storageRoot?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MODELS: Record<string, string> = {
  image: "fal-ai/flux/schnell",
  video: "fal-ai/ltx-video",
  audio: "fal-ai/stable-audio",
};

const MAX_OUTPUT_BYTES = 50_000_000; // 50 MB per output file

function resolveKey(opts: FalProviderOptions): string {
  return (opts.apiKey ?? process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "").trim();
}

async function defaultTransport(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; expect: "json" | "bytes" },
): Promise<FalTransportResponse> {
  const res = await fetch(url, { method: init.method, headers: init.headers, body: init.body, redirect: "manual", signal: AbortSignal.timeout(60_000) });
  if (init.expect === "bytes") {
    const buf = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, json: null, bytes: buf, contentType: res.headers.get("content-type") ?? undefined };
  }
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = text ? (JSON.parse(text) as Record<string, unknown>) : null; } catch { json = null; }
  return { status: res.status, json };
}

/** Pull output media URLs out of a fal result payload (handles images / video / audio / generic url shapes). */
export function extractFalOutputUrls(result: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const pushUrl = (v: unknown) => { if (v && typeof v === "object" && typeof (v as { url?: unknown }).url === "string") urls.push((v as { url: string }).url); };
  for (const key of ["images", "video", "audio", "files", "image", "output"]) {
    const val = (result as Record<string, unknown>)[key];
    if (Array.isArray(val)) val.forEach(pushUrl);
    else if (val && typeof val === "object") pushUrl(val);
    else if (typeof val === "string" && /^https?:\/\//.test(val)) urls.push(val);
  }
  if (typeof result.url === "string" && /^https?:\/\//.test(result.url)) urls.push(result.url);
  return [...new Set(urls)];
}

const EXT_BY_CT: Record<string, string> = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif",
  "video/mp4": ".mp4", "video/quicktime": ".mov", "audio/mpeg": ".mp3", "audio/wav": ".wav",
};

export function createFalProvider(opts: FalProviderOptions = {}): MediaProvider {
  const transport = opts.transport ?? defaultTransport;
  const queueBase = opts.queueBase ?? "https://queue.fal.run";
  const modelForKind = opts.modelForKind ?? ((k: MediaKind) => DEFAULT_MODELS[k] ?? DEFAULT_MODELS.image);
  const pollIntervalMs = opts.pollIntervalMs ?? 2_000;
  const maxPolls = opts.maxPolls ?? 60; // ~2 min at 2s
  const maxOutputBytes = opts.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const storageRoot = () => opts.storageRoot ?? process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");

  return {
    slug: "fal",
    configured: () => Boolean(resolveKey(opts)) && falConfigured(),
    async generate({ kind, prompt, params }): Promise<MediaGenerationResult> {
      const key = resolveKey(opts);
      if (!key) throw new Error("fal.ai is not configured (FAL_KEY missing) — generation blocked");
      const model = (typeof params.model === "string" && params.model) || modelForKind(kind);
      const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
      const input = { prompt, ...(params as Record<string, unknown>) };
      delete (input as Record<string, unknown>).model;

      // 1) Submit to the fal queue.
      const submit = await transport(`${queueBase}/${model}`, { method: "POST", headers, body: JSON.stringify(input), expect: "json" });
      if (submit.status >= 400 || !submit.json) throw new Error(`fal submit failed (HTTP ${submit.status})`);
      const statusUrl = String(submit.json.status_url ?? "");
      const responseUrl = String(submit.json.response_url ?? "");
      if (!statusUrl || !responseUrl) throw new Error("fal submit response missing status_url/response_url");

      // 2) Poll until COMPLETED (bounded).
      let completed = false;
      for (let i = 0; i < maxPolls; i++) {
        const st = await transport(statusUrl, { method: "GET", headers, expect: "json" });
        const status = String(st.json?.status ?? "");
        if (status === "COMPLETED") { completed = true; break; }
        if (status === "FAILED" || status === "ERROR") throw new Error(`fal generation failed: ${JSON.stringify(st.json?.error ?? status)}`);
        await sleep(pollIntervalMs);
      }
      if (!completed) throw new Error(`fal generation timed out after ${maxPolls} polls`);

      // 3) Fetch the result + extract output URLs.
      const result = await transport(responseUrl, { method: "GET", headers, expect: "json" });
      if (result.status >= 400 || !result.json) throw new Error(`fal result fetch failed (HTTP ${result.status})`);
      const outputUrls = extractFalOutputUrls(result.json);
      if (outputUrls.length === 0) throw new Error("fal result contained no output media (validation failed)");

      // 4) Download + validate each output to durable storage; return local refs.
      const mediaDir = path.join(storageRoot(), "media");
      await fs.mkdir(mediaDir, { recursive: true });
      const outputRefs: string[] = [];
      for (const url of outputUrls) {
        await assertFetchableUrl(url); // SSRF guard on the CDN URL
        const dl = await transport(url, { method: "GET", headers: {}, expect: "bytes" });
        if (dl.status >= 400 || !dl.bytes) throw new Error(`fal output download failed (HTTP ${dl.status})`);
        if (dl.bytes.byteLength > maxOutputBytes) throw new Error(`fal output too large (${dl.bytes.byteLength} > ${maxOutputBytes} bytes)`);
        const ext = EXT_BY_CT[dl.contentType ?? ""] ?? (path.extname(new URL(url).pathname) || ".bin");
        const name = `${createHash("sha256").update(url).digest("hex").slice(0, 32)}${ext}`;
        await fs.writeFile(path.join(mediaDir, name), dl.bytes);
        outputRefs.push(`media/${name}`);
      }

      const meteredCents = typeof result.json.cost === "number" ? Math.round(result.json.cost * 100) : undefined;
      return { outputRefs, actualCostCents: meteredCents };
    },
  };
}

/** Production fal provider (real fetch, real FS). Registered only when FAL_KEY is present via configured(). */
export const falMediaProvider: MediaProvider = createFalProvider();
