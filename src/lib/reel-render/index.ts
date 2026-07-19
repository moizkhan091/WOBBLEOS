import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";

/**
 * Reel render worker — turns a HyperFrames composition (seek-driven GSAP timeline on
 * window.__timelines["master"]) + a voiceover mp3 into a finished vertical 1080x1920 30fps MP4, exactly per the
 * Phase-9 PRODUCTION-PROCESS: render frames at 1.0, then post-process at the voice's speed-up (setpts + atempo)
 * with loudnorm baked in. Deterministic — every frame is a chromium screenshot of the timeline seeked to that
 * exact time, so word reveals land on the spoken beat. No fabrication: if chromium or ffmpeg is missing it
 * throws (never a fake file).
 */

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

export interface RenderReelInput {
  /** The composition HTML (from buildReelComposition). */
  html: string;
  /** Absolute path to the voiceover mp3 (the VO whose timings drove the composition). */
  audioPath: string;
  durationSec: number;
  /** post-render speed-up (Moiz = 1.05, v3 = 1.0). Applied to BOTH video + audio so they stay in sync. */
  speedUp?: number;
  fps?: number;
  /** where to write the final mp4 (absolute). Defaults to STORAGE_ROOT/media/reel-<hash>.mp4. */
  outputPath?: string;
  storageRoot?: string;
  /** cap frames for a fast proof (optional). */
  maxFrames?: number;
  /** intermediate frame codec. jpeg (default) encodes ~4x faster than png and is visually identical after H.264. */
  frameFormat?: "png" | "jpeg";
  /** optional music bed (absolute path) mixed UNDER the VO (ducked) with a tail fade-out. */
  musicPath?: string;
  /** music level as a linear gain under the VO (default 0.12 ≈ -18dB — present but never fights the voice). */
  musicVolume?: number;
}

export interface RenderReelOutput {
  outputPath: string;
  /** media ref relative to storageRoot (e.g. "media/reel-ab.mp4") when written under it. */
  mediaRef?: string;
  frames: number;
  fps: number;
  finalDurationSec: number;
  speedUp: number;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr?.slice(-500) || err.message}`));
      else resolve();
    });
  });
}

/** Render the composition to frames with chromium, then mux the VO with ffmpeg (speed-up + loudnorm). */
export async function renderReelToFile(input: RenderReelInput): Promise<RenderReelOutput> {
  const fps = input.fps ?? 30;
  const speedUp = input.speedUp ?? 1.0;
  const storageRoot = input.storageRoot ?? process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");
  const totalFrames = Math.min(input.maxFrames ?? Infinity, Math.max(1, Math.ceil(input.durationSec * fps)));

  const audioStat = await fs.stat(input.audioPath).catch(() => null);
  if (!audioStat) throw new Error(`reel render: audio not found at ${input.audioPath}`);

  const work = await fs.mkdtemp(path.join(os.tmpdir(), "wobble-reel-"));
  const framesDir = path.join(work, "frames");
  await fs.mkdir(framesDir, { recursive: true });
  const htmlPath = path.join(work, "comp.html");
  await fs.writeFile(htmlPath, input.html, "utf8");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    await page.goto(`file://${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
    // fonts + GSAP timeline must be ready before we seek/capture, else frames render unstyled.
    await page.waitForFunction(() => (window as unknown as { __hfReady?: boolean }).__hfReady === true, { timeout: 15000 });
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);

    const fmt = input.frameFormat ?? "jpeg";
    const ext = fmt === "png" ? "png" : "jpg";
    const pad = String(totalFrames).length;
    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps;
      await page.evaluate((time) => {
        const tl = (window as unknown as { __timelines: Record<string, { seek: (n: number) => void }> }).__timelines.master;
        tl.seek(time);
      }, t);
      const buf = fmt === "png" ? await page.screenshot({ type: "png" }) : await page.screenshot({ type: "jpeg", quality: 92 });
      await fs.writeFile(path.join(framesDir, `f_${String(f).padStart(pad, "0")}.${ext}`), buf);
    }

    const silent = path.join(work, "silent.mp4");
    await run(FFMPEG, ["-y", "-framerate", String(fps), "-i", path.join(framesDir, `f_%0${pad}d.${ext}`), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(fps), silent]);

    const dir = path.join(storageRoot, "media");
    await fs.mkdir(dir, { recursive: true });
    const name = `reel-${createHash("sha256").update(input.html + input.audioPath + (input.musicPath ?? "")).digest("hex").slice(0, 20)}.mp4`;
    const outputPath = input.outputPath ?? path.join(dir, name);
    // final: mux VO, apply the voice speed-up to video (setpts) + audio (atempo), loudnorm to broadcast target.
    const finalDur = input.durationSec / speedUp;
    const voChain = speedUp === 1 ? "loudnorm=I=-14:TP=-1:LRA=11" : `atempo=${speedUp},loudnorm=I=-14:TP=-1:LRA=11`;
    const vf = speedUp === 1 ? "setpts=PTS" : `setpts=PTS/${speedUp}`;
    const music = input.musicPath && (await fs.stat(input.musicPath).catch(() => null)) ? input.musicPath : null;
    if (music) {
      // Duck a music bed UNDER the VO: VO at full (normalize=0 keeps it from being halved), music quiet + tail
      // fade; amix duration=first ends the mix with the VO so trailing music never overruns.
      const vol = input.musicVolume ?? 0.12;
      const fadeSt = Math.max(0, finalDur - 1.2).toFixed(2);
      const filter = `[0:v]${vf}[v];[1:a]${voChain}[vo];[2:a]volume=${vol},afade=t=out:st=${fadeSt}:d=1.2[mus];[vo][mus]amix=inputs=2:duration=first:normalize=0[a]`;
      await run(FFMPEG, ["-y", "-i", silent, "-i", input.audioPath, "-i", music, "-filter_complex", filter, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-shortest", outputPath]);
    } else {
      await run(FFMPEG, ["-y", "-i", silent, "-i", input.audioPath, "-filter:v", vf, "-filter:a", voChain, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-shortest", outputPath]);
    }

    const mediaRef = outputPath.startsWith(dir) ? `media/${path.basename(outputPath)}` : undefined;
    return { outputPath, mediaRef, frames: totalFrames, fps, finalDurationSec: input.durationSec / speedUp, speedUp };
  } finally {
    await browser.close();
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
