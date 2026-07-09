import { promises as fs } from "node:fs";
import path from "node:path";
import { newId } from "@/lib/ids";
import {
  assetInputFromLocalImage,
  assetInputFromLocalReel,
  buildContentAssetRow,
  localImportKey,
} from "@/lib/domain/library";
import { defaultStore, type LibraryStore } from "@/lib/library";

/**
 * Import the founder's on-disk social library into content_assets.
 *
 * Two source shapes (both single-media-per-folder):
 *   images: <campaign>/ad_097__ai-creative-engine__mistake/{097.png, caption.txt}
 *   reels:  <topic>/human-vs-ai/{reel.mp4, CAPTION.txt}
 *
 * Media bytes are COPIED into STORAGE_ROOT/media/library/<assetId>/ so the OS owns them
 * (the source folders live in the founder's OneDrive and shouldn't be depended on). The
 * asset's mediaRefs[].path is stored relative to STORAGE_ROOT so it stays portable. Import
 * is idempotent: each asset carries a stable metadata.importKey and we skip anything already in.
 */

export interface ImportLocalOptions {
  imagesRoot?: string;
  reelsRoot?: string;
}

export interface ImportLocalResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];
const VIDEO_EXTS = [".mp4", ".mov", ".m4v"];

function storageRoot(): string {
  return process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function subDirs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function findFileByExt(dir: string, exts: string[]): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const match = entries.find((e) => e.isFile() && exts.some((x) => e.name.toLowerCase().endsWith(x)));
  return match ? match.name : null;
}

async function findCaptionFile(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const match = entries.find((e) => e.isFile() && /caption\.txt$/i.test(e.name));
  return match ? match.name : null;
}

async function readCaption(file: string): Promise<string | undefined> {
  try {
    const text = (await fs.readFile(file, "utf8")).trim();
    return text.length ? text : undefined;
  } catch {
    return undefined;
  }
}

/** Copy a source media file into STORAGE_ROOT/media/library/<assetId>/ and return the relative path. */
async function copyMedia(srcFile: string, assetId: string, fileName: string): Promise<string> {
  const rel = path.posix.join("media", "library", assetId, fileName);
  const dest = path.join(storageRoot(), rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(srcFile, dest);
  return rel;
}

export async function importLocalSocialLibrary(
  opts: ImportLocalOptions,
  deps: { store?: LibraryStore } = {},
): Promise<ImportLocalResult> {
  const store = deps.store ?? defaultStore();
  const result: ImportLocalResult = { imported: 0, skipped: 0, failed: 0, errors: [] };

  if (opts.imagesRoot) await importImages(opts.imagesRoot, store, result);
  if (opts.reelsRoot) await importReels(opts.reelsRoot, store, result);

  return result;
}

async function alreadyImported(store: LibraryStore, key: string): Promise<boolean> {
  if (!store.findAssetByImportKey) return false;
  return Boolean(await store.findAssetByImportKey(key));
}

async function importImages(root: string, store: LibraryStore, result: ImportLocalResult): Promise<void> {
  if (!(await dirExists(root))) {
    result.errors.push(`images root not found: ${root}`);
    return;
  }
  for (const campaign of await subDirs(root)) {
    const campaignDir = path.join(root, campaign);
    for (const adFolder of await subDirs(campaignDir)) {
      const adDir = path.join(campaignDir, adFolder);
      try {
        const imgName = await findFileByExt(adDir, IMAGE_EXTS);
        if (!imgName) {
          result.failed += 1;
          result.errors.push(`no image in ${campaign}/${adFolder}`);
          continue;
        }
        const importKey = localImportKey("image", `${campaign}/${adFolder}`);
        if (await alreadyImported(store, importKey)) {
          result.skipped += 1;
          continue;
        }
        const capName = await findCaptionFile(adDir);
        const caption = capName ? await readCaption(path.join(adDir, capName)) : undefined;
        const id = newId("asset");
        const mediaPath = await copyMedia(path.join(adDir, imgName), id, imgName);
        const input = assetInputFromLocalImage({ folderName: adFolder, caption, mediaPath, importKey });
        await store.insertAsset(buildContentAssetRow(input, { id }));
        result.imported += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push(`${campaign}/${adFolder}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

async function importReels(root: string, store: LibraryStore, result: ImportLocalResult): Promise<void> {
  if (!(await dirExists(root))) {
    result.errors.push(`reels root not found: ${root}`);
    return;
  }
  for (const topic of await subDirs(root)) {
    const topicDir = path.join(root, topic);
    for (const reelFolder of await subDirs(topicDir)) {
      const reelDir = path.join(topicDir, reelFolder);
      try {
        const videoName = await findFileByExt(reelDir, VIDEO_EXTS);
        if (!videoName) {
          result.failed += 1;
          result.errors.push(`no video in ${topic}/${reelFolder}`);
          continue;
        }
        const importKey = localImportKey("reel", `${topic}/${reelFolder}`);
        if (await alreadyImported(store, importKey)) {
          result.skipped += 1;
          continue;
        }
        const capName = await findCaptionFile(reelDir);
        const caption = capName ? await readCaption(path.join(reelDir, capName)) : undefined;
        const id = newId("asset");
        const mediaPath = await copyMedia(path.join(reelDir, videoName), id, videoName);
        const input = assetInputFromLocalReel({ topic, reelName: reelFolder, caption, mediaPath, importKey });
        await store.insertAsset(buildContentAssetRow(input, { id }));
        result.imported += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push(`${topic}/${reelFolder}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
