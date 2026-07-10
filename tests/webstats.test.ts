import { describe, expect, it } from "vitest";
import { plausibleConfigured, readPlausibleConfig, getWebstats } from "@/lib/analytics/plausible";

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
});
