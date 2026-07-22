/**
 * HTML → PDF for WOBBLE documents, via headless Chromium (Playwright).
 *
 * WHY Chromium and not a PDF library: the design system is CSS. A hand-rolled PDF writer would
 * mean re-implementing the entire type ladder, the lime inversions and the grid a second time,
 * and the two would drift. Printing the exact HTML the client sees in a browser is the only way
 * the PDF and the web view stay identical.
 *
 * WHY it degrades loudly: Playwright is a devDependency and a production VPS installed with
 * `npm ci --omit=dev` has neither the package nor the browser binary. The one thing this module
 * must never do is hand back a zero-byte or placeholder PDF that gets emailed to a client. If
 * Chromium is not there, it throws `PdfRendererUnavailableError` and the caller decides.
 */

import { createRequire } from "node:module";
import { FORMATS, type DocumentFormat } from "@/lib/design-system/tokens";

/** Thrown when Chromium (or the `playwright` package) is not available in this environment. */
export class PdfRendererUnavailableError extends Error {
  readonly code = "PDF_RENDERER_UNAVAILABLE" as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PdfRendererUnavailableError";
  }
}

/** Thrown when Chromium was reachable but the render itself failed. Distinct on purpose. */
export class PdfRenderFailedError extends Error {
  readonly code = "PDF_RENDER_FAILED" as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PdfRenderFailedError";
  }
}

export interface PdfOptions {
  /**
   * Base URL Chromium resolves relative asset paths against — notably `/fonts/*.woff2`. Without
   * it the self-hosted faces cannot load and the PDF silently ships in the fallback stack.
   * Pass the running app origin (`http://127.0.0.1:3000`) or a `file://` directory URL.
   */
  readonly baseUrl?: string;
  /** Milliseconds to wait for fonts/layout to settle. */
  readonly timeoutMs?: number;
}

// Minimal structural types — we deliberately do not import Playwright's types, so that this file
// still typechecks in an environment where the devDependency has been pruned.
interface PwPdfOptions {
  printBackground: boolean;
  preferCSSPageSize: boolean;
  width?: string;
  height?: string;
  format?: string;
  landscape?: boolean;
  margin?: { top: string; right: string; bottom: string; left: string };
}
interface PwPage {
  setContent(html: string, options: { waitUntil: "load" | "networkidle"; timeout: number }): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  pdf(options: PwPdfOptions): Promise<Uint8Array>;
}
interface PwContext {
  newPage(): Promise<PwPage>;
}
interface PwBrowser {
  newContext(options?: { baseURL?: string }): Promise<PwContext>;
  close(): Promise<void>;
}
interface PwChromium {
  launch(options?: { args?: string[] }): Promise<PwBrowser>;
}
interface PlaywrightModule {
  chromium: PwChromium;
}

/**
 * Resolves Playwright at runtime through `createRequire` rather than a static/dynamic `import`.
 *
 * WHY: a bundler (Next/webpack) tries to resolve `import("playwright")` at build time and would
 * either inline the whole browser driver or fail the build on a pruned install. `createRequire`
 * is opaque to the bundler and only touched when someone actually asks for a PDF.
 */
function loadChromium(): PwChromium {
  const requireFrom = createRequire(import.meta.url);
  for (const specifier of ["playwright", "@playwright/test", "playwright-core"]) {
    try {
      const mod = requireFrom(specifier) as PlaywrightModule;
      if (mod?.chromium) return mod.chromium;
    } catch {
      // Try the next specifier — a pruned prod install has none of them.
    }
  }
  throw new PdfRendererUnavailableError(
    "PDF rendering needs Playwright. Install it (`npm i -D @playwright/test`) and the browser " +
      "(`npx playwright install --with-deps chromium`), or render the HTML and print it manually.",
  );
}

/** Playwright page options for a format. Deck prints true 16:9; the others use real paper sizes. */
export function pdfPageOptions(format: DocumentFormat): PwPdfOptions {
  const spec = FORMATS[format];
  const base: PwPdfOptions = {
    printBackground: true,
    // The generated HTML already declares `@page{size:…;margin:0}` — honouring it keeps one source
    // of truth for page geometry instead of two that can disagree.
    preferCSSPageSize: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  };
  if (format === "deck16x9") {
    return { ...base, width: `${spec.pageWidth}px`, height: `${spec.pageHeight}px`, landscape: true };
  }
  if (format === "deckA4") return { ...base, format: "A4", landscape: false };
  return { ...base, format: "Letter", landscape: false };
}

/**
 * Render a self-contained HTML string to a PDF buffer.
 *
 * @throws {PdfRendererUnavailableError} when Playwright/Chromium cannot be loaded or launched.
 * @throws {PdfRenderFailedError} when Chromium launched but the page could not be printed.
 */
export async function renderPdf(html: string, format: DocumentFormat, options?: PdfOptions): Promise<Uint8Array> {
  const chromium = loadChromium();
  const timeout = options?.timeoutMs ?? 30_000;

  let browser: PwBrowser;
  try {
    browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
  } catch (cause) {
    throw new PdfRendererUnavailableError(
      "Chromium failed to launch. Run `npx playwright install --with-deps chromium` on this host.",
      { cause },
    );
  }

  try {
    const context = await browser.newContext(options?.baseUrl ? { baseURL: options.baseUrl } : undefined);
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load", timeout });
    // Without this the first page can print in the fallback stack while the woff2 files are still
    // decoding — the exact silent-downgrade this module exists to prevent.
    await page.evaluate<Promise<void>>(() => document.fonts.ready.then(() => undefined));
    const buffer = await page.pdf(pdfPageOptions(format));
    if (!buffer || buffer.length === 0) {
      throw new PdfRenderFailedError("Chromium returned an empty PDF.");
    }
    return buffer;
  } catch (cause) {
    if (cause instanceof PdfRenderFailedError) throw cause;
    throw new PdfRenderFailedError(`PDF render failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** Cheap capability probe for a health check / UI affordance. Never throws. */
export function isPdfRendererAvailable(): boolean {
  try {
    loadChromium();
    return true;
  } catch {
    return false;
  }
}
