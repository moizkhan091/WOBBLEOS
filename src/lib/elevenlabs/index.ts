import { loadEngagedSwitches, assertNotKilled } from "@/lib/security-governance/enforcement";
import { assertProviderAllowance, recordExternalSpend, withExternalProviderSlot, type ProviderBudgetDeps } from "@/lib/provider-budget";
import type { KillSwitchRow } from "@/lib/domain/security-governance";

/**
 * ElevenLabs voiceover adapter — a GOVERNED external provider for TEXT-TO-SPEECH ONLY. It calls exactly one
 * endpoint (POST /v1/text-to-speech/{voiceId}); it NEVER touches voice-creation / cloning endpoints, honouring
 * the founder's "no cloning" rule. Every call passes the same controls as any paid provider: kill switch →
 * budget allowance (CHARACTERS, since ElevenLabs bills per character) → max-1 concurrency, then records the
 * actual characters to the durable ledger. The key is read from the environment (UAT secrets), never logged;
 * with no key the call is truthfully BLOCKED (never a fabricated audio file). The default model + settings are
 * the client-LOCKED v2 config from Phase-9 VOICE-SETTINGS.md; the voiceId is always caller-supplied so a
 * personal voice-clone id is never baked into the repo.
 */

export const ELEVENLABS_TTS_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
export const ELEVENLABS_PROVIDER = "elevenlabs";

/** Client-LOCKED v2 settings (VOICE-SETTINGS.md, 2026-07-05): expressive-but-stable, high similarity, no style. */
export const ELEVENLABS_DEFAULT_MODEL = "eleven_multilingual_v2";
export const ELEVENLABS_DEFAULT_SETTINGS: ElevenLabsVoiceSettings = { stability: 0.4, similarity_boost: 0.75, style: 0, use_speaker_boost: true };
export const ELEVENLABS_DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
/** Hard upper bound per single call so one request can never blow the character budget. */
export const ELEVENLABS_MAX_CHARS = 5000;

export interface ElevenLabsVoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export interface ElevenLabsVoiceoverInput {
  text: string;
  /** The voice to speak with — always caller-supplied (never a hardcoded personal clone). */
  voiceId: string;
  /** The named acceptance/ledger item this voiceover advances — required (no spend without a reason). */
  item: string;
  modelId?: string;
  voiceSettings?: ElevenLabsVoiceSettings;
  outputFormat?: string;
  actor?: string;
}

export interface ElevenLabsVoiceoverOutput {
  audio: Uint8Array;
  contentType: string;
  charactersUsed: number;
  voiceId: string;
  modelId: string;
}

export interface ElevenLabsDeps extends ProviderBudgetDeps {
  fetchImpl?: typeof fetch;
  apiKey?: string;
  loadKillSwitches?: () => Promise<KillSwitchRow[]>;
}

export class ElevenLabsNotConfiguredError extends Error {
  readonly name = "ElevenLabsNotConfiguredError";
  constructor() {
    super("ElevenLabs is not configured (ELEVENLABS_API_KEY absent) — voiceover is blocked, never faked");
  }
}

export interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}
export interface ElevenLabsTimestampedOutput extends ElevenLabsVoiceoverOutput {
  alignment: ElevenLabsAlignment | null;
}

/**
 * TTS WITH per-character timestamps — the source of truth for reel caption/scene sync. Same governance as the
 * plain call. Returns the audio bytes + the character alignment. v3 returns [tags] as characters in the
 * alignment (strip them for captions with alignmentToWords in @/lib/domain/reel-voice).
 */
export async function elevenLabsVoiceoverWithTimestamps(input: ElevenLabsVoiceoverInput, deps: ElevenLabsDeps = {}): Promise<ElevenLabsTimestampedOutput> {
  const apiKey = deps.apiKey ?? process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new ElevenLabsNotConfiguredError();
  if (!input.voiceId?.trim()) throw new Error("voiceId is required for ElevenLabs voiceover");
  const text = input.text?.trim() ?? "";
  if (!text) throw new Error("text is required for ElevenLabs voiceover");
  if (text.length > ELEVENLABS_MAX_CHARS) throw new Error(`text exceeds ${ELEVENLABS_MAX_CHARS} chars (${text.length}) — split it`);

  const fetchImpl = deps.fetchImpl ?? fetch;
  const modelId = input.modelId ?? ELEVENLABS_DEFAULT_MODEL;
  const outputFormat = input.outputFormat ?? ELEVENLABS_DEFAULT_OUTPUT_FORMAT;
  const chars = text.length;

  const switches: KillSwitchRow[] = deps.loadKillSwitches ? await deps.loadKillSwitches() : await loadEngagedSwitches();
  assertNotKilled(switches, "provider", ELEVENLABS_PROVIDER);
  try {
    await assertProviderAllowance(ELEVENLABS_PROVIDER, chars, deps);
  } catch (e) {
    await recordExternalSpend({ provider: ELEVENLABS_PROVIDER, item: input.item, model: modelId, estimatedMaxCost: chars, actualCost: 0, unit: "characters", result: "rejected_budget", actor: input.actor }, deps).catch(() => {});
    throw e;
  }

  return withExternalProviderSlot(async () => {
    const started = Date.now();
    try {
      const url = `${ELEVENLABS_TTS_BASE}/${encodeURIComponent(input.voiceId)}/with-timestamps?output_format=${encodeURIComponent(outputFormat)}`;
      const resp = await fetchImpl(url, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ text, model_id: modelId, voice_settings: { ...ELEVENLABS_DEFAULT_SETTINGS, ...input.voiceSettings } }),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`ElevenLabs TTS(timestamps) failed (${resp.status}): ${body.slice(0, 200)}`);
      }
      const json = (await resp.json()) as { audio_base64?: string; alignment?: ElevenLabsAlignment | null };
      const audio = json.audio_base64 ? new Uint8Array(Buffer.from(json.audio_base64, "base64")) : new Uint8Array();
      if (audio.byteLength === 0) throw new Error("ElevenLabs returned empty audio (validation failed)");
      await recordExternalSpend({ provider: ELEVENLABS_PROVIDER, item: input.item, model: modelId, estimatedMaxCost: chars, actualCost: chars, unit: "characters", latencyMs: Date.now() - started, result: "succeeded", actor: input.actor, metadata: { bytes: audio.byteLength, voiceId: input.voiceId, timestamps: true } }, deps).catch(() => {});
      return { audio, contentType: "audio/mpeg", charactersUsed: chars, voiceId: input.voiceId, modelId, alignment: json.alignment ?? null };
    } catch (err) {
      await recordExternalSpend({ provider: ELEVENLABS_PROVIDER, item: input.item, model: modelId, estimatedMaxCost: chars, actualCost: 0, unit: "characters", latencyMs: Date.now() - started, result: "failed", actor: input.actor, metadata: { error: err instanceof Error ? err.message : String(err) } }, deps).catch(() => {});
      throw err;
    }
  }, deps);
}

export async function elevenLabsVoiceover(input: ElevenLabsVoiceoverInput, deps: ElevenLabsDeps = {}): Promise<ElevenLabsVoiceoverOutput> {
  const apiKey = deps.apiKey ?? process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new ElevenLabsNotConfiguredError();
  if (!input.voiceId?.trim()) throw new Error("voiceId is required for ElevenLabs voiceover");
  const text = input.text?.trim() ?? "";
  if (!text) throw new Error("text is required for ElevenLabs voiceover");
  if (text.length > ELEVENLABS_MAX_CHARS) throw new Error(`text exceeds ${ELEVENLABS_MAX_CHARS} chars (${text.length}) — split it`);

  const fetchImpl = deps.fetchImpl ?? fetch;
  const modelId = input.modelId ?? ELEVENLABS_DEFAULT_MODEL;
  const outputFormat = input.outputFormat ?? ELEVENLABS_DEFAULT_OUTPUT_FORMAT;
  // ElevenLabs bills per CHARACTER of input text — that IS the worst case (no hidden multiplier).
  const chars = text.length;

  // Governance BEFORE the paid call.
  const switches: KillSwitchRow[] = deps.loadKillSwitches ? await deps.loadKillSwitches() : await loadEngagedSwitches();
  assertNotKilled(switches, "provider", ELEVENLABS_PROVIDER);
  try {
    await assertProviderAllowance(ELEVENLABS_PROVIDER, chars, deps);
  } catch (e) {
    await recordExternalSpend({ provider: ELEVENLABS_PROVIDER, item: input.item, model: modelId, estimatedMaxCost: chars, actualCost: 0, unit: "characters", result: "rejected_budget", actor: input.actor }, deps).catch(() => {});
    throw e;
  }

  return withExternalProviderSlot(async () => {
    const started = Date.now();
    try {
      const url = `${ELEVENLABS_TTS_BASE}/${encodeURIComponent(input.voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
      const resp = await fetchImpl(url, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: modelId, voice_settings: { ...ELEVENLABS_DEFAULT_SETTINGS, ...input.voiceSettings } }),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`ElevenLabs TTS failed (${resp.status}): ${body.slice(0, 200)}`);
      }
      const audio = new Uint8Array(await resp.arrayBuffer());
      if (audio.byteLength === 0) throw new Error("ElevenLabs returned empty audio (validation failed)");
      const out: ElevenLabsVoiceoverOutput = {
        audio,
        contentType: resp.headers.get("content-type") ?? "audio/mpeg",
        charactersUsed: chars,
        voiceId: input.voiceId,
        modelId,
      };
      await recordExternalSpend({ provider: ELEVENLABS_PROVIDER, item: input.item, model: modelId, estimatedMaxCost: chars, actualCost: chars, unit: "characters", latencyMs: Date.now() - started, result: "succeeded", actor: input.actor, metadata: { bytes: audio.byteLength, voiceId: input.voiceId } }, deps).catch(() => {});
      return out;
    } catch (err) {
      await recordExternalSpend({ provider: ELEVENLABS_PROVIDER, item: input.item, model: modelId, estimatedMaxCost: chars, actualCost: 0, unit: "characters", latencyMs: Date.now() - started, result: "failed", actor: input.actor, metadata: { error: err instanceof Error ? err.message : String(err) } }, deps).catch(() => {});
      throw err;
    }
  }, deps);
}
