import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import { elevenLabsVoiceoverWithTimestamps, type ElevenLabsDeps } from "@/lib/elevenlabs";
import { resolveReelVoice, reelNarrationGuidance, stripExpressionTags, alignmentToWords, type ReelVoice, type WordTiming } from "@/lib/domain/reel-voice";
import { buildReelComposition, planScenesFromWords, type ReelScene } from "@/lib/domain/reel-composition";
import { renderReelToFile, type RenderReelOutput } from "@/lib/reel-render";

/**
 * Reel orchestrator — the whole HyperFrames reel pipeline in one place: a topic + a chosen voice becomes a
 * finished vertical MP4. Flow: LLM writes WOBBLE-style spoken narration (per-voice: Moiz clean, Hale/Female
 * expressive [tags]) → ElevenLabs speaks it WITH per-character timestamps → timings become tag-stripped word
 * beats → the scene planner lays out the 3-colour kinetic-typography composition → the render worker captures
 * frames + muxes the VO (speed-up + loudnorm). No step is faked: the VO needs a real ELEVENLABS_API_KEY and the
 * render needs chromium + ffmpeg, or it throws. The narration step can be supplied directly (narrationOverride)
 * so the VO→render half is provable without the text LLM.
 */

export const REEL_WRITER_AGENT = "reel_writer";
export const REEL_MODULE = "content";

export type ReelTextProvider = (input: { role: string; module: string; model?: string; messages: ProviderChatMessage[]; maxTokens?: number; temperature?: number }) => Promise<{ text: string }>;

export interface ReelDeps extends ElevenLabsDeps {
  runProvider?: ReelTextProvider;
}

export interface GenerateReelNarrationInput {
  topic: string;
  angle?: string;
  voiceKey?: string;
  /** approx spoken length target in seconds (drives word count). Default 24. */
  targetSeconds?: number;
  model?: string;
}

/** Ask the writer LLM for WOBBLE-style spoken reel narration: hard hook → agitate the leak → "here's the fix" →
 *  the mechanism in plain words → a soft CTA. Short punchy lines, ONE idea per line. Per-voice tag rules enforced. */
export async function generateReelNarration(input: GenerateReelNarrationInput, deps: ReelDeps = {}): Promise<{ narration: string; voice: ReelVoice }> {
  const voice = resolveReelVoice(input.voiceKey);
  const run = deps.runProvider ?? runTextProvider;
  const targetWords = Math.round((input.targetSeconds ?? 24) * 2.6); // ~2.6 spoken words/sec
  const system = [
    "You write short-form vertical video (Reels/Shorts) narration for WOBBLE — an AI systems agency for local service businesses.",
    "WOBBLE voice: blunt, concrete, mechanism-first, no hype, no emojis, no hashtags. Talk to a busy owner who is losing money to a broken process.",
    "STRUCTURE (spoken, ~"+targetWords+" words total): 1) a hard hook that names the exact pain in the first 3 seconds, 2) agitate — make the leak vivid with a number or a scene, 3) the turn: 'Here's the fix.' 4) the mechanism in plain words (what the AI system actually does), 5) a calm close + a soft CTA (book a free AI audit).",
    "Write ONLY the words to be spoken — no scene directions, no labels, no markdown. Short sentences. Each sentence is its own beat.",
    reelNarrationGuidance(voice),
  ].join("\n");
  const user = `Topic: ${input.topic}${input.angle ? `\nAngle: ${input.angle}` : ""}\nWrite the narration now.`;
  const { text } = await run({ role: REEL_WRITER_AGENT, module: REEL_MODULE, model: input.model, temperature: 0.8, maxTokens: 600, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  let narration = text.trim();
  if (!voice.allowsExpressiveTags) narration = stripExpressionTags(narration); // Moiz: never any [tags], even if the model slipped one in.
  if (!narration) throw new Error("reel writer returned empty narration");
  return { narration, voice };
}

export interface ProduceReelInput {
  /** the narration to speak (with [tags] only for expressive voices). If absent, generate it from topic. */
  narration?: string;
  topic?: string;
  angle?: string;
  voiceKey?: string;
  /** the named ledger/acceptance item this reel advances (required for the governed VO spend). */
  item: string;
  targetSeconds?: number;
  storageRoot?: string;
  /** cap frames for a fast proof render. */
  maxFrames?: number;
  /** intermediate frame codec (jpeg default — faster; identical after H.264). */
  frameFormat?: "png" | "jpeg";
  scenePlanner?: (words: WordTiming[], durationSec: number) => ReelScene[];
}

export interface ProduceReelOutput extends RenderReelOutput {
  voiceKey: string;
  words: number;
  scenes: number;
  narration: string;
  captionsSrt: string;
}

/** SRT captions from tag-stripped word timings (one cue per ~7 words), scaled to the post-render speed-up. */
export function wordsToSrt(words: WordTiming[], speedUp = 1): string {
  const fmt = (s: number) => {
    const t = s / speedUp;
    const hh = Math.floor(t / 3600).toString().padStart(2, "0");
    const mm = Math.floor((t % 3600) / 60).toString().padStart(2, "0");
    const ss = Math.floor(t % 60).toString().padStart(2, "0");
    const ms = Math.round((t - Math.floor(t)) * 1000).toString().padStart(3, "0");
    return `${hh}:${mm}:${ss},${ms}`;
  };
  const cues: string[] = [];
  for (let i = 0, n = 1; i < words.length; i += 7, n++) {
    const chunk = words.slice(i, i + 7);
    if (!chunk.length) break;
    cues.push(`${n}\n${fmt(chunk[0].start)} --> ${fmt(chunk[chunk.length - 1].end)}\n${chunk.map((w) => w.word).join(" ")}\n`);
  }
  return cues.join("\n");
}

/** Full pipeline: (narration →) VO with timestamps → word beats → scene plan → composition → rendered MP4. */
export async function produceReel(input: ProduceReelInput, deps: ReelDeps = {}): Promise<ProduceReelOutput> {
  const voice = resolveReelVoice(input.voiceKey);
  let narration = input.narration?.trim() ?? "";
  if (!narration) {
    if (!input.topic) throw new Error("produceReel needs either narration or topic");
    narration = (await generateReelNarration({ topic: input.topic, angle: input.angle, voiceKey: voice.key, targetSeconds: input.targetSeconds }, deps)).narration;
  }
  // Moiz forbids tags entirely; expressive voices keep the [tags] for the TTS but captions strip them later.
  const spoken = voice.allowsExpressiveTags ? narration : stripExpressionTags(narration);

  const vo = await elevenLabsVoiceoverWithTimestamps(
    { text: spoken, voiceId: voice.id, modelId: voice.model, voiceSettings: voice.settings, item: input.item },
    deps,
  );
  if (!vo.alignment) throw new Error("ElevenLabs returned no timestamps — cannot sync the reel (never faked)");
  const words = alignmentToWords(vo.alignment);
  if (!words.length) throw new Error("no spoken words parsed from the VO alignment");
  const durationSec = Math.max(...words.map((w) => w.end)) + 0.4; // small tail so the last word/scene isn't clipped.

  const storageRoot = input.storageRoot ?? process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");
  const audioDir = await fs.mkdtemp(path.join(os.tmpdir(), "wobble-reel-vo-"));
  const audioPath = path.join(audioDir, "voiceover.mp3");
  await fs.writeFile(audioPath, vo.audio);

  try {
    const scenes = (input.scenePlanner ?? planScenesFromWords)(words, durationSec);
    const html = buildReelComposition({ title: input.topic ?? "WOBBLE reel", scenes, audioSrc: "voiceover.mp3", durationSec });
    const rendered = await renderReelToFile({ html, audioPath, durationSec, speedUp: voice.speedUp, storageRoot, maxFrames: input.maxFrames, frameFormat: input.frameFormat });
    return { ...rendered, voiceKey: voice.key, words: words.length, scenes: scenes.length, narration, captionsSrt: wordsToSrt(words, voice.speedUp) };
  } finally {
    await fs.rm(audioDir, { recursive: true, force: true }).catch(() => {});
  }
}
