/**
 * WOBBLE ElevenLabs voiceover (execution-order step 17) — ONE governed audition VO (founder cap: ≤1 audition).
 * TTS-only (never cloning). Uses the client-LOCKED v2 config (eleven_multilingual_v2 + the VOICE-SETTINGS.md
 * settings, NEVER v3 for the Moiz voice). Character spend is recorded to external_provider_spend against the
 * ElevenLabs budget. The MP3 is written to a scratch dir (never committed).
 *
 * Run:  DATABASE_URL=… ELEVENLABS_API_KEY=… ELEVENLABS_VOICE_ID=… STORAGE_ROOT=…/scratch npx tsx src/scripts/prove-elevenlabs-voiceover.ts
 */
import { writeFileSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";
import { closeDb } from "@/db";
import { elevenLabsVoiceover } from "@/lib/elevenlabs";
import { getProviderSpend } from "@/lib/provider-budget";

const FOUNDER = "Moiz";
// A short, on-brand WOBBLE line (keeps the audition tiny vs the character budget).
const SCRIPT = "Most agencies keep AI behind the curtain. WOBBLE puts it inside your business. Book a free AI audit.";

async function main() {
  // The secret may carry an inline "# annotation" and/or a comma list of voices — take the first bare id.
  const voiceId = (process.env.ELEVENLABS_VOICE_ID ?? "").split(/[#,]/)[0].trim();
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID not set");
  const storageRoot = process.env.STORAGE_ROOT ?? process.cwd();

  console.log(`  audition: voice=${voiceId.slice(0, 6)}… model=eleven_multilingual_v2 chars=${SCRIPT.length}`);
  const out = await elevenLabsVoiceover(
    { text: SCRIPT, voiceId, item: "media:voiceover:audition", actor: FOUNDER },
    {},
  );

  const dir = path.join(storageRoot, "media");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `wobble-audition-${voiceId.slice(0, 8)}.mp3`);
  writeFileSync(file, out.audio);
  const size = statSync(file).size;
  console.log(`  audition MP3 = ${(size / 1024).toFixed(1)} KB (${out.contentType}), charactersUsed=${out.charactersUsed}`);
  if (size < 1000) throw new Error(`audition audio suspiciously small (${size} bytes)`);

  const spent = await getProviderSpend("elevenlabs");
  console.log(`  ElevenLabs character spend now ${spent} of 210000 (stop) / 232285 (ceiling)`);
  console.log("  DONE: ElevenLabs voiceover proven live (governed, character-budget-tracked, v2 locked, TTS-only).");
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
