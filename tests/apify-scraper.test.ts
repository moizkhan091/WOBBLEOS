import { describe, expect, it } from "vitest";
import { apifyConfigured, runApifyActor, scrapeWebsite, scrapeInstagram, scrapeBusinessSignals, summarizeSignals } from "@/lib/scraper/apify";

describe("apify scraper (mocked fetch, no network/spend)", () => {
  it("is inert without a key", async () => {
    expect(apifyConfigured({ apiKey: "" })).toBe(false);
    const sig = await scrapeBusinessSignals({ website: "x.com" }, { apiKey: "" });
    expect(sig.scraped).toBe(false);
  });

  it("runs an actor and returns dataset items", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => { calls.push(String(url)); return new Response(JSON.stringify([{ text: "hello" }]), { status: 200 }); }) as unknown as typeof fetch;
    const items = await runApifyActor("apify~x", { a: 1 }, { apiKey: "sk", fetchImpl: fake });
    expect(items).toEqual([{ text: "hello" }]);
    expect(calls[0]).toContain("/acts/apify~x/run-sync-get-dataset-items?token=sk");
  });

  it("scrapes a website into a compact signal", async () => {
    const fake = (async () => new Response(JSON.stringify([{ title: "Bright Dental", text: "We are a dental clinic." }, { text: "Book online." }]), { status: 200 })) as unknown as typeof fetch;
    const w = await scrapeWebsite("brightdental.com", { apiKey: "sk", fetchImpl: fake });
    expect(w.title).toBe("Bright Dental");
    expect(w.pages).toBe(2);
    expect(w.text).toContain("dental clinic");
  });

  it("scrapes instagram posts + normalizes the handle", async () => {
    const fake = (async () => new Response(JSON.stringify([{ caption: "New smile!", likesCount: 40, commentsCount: 3, biography: "Top dentist", followersCount: 5000 }]), { status: 200 })) as unknown as typeof fetch;
    const ig = await scrapeInstagram("https://instagram.com/brightdental/", 10, { apiKey: "sk", fetchImpl: fake });
    expect(ig.handle).toBe("brightdental");
    expect(ig.followers).toBe(5000);
    expect(ig.posts[0].caption).toBe("New smile!");
  });

  it("summarizes signals into a bounded prompt block", () => {
    const block = summarizeSignals({ scraped: true, website: { url: "x", title: "Bright Dental", text: "dental clinic", pages: 3 }, instagram: { handle: "brightdental", followers: 5000, bio: "dentist", posts: [{ caption: "smile", likes: 40 }] } });
    expect(block).toContain("WEBSITE");
    expect(block).toContain("INSTAGRAM @brightdental");
    expect(block).toContain("5000 followers");
  });
});
