import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  CAPTION_FILENAMES,
  InvalidImportRootError,
  importContentFolder,
  resolveImportRoot,
  scanContentFolder,
} from "@/lib/library/folder-import";
import type { ContentAssetRow } from "@/lib/domain/library";
import type { LibraryStore } from "@/lib/library";

/**
 * Bulk folder import — scanner + importer, against a fixture tree that mirrors the founder's REAL
 * layout. No DB (an in-memory store is injected), no network, temp dirs cleaned up after.
 *
 * The fixture reproduces all three trees and every shape that has bitten this import before:
 *   IMAGES/       <campaign>/ad_085__topic__angle/{085.png, caption.txt}     ← the 196-post tree
 *                 <campaign>/loose-folder-name/{x.png, caption.txt}          ← name off-convention
 *                 <campaign>/no-caption/{x.png}                              ← media, no copy
 *                 <campaign>/two-media/{a.png, b.png, caption.txt}           ← ambiguous
 *                 <campaign>/copy-only/{caption.txt}                         ← copy, no media
 *   AD-HANDOFF/   <campaign>/<angle>/{reel.mp4, META-AD-COPY.txt}            ← paid
 *   SOCIAL-MEDIA/ <campaign>/<angle>/{reel.mp4, CAPTION.txt}                 ← organic, SAME names
 * plus `.credentials.local.txt` dotfiles, which must never be read or imported.
 */

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const MP4 = Buffer.from("fake-mp4-bytes-for-a-reel");

let fixture: string;
let storageRoot: string;
let imagesRoot: string;
let adHandoffRoot: string;
let socialRoot: string;

async function writeLeaf(dir: string, files: Record<string, Buffer | string>): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), content);
  }
}

beforeAll(async () => {
  fixture = await fs.mkdtemp(path.join(os.tmpdir(), "wob-folder-"));
  storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wob-folder-store-"));

  imagesRoot = path.join(fixture, "Wobble-Social-Library-UPLOAD");
  adHandoffRoot = path.join(fixture, "AD-HANDOFF");
  socialRoot = path.join(fixture, "SOCIAL-MEDIA");

  // --- images tree
  await writeLeaf(path.join(imagesRoot, "abandoned-cart", "ad_085__abandoned-cart-retention__universal-pain"), {
    "085.png": PNG,
    "caption.txt": "Your cart abandoners are not gone.\n\nThey are just waiting.",
  });
  await writeLeaf(path.join(imagesRoot, "abandoned-cart", "loose folder name"), { "x.png": PNG, "caption.txt": "" });
  await writeLeaf(path.join(imagesRoot, "speed-to-lead", "ad_090__speed-to-lead__infographic"), {
    "090.png": PNG,
    "caption.txt": "Five minutes or you lose the lead.",
  });
  await writeLeaf(path.join(imagesRoot, "speed-to-lead", "no-caption"), { "099.png": PNG });
  await writeLeaf(path.join(imagesRoot, "speed-to-lead", "two-media"), { "a.png": PNG, "b.png": Buffer.concat([PNG, Buffer.from("x")]), "caption.txt": "Two files here." });
  await writeLeaf(path.join(imagesRoot, "speed-to-lead", "copy-only"), { "caption.txt": "Copy with nothing to post." });
  await writeLeaf(path.join(imagesRoot, "speed-to-lead", "docs-only"), { "NOTES.md": "not a post", "plan.json": "{}" });

  // --- the two reel trees: SAME campaign/angle, different copy, different caption filename
  await writeLeaf(path.join(adHandoffRoot, "ai-appointment-booking", "six-texts"), {
    "reel.mp4": MP4,
    "META-AD-COPY.txt": "PAID: Book more appointments while you sleep.",
  });
  await writeLeaf(path.join(socialRoot, "ai-appointment-booking", "six-texts"), {
    "reel.mp4": MP4,
    "CAPTION.txt": "ORGANIC: six texts that book the showing.",
  });

  // --- credential dotfiles that must never be touched
  await fs.writeFile(path.join(fixture, ".elevenlabs-credentials.local.txt"), "SECRET");
  await writeLeaf(path.join(adHandoffRoot, "ai-appointment-booking", "six-texts"), {
    ".image-api-credentials.local.txt": "SECRET",
  });
});

afterAll(async () => {
  await fs.rm(fixture, { recursive: true, force: true }).catch(() => {});
  await fs.rm(storageRoot, { recursive: true, force: true }).catch(() => {});
});

/** Minimal in-memory LibraryStore — only the two methods the importer touches need real behaviour. */
function memoryStore(): { store: LibraryStore; rows: ContentAssetRow[] } {
  const rows: ContentAssetRow[] = [];
  const store = {
    async insertAsset(row: ContentAssetRow) { rows.push(row); },
    async findAssetByImportKey(key: string) {
      return rows.find((r) => (r.metadata as { importKey?: unknown }).importKey === key) ?? null;
    },
  } as unknown as LibraryStore;
  return { store, rows };
}

const noAudit = async () => {};

describe("scanContentFolder — the images tree", () => {
  it("finds every post and parses ad_<num>__<topic>__<angle>", async () => {
    const scan = await scanContentFolder(imagesRoot);
    // 5 importable posts: 2 well-formed ads, the off-convention folder, no-caption, two-media.
    expect(scan.posts).toHaveLength(5);
    expect(scan.campaigns).toEqual(["abandoned-cart", "speed-to-lead"]);
    expect(scan.tree).toBe("Wobble-Social-Library-UPLOAD");

    const ad085 = scan.posts.find((p) => p.postSlug.startsWith("ad_085"))!;
    expect(ad085.adNumber).toBe(85);
    expect(ad085.topic).toBe("abandoned-cart-retention");
    expect(ad085.angle).toBe("universal-pain");
    expect(ad085.mediaFilename).toBe("085.png");
    expect(ad085.mediaKind).toBe("image");
    expect(ad085.mimeType).toBe("image/png");
    expect(ad085.captionSource).toBe("caption.txt");
    // Title is the caption's first line, not the folder name.
    expect(ad085.title).toBe("Your cart abandoners are not gone.");
  });

  it("a folder that does not match the convention still imports, titled from its own name", async () => {
    const scan = await scanContentFolder(imagesRoot);
    const loose = scan.posts.find((p) => p.postSlug === "loose folder name")!;
    expect(loose).toBeTruthy();
    expect(loose.adNumber).toBeUndefined();
    expect(loose.topic).toBeUndefined();
    // caption.txt is empty → falls back to the folder name rather than a generic placeholder.
    expect(loose.title).toBe("Loose Folder Name");
  });

  it("reports the imperfect folders as warnings instead of silently dropping them", async () => {
    const { warnings } = await scanContentFolder(imagesRoot);
    const by = (p: string) => warnings.filter((w) => w.path === p);

    // media but no caption file → still a post, but the founder is told
    expect(by("speed-to-lead/no-caption").map((w) => w.code)).toContain("missing_caption");
    // an empty caption.txt is the same problem wearing a hat
    expect(by("abandoned-cart/loose folder name").map((w) => w.code)).toContain("missing_caption");
    // two media files → one is chosen deterministically and the ignored one is NAMED
    const multi = by("speed-to-lead/two-media").find((w) => w.code === "multiple_media")!;
    expect(multi.reason).toContain("importing 'a.png'");
    expect(multi.reason).toContain("b.png");
    // caption but no media → cannot be posted, must be visible
    expect(by("speed-to-lead/copy-only").map((w) => w.code)).toContain("missing_media");
  });

  it("a folder of documents is not a post and is not reported as a broken one", async () => {
    const { posts, warnings } = await scanContentFolder(imagesRoot);
    expect(posts.some((p) => p.postSlug === "docs-only")).toBe(false);
    expect(warnings.some((w) => w.path === "speed-to-lead/docs-only")).toBe(false);
  });

  it("honours the campaign filter and the limit", async () => {
    const one = await scanContentFolder(imagesRoot, { campaign: "abandoned-cart" });
    expect(one.campaigns).toEqual(["abandoned-cart"]);
    expect(one.posts.every((p) => p.campaign === "abandoned-cart")).toBe(true);

    const limited = await scanContentFolder(imagesRoot, { limit: 2 });
    expect(limited.posts).toHaveLength(2);
  });
});

describe("scanContentFolder — the two reel trees", () => {
  it("reads META-AD-COPY.txt in AD-HANDOFF and reports kind video", async () => {
    const scan = await scanContentFolder(adHandoffRoot);
    expect(scan.tree).toBe("AD-HANDOFF");
    expect(scan.posts).toHaveLength(1);
    const post = scan.posts[0];
    expect(post.mediaFilename).toBe("reel.mp4");
    expect(post.mediaKind).toBe("video");
    expect(post.mimeType).toBe("video/mp4");
    expect(post.captionSource).toBe("META-AD-COPY.txt");
    expect(post.caption).toContain("PAID:");
  });

  it("reads CAPTION.txt in SOCIAL-MEDIA (case-insensitive candidate list)", async () => {
    const scan = await scanContentFolder(socialRoot);
    expect(scan.tree).toBe("SOCIAL-MEDIA");
    const post = scan.posts[0];
    expect(post.captionSource).toBe("CAPTION.txt");
    expect(post.caption).toContain("ORGANIC:");
    expect(CAPTION_FILENAMES).toContain(post.captionSource!.toLowerCase());
  });

  it("the same campaign/angle in two trees gets two DIFFERENT import keys", async () => {
    const paid = (await scanContentFolder(adHandoffRoot)).posts[0];
    const organic = (await scanContentFolder(socialRoot)).posts[0];
    expect(paid.campaign).toBe(organic.campaign);
    expect(paid.postSlug).toBe(organic.postSlug);
    // Same folder names, same reel bytes — only the tree separates them. Without it in the key the
    // paid variant silently collapses into the organic one.
    expect(paid.importKey).not.toBe(organic.importKey);
    expect(paid.importKey).toContain("AD-HANDOFF");
    expect(organic.importKey).toContain("SOCIAL-MEDIA");
    // Both still expose the pre-tree key the CLI importer used, for the legacy dedupe check.
    expect(paid.legacyImportKey).toBe(organic.legacyImportKey);
  });

  it("NEVER picks up a dotfile — credentials live in these folders", async () => {
    const scan = await scanContentFolder(adHandoffRoot);
    const post = scan.posts[0];
    expect(post.mediaFilename).not.toMatch(/^\./);
    expect(post.captionSource).not.toMatch(/^\./);
    // The credential file is neither imported nor mentioned in any warning.
    const mentionsSecret = scan.warnings.some((w) => w.reason.includes("credentials"));
    expect(mentionsSecret).toBe(false);
  });
});

describe("importContentFolder", () => {
  it("imports every post, storing media content-addressed under STORAGE_ROOT/media", async () => {
    const { store, rows } = memoryStore();
    const res = await importContentFolder(imagesRoot, { storageRoot, createdBy: "Moiz" }, { store, recordAudit: noAudit });

    expect(res.imported).toBe(5);
    expect(res.skipped).toBe(0);
    expect(res.failed).toBe(0);
    expect(rows).toHaveLength(5);

    const asset = res.assets.find((a) => a.title === "Your cart abandoners are not gone.")!;
    expect(asset.kind).toBe("image");
    // The caption is the asset's CAPTION field — the copy that gets posted, not buried in metadata.
    expect(asset.caption).toContain("They are just waiting.");
    expect(asset.mediaRefs[0].path).toMatch(/^media\/[0-9a-f]{32}\.png$/);
    expect(asset.createdBy).toBe("Moiz");
    expect(asset.tags).toContain("campaign:abandoned-cart");
    expect(asset.metadata.campaign).toBe("abandoned-cart");
    expect(asset.metadata.tree).toBe("Wobble-Social-Library-UPLOAD");
    expect(asset.metadata.captionSource).toBe("caption.txt");
    await expect(fs.stat(path.join(storageRoot, asset.mediaRefs[0].path!))).resolves.toBeTruthy();
  });

  it("is IDEMPOTENT — a second run imports nothing and skips everything", async () => {
    const { store } = memoryStore();
    const first = await importContentFolder(imagesRoot, { storageRoot }, { store, recordAudit: noAudit });
    const second = await importContentFolder(imagesRoot, { storageRoot }, { store, recordAudit: noAudit });
    expect(first.imported).toBe(5);
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(5);
  });

  it("imports the SAME campaign/angle from both reel trees as TWO assets, not one", async () => {
    const { store, rows } = memoryStore();
    const paid = await importContentFolder(adHandoffRoot, { storageRoot }, { store, recordAudit: noAudit });
    const organic = await importContentFolder(socialRoot, { storageRoot }, { store, recordAudit: noAudit });

    expect(paid.imported).toBe(1);
    expect(organic.imported).toBe(1); // NOT skipped as a duplicate
    expect(rows).toHaveLength(2);

    const [a, b] = rows;
    expect(a.kind).toBe("reel"); // video media → reel asset
    expect(b.kind).toBe("reel");
    expect(a.metadata.tree).toBe("AD-HANDOFF");
    expect(b.metadata.tree).toBe("SOCIAL-MEDIA");
    expect(a.caption).toContain("PAID:");
    expect(b.caption).toContain("ORGANIC:");
    // Identical reel bytes → ONE file on disk, referenced by both assets (content-addressing).
    expect(a.mediaRefs[0].path).toBe(b.mediaRefs[0].path);
  });

  it("dryRun reports what WOULD happen and writes nothing at all", async () => {
    const { store, rows } = memoryStore();
    const dryStore = await fs.mkdtemp(path.join(os.tmpdir(), "wob-dry-"));
    try {
      const res = await importContentFolder(imagesRoot, { dryRun: true, storageRoot: dryStore }, { store, recordAudit: noAudit });
      expect(res.dryRun).toBe(true);
      expect(res.scanned).toBe(5);
      expect(res.imported).toBe(5); // "would import"
      expect(res.assets).toHaveLength(0);
      expect(res.planned).toHaveLength(5);
      expect(res.planned[0]).toHaveProperty("title");
      expect(rows).toHaveLength(0); // no rows inserted
      await expect(fs.readdir(dryStore)).resolves.toEqual([]); // no media copied
    } finally {
      await fs.rm(dryStore, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("treats a legacy (pre-tree) key with the same copy as already imported", async () => {
    const { store, rows } = memoryStore();
    const scan = await scanContentFolder(socialRoot);
    // Simulate what `npm run library:import` already wrote: the pre-tree key, same caption.
    rows.push({
      id: "asset_legacy", title: "legacy", kind: "reel", caption: scan.posts[0].caption ?? null,
      mediaRefs: [], platforms: [], tags: [], ownerScope: "company", ownerId: null,
      sourceType: "imported", sourcePacketId: null, status: "ready", createdBy: null,
      metadata: { importKey: scan.posts[0].legacyImportKey }, createdAt: new Date(), updatedAt: new Date(),
    });
    const res = await importContentFolder(socialRoot, { storageRoot }, { store, recordAudit: noAudit });
    expect(res.imported).toBe(0);
    expect(res.skipped).toBe(1);
  });
});

describe("resolveImportRoot", () => {
  it("accepts an existing absolute directory", async () => {
    await expect(resolveImportRoot(imagesRoot)).resolves.toBe(path.resolve(imagesRoot));
  });

  it("refuses '..' segments, blanks, missing paths and files", async () => {
    await expect(resolveImportRoot(`${imagesRoot}/../../etc`)).rejects.toBeInstanceOf(InvalidImportRootError);
    await expect(resolveImportRoot("   ")).rejects.toBeInstanceOf(InvalidImportRootError);
    await expect(resolveImportRoot(path.join(fixture, "does-not-exist"))).rejects.toBeInstanceOf(InvalidImportRootError);
    await expect(resolveImportRoot(path.join(fixture, ".elevenlabs-credentials.local.txt"))).rejects.toBeInstanceOf(InvalidImportRootError);
  });

  it("enforces LIBRARY_IMPORT_ROOTS when it is set", async () => {
    const previous = process.env.LIBRARY_IMPORT_ROOTS;
    process.env.LIBRARY_IMPORT_ROOTS = imagesRoot;
    try {
      await expect(resolveImportRoot(imagesRoot)).resolves.toBeTruthy();
      await expect(resolveImportRoot(adHandoffRoot)).rejects.toThrow(/LIBRARY_IMPORT_ROOTS/);
    } finally {
      if (previous === undefined) delete process.env.LIBRARY_IMPORT_ROOTS;
      else process.env.LIBRARY_IMPORT_ROOTS = previous;
    }
  });
});
