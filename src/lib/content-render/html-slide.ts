import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

/**
 * HTML/CSS carousel INNER slides — rendered to PNG with headless chromium (per the handoff spec: text-heavy
 * interior slides use deterministic HTML/CSS for EXACT text, while the cover is a GPT-Image-2 attention grabber).
 * Perfect typography, no AI text glitches. Falls back gracefully (caller catches) so a machine without chromium
 * still produces a carousel (via the image model instead).
 */

export interface HtmlSlideInput {
  role: string; // cover|problem|mechanism|proof|cta
  heading: string;
  body?: string;
  index: number; // 1-based
  total: number;
  accentColor?: string; // css colour, e.g. "#FF6B00"
}

const ACCENT_HEX: Record<string, string> = { "electric orange": "#FF6B00", orange: "#FF6B00", "electric lime": "#B8FF2C", lime: "#B8FF2C", crimson: "#FF3B3B", cobalt: "#3B7BFF", green: "#22C55E" };

function accentHex(accent?: string): string {
  if (!accent) return "#B8FF2C";
  if (/^#[0-9a-f]{3,8}$/i.test(accent)) return accent;
  return ACCENT_HEX[accent.trim().toLowerCase()] ?? "#B8FF2C";
}

const ROLE_LABEL: Record<string, string> = { cover: "", problem: "THE PROBLEM", mechanism: "HOW IT WORKS", proof: "PROOF", cta: "YOUR NEXT MOVE" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build the on-brand HTML for one text-heavy WOBBLE carousel slide (1080x1350). */
export function buildSlideHtml(input: HtmlSlideInput): string {
  const accent = accentHex(input.accentColor);
  const label = input.role === "mechanism" ? `STEP ${input.index - 1}` : ROLE_LABEL[input.role] ?? "";
  const bodyLines = (input.body ?? "")
    .split(/\n|(?<=\.)\s+(?=[A-Z])/)
    .map((l) => l.trim())
    .filter(Boolean);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:1080px; height:1350px; }
    body { background:#0A0B0F; color:#F2F4F1; font-family:"Archivo","Helvetica Neue",Arial,sans-serif; -webkit-font-smoothing:antialiased; position:relative; overflow:hidden; }
    .bg { position:absolute; inset:0; background:radial-gradient(1200px 700px at 80% -10%, ${accent}14, transparent 60%); }
    .grid { position:absolute; inset:0; background-image:linear-gradient(${accent}0d 1px,transparent 1px),linear-gradient(90deg,${accent}0d 1px,transparent 1px); background-size:90px 90px; opacity:.5; }
    .wrap { position:absolute; inset:0; padding:96px 90px; display:flex; flex-direction:column; }
    .label { font-size:26px; font-weight:800; letter-spacing:.22em; color:${accent}; margin-bottom:26px; }
    .h { font-size:104px; font-weight:900; line-height:.98; letter-spacing:-.02em; }
    .h b { color:${accent}; }
    .body { margin-top:auto; }
    .line { font-size:40px; line-height:1.42; color:#D7DAD3; margin-bottom:20px; display:flex; gap:20px; }
    .line::before { content:""; flex:0 0 auto; width:14px; height:14px; margin-top:16px; border-radius:3px; background:${accent}; }
    .foot { display:flex; justify-content:space-between; align-items:flex-end; margin-top:56px; }
    .mark { font-size:40px; font-weight:900; }
    .mark b { color:${accent}; }
    .num { font-size:24px; color:#7a7f74; font-weight:700; }
  </style></head><body>
    <div class="bg"></div><div class="grid"></div>
    <div class="wrap">
      ${label ? `<div class="label">${esc(label)}</div>` : ""}
      <div class="h">${esc(input.heading)}</div>
      <div class="body">${bodyLines.map((l) => `<div class="line">${esc(l)}</div>`).join("")}</div>
      <div class="foot"><div class="mark">wobble<b>.</b></div><div class="num">${input.index} / ${input.total}</div></div>
    </div>
  </body></html>`;
}

/** Rasterise one slide's HTML to a PNG file under STORAGE_ROOT/media; returns the media ref (e.g. "media/ab.png"). */
export async function renderHtmlSlideToFile(input: HtmlSlideInput, opts: { storageRoot?: string } = {}): Promise<string> {
  const { chromium } = await import("playwright");
  const storageRoot = opts.storageRoot ?? process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");
  const html = buildSlideHtml(input);
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle" });
    const buf = await page.screenshot({ type: "png" });
    const dir = path.join(storageRoot, "media");
    await fs.mkdir(dir, { recursive: true });
    const name = `${createHash("sha256").update(buf).digest("hex").slice(0, 32)}.png`;
    await fs.writeFile(path.join(dir, name), buf);
    return `media/${name}`;
  } finally {
    await browser.close();
  }
}
