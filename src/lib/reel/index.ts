import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runTextProvider, type ProviderChatMessage } from "@/lib/providers";
import { elevenLabsVoiceoverWithTimestamps, type ElevenLabsDeps } from "@/lib/elevenlabs";
import { resolveReelVoice, reelNarrationGuidance, stripExpressionTags, alignmentToWords, type ReelVoice, type WordTiming } from "@/lib/domain/reel-voice";
import { buildReelComposition, planScenesFromWords, type ReelScene } from "@/lib/domain/reel-composition";
import { buildReelDirectorPrompt, parseDirectedPlan, mapDirectedScenes } from "@/lib/domain/reel-director";
import { reelWriterKnowledge } from "@/lib/domain/reel-knowledge";
import { buildAnimatorPrompt, extractComposition, validateComposition } from "@/lib/domain/reel-authoring";
import { reelEffectCatalog } from "@/lib/domain/reel-effects";
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
export const REEL_DIRECTOR_AGENT = "reel_director";
export const REEL_ANIMATOR_AGENT = "reel_animator";
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
    reelWriterKnowledge(),
    "# YOUR TASK",
    "You are the WOBBLE REEL WRITER. Write the spoken narration for ONE short-form vertical reel, applying the craft above.",
    "WOBBLE voice: blunt, concrete, mechanism-first, no hype, no emojis, no hashtags. Talk to a busy owner losing money to a broken process.",
    `Target ~${targetWords} spoken words. Follow the 4-beat spine: hook (name the exact pain in the first 3 seconds) → value/proof (make the leak vivid with a number or a scene, drip real specifics) → the turn ('here's the fix', the mechanism in plain words) → a calm close + the soft CTA (book a free AI audit).`,
    "Write ONLY the words to be spoken — no scene directions, no labels, no markdown, no headings. Short sentences; each is its own beat; keep the sentence-end edge jagged.",
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
  /** optional model override for the writer + director LLM calls. */
  model?: string;
  targetSeconds?: number;
  storageRoot?: string;
  /** cap frames for a fast proof render. */
  maxFrames?: number;
  /** intermediate frame codec (jpeg default — faster; identical after H.264). */
  frameFormat?: "png" | "jpeg";
  /** optional music bed (absolute path) ducked under the VO. Defaults to REEL_MUSIC_BED env if set. */
  musicPath?: string;
  scenePlanner?: (words: WordTiming[], durationSec: number) => ReelScene[];
  /** author mode: the animator LLM writes the whole composition from the effect library. Default true when a
   *  topic is known + no scenePlanner override. Set false to force the template path. */
  author?: boolean;
}

export interface ProduceReelOutput extends RenderReelOutput {
  voiceKey: string;
  words: number;
  scenes: number;
  mockups: number;
  directed: boolean;
  /** true when the animator LLM authored the whole composition (full effect library); false = template path. */
  authored: boolean;
  narration: string;
  captionsSrt: string;
}

/**
 * REEL ANIMATOR — the animator LLM AUTHORS the entire HyperFrames composition (HTML+CSS+GSAP) for this reel from
 * the full effect library, the way the real WOBBLE reels are hand-made. The result is validated for the contract
 * + seek-safety + brand before we trust it; on any failure (no credit, bad HTML, unsafe motion) it returns null
 * and the caller falls back to the template path. THIS is what lifts the reel out of "a few hardcoded effects".
 */
export async function authorReelComposition(
  input: { topic: string; angle?: string; narration: string; words: WordTiming[]; durationSec: number; audioSrc: string; model?: string },
  deps: ReelDeps = {},
): Promise<{ html: string; issues: string[] } | null> {
  try {
    const run = deps.runProvider ?? runTextProvider;
    const { system, user } = buildAnimatorPrompt({ ...input, catalog: reelEffectCatalog() });
    const { text } = await run({ role: REEL_ANIMATOR_AGENT, module: REEL_MODULE, model: input.model, temperature: 0.7, maxTokens: 9000, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
    const html = extractComposition(text);
    if (!html) return null;
    const v = validateComposition(html);
    return { html, issues: v.issues }; // caller renders only when issues is empty; otherwise logs + falls back.
  } catch {
    return null;
  }
}

/**
 * Ask the REEL DIRECTOR LLM for a per-topic scene plan (backgrounds, accent words, and topic-specific mockups),
 * then map it onto the REAL word timings so everything lands on the beat. This is what makes each reel bespoke
 * to its topic instead of a reused template. Any failure (no LLM credit, bad JSON, empty plan) falls back to the
 * deterministic kinetic-typography planner — the reel always renders.
 */
export async function directReelScenes(
  input: { topic: string; angle?: string; narration: string; words: WordTiming[]; durationSec: number; model?: string },
  deps: ReelDeps = {},
): Promise<{ scenes: ReelScene[]; directed: boolean }> {
  try {
    const run = deps.runProvider ?? runTextProvider;
    const { system, user } = buildReelDirectorPrompt({ topic: input.topic, angle: input.angle, narration: input.narration, words: input.words });
    const { text } = await run({ role: REEL_DIRECTOR_AGENT, module: REEL_MODULE, model: input.model, temperature: 0.6, maxTokens: 2200, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
    const plan = parseDirectedPlan(text);
    if (plan) {
      const scenes = mapDirectedScenes(plan, input.words, input.durationSec);
      if (scenes.length) return { scenes, directed: true };
    }
  } catch {
    // fall through to the deterministic planner — a reel is better than an error.
  }
  return { scenes: planScenesFromWords(input.words, input.durationSec), directed: false };
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
    let html = "";
    let authored = false;
    let scenes: ReelScene[] = [];
    let directed = false;

    // 1) AUTHOR MODE (default when a topic is known + no scenePlanner override): the animator LLM writes the
    //    whole composition from the full effect library. Rendered only if it passes the seek-safety validator.
    const wantAuthor = input.author ?? (Boolean(input.topic) && !input.scenePlanner);
    if (wantAuthor && input.topic) {
      const authoredResult = await authorReelComposition(
        { topic: input.topic, angle: input.angle, narration: stripExpressionTags(narration), words, durationSec, audioSrc: "voiceover.mp3", model: input.model },
        deps,
      );
      if (authoredResult && authoredResult.issues.length === 0) {
        html = authoredResult.html;
        authored = true;
      }
    }

    // 2) TEMPLATE FALLBACK: the director designs a per-topic scene plan (or the deterministic planner), rendered
    //    through our built-in composition. Guarantees a reel even when authoring is unavailable/unsafe.
    if (!authored) {
      if (input.scenePlanner) {
        scenes = input.scenePlanner(words, durationSec);
      } else if (input.topic) {
        const r = await directReelScenes({ topic: input.topic, angle: input.angle, narration: stripExpressionTags(narration), words, durationSec, model: input.model }, deps);
        scenes = r.scenes;
        directed = r.directed;
      } else {
        scenes = planScenesFromWords(words, durationSec);
      }
      html = buildReelComposition({ title: input.topic ?? "WOBBLE reel", scenes, audioSrc: "voiceover.mp3", durationSec });
    }

    const mockups = scenes.filter((s) => s.mockup).length;
    const sceneCount = authored ? (html.match(/class="[^"]*\bscene\b/g)?.length ?? 0) : scenes.length;
    const rendered = await renderReelToFile({ html, audioPath, durationSec, speedUp: voice.speedUp, storageRoot, maxFrames: input.maxFrames, frameFormat: input.frameFormat, musicPath: input.musicPath ?? process.env.REEL_MUSIC_BED });
    return { ...rendered, voiceKey: voice.key, words: words.length, scenes: sceneCount, mockups, directed, authored, narration, captionsSrt: wordsToSrt(words, voice.speedUp) };
  } finally {
    await fs.rm(audioDir, { recursive: true, force: true }).catch(() => {});
  }
}
