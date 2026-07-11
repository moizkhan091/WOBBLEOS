import { describe, expect, it, beforeAll } from "vitest";
import { signMediaToken, verifyMediaToken } from "@/lib/library/media-token";

beforeAll(() => { process.env.MEDIA_URL_SECRET = "test-media-secret-min-16-chars"; });

describe("signed media tokens", () => {
  it("verifies a token it signed", () => {
    const t = signMediaToken("asset_1", 0);
    expect(verifyMediaToken("asset_1", 0, t)).toBe(true);
  });
  it("rejects a token for a different asset or index (tamper-proof)", () => {
    const t = signMediaToken("asset_1", 0);
    expect(verifyMediaToken("asset_2", 0, t)).toBe(false);
    expect(verifyMediaToken("asset_1", 1, t)).toBe(false);
  });
  it("rejects a missing/garbage token", () => {
    expect(verifyMediaToken("asset_1", 0, null)).toBe(false);
    expect(verifyMediaToken("asset_1", 0, "deadbeef")).toBe(false);
  });
});
