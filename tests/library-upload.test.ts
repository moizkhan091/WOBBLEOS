import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  ALLOWED_MEDIA_TYPES,
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_MAX_VIDEO_BYTES,
  InvalidMediaPayloadError,
  MediaTooLargeError,
  UnsupportedMediaTypeError,
  mimeTypeForExtension,
  normalizeMimeType,
  storeUploadedFile,
  storeUploadedMedia,
  titleFromFilename,
} from "@/lib/library/upload";

/**
 * Founder media upload ingest — the PURE parts only (no DB, no network).
 *
 * A temp storageRoot is injected, so every assertion is about real bytes on a real disk: the file is
 * written, it is written under media/, it is named after its own hash, and the client filename never
 * influences any of that. Size limits are overridden per-test so oversize rejection is proven without
 * allocating 200 MB.
 */

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
// Not a real container — the ingest never parses video, it validates the declared type and stores bytes.
const MP4_B64 = Buffer.from("wobble-test-video-bytes").toString("base64");

let storageRoot: string;
beforeAll(async () => { storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wob-upload-")); });
afterAll(async () => { await fs.rm(storageRoot, { recursive: true, force: true }).catch(() => {}); });

describe("storeUploadedMedia — founder media upload ingest", () => {
  it("stores an allowed image and returns a media/<hash>.<ext> ref", async () => {
    const res = await storeUploadedMedia(
      { filename: "my-post.png", mimeType: "image/png", dataBase64: PNG_B64 },
      { storageRoot },
    );
    expect(res.mediaRef).toMatch(/^media\/[0-9a-f]{32}\.png$/);
    expect(res.kind).toBe("image");
    expect(res.contentType).toBe("image/png");

    // The bytes really landed, under STORAGE_ROOT/media, byte-identical to what was sent.
    const written = await fs.readFile(path.join(storageRoot, res.mediaRef));
    expect(written.equals(Buffer.from(PNG_B64, "base64"))).toBe(true);
    expect(res.bytes).toBe(written.byteLength);
  });

  it("stores an allowed video and reports kind 'video'", async () => {
    const res = await storeUploadedMedia(
      { filename: "reel.mp4", mimeType: "video/mp4", dataBase64: MP4_B64 },
      { storageRoot },
    );
    expect(res.mediaRef).toMatch(/^media\/[0-9a-f]{32}\.mp4$/);
    expect(res.kind).toBe("video");
    await expect(fs.stat(path.join(storageRoot, res.mediaRef))).resolves.toBeTruthy();
  });

  it("maps each allowlisted type to its canonical extension (iPhone .mov, webm, jpeg → .jpg)", async () => {
    const cases: Array<{ mimeType: string; ext: string }> = [
      { mimeType: "image/jpeg", ext: ".jpg" },
      { mimeType: "image/webp", ext: ".webp" },
      { mimeType: "image/gif", ext: ".gif" },
      { mimeType: "video/quicktime", ext: ".mov" },
      { mimeType: "video/webm", ext: ".webm" },
    ];
    for (const c of cases) {
      const bytes = Buffer.from(`bytes-for-${c.mimeType}`).toString("base64");
      const res = await storeUploadedMedia({ filename: "whatever", mimeType: c.mimeType, dataBase64: bytes }, { storageRoot });
      expect(path.extname(res.mediaRef), c.mimeType).toBe(c.ext);
      expect(res.contentType).toBe(c.mimeType);
    }
  });

  it("is content-addressed: the same bytes twice produce the SAME ref (natural dedupe)", async () => {
    const first = await storeUploadedMedia({ filename: "a.png", mimeType: "image/png", dataBase64: PNG_B64 }, { storageRoot });
    // Different filename, same bytes — the ref is derived from the CONTENT, so it must not change.
    const second = await storeUploadedMedia({ filename: "totally-different-name.png", mimeType: "image/png", dataBase64: PNG_B64 }, { storageRoot });
    expect(second.mediaRef).toBe(first.mediaRef);

    const files = await fs.readdir(path.join(storageRoot, "media"));
    expect(files.filter((f) => f === path.basename(first.mediaRef))).toHaveLength(1);
  });

  it("different bytes produce different refs (no collision from the same filename)", async () => {
    const a = await storeUploadedMedia({ filename: "same.png", mimeType: "image/png", dataBase64: Buffer.from("aaa").toString("base64") }, { storageRoot });
    const b = await storeUploadedMedia({ filename: "same.png", mimeType: "image/png", dataBase64: Buffer.from("bbb").toString("base64") }, { storageRoot });
    expect(a.mediaRef).not.toBe(b.mediaRef);
  });

  it("rejects a non-allowlisted mime type with UnsupportedMediaTypeError (an .exe is not media)", async () => {
    await expect(
      storeUploadedMedia({ filename: "invoice.png", mimeType: "application/x-msdownload", dataBase64: PNG_B64 }, { storageRoot }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeError);
  });

  it("rejects SVG and HTML — active documents are never accepted as 'images'", async () => {
    for (const mimeType of ["image/svg+xml", "text/html"]) {
      await expect(
        storeUploadedMedia({ filename: "x.png", mimeType, dataBase64: PNG_B64 }, { storageRoot }),
        mimeType,
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeError);
    }
  });

  it("rejects an oversize image with MediaTooLargeError", async () => {
    await expect(
      storeUploadedMedia({ filename: "big.png", mimeType: "image/png", dataBase64: PNG_B64 }, { storageRoot, maxBytes: { image: 8 } }),
    ).rejects.toBeInstanceOf(MediaTooLargeError);
  });

  it("rejects an oversize video with MediaTooLargeError and writes nothing", async () => {
    const before = await fs.readdir(path.join(storageRoot, "media"));
    await expect(
      storeUploadedMedia({ filename: "big.mp4", mimeType: "video/mp4", dataBase64: MP4_B64 }, { storageRoot, maxBytes: { video: 4 } }),
    ).rejects.toBeInstanceOf(MediaTooLargeError);
    const after = await fs.readdir(path.join(storageRoot, "media"));
    expect(after).toEqual(before); // rejection happens BEFORE any write
  });

  it("a spoofed filename extension never overrides the mime-derived extension", async () => {
    const res = await storeUploadedMedia(
      { filename: "payload.exe", mimeType: "image/png", dataBase64: PNG_B64 },
      { storageRoot },
    );
    expect(res.mediaRef).toMatch(/\.png$/);
    expect(res.mediaRef).not.toContain("exe");
  });

  it("a traversal filename cannot escape the media directory", async () => {
    const res = await storeUploadedMedia(
      { filename: "../../../../etc/passwd.png", mimeType: "image/png", dataBase64: PNG_B64 },
      { storageRoot },
    );
    expect(res.mediaRef).toMatch(/^media\/[0-9a-f]{32}\.png$/);

    // Nothing outside media/ was created, and every name in media/ is a plain hash — no separators,
    // no dot-segments, nothing derived from the client's string.
    const rootEntries = await fs.readdir(storageRoot);
    expect(rootEntries).toEqual(["media"]);
    for (const name of await fs.readdir(path.join(storageRoot, "media"))) {
      expect(name, name).toMatch(/^[0-9a-f]{32}\.[a-z0-9]+$/);
    }
  });

  it("accepts a mime type carrying parameters and odd casing", async () => {
    const res = await storeUploadedMedia(
      { filename: "photo.jpeg", mimeType: "IMAGE/JPEG; charset=binary", dataBase64: PNG_B64 },
      { storageRoot },
    );
    expect(res.contentType).toBe("image/jpeg");
    expect(res.mediaRef).toMatch(/\.jpg$/);
  });

  it("accepts a data: URL payload (what FileReader.readAsDataURL hands the browser)", async () => {
    const res = await storeUploadedMedia(
      { filename: "from-browser.png", mimeType: "image/png", dataBase64: `data:image/png;base64,${PNG_B64}` },
      { storageRoot },
    );
    // Same bytes as the raw-base64 upload → same content-addressed ref.
    expect(res.mediaRef).toMatch(/^media\/[0-9a-f]{32}\.png$/);
    expect(res.bytes).toBe(Buffer.from(PNG_B64, "base64").byteLength);
  });

  it("rejects malformed or empty base64 instead of silently storing truncated garbage", async () => {
    // Buffer.from(_, "base64") would DISCARD the invalid chars and return a short buffer.
    await expect(
      storeUploadedMedia({ filename: "x.png", mimeType: "image/png", dataBase64: "not base64!!!***" }, { storageRoot }),
    ).rejects.toBeInstanceOf(InvalidMediaPayloadError);
    await expect(
      storeUploadedMedia({ filename: "x.png", mimeType: "image/png", dataBase64: "   " }, { storageRoot }),
    ).rejects.toBeInstanceOf(InvalidMediaPayloadError);
  });

  it("exposes a defensible allowlist and limits", () => {
    expect(Object.keys(ALLOWED_MEDIA_TYPES).sort()).toEqual(
      ["image/gif", "image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"].sort(),
    );
    expect(ALLOWED_MEDIA_TYPES["image/svg+xml"]).toBeUndefined(); // scriptable — deliberately excluded
    expect(DEFAULT_MAX_VIDEO_BYTES).toBe(200 * 1024 * 1024);
    expect(DEFAULT_MAX_IMAGE_BYTES).toBe(25 * 1024 * 1024);
  });

  it("normalizeMimeType strips parameters and lower-cases", () => {
    expect(normalizeMimeType("Video/MP4; codecs=avc1")).toBe("video/mp4");
    expect(normalizeMimeType("  image/png  ")).toBe("image/png");
  });

  it("mimeTypeForExtension derives the type from a path, allowlist-only", () => {
    expect(mimeTypeForExtension("085.PNG")).toBe("image/png");
    expect(mimeTypeForExtension("photo.jpeg")).toBe("image/jpeg"); // non-canonical spelling still maps
    expect(mimeTypeForExtension("reel.mp4")).toBe("video/mp4");
    expect(mimeTypeForExtension("notes.md")).toBeNull();
    expect(mimeTypeForExtension("logo.svg")).toBeNull();
  });

  it("storeUploadedFile ingests a file already on disk, sharing the upload's ref and rules", async () => {
    const srcDir = await fs.mkdtemp(path.join(os.tmpdir(), "wob-src-"));
    try {
      const src = path.join(srcDir, "source-fixture.png");
      await fs.writeFile(src, Buffer.from(PNG_B64, "base64"));

      const fromDisk = await storeUploadedFile(src, { storageRoot });
      // Same bytes as the base64 path → the SAME content-addressed ref. One media store, two doors.
      const fromUpload = await storeUploadedMedia({ filename: "x.png", mimeType: "image/png", dataBase64: PNG_B64 }, { storageRoot });
      expect(fromDisk.mediaRef).toBe(fromUpload.mediaRef);
      expect(fromDisk.kind).toBe("image");
      expect(fromDisk.contentType).toBe("image/png");
    } finally {
      await fs.rm(srcDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("storeUploadedFile enforces the allowlist and the size cap from the file itself", async () => {
    const srcDir = await fs.mkdtemp(path.join(os.tmpdir(), "wob-src-"));
    try {
      const exe = path.join(srcDir, "tool.exe");
      await fs.writeFile(exe, Buffer.from("MZ"));
      await expect(storeUploadedFile(exe, { storageRoot })).rejects.toBeInstanceOf(UnsupportedMediaTypeError);

      const big = path.join(srcDir, "big-source.png");
      await fs.writeFile(big, Buffer.from(PNG_B64, "base64"));
      // Refused from the file's own stat — the bytes are never read into memory.
      await expect(storeUploadedFile(big, { storageRoot, maxBytes: { image: 4 } })).rejects.toBeInstanceOf(MediaTooLargeError);
    } finally {
      await fs.rm(srcDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("titleFromFilename produces a human title from an untrusted filename", () => {
    expect(titleFromFilename("C:\\Users\\moiz\\my_first-reel.mp4")).toBe("my first reel");
    expect(titleFromFilename("/tmp/listing-tour.mov")).toBe("listing tour");
    expect(titleFromFilename(".png")).toBe("Uploaded media");
    expect(titleFromFilename("x".repeat(500)).length).toBe(140);
  });
});
