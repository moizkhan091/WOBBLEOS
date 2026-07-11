import { describe, expect, it } from "vitest";
import { plausibleConfigured, readPlausibleConfig, getWebstats, normalizePlausiblePeriod } from "@/lib/analytics/plausible";

describe("plausible config", () => {
  it("is unconfigured without keys", () => {
    expect(plausibleConfigured({ apiKey: undefined, siteId: undefined })).toBe(false);
    expect(plausibleConfigured({ apiKey: "k", siteId: "wobblepk.com" })).toBe(true);
  });
  it("reads env", () => {
    const cfg = readPlausibleConfig({ PLAUSIBLE_API_KEY: "k", PLAUSIBLE_SITE_ID: "s" });
    expect(cfg.apiKey).toBe("k");
    expect(cfg.host).toBe("https://plausible.io");
  });
});

describe("getWebstats", () => {
  it("returns an honest connect-state when unconfigured (no fake data)", async () => {
    const r = await getWebstats("30d", { config: { apiKey: undefined, siteId: undefined } });
    expect(r.configured).toBe(false);
    expect(r.needs).toContain("PLAUSIBLE_API_KEY");
    expect(r.aggregate).toBeUndefined();
  });
  it("parses live Plausible responses when configured", async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes("aggregate")) return { ok: true, json: async () => ({ results: { visitors: { value: 1200 }, pageviews: { value: 3400 }, bounce_rate: { value: 42 }, visit_duration: { value: 95 } } }) } as Response;
      if (url.includes("event:page")) return { ok: true, json: async () => ({ results: [{ page: "/", visitors: 800, pageviews: 2000 }] }) } as Response;
      return { ok: true, json: async () => ({ results: [{ source: "Google", visitors: 500 }] }) } as Response;
    }) as unknown as typeof fetch;
    const r = await getWebstats("30d", { config: { apiKey: "k", siteId: "wobblepk.com", host: "https://plausible.io" }, fetchImpl });
    expect(r.configured).toBe(true);
    expect(r.aggregate?.visitors).toBe(1200);
    expect(r.topPages?.[0].page).toBe("/");
    expect(r.topSources?.[0].source).toBe("Google");
  });

  it("allowlists the period so an injected value can't smuggle query params into the URL", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      // aggregate reads results.<metric>.value; breakdowns map over an array — [] is safe for both.
      return { ok: true, json: async () => ({ results: [] }) } as Response;
    }) as unknown as typeof fetch;

    // Attempt to inject an extra `&`-delimited param + override.
    const evil = "30d&site_id=victim.com&metrics=evil";
    const r = await getWebstats(evil, { config: { apiKey: "k", siteId: "wobblepk.com", host: "https://plausible.io" }, fetchImpl });

    // Falls back to the safe default; the raw injected string never reaches the URL.
    expect(r.period).toBe("30d");
    for (const url of urls) {
      expect(url).not.toContain("victim.com");
      expect(url).not.toContain("evil");
      expect(url).toContain("period=30d&");
    }
  });

  it("normalizePlausiblePeriod passes valid tokens and rejects everything else", () => {
    for (const p of ["day", "7d", "30d", "month", "6mo", "12mo"]) expect(normalizePlausiblePeriod(p)).toBe(p);
    expect(normalizePlausiblePeriod("custom")).toBe("30d");
    expect(normalizePlausiblePeriod("30d&foo=bar")).toBe("30d");
    expect(normalizePlausiblePeriod("")).toBe("30d");
    expect(normalizePlausiblePeriod(undefined)).toBe("30d");
  });
});
