import { describe, expect, it } from "vitest";
import {
  selectIngestionAdapter,
  inlineContentOf,
  stripHtml,
  chunkText,
  INGESTION_ADAPTERS,
  type IngestionContext,
} from "@/lib/source-intake/adapters";

const noApify: IngestionContext = { apifyConfigured: false };
const withApify: IngestionContext = { apifyConfigured: true, scrapeWebsite: async () => ({ text: "apify web text" }), scrapeInstagram: async () => ({ posts: [{ caption: "cap" }] }) };

describe("ingestion adapter registry", () => {
  it("chunkText normalizes whitespace and caps chunk count", () => {
    expect(chunkText("  a\n\n b  ")).toEqual(["a b"]);
    expect(chunkText("")).toEqual([]);
    expect(chunkText("x".repeat(50), 10, 3).length).toBe(3); // capped
  });

  it("stripHtml removes tags, scripts, styles and entities", () => {
    expect(stripHtml("<p>Hello&nbsp;<b>world</b></p><script>bad()</script>")).toBe("Hello world");
  });

  it("inlineContentOf reads content/rawText/transcript/extractedData", () => {
    expect(inlineContentOf({ metadata: { content: "hi" } })).toBe("hi");
    expect(inlineContentOf({ metadata: { transcript: "t" } })).toBe("t");
    expect(inlineContentOf({ extractedData: "ed" })).toBe("ed");
    expect(inlineContentOf({ metadata: { other: "x" } })).toBeNull();
  });

  it("selects inline_text first when a source carries inline content (no network)", () => {
    const a = selectIngestionAdapter({ url: "https://example.com", metadata: { content: "note text" } }, noApify);
    expect(a?.slug).toBe("inline_text");
  });

  it("selects rss_feed for a feed URL", () => {
    expect(selectIngestionAdapter({ url: "https://x.com/feed.xml", sourceType: "rss_feed" }, noApify)?.slug).toBe("rss_feed");
    expect(selectIngestionAdapter({ url: "https://x.com/rss" }, noApify)?.slug).toBe("rss_feed");
  });

  it("falls back to http_web for a plain URL WITHOUT apify (web ingestion is not apify-gated)", () => {
    expect(selectIngestionAdapter({ url: "https://example.com/post", sourceType: "blog" }, noApify)?.slug).toBe("http_web");
  });

  it("prefers apify_social / apify_web when a key is configured", () => {
    expect(selectIngestionAdapter({ url: "https://instagram.com/x", sourceType: "instagram_profile" }, withApify)?.slug).toBe("apify_social");
    expect(selectIngestionAdapter({ url: "https://example.com", sourceType: "website" }, withApify)?.slug).toBe("apify_web");
  });

  it("a social source without apify falls through to http_web (never a dead end)", () => {
    expect(selectIngestionAdapter({ url: "https://instagram.com/x", sourceType: "instagram_profile" }, noApify)?.slug).toBe("http_web");
  });

  it("no adapter applies to a source with neither URL nor inline content", () => {
    expect(selectIngestionAdapter({ sourceType: "manual_note" }, noApify)).toBeNull();
  });

  it("inline_text adapter chunks the inline content", async () => {
    const a = INGESTION_ADAPTERS.find((x) => x.slug === "inline_text")!;
    const out = await a.collect({ metadata: { content: "alpha beta gamma" } }, {});
    expect(out.chunks).toEqual(["alpha beta gamma"]);
  });

  it("http_web adapter fetches + strips via the injected fetcher", async () => {
    const a = INGESTION_ADAPTERS.find((x) => x.slug === "http_web")!;
    const out = await a.collect({ url: "https://example.com" }, { fetchText: async () => "<h1>Title</h1><p>Body</p>" });
    expect(out.chunks.join(" ")).toContain("Title Body");
  });

  it("rss_feed adapter extracts item titles + descriptions via the injected fetcher", async () => {
    const a = INGESTION_ADAPTERS.find((x) => x.slug === "rss_feed")!;
    const xml = `<rss><channel><item><title>First</title><description><![CDATA[<p>desc one</p>]]></description></item><item><title>Second</title><description>desc two</description></item></channel></rss>`;
    const out = await a.collect({ url: "https://x.com/feed.xml" }, { fetchText: async () => xml });
    expect(out.chunks.length).toBe(2);
    expect(out.chunks[0]).toContain("First");
    expect(out.chunks[0]).toContain("desc one");
    expect(out.chunks[1]).toContain("Second");
  });
});
