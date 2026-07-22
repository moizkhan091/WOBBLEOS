import { promises as fs } from "node:fs";
import path from "node:path";
import {
  localImportKey,
  parseAdFolderName,
  type ContentAssetRow,
  type CreateAssetInput,
  type ParsedAdFolder,
} from "@/lib/domain/library";
import { addContentAsset, defaultStore, type LibraryDeps } from "@/lib/library";
import {
  MediaTooLargeError,
  UnsupportedMediaTypeError,
  mimeTypeForExtension,
  storeUploadedFile,
} from "@/lib/library/upload";

/**
 * BULK folder import — "point WOBBLE at my content folder and ingest all of it".
 *
 * THREE real trees, all `<root>/<campaign>/<post>/{ one media file, one caption file }` at depth 2,
 * and none of them agreeing on a filename:
 *
 *   A  Wobble-Social-Library-UPLOAD          <campaign>/ad_<num>__<topic>__<angle>/{<num>.png, caption.txt}
 *   B  PHASE-9-VIDEO-REELS/…/AD-HANDOFF      <campaign>/<angle>/{reel.mp4, META-AD-COPY.txt}
 *   C  PHASE-9-VIDEO-REELS/…/SOCIAL-MEDIA    <campaign>/<angle>/{reel.mp4, CAPTION.txt}
 *
 * So NOTHING about the leaf is hardcoded: the media file is "the one allowed media file in this
 * folder" and the caption is the first match from a case-insensitive candidate list. The `ad_…`
 * naming in A is a convention, not a requirement — a folder that does not match still imports, using
 * its own name as the title. One odd folder must never abort a 196-item run.
 *
 * B and C hold the SAME campaign/angle names (`ai-appointment-booking/six-texts` is in both) with
 * DIFFERENT copy — one paid ad, one organic caption. They are two assets, not one, so the tree is
 * part of the dedupe key and is recorded on the asset (`metadata.tree`, `metadata.captionSource`).
 *
 * SAFETY: the reels root also contains `.elevenlabs-credentials.local.txt`,
 * `.image-api-credentials.local.txt` and a pile of .md/.json working docs. Dotfiles are never read
 * or listed, and a folder is only a post if it contains a recognised MEDIA file — a directory of
 * documents is not a post and is not reported as a broken one.
 *
 * RELATIONSHIP TO `import-local.ts` (read this before adding a third importer):
 * `importLocalSocialLibrary` already walks these exact roots and is what `npm run library:import`
 * runs; ~226 assets were imported with it. This module is the API/UI-facing successor and it is
 * deliberately KEY-COMPATIBLE with it: both derive their dedupe key from the shared
 * `localImportKey(kind, "<campaign>/<postSlug>")`, so running this over a tree the CLI already
 * imported reports every folder as `skipped` instead of creating 196 duplicates. What this adds is
 * everything the CLI importer cannot do: a scan/preview that writes nothing (`dryRun`), per-folder
 * WARNINGS the founder can actually read, campaign/limit filters, owner scoping, and — the reason it
 * could not simply be extended — media stored through the ONE content-addressed path
 * (`storeUploadedFile` → `STORAGE_ROOT/media/<sha256>.<ext>`) rather than
 * `media/library/<assetId>/<originalName>`, which re-copied identical bytes under a new id on every
 * fresh import. The two should be consolidated onto this module; see the handoff log.
 */

// ---------------------------------------------------------------- types

export type ScannedMediaKind = "image" | "video";

export interface ScannedPost {
  /** Which tree this came from — the root's folder name (`AD-HANDOFF`, `SOCIAL-MEDIA`, …). */
  tree: string;
  /** Campaign folder name — the first level under the root. */
  campaign: string;
  /** Post folder name — the second level (e.g. `ad_085__abandoned-cart-retention__universal-pain`). */
  postSlug: string;
  /** Absolute path of the post folder. */
  dirPath: string;
  /** Parsed from `ad_<num>__<topic>__<angle>`; undefined when the folder does not follow it. */
  adNumber?: number;
  topic?: string;
  angle?: string;
  /** Absolute path of the chosen media file. */
  mediaPath: string;
  mediaFilename: string;
  mediaKind: ScannedMediaKind;
  mimeType: string;
  captionPath?: string;
  /** Which caption file supplied the copy — `caption.txt` vs `META-AD-COPY.txt` is paid vs organic. */
  captionSource?: string;
  caption?: string;
  /** Title the asset will get: caption's first line, else topic+angle, else the folder name. */
  title: string;
  /** Tree-scoped dedupe key. The tree is IN the key so B and C stay two assets, not one. */
  importKey: string;
  /**
   * The pre-tree key `import-local.ts` wrote for this same folder. Consulted (not written) so a tree
   * the CLI importer already ingested is not imported a second time — see `importContentFolder`.
   */
  legacyImportKey: string;
}

export type ScanWarningCode =
  | "missing_media"
  | "missing_caption"
  | "multiple_media"
  | "unsupported_media"
  | "unreadable_caption"
  | "unreadable_folder";

export interface ScanWarning {
  /** `<campaign>/<postSlug>` — stable and short enough to show in a list. */
  path: string;
  code: ScanWarningCode;
  reason: string;
}

export interface ScanResult {
  /** The tree label every scanned post carries. */
  tree: string;
  posts: ScannedPost[];
  /**
   * Everything that was NOT perfect. A silent skip is the failure mode this whole module exists to
   * avoid: the founder must be able to see what did not import, and why, without diffing counts.
   */
  warnings: ScanWarning[];
  campaigns: string[];
  root: string;
}

export interface ImportFolderOptions {
  /** Scan and report exactly what WOULD happen; write no files and insert no rows. */
  dryRun?: boolean;
  /** Stop after N posts (a safe first taste of a 196-item tree). */
  limit?: number;
  /** Only this campaign folder. */
  campaign?: string;
  ownerScope?: string;
  ownerId?: string;
  createdBy?: string;
  /** Test seam — otherwise STORAGE_ROOT. */
  storageRoot?: string;
  /** Platforms every imported asset is tagged for. Defaults to the library's existing choice. */
  platforms?: CreateAssetInput["platforms"];
  /** Tree label; defaults to the root folder's name. It is part of the dedupe key — see below. */
  tree?: string;
  /**
   * Also treat the PRE-TREE key written by `import-local.ts` as "already imported" (default true).
   *
   * This is what stops a re-import of a tree the CLI importer already ingested from duplicating it.
   * A legacy row only counts as the same post when its caption also matches, because B and C share
   * campaign/angle names and differ only in copy — matching on the key alone would silently discard
   * the paid variant of an organic reel that was imported first.
   */
  matchLegacyKeys?: boolean;
}

export interface ImportFolderFailure {
  path: string;
  error: string;
}

export interface ImportFolderResult {
  root: string;
  /** Tree label recorded on every asset from this run. */
  tree: string;
  dryRun: boolean;
  /** Posts the scan found (after campaign/limit filtering). */
  scanned: number;
  imported: number;
  /** Already in the library under the same importKey — a re-run is all-skips, by design. */
  skipped: number;
  failed: number;
  /** The rows created. Empty on a dry run. */
  assets: ContentAssetRow[];
  /** In a dry run, what WOULD have been created. */
  planned: Array<{ path: string; title: string; kind: ScannedMediaKind; mediaFilename: string; hasCaption: boolean }>;
  warnings: ScanWarning[];
  failures: ImportFolderFailure[];
  campaigns: string[];
}

/** The import root was missing, not a directory, or refused by the traversal/allowlist checks. */
export class InvalidImportRootError extends Error {
  readonly name = "InvalidImportRootError";
  constructor(reason: string) {
    super(`invalid import root: ${reason}`);
  }
}

// ---------------------------------------------------------------- root validation

/**
 * Resolve and vet a caller-supplied server path.
 *
 * This endpoint reads an arbitrary directory on the server, so even behind a founder session it is
 * the most powerful primitive in this module. Three checks:
 *  1. `..` segments are refused BEFORE resolution — after `path.resolve` they are gone, so checking
 *     only the resolved string would silently accept `/srv/app/../../etc`.
 *  2. The path must resolve to an absolute directory that exists.
 *  3. If `LIBRARY_IMPORT_ROOTS` is set (`;`- or `,`-separated), the resolved path must be inside one
 *     of those roots. Unset means "any absolute directory", which is the right default for a
 *     single-tenant founder OS on their own machine, and the env var is how a shared deployment
 *     narrows it to the content volume.
 */
export async function resolveImportRoot(raw: string): Promise<string> {
  const input = (raw ?? "").trim();
  if (!input) throw new InvalidImportRootError("rootDir is required");
  if (input.split(/[\\/]/).some((seg) => seg === "..")) {
    throw new InvalidImportRootError("path segments containing '..' are not allowed");
  }

  const resolved = path.resolve(input);
  if (!path.isAbsolute(resolved)) throw new InvalidImportRootError("rootDir must be an absolute path");
  if (resolved.split(path.sep).some((seg) => seg === "..")) {
    throw new InvalidImportRootError("resolved path still contains '..'");
  }

  const allowlist = (process.env.LIBRARY_IMPORT_ROOTS ?? "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => path.resolve(s));
  if (allowlist.length > 0) {
    const inside = allowlist.some((base) => resolved === base || resolved.startsWith(base + path.sep));
    if (!inside) throw new InvalidImportRootError(`path is outside LIBRARY_IMPORT_ROOTS`);
  }

  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat) throw new InvalidImportRootError(`${resolved} does not exist`);
  if (!stat.isDirectory()) throw new InvalidImportRootError(`${resolved} is not a directory`);
  return resolved;
}

// ---------------------------------------------------------------- scan

/**
 * Caption filenames, in priority order, matched CASE-INSENSITIVELY. Three trees, three spellings:
 * `caption.txt` (images), `CAPTION.txt` (organic reels), `META-AD-COPY.txt` (paid reels). Which one
 * supplied the copy is recorded on the asset — for the two reel trees it is the only thing that
 * distinguishes an ad from an organic post.
 */
export const CAPTION_FILENAMES = ["caption.txt", "meta-ad-copy.txt"] as const;

/**
 * Extensions that LOOK like media but are not on the upload allowlist. Only these earn an
 * `unsupported_media` warning — a folder of .md/.json working notes is not a broken post, and
 * warning about every one of them would bury the warnings that matter.
 */
// .m4v is NOT listed here any more — it is on the upload allowlist now (the pre-existing CLI importer
// accepted it, so real files in the founder's trees use it), which means it imports rather than warns.
const MEDIA_LIKE_EXTS = new Set([".avi", ".mkv", ".wmv", ".flv", ".mpg", ".mpeg", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".svg", ".avif"]);

/** Dotfiles are NEVER read or listed — the reels root holds `.elevenlabs-credentials.local.txt`. */
function isHidden(name: string): boolean {
  return name.startsWith(".");
}

async function subDirs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && !isHidden(e.name)).map((e) => e.name).sort();
}

function isCaptionFile(name: string): boolean {
  return CAPTION_FILENAMES.includes(name.toLowerCase() as (typeof CAPTION_FILENAMES)[number]);
}

/** First non-empty line of the caption, clamped — the same titling rule the local importer uses. */
function firstCaptionLine(caption: string | undefined): string | null {
  const line = (caption ?? "").split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0);
  return line ? line.slice(0, 140) : null;
}

function humanize(slug: string): string {
  return slug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function titleFor(caption: string | undefined, parsed: ParsedAdFolder | null, postSlug: string): string {
  const fromCaption = firstCaptionLine(caption);
  if (fromCaption) return fromCaption;
  // No caption. A parsed folder has meaning worth using; anything else falls back to its own name,
  // which is always better than a generic placeholder the founder cannot map to a folder.
  if (parsed) return humanize(`${parsed.product} ${parsed.angle}`).slice(0, 140) || humanize(postSlug).slice(0, 140);
  return (humanize(postSlug) || postSlug).slice(0, 140);
}

/**
 * Walk `<root>/<campaign>/<post>` and describe every post found, plus everything that looked wrong.
 * Filesystem-only: no DB, no writes, safe to call for a preview.
 */
export async function scanContentFolder(
  rootDir: string,
  opts: { campaign?: string; limit?: number; tree?: string } = {},
): Promise<ScanResult> {
  const root = path.resolve(rootDir);
  // The tree label defaults to the root's own folder name, which is exactly what distinguishes the
  // two reel trees (`AD-HANDOFF` vs `SOCIAL-MEDIA`) that share campaign and angle names.
  const tree = (opts.tree ?? path.basename(root)) || "root";
  const posts: ScannedPost[] = [];
  const warnings: ScanWarning[] = [];
  const limit = opts.limit && opts.limit > 0 ? opts.limit : Infinity;

  const allCampaigns = await subDirs(root);
  const campaigns = opts.campaign ? allCampaigns.filter((c) => c === opts.campaign) : allCampaigns;

  for (const campaign of campaigns) {
    if (posts.length >= limit) break;
    const campaignDir = path.join(root, campaign);
    let postSlugs: string[];
    try {
      postSlugs = await subDirs(campaignDir);
    } catch (error) {
      warnings.push({ path: campaign, code: "unreadable_folder", reason: error instanceof Error ? error.message : "unreadable" });
      continue;
    }

    for (const postSlug of postSlugs) {
      if (posts.length >= limit) break;
      const rel = `${campaign}/${postSlug}`;
      const dirPath = path.join(campaignDir, postSlug);

      let files: string[];
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        // Dotfiles are dropped HERE, before anything looks at a name or opens a handle. The reels
        // root contains `.elevenlabs-credentials.local.txt` and `.image-api-credentials.local.txt`;
        // an importer that walks a founder's content folder must never so much as read them.
        files = entries.filter((e) => e.isFile() && !isHidden(e.name)).map((e) => e.name).sort();
      } catch (error) {
        warnings.push({ path: rel, code: "unreadable_folder", reason: error instanceof Error ? error.message : "unreadable" });
        continue;
      }

      // Split the folder into media candidates (allowlisted) and media-SHAPED files we cannot take.
      // Everything else (.md, .json, notes) is ignored in silence — it is not a failed import.
      const mediaFiles: string[] = [];
      const rejected: string[] = [];
      for (const file of files) {
        if (isCaptionFile(file)) continue;
        if (mimeTypeForExtension(file)) mediaFiles.push(file);
        else if (MEDIA_LIKE_EXTS.has(path.extname(file).toLowerCase())) rejected.push(file);
      }

      const captionFile = files.find(isCaptionFile);

      if (mediaFiles.length === 0) {
        // No media → not a post. Only WARN when this folder looked like it was meant to be one:
        // copy with nothing to post, or media in a format the allowlist refuses. A directory of
        // documents is silently not-a-post, so 20 doc folders do not drown the real problems.
        if (rejected.length) {
          warnings.push({ path: rel, code: "unsupported_media", reason: `no supported media — found ${rejected.join(", ")}, not on the upload allowlist` });
        } else if (captionFile) {
          warnings.push({ path: rel, code: "missing_media", reason: `has ${captionFile} but no media file — nothing to post` });
        }
        continue;
      }
      if (mediaFiles.length > 1) {
        // Import the first deterministically (files are sorted) and NAME the ones being ignored, so
        // the founder can split the folder rather than wonder which one made it in.
        warnings.push({
          path: rel,
          code: "multiple_media",
          reason: `${mediaFiles.length} media files found — importing '${mediaFiles[0]}', ignoring ${mediaFiles.slice(1).join(", ")}`,
        });
      }
      if (rejected.length) {
        warnings.push({ path: rel, code: "unsupported_media", reason: `ignored unsupported file(s): ${rejected.join(", ")}` });
      }

      const mediaFilename = mediaFiles[0];
      const mimeType = mimeTypeForExtension(mediaFilename)!; // non-null: it is why the file is in this list
      // The KIND FOLLOWS THE FILE, not the folder or the tree: png/jpg/webp/gif → image,
      // mp4/mov/webm → video. A reel tree that one day contains a still still imports correctly.
      const mediaKind: ScannedMediaKind = mimeType.startsWith("video/") ? "video" : "image";

      let caption: string | undefined;
      let captionPath: string | undefined;
      if (captionFile) {
        captionPath = path.join(dirPath, captionFile);
        try {
          const text = (await fs.readFile(captionPath, "utf8")).trim();
          caption = text.length ? text : undefined;
          if (!caption) warnings.push({ path: rel, code: "missing_caption", reason: `${captionFile} is empty` });
        } catch (error) {
          warnings.push({ path: rel, code: "unreadable_caption", reason: error instanceof Error ? error.message : "unreadable" });
        }
      } else {
        // Still imported — the media is the asset, the caption is copy that can be written later.
        warnings.push({
          path: rel,
          code: "missing_caption",
          reason: `no caption file (looked for ${CAPTION_FILENAMES.join(", ")}) — importing the media with no caption`,
        });
      }

      const parsed = parseAdFolderName(postSlug);
      const kindForKey = mediaKind === "video" ? "reel" : "image";
      posts.push({
        tree,
        campaign,
        postSlug,
        dirPath,
        adNumber: parsed?.seq ?? undefined,
        topic: parsed?.product,
        angle: parsed?.angle,
        mediaPath: path.join(dirPath, mediaFilename),
        mediaFilename,
        mediaKind,
        mimeType,
        captionPath,
        captionSource: captionFile,
        caption,
        title: titleFor(caption, parsed, postSlug),
        // TREE-SCOPED. `AD-HANDOFF/ai-appointment-booking/six-texts` and
        // `SOCIAL-MEDIA/ai-appointment-booking/six-texts` are the same reel with different copy —
        // two assets. Without the tree in the key the second one silently collapses into the first.
        importKey: localImportKey(kindForKey, `${tree}/${rel}`),
        legacyImportKey: localImportKey(kindForKey, rel),
      });
    }
  }

  return { tree, posts, warnings, campaigns, root };
}

// ---------------------------------------------------------------- import

function assetInputForPost(post: ScannedPost, opts: ImportFolderOptions, mediaRef: string, bytes: number): CreateAssetInput {
  const tags = ["wobble-library", `campaign:${post.campaign}`, `tree:${post.tree}`];
  if (post.topic) tags.push(post.topic);
  if (post.angle) tags.push(`angle:${post.angle}`);
  return {
    title: post.title,
    // The asset kind follows the MEDIA. `reel` (not `video`) for video because that is what the
    // existing reel imports use and what the Library's "Reels" filter selects on; a video asset
    // filed as `video` would be invisible in the UI the founder actually browses.
    kind: post.mediaKind === "video" ? "reel" : "image",
    // The caption IS the post copy — `createAssetSchema.caption` is the field that carries it, and
    // it is what the scheduler/publishers send. It is NOT buried in metadata.
    caption: post.caption,
    mediaRefs: [{ path: mediaRef, kind: post.mediaKind, order: 0 }],
    platforms: opts.platforms ?? ["instagram", "linkedin"],
    tags,
    ownerScope: opts.ownerScope ?? "company",
    ownerId: opts.ownerId,
    sourceType: "imported",
    status: "ready",
    createdBy: opts.createdBy,
    metadata: {
      importKey: post.importKey,
      source: "folder_import",
      // Which tree + which caption file. For the two reel trees this is the ONLY thing that says
      // whether the copy on this asset is a paid Meta ad or an organic caption.
      tree: post.tree,
      captionSource: post.captionSource ?? null,
      campaign: post.campaign,
      postSlug: post.postSlug,
      adId: post.adNumber != null ? `ad_${String(post.adNumber).padStart(3, "0")}` : null,
      seq: post.adNumber ?? null,
      product: post.topic ?? null,
      angle: post.angle ?? null,
      mediaFilename: post.mediaFilename,
      bytes,
    },
  };
}

/**
 * Scan a folder tree and ingest every post in it.
 *
 * IDEMPOTENT by `metadata.importKey` — re-running as the folder grows imports only what is new and
 * counts the rest as `skipped`. That is not a nicety: the founder will re-run this, and a
 * non-idempotent bulk importer turns 196 posts into 392 the second time.
 *
 * `dryRun: true` performs the full scan and the full dedupe check, then stops: nothing is copied and
 * no row is inserted, but `planned`, `skipped` and `warnings` are exactly what a real run would do.
 */
export async function importContentFolder(
  rootDir: string,
  opts: ImportFolderOptions = {},
  deps: LibraryDeps = {},
): Promise<ImportFolderResult> {
  const store = deps.store ?? defaultStore();
  const scan = await scanContentFolder(rootDir, { campaign: opts.campaign, limit: opts.limit, tree: opts.tree });
  const matchLegacy = opts.matchLegacyKeys !== false;

  const result: ImportFolderResult = {
    root: scan.root,
    tree: scan.tree,
    dryRun: Boolean(opts.dryRun),
    scanned: scan.posts.length,
    imported: 0,
    skipped: 0,
    failed: 0,
    assets: [],
    planned: [],
    warnings: scan.warnings,
    failures: [],
    campaigns: scan.campaigns,
  };

  for (const post of scan.posts) {
    const rel = `${post.campaign}/${post.postSlug}`;
    try {
      // Dedupe FIRST: cheaper than copying 1.2 MB to discover it is already there, and it makes the
      // dry-run preview truthful about how much is actually new.
      const lookup = store.findAssetByImportKey?.bind(store);
      const existing = lookup ? await lookup(post.importKey) : null;
      if (existing) {
        result.skipped += 1;
        continue;
      }
      // Legacy (pre-tree) key from `import-local.ts`. Matched on the key AND the caption: the key
      // alone cannot tell `AD-HANDOFF/x/y` from `SOCIAL-MEDIA/x/y`, and treating them as the same
      // post is exactly how the paid variant would vanish. Same copy → genuinely the same post.
      if (lookup && matchLegacy) {
        const legacy = await lookup(post.legacyImportKey);
        if (legacy && (legacy.caption ?? "").trim() === (post.caption ?? "").trim()) {
          result.skipped += 1;
          continue;
        }
      }

      if (opts.dryRun) {
        result.planned.push({
          path: rel,
          title: post.title,
          kind: post.mediaKind,
          mediaFilename: post.mediaFilename,
          hasCaption: Boolean(post.caption),
        });
        result.imported += 1; // "would import" — `dryRun` on the result says which it is
        continue;
      }

      // Same allowlist, caps, hashing and storage layout as a browser upload — one media path.
      const stored = await storeUploadedFile(post.mediaPath, { mimeType: post.mimeType, storageRoot: opts.storageRoot });
      const asset = await addContentAsset(assetInputForPost(post, opts, stored.mediaRef, stored.bytes), deps);
      result.assets.push(asset);
      result.imported += 1;
    } catch (error) {
      // One bad folder in 196 must not abort the run — record it and keep going.
      result.failed += 1;
      const detail =
        error instanceof UnsupportedMediaTypeError || error instanceof MediaTooLargeError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      result.failures.push({ path: rel, error: detail });
    }
  }

  return result;
}
