import { describe, expect, it } from "vitest";
import {
  assetInputFromLocalImage,
  assetInputFromLocalReel,
  assetInputFromPacket,
  planFeed,
  buildContentAssetRow,
  buildScheduledPostRow,
  canTransitionPost,
  localImportKey,
  parseAdFolderName,
  type ContentAssetRow,
  type ScheduledPostRow,
} from "@/lib/domain/library";
import {
  addContentAsset,
  cancelScheduledPost,
  deleteScheduledPost,
  dispatchDuePosts,
  importFromContentPacket,
  listContentAssets,
  listScheduledPosts,
  markAssetPostedOnPlatform,
  markPostPublished,
  applyZernioPostEvent,
  schedulePost,
  type LibraryStore,
  type PublisherAdapter,
} from "@/lib/library";
import { createZernioPost, zernioMediaItems } from "@/lib/library/zernio";

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

  it("passes metadata through to the asset row", () => {
    const row = buildContentAssetRow({ title: "A", metadata: { importKey: "k1", seq: 97 } }, { now, id: "asset_1" });
    expect(row.metadata).toMatchObject({ importKey: "k1", seq: 97 });
  });
});

// ---------------------------------------------------------------- local library import

describe("local library import (domain)", () => {
  it("parses an ad folder name into id · product · angle", () => {
    expect(parseAdFolderName("ad_097__ai-creative-engine__mistake")).toEqual({ adId: "ad_097", seq: 97, product: "ai-creative-engine", angle: "mistake" });
    expect(parseAdFolderName("ad_286__ecommerce-cart__catch-the-cart")).toEqual({ adId: "ad_286", seq: 286, product: "ecommerce-cart", angle: "catch-the-cart" });
    expect(parseAdFolderName("not-an-ad-folder")).toBeNull();
  });

  it("builds a stable, unique import key", () => {
    expect(localImportKey("image", "ai-creative-engine/ad_097__x__y")).toBe("local:image:ai-creative-engine/ad_097__x__y");
    expect(localImportKey("reel", "ai-receptionist/human-vs-ai")).toBe("local:reel:ai-receptionist/human-vs-ai");
  });

  it("maps a local static image into a library asset with parsed metadata", () => {
    const input = assetInputFromLocalImage({
      folderName: "ad_097__ai-creative-engine__mistake",
      caption: "Your ads aren't tired. Your angles are.\n\nHere is the problem…",
      mediaPath: "media/library/asset_x/097.png",
      importKey: "local:image:ai-creative-engine/ad_097__ai-creative-engine__mistake",
    });
    expect(input.kind).toBe("image");
    expect(input.title).toBe("Your ads aren't tired. Your angles are."); // first caption line
    expect(input.mediaRefs).toEqual([{ path: "media/library/asset_x/097.png", kind: "image", order: 0 }]);
    expect(input.platforms).toEqual(["instagram", "linkedin"]);
    expect(input.tags).toEqual(["wobble-library", "ai-creative-engine", "angle:mistake"]);
    expect(input.metadata).toMatchObject({ adId: "ad_097", seq: 97, product: "ai-creative-engine", angle: "mistake" });
  });

  it("plans a feed: spreads variety, interleaves reels, assigns time slots", () => {
    const assets = [
      { id: "i1", title: "Img1", kind: "image", metadata: { angle: "mistake", product: "ai-ads" } },
      { id: "i2", title: "Img2", kind: "image", metadata: { angle: "mistake", product: "ai-ads" } },
      { id: "i3", title: "Img3", kind: "image", metadata: { angle: "outcome", product: "ai-crm" } },
      { id: "r1", title: "Reel1", kind: "reel", metadata: { topic: "reception" } },
    ];
    const { items, summary } = planFeed(assets, { startAt: new Date("2026-07-10T00:00:00Z"), perDay: 1, hoursOfDay: [18], reelEvery: 2 });
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.order)).toEqual([0, 1, 2, 3]);
    // exactly one reel, dropped in after the first 2 images (reelEvery 2)
    expect(items.filter((i) => i.kind === "reel")).toHaveLength(1);
    expect(items[2].kind).toBe("reel");
    // first two images differ in angle or product (variety spread)
    expect(items[0].angle !== items[1].angle || items[0].product !== items[1].product).toBe(true);
    // one post per day -> different calendar days for order 0 vs 3
    expect(items[0].scheduledAt.slice(0, 10)).not.toBe(items[3].scheduledAt.slice(0, 10));
    expect(summary).toContain("posts sequenced");
  });

  it("maps a local reel into a reel asset, falling back to a humanized title", () => {
    const input = assetInputFromLocalReel({
      topic: "ai-receptionist",
      reelName: "human-vs-ai",
      mediaPath: "media/library/asset_y/reel.mp4",
      importKey: "local:reel:ai-receptionist/human-vs-ai",
    });
    expect(input.kind).toBe("reel");
    expect(input.title).toBe("Ai Receptionist Human Vs Ai"); // no caption → humanized
    expect(input.mediaRefs).toEqual([{ path: "media/library/asset_y/reel.mp4", kind: "video", order: 0 }]);
    expect(input.tags).toContain("reel");
  });
});

// ---------------------------------------------------------------- service

function makeStore() {
  const assets = new Map<string, ContentAssetRow>();
  const posts = new Map<string, ScheduledPostRow>();
  const store: LibraryStore = {
    insertAsset: async (r) => void assets.set(r.id, r),
    listAssets: async (q) => [...assets.values()].filter((a) => (!q.status || a.status === q.status) && (!q.kind || a.kind === q.kind) && (!q.ownerScope || a.ownerScope === q.ownerScope) && (!q.ownerId || a.ownerId === q.ownerId)).slice(0, q.limit),
    getAssetById: async (id) => assets.get(id) ?? null,
    updateAsset: async (id, f) => { const a = assets.get(id); if (a) assets.set(id, { ...a, ...f }); },
    findAssetByPacketId: async (pid) => [...assets.values()].find((a) => a.sourcePacketId === pid) ?? null,
    insertScheduledPost: async (r) => void posts.set(r.id, r),
    listScheduledPosts: async (q) => [...posts.values()].filter((p) => (!q.status || p.status === q.status) && (!q.platform || p.platform === q.platform)).slice(0, q.limit),
    getScheduledPostById: async (id) => posts.get(id) ?? null,
    updateScheduledPost: async (id, f) => { const p = posts.get(id); if (p) posts.set(id, { ...p, ...f }); },
    deleteScheduledPost: async (id) => void posts.delete(id),
    listPostsByAsset: async (assetId) => [...posts.values()].filter((p) => p.assetId === assetId),
    listDuePosts: async (n, limit) => [...posts.values()].filter((p) => p.status === "scheduled" && p.scheduledAt.getTime() <= n.getTime()).slice(0, limit),
    findPostByAssetAndPlatform: async (assetId, platform) => [...posts.values()].filter((p) => p.assetId === assetId && p.platform === platform).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
    findPostByPublisherRef: async (ref) => [...posts.values()].find((p) => p.publisherRef === ref) ?? null,
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

  it("REFUSES to promote an UNAPPROVED pack — unapproved content cannot publish", async () => {
    const { store } = makeStore();
    for (const status of ["pending", "rejected", "draft"] as const) {
      const asset = await importFromContentPacket(`pk_${status}`, { store, getPacketForImport: async () => ({ id: `pk_${status}`, hook: "H", approvalStatus: status }), recordAudit: async () => {}, now });
      expect(asset).toBeNull(); // never promoted
    }
    expect((await listContentAssets({}, { store }))).toHaveLength(0); // no asset created for any unapproved pack
  });

  it("promotes an APPROVED pack and carries the source-track owner scope onto the asset (tenant isolation)", async () => {
    const { store } = makeStore();
    const a = await importFromContentPacket("pk_ok", { store, getPacketForImport: async () => ({ id: "pk_ok", hook: "H", approvalStatus: "approved", ownerScope: "content_track", ownerId: "track_A" }), recordAudit: async () => {}, now });
    expect(a).not.toBeNull();
    expect(a!.ownerScope).toBe("content_track");
    expect(a!.ownerId).toBe("track_A");
  });

  it("listContentAssets ISOLATES by owner — a caller scoped to one owner never sees another's assets", async () => {
    const { store } = makeStore();
    await importFromContentPacket("pk_a", { store, getPacketForImport: async () => ({ id: "pk_a", hook: "A", approvalStatus: "approved", ownerScope: "content_track", ownerId: "track_A" }), recordAudit: async () => {}, now });
    await importFromContentPacket("pk_b", { store, getPacketForImport: async () => ({ id: "pk_b", hook: "B", approvalStatus: "approved", ownerScope: "content_track", ownerId: "track_B" }), recordAudit: async () => {}, now });
    const onlyA = await listContentAssets({ ownerScope: "content_track", ownerId: "track_A" }, { store });
    expect(onlyA).toHaveLength(1);
    expect(onlyA[0].sourcePacketId).toBe("pk_a"); // B's asset is not leaked to A's scope
  });

  it("schedulePost is IDEMPOTENT — a duplicate active schedule returns the existing post (no double-post)", async () => {
    const { store } = makeStore();
    const asset = await addContentAsset({ title: "A", platforms: ["instagram"] }, { store, now, recordAudit: async () => {} });
    const p1 = await schedulePost({ assetId: asset.id, platform: "instagram", scheduledAt: "2026-07-10T09:00:00Z", createdBy: "Moiz" }, { store, now, recordAudit: async () => {} });
    const p2 = await schedulePost({ assetId: asset.id, platform: "instagram", scheduledAt: "2026-07-11T09:00:00Z", createdBy: "Moiz" }, { store, now, recordAudit: async () => {} });
    expect(p2.id).toBe(p1.id); // the retry returned the same live post
    expect(await listScheduledPosts({ status: "scheduled" }, { store })).toHaveLength(1); // exactly one active post
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

  it("remote-scheduling persists locally FIRST, then stores the provider ref (no orphan)", async () => {
    const { store, posts } = makeStore();
    const insertOrder: string[] = [];
    const origInsert = store.insertScheduledPost;
    store.insertScheduledPost = async (r) => { insertOrder.push("insert"); return origInsert(r); };
    const scheduleRemote = async () => { insertOrder.push("remote"); return { publisherRef: "zpost_created" }; };

    const asset = await addContentAsset({ title: "A" }, { store, now, recordAudit: async () => {} });
    const post = await schedulePost({ assetId: asset.id, platform: "instagram", scheduledAt: "2026-07-12T09:00:00Z", publisher: "zernio" }, { store, now, recordAudit: async () => {}, scheduleRemote });

    expect(insertOrder).toEqual(["insert", "remote"]); // local record exists before we ever touch Zernio
    expect(posts.get(post.id)!.publisherRef).toBe("zpost_created");
  });

  it("a failed remote pre-schedule keeps the local post (dispatched locally at due time, not lost)", async () => {
    const { store, posts } = makeStore();
    const scheduleRemote = async () => { throw new Error("zernio 500"); };
    const asset = await addContentAsset({ title: "A" }, { store, now, recordAudit: async () => {} });
    const post = await schedulePost({ assetId: asset.id, platform: "instagram", scheduledAt: "2026-07-12T09:00:00Z", publisher: "zernio" }, { store, now, recordAudit: async () => {}, scheduleRemote });
    expect(posts.get(post.id)!.status).toBe("scheduled");
    expect(posts.get(post.id)!.publisherRef ?? null).toBeNull(); // no ref -> dispatch WILL publish it
  });

  it("dispatch NEVER re-publishes a post already handed to the provider (no double-post)", async () => {
    const { store, posts } = makeStore();
    const asset = await addContentAsset({ title: "A" }, { store, now, recordAudit: async () => {} });
    const past = "2026-07-09T11:00:00Z"; // due
    // Simulate a post already remote-scheduled on Zernio at schedule time (has a publisherRef).
    const scheduleRemote = async () => ({ publisherRef: "zpost_live" });
    const post = await schedulePost({ assetId: asset.id, platform: "linkedin", scheduledAt: past, publisher: "zernio" }, { store, now, recordAudit: async () => {}, scheduleRemote });
    expect(posts.get(post.id)!.publisherRef).toBe("zpost_live");

    let published = 0;
    const fakeZernio: PublisherAdapter = { slug: "zernio", publish: async () => { published += 1; return { publisherRef: "SECOND_POST" }; } };
    const result = await dispatchDuePosts({ store, now, publishers: { zernio: fakeZernio } });

    expect(published).toBe(0); // the provider owns it; the webhook reconciles — we do NOT publish again
    expect(result.dispatched).toBe(0);
    expect(result.deferred).toBe(1);
    expect(posts.get(post.id)!.status).toBe("scheduled"); // untouched, awaiting the webhook
    expect(posts.get(post.id)!.publisherRef).toBe("zpost_live"); // still the ORIGINAL ref
  });

  it("removes a post record and recomputes the asset status", async () => {
    const { store, assets, posts } = makeStore();
    const asset = await addContentAsset({ title: "A" }, { store, now, recordAudit: async () => {} });
    const post = await markAssetPostedOnPlatform(asset.id, "instagram", {}, { store, now, recordAudit: async () => {} });
    expect(assets.get(asset.id)!.status).toBe("published");
    expect(await deleteScheduledPost(post.id, { store, now, recordAudit: async () => {} })).toBe(true);
    expect(posts.has(post.id)).toBe(false);
    expect(assets.get(asset.id)!.status).toBe("ready"); // no posts left -> back to ready
  });

  it("cancel can also cancel on the remote provider", async () => {
    const { store } = makeStore();
    const asset = await addContentAsset({ title: "A" }, { store, now, recordAudit: async () => {} });
    const post = await schedulePost({ assetId: asset.id, platform: "instagram", scheduledAt: "2026-07-12T09:00:00Z", publisher: "zernio" }, { store, now, recordAudit: async () => {} });
    await store.updateScheduledPost(post.id, { publisherRef: "zernio_post_1" });
    let remoteCancelled: string | null = null;
    const ok = await cancelScheduledPost(post.id, { store, now, cancelRemote: async (p) => { remoteCancelled = p.publisherRef; } });
    expect(ok).toBe(true);
    expect(remoteCancelled).toBe("zernio_post_1"); // hit the provider so it won't fire later
  });

  it("marks a manual post published", async () => {
    const { store, assets } = makeStore();
    const asset = await addContentAsset({ title: "A" }, { store, now, recordAudit: async () => {} });
    const post = await schedulePost({ assetId: asset.id, platform: "instagram", scheduledAt: "2026-07-10T09:00:00Z", publisher: "manual" }, { store, now, recordAudit: async () => {} });
    expect(await markPostPublished(post.id, { actor: "Moiz" }, { store, now, recordAudit: async () => {} })).toBe(true);
    expect(assets.get(asset.id)!.status).toBe("published");
  });

  it("marks an asset posted per-platform (independent, idempotent)", async () => {
    const { store, assets, posts } = makeStore();
    const asset = await addContentAsset({ title: "A" }, { store, now, recordAudit: async () => {} });

    const ig = await markAssetPostedOnPlatform(asset.id, "instagram", { actor: "Moiz" }, { store, now, recordAudit: async () => {} });
    expect(ig.status).toBe("published");
    expect(ig.platform).toBe("instagram");
    expect(ig.publisher).toBe("manual");
    expect(assets.get(asset.id)!.status).toBe("published");

    // Instagram is posted; LinkedIn is NOT — per-platform independence.
    const igPosts = await listScheduledPosts({ platform: "instagram", status: "published" }, { store });
    const liPosts = await listScheduledPosts({ platform: "linkedin", status: "published" }, { store });
    expect(igPosts).toHaveLength(1);
    expect(liPosts).toHaveLength(0);

    // Idempotent: re-marking Instagram returns the same row, no duplicate.
    const again = await markAssetPostedOnPlatform(asset.id, "instagram", {}, { store, now, recordAudit: async () => {} });
    expect(again.id).toBe(ig.id);
    expect([...posts.values()].filter((p) => p.platform === "instagram")).toHaveLength(1);

    // Now mark LinkedIn — separate record.
    const li = await markAssetPostedOnPlatform(asset.id, "linkedin", {}, { store, now, recordAudit: async () => {} });
    expect(li.id).not.toBe(ig.id);
    expect(await listScheduledPosts({ platform: "linkedin", status: "published" }, { store })).toHaveLength(1);
  });

  it("mark-posted is race-safe: a rejected duplicate insert re-reads the winner (no duplicate published row)", async () => {
    const { store, posts } = makeStore();
    const asset = await addContentAsset({ title: "A" }, { store, now, recordAudit: async () => {} });

    // Simulate LOSING the concurrent race: our insert is rejected by the partial unique index, but a
    // concurrent winner has already published. The winner row appears the moment our insert is attempted.
    const winner = buildScheduledPostRow({ assetId: asset.id, platform: "instagram", scheduledAt: now, publisher: "manual" }, { now, id: "winner_pub" });
    winner.status = "published";
    winner.publishedAt = now;
    store.insertScheduledPost = async () => { posts.set(winner.id, winner); throw new Error("duplicate key value violates unique constraint"); };

    const post = await markAssetPostedOnPlatform(asset.id, "instagram", {}, { store, now, recordAudit: async () => {} });
    expect(post.id).toBe("winner_pub"); // returned the winner — did NOT create a duplicate or throw
    expect(post.status).toBe("published");
    expect([...posts.values()].filter((p) => p.status === "published" && p.platform === "instagram")).toHaveLength(1);
  });

  it("marking posted promotes an existing scheduled post instead of duplicating", async () => {
    const { store, posts } = makeStore();
    const asset = await addContentAsset({ title: "A" }, { store, now, recordAudit: async () => {} });
    const scheduled = await schedulePost({ assetId: asset.id, platform: "instagram", scheduledAt: "2026-07-11T09:00:00Z", publisher: "manual" }, { store, now, recordAudit: async () => {} });
    const marked = await markAssetPostedOnPlatform(asset.id, "instagram", {}, { store, now, recordAudit: async () => {} });
    expect(marked.id).toBe(scheduled.id); // same row, promoted
    expect(posts.get(scheduled.id)!.status).toBe("published");
    expect([...posts.values()].filter((p) => p.platform === "instagram")).toHaveLength(1);
  });

  it("applies a Zernio post.published webhook -> local post published + asset published", async () => {
    const { store, assets, posts } = makeStore();
    const asset = await addContentAsset({ title: "A" }, { store, now, recordAudit: async () => {} });
    const post = await schedulePost({ assetId: asset.id, platform: "instagram", scheduledAt: "2026-07-12T09:00:00Z", publisher: "zernio" }, { store, now, recordAudit: async () => {} });
    await store.updateScheduledPost(post.id, { publisherRef: "zpost_1" });

    const res = await applyZernioPostEvent(
      { event: "post.published", post: { id: "zpost_1", publishedAt: "2026-07-12T09:00:05Z", platforms: [{ platform: "instagram", status: "published", platformPostId: "IG_123", publishedUrl: "https://instagram.com/p/abc" }] } },
      { store, now },
    );
    expect(res.updated).toBe(true);
    expect(posts.get(post.id)!.status).toBe("published");
    expect((posts.get(post.id)!.result as { publishedUrl?: string }).publishedUrl).toBe("https://instagram.com/p/abc");
    expect(assets.get(asset.id)!.status).toBe("published");

    // Idempotent: re-delivering the same event doesn't error or change anything.
    const again = await applyZernioPostEvent({ event: "post.published", post: { id: "zpost_1", platforms: [] } }, { store, now });
    expect(again.updated).toBe(true);
    expect(posts.get(post.id)!.status).toBe("published");
  });

  it("builds signed public Zernio media URLs for local media (so cookie-less providers can fetch)", () => {
    const asset = { id: "asset_1", kind: "image", mediaRefs: [{ path: "media/library/asset_1/x.png", kind: "image", order: 0 }] } as never;
    const items = zernioMediaItems(asset, "https://os.wobble.com");
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("image");
    // signed public endpoint (NOT the session-gated /api/library route) with an HMAC token bound to
    // assetId+index+EXPIRY. Format: `<exp>.<hmac>` (WOB-AUD-019 — the token now expires).
    expect(items[0].url).toMatch(/^https:\/\/os\.wobble\.com\/api\/public\/media\/asset_1\?i=0&t=\d+\.[a-f0-9]{64}$/);
  });

  it("passes through already-remote media URLs unchanged", () => {
    const asset = { id: "asset_2", kind: "image", mediaRefs: [{ url: "https://cdn.example.com/a.png", kind: "image", order: 0 }] } as never;
    const items = zernioMediaItems(asset, "https://os.wobble.com");
    expect(items[0].url).toBe("https://cdn.example.com/a.png");
  });

  it("createZernioPost posts to the API with an injected fetch", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ post: { _id: "zpost_9" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await createZernioPost(
      { content: "hi", platforms: [{ platform: "instagram", accountId: "acc_1" }], publishNow: true },
      { apiKey: "sk_test", fetchImpl: fakeFetch },
    );
    expect(out.id).toBe("zpost_9");
    expect(calls[0].url).toBe("https://zernio.com/api/v1/posts");
    expect(calls[0].body).toMatchObject({ content: "hi", publishNow: true, platforms: [{ platform: "instagram", accountId: "acc_1" }] });
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
