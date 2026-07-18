import { describe, expect, it, vi } from "vitest";
import { elevenLabsVoiceover, ElevenLabsNotConfiguredError, ELEVENLABS_MAX_CHARS } from "@/lib/elevenlabs";
import { ProviderBudgetExceededError } from "@/lib/provider-budget";

/**
 * ElevenLabs is a GOVERNED external provider: every voiceover clears the kill switch and the CHARACTER budget
 * before spending, is truthfully blocked (never faked) without a key, and only ever calls the TTS endpoint
 * (never a cloning endpoint). These prove the guards fire — the paid HTTP call is never made on a rejection.
 */
const VOICE = "test-voice-id";
function audioFetch() {
  return vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer,
    headers: { get: () => "audio/mpeg" },
  }) as unknown as Response);
}

describe("ElevenLabs voiceover adapter (governed, TTS-only)", () => {
  it("is truthfully BLOCKED without a key (never faked)", async () => {
    await expect(elevenLabsVoiceover({ text: "hi", voiceId: VOICE, item: "test" }, { apiKey: undefined }))
      .rejects.toBeInstanceOf(ElevenLabsNotConfiguredError);
  });

  it("requires a voiceId (never a hardcoded personal clone)", async () => {
    await expect(elevenLabsVoiceover({ text: "hi", voiceId: "", item: "test" }, { apiKey: "k" }))
      .rejects.toThrow(/voiceId is required/);
  });

  it("REJECTS on character-budget exceedance — the paid HTTP call is never made", async () => {
    const fetchImpl = vi.fn();
    await expect(
      elevenLabsVoiceover({ text: "a much longer line of narration", voiceId: VOICE, item: "vo" }, { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, getSpent: async () => 210000, loadKillSwitches: async () => [] }),
    ).rejects.toBeInstanceOf(ProviderBudgetExceededError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("REJECTS when a provider kill switch is engaged — no HTTP call", async () => {
    const fetchImpl = vi.fn();
    await expect(
      elevenLabsVoiceover({ text: "hi", voiceId: VOICE, item: "vo" }, { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, getSpent: async () => 0, loadKillSwitches: async () => [{ targetType: "provider", targetRef: "elevenlabs", state: "disabled", reason: "freeze" }] }),
    ).rejects.toThrow(/kill switch on provider:elevenlabs/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects text over the per-call character cap", async () => {
    await expect(elevenLabsVoiceover({ text: "x".repeat(ELEVENLABS_MAX_CHARS + 1), voiceId: VOICE, item: "vo" }, { apiKey: "k", getSpent: async () => 0, loadKillSwitches: async () => [] }))
      .rejects.toThrow(/exceeds .* chars/);
  });

  it("runs a governed TTS call and returns audio + character count (budget clear)", async () => {
    const fetchImpl = audioFetch();
    const text = "Book a free AI audit.";
    const out = await elevenLabsVoiceover({ text, voiceId: VOICE, item: "vo-audition" }, { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, getSpent: async () => 0, loadKillSwitches: async () => [] });
    expect(out.audio.byteLength).toBe(8);
    expect(out.charactersUsed).toBe(text.length);
    expect(out.voiceId).toBe(VOICE);
    expect(out.modelId).toBe("eleven_multilingual_v2"); // client-locked default
    expect(fetchImpl).toHaveBeenCalledOnce();
    // Only ever the TTS endpoint — never a cloning endpoint.
    const calledUrl = String((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]);
    expect(calledUrl).toContain("/v1/text-to-speech/");
    expect(calledUrl).not.toMatch(/voice-generation|voices\/add|\/clone/);
  });

  it("throws (and never fabricates) on an HTTP error", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, text: async () => "unauthorized" }) as unknown as Response);
    await expect(elevenLabsVoiceover({ text: "hi", voiceId: VOICE, item: "vo" }, { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, getSpent: async () => 0, loadKillSwitches: async () => [] }))
      .rejects.toThrow(/ElevenLabs TTS failed \(401\)/);
  });
});
