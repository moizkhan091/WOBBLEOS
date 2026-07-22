import { NextResponse } from "next/server";
import { z } from "zod";
import { addContentAsset } from "@/lib/library";
import { ASSET_KINDS, POST_PLATFORMS, type AssetKind, type ContentAssetRow } from "@/lib/domain/library";
import {
  InvalidMediaPayloadError,
  MediaTooLargeError,
  UnsupportedMediaTypeError,
  storeUploadedMedia,
  titleFromFilename,
} from "@/lib/library/upload";
import { requireFounder, isAuthError } from "@/lib/auth/route";

/**
 * POST /api/library/upload — the founder's OWN reels and images enter the Content Library here.
 *
 * This is the one path that was missing. Assets could previously only arrive from an approved
 * content packet or from Media Studio generation, so a reel the founder actually shot had no way in
 * and therefore could not be scheduled. This route stores the bytes (see `lib/library/upload.ts` for
 * the allowlist + content-addressing rationale) and immediately creates a REAL library asset, which
 * means the upload is schedulable through the existing `POST /api/library/schedule` with no further
 * step. Uploading and then finding a half-created thing you must "finish" would be a worse lie than
 * not shipping the feature.
 *
 * Accepts one file (`filename`/`mimeType`/`dataBase64`) or a batch (`files: [...]`). A batch reports
 * PER-FILE status: one rejected clip must not silently discard the nine that were fine, and must not
 * be reported as a success either.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fileSchema = z.object({
  filename: z.string().trim().min(1).max(400),
  mimeType: z.string().trim().min(1).max(200),
  dataBase64: z.string().min(1),
  /** Per-file overrides so a batch upload isn't forced to share one title/kind/caption. */
  title: z.string().trim().min(1).max(200).optional(),
  kind: z.enum(ASSET_KINDS).optional(),
  caption: z.string().trim().min(1).optional(),
});

const uploadSchema = z
  .object({
    // ---- single-file form
    filename: z.string().trim().min(1).max(400).optional(),
    mimeType: z.string().trim().min(1).max(200).optional(),
    dataBase64: z.string().min(1).optional(),
    // ---- batch form
    files: z.array(fileSchema).min(1).max(25).optional(),
    // ---- shared asset fields (per-file values win where both are given)
    title: z.string().trim().min(1).max(200).optional(),
    kind: z.enum(ASSET_KINDS).optional(),
    caption: z.string().trim().min(1).optional(),
    platforms: z.array(z.enum(POST_PLATFORMS)).default([]),
    tags: z.array(z.string().trim().min(1)).max(20).default([]),
    ownerScope: z.string().trim().min(1).default("company"),
    ownerId: z.string().trim().min(1).optional(),
  })
  .refine(
    (v) => Boolean(v.files?.length) || Boolean(v.filename && v.mimeType && v.dataBase64),
    { message: "provide either `files: [...]` or `filename` + `mimeType` + `dataBase64`" },
  );

type UploadBody = z.output<typeof uploadSchema>;
type UploadFile = z.output<typeof fileSchema>;

/** Per-file outcome. Failures carry the HTTP status they WOULD have had on their own. */
type FileResult =
  | { index: number; filename: string; ok: true; asset: ContentAssetRow; mediaRef: string; bytes: number }
  | { index: number; filename: string; ok: false; status: number; error: string };

/**
 * Default asset kind. An uploaded video defaults to `reel` (the founder's stated use case, and what
 * `assetInputFromLocalReel` already produces for locally-imported reel folders); an image defaults
 * to `image`. Either is overridable per file. The `mediaRefs[].kind` stays the honest media kind —
 * that is what the Zernio adapter reads to decide image vs video upload.
 */
function defaultAssetKind(mediaKind: "image" | "video"): AssetKind {
  return mediaKind === "video" ? "reel" : "image";
}

/** Map a thrown ingest error onto its truthful HTTP status. Never a blanket 500. */
function statusForError(error: unknown): number {
  if (error instanceof UnsupportedMediaTypeError) return 415;
  if (error instanceof MediaTooLargeError) return 413;
  if (error instanceof InvalidMediaPayloadError) return 422;
  return 500;
}

async function ingestOne(file: UploadFile, index: number, shared: UploadBody, founder: string): Promise<FileResult> {
  try {
    const stored = await storeUploadedMedia({
      filename: file.filename,
      mimeType: file.mimeType,
      dataBase64: file.dataBase64,
    });
    const asset = await addContentAsset({
      title: file.title ?? shared.title ?? titleFromFilename(file.filename),
      kind: file.kind ?? shared.kind ?? defaultAssetKind(stored.kind),
      caption: file.caption ?? shared.caption,
      // The stored ref is content-addressed and relative — `serveLibraryMedia` resolves it against
      // STORAGE_ROOT and refuses anything escaping media/.
      mediaRefs: [{ path: stored.mediaRef, kind: stored.kind, order: 0 }],
      platforms: shared.platforms,
      tags: shared.tags.length ? shared.tags : ["founder-upload"],
      ownerScope: shared.ownerScope,
      ownerId: shared.ownerId,
      // Founder-supplied, not derived from a packet or a generator run.
      sourceType: "manual",
      // `ready` → immediately selectable in the scheduler. That is the whole point of the feature.
      status: "ready",
      createdBy: founder,
      metadata: {
        source: "founder_upload",
        // Recorded for provenance/display ONLY. This string never touched the filesystem — the file
        // on disk is named after the hash of its own bytes.
        originalFilename: file.filename.slice(0, 400),
        contentType: stored.contentType,
        bytes: stored.bytes,
      },
    });
    return { index, filename: file.filename, ok: true, asset, mediaRef: stored.mediaRef, bytes: stored.bytes };
  } catch (error) {
    return {
      index,
      filename: file.filename,
      ok: false,
      status: statusForError(error),
      // The message describes the REJECTION (type/size/encoding). File bytes are never echoed back.
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 503 });

  // Auth BEFORE reading the body. Sibling routes validate first, but those bodies are small JSON;
  // this one can be hundreds of megabytes, and buffering + base64-decoding that for an
  // unauthenticated caller is a free denial-of-service. Same gate, just earlier.
  const auth = await requireFounder(request);
  if (isAuthError(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "validation failed", issues: parsed.error.issues }, { status: 422 });
  const shared = parsed.data;

  const isBatch = Boolean(shared.files?.length);
  const files: UploadFile[] = shared.files?.length
    ? shared.files
    : [
        {
          filename: shared.filename!,
          mimeType: shared.mimeType!,
          dataBase64: shared.dataBase64!,
          title: shared.title,
          kind: shared.kind,
          caption: shared.caption,
        },
      ];

  // Sequential on purpose: parallel ingest of 25 large files would hold every decoded buffer in
  // memory at once. Uploading is not the hot path; predictable memory is worth more than latency.
  const results: FileResult[] = [];
  for (let i = 0; i < files.length; i++) {
    results.push(await ingestOne(files[i], i, shared, auth));
  }

  const succeeded = results.filter((r): r is Extract<FileResult, { ok: true }> => r.ok);
  const failed = results.filter((r): r is Extract<FileResult, { ok: false }> => !r.ok);

  if (!isBatch) {
    const only = results[0];
    if (!only.ok) return NextResponse.json({ ok: false, error: only.error }, { status: only.status });
    return NextResponse.json({ ok: true, asset: only.asset, mediaRef: only.mediaRef }, { status: 201 });
  }

  // Batch honesty: all good → 201. Mixed → 207 Multi-Status with both lists, so the UI can show
  // "8 uploaded, 2 rejected (too large)" instead of a green tick over silent data loss. All failed →
  // the first failure's own status, because nothing was created.
  if (failed.length === 0) {
    return NextResponse.json({ ok: true, assets: succeeded.map((r) => r.asset), results }, { status: 201 });
  }
  if (succeeded.length === 0) {
    return NextResponse.json({ ok: false, error: failed[0].error, assets: [], results }, { status: failed[0].status });
  }
  return NextResponse.json(
    { ok: true, assets: succeeded.map((r) => r.asset), results, failedCount: failed.length },
    { status: 207 },
  );
}
