import { describe, expect, it } from "vitest";
import {
  assetInputFromPacket,
  buildContentAssetRow,
  buildScheduledPostRow,
  canTransitionPost,
  type ContentAssetRow,
  type ScheduledPostRow,
} from "@/lib/domain/library";
import {
  addContentAsset,
  cancelScheduledPost,
  dispatchDuePosts,
  importFromContentPacket,
  listContentAssets,
  listScheduledPosts,
  markPostPublished,
  schedulePost,
  type LibraryStore,
  type PublisherAdapter,
} from "@/lib/library";

const now = new Date("2026-07-09T12:00:00Z");

// ---------------------------------------------------------------- domain

describe("library domain", () => {
  it("builds an asset row with defaults", () => {
    const row = buildContentAssetRow({ title: "Reel 1", kind: "reel", caption: "hi" }, { now, id: "asset_1" });
    expect(row).toMatchObject({ id: "asset_1", kind: "reel", status: "ready", sourceType: "imported", caption: "hi" });
  });

  it("maps an approved carousel pack into a library asset", () => {
    const input = assetInputFromPacket({ id: "pk1", platform: "linkedin", format: "carousel", hook: "H", caption: "C", createdBy: "Moiz" });
    expect(input.kind).toBe("carousel");
    expect(input.sourceType).toBe("content_pack");
    expect(input.sourcePacketId).toBe("pk1");
    expect(input.platforms).toEqual(["linkedin"]);
    expect(input.caption).toContain("H");
    expect(input.caption).toContain("C");
  });

  it("enforces the post status machine", () => {
    expect(canTransitionPost("scheduled", "published")).toBe(true);
    expect(canTransitionPost("scheduled", "canceled")).toBe(true);
    expect(canTransitionPost("published", "scheduled")).toBe(false);
    expect(canTransitionPost("failed", "scheduled")).toBe(true);
  });

  it("builds a scheduled post from a coerced date", () => {
    const row = buildScheduledPostRow({ assetId: "asset_1", platform: "instagram", scheduledAt: "2026-07-10T09:00:00Z", publisher: "manual" }, { now, id: "post_1" });
    expect(row).toMatchObject({ id: "post_1", assetId: "asset_1", platform: "instagram", status: "scheduled", publisher: "manual" });
    expect(row.scheduledAt.toISOString()).toBe("2026-07-10T09:00:00.000Z");
  });
});

// ---------------------------------------------------------------- service

function makeStore() {
  const assets = new Map<string, ContentAssetRow>();
  const posts = new Map<string, ScheduledPostRow>();
  const store: LibraryStore = {
    insertAsset: async (r) => void assets.set(r.id, r),
    listAssets: async (q) => [...assets.values()].filter((a) => (!q.status || a.status === q.status) && (!q.kind || a.kind === q.kind)).slice(0, q.limit),
    getAssetById: async (id) => assets.get(id) ?? null,
    updateAsset: async (id, f) => { const a = assets.get(id); if (a) assets.set(id, { ...a, ...f }); },
    findAssetByPacketId: async (pid) => [...assets.values()].find((a) => a.sourcePacketId === pid) ?? null,
    insertScheduledPost: async (r) => void posts.set(r.id, r),
    listScheduledPosts: async (q) => [...posts.values()].filter((p) => (!q.status || p.status === q.status) && (!q.platform || p.platform === q.platform)).slice(0, q.limit),
    getScheduledPostById: async (id) => posts.get(id) ?? null,
    updateScheduledPost: async (id, f) => { const p = posts.get(id); if (p) posts.set(id, { ...p, ...f }); },
    listDuePosts: async (n, limit) => [...posts.values()].filter((p) => p.status === "scheduled" && p.scheduledAt.getTime() <= n.getTime()).slice(0, limit),
  };
  return { store, assets, posts };
}

describe("library service", () => {
  it("adds + lists assets", async () => {
    const { store } = makeStore();
    await addContentAsset({ title: "A", kind: "image" }, { store, now, recordAudit: async () => {} });
    const list = await listContentAssets({}, { store });
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("A");
  });

  it("imports an approved pack once (idempotent)", async () => {
    const { store } = makeStore();
    const getPacketForImport = async () => ({ id: "pk1", platform: "instagram", format: "carousel", hook: "Hook", caption: "Cap", createdBy: "Moiz" });
    const a1 = await importFromContentPacket("pk1", { store, getPacketForImport, recordAudit: async () => {}, now });
    const a2 = await importFromContentPacket("pk1", { store, getPacketForImport, recordAudit: async () => {}, now });
    expect(a1?.sourcePacketId).toBe("pk1");
    expect(a2?.id).toBe(a1?.id); // no duplicate
    expect((await listContentAssets({}, { store }))).toHaveLength(1);
  });

  it("schedules a post and moves the asset to scheduled", async () => {
    const { store, assets } = makeStore();
    const asset = await addContentAsset({ title: "A", platforms: ["instagram"] }, { store, now, recordAudit: async () => {} });
    const post = await schedulePost({ assetId: asset.id, platform: "instagram", scheduledAt: "2026-07-10T09:00:00Z", createdBy: "Moiz" }, { store, now, recordAudit: async () => {} });
    expect(post.status).toBe("scheduled");
    expect(assets.get(asset.id)!.status).toBe("scheduled");
    expect(await listScheduledPosts({ status: "scheduled" }, { store })).toHaveLength(1);
  });

  it("cancels a scheduled post", async () => {
    const { store } = makeStore();
    const asset = await addContentAsset({ title: "A" }, { store, now, recordAudit: async () => {} });
    const post = await schedulePost({ assetId: asset.id, platform: "instagram", scheduledAt: "2026-07-10T09:00:00Z" }, { store, now, recordAudit: async () => {} });
    expect(await cancelScheduledPost(post.id, { store, now })).toBe(true);
    expect((await listScheduledPosts({ status: "canceled" }, { store }))).toHaveLength(1);
  });

  it("marks a manual post published", async () => {
    const { store, assets } = makeStore();
    const asset = await addContentAsset({ title: "A" }, { store, now, recordAudit: async () => {} });
    const post = await schedulePost({ assetId: asset.id, platform: "instagram", scheduledAt: "2026-07-10T09:00:00Z", publisher: "manual" }, { store, now, recordAudit: async () => {} });
    expect(await markPostPublished(post.id, { actor: "Moiz" }, { store, now, recordAudit: async () => {} })).toBe(true);
    expect(assets.get(asset.id)!.status).toBe("published");
  });

  it("dispatch defers manual posts but fires automated ones", async () => {
    const { store, posts } = makeStore();
    const asset = await addContentAsset({ title: "A" }, { store, now, recordAudit: async () => {} });
    const past = "2026-07-09T11:00:00Z"; // before `now`
    const manual = await schedulePost({ assetId: asset.id, platform: "instagram", scheduledAt: past, publisher: "manual" }, { store, now, recordAudit: async () => {} });
    const auto = await schedulePost({ assetId: asset.id, platform: "linkedin", scheduledAt: past, publisher: "zernio" }, { store, now, recordAudit: async () => {} });
    const fakeZernio: PublisherAdapter = { slug: "zernio", publish: async () => ({ publisherRef: "ext_123" }) };

    const result = await dispatchDuePosts({ store, now, publishers: { zernio: fakeZernio } });
    expect(result.deferred).toBe(1);
    expect(result.dispatched).toBe(1);
    expect(posts.get(manual.id)!.status).toBe("scheduled"); // manual left for the human
    expect(posts.get(auto.id)!.status).toBe("published");
    expect(posts.get(auto.id)!.publisherRef).toBe("ext_123");
  });
});
