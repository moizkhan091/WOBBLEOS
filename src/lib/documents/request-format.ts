import { FORMATS, type DocumentFormat } from "@/lib/design-system/tokens";

/**
 * Shared `?format=` + `?download=` handling for the document routes.
 *
 * The founder's own artifacts ship in three shapes — a 16:9 stage deck for presenting, an A4 deck as a
 * print/leave-behind, and a portrait prose document — so every generated audit/proposal must be
 * requestable in any of them rather than being hardcoded to one. The THINKING is done once (the
 * WobbleDocument model); only the dressing changes, so switching format never regenerates content.
 */

/** Accepted aliases, so a human-typed `?format=a4` or `?format=slides` does the obvious thing. */
const FORMAT_ALIASES: Record<string, DocumentFormat> = {
  deck: "deck16x9",
  deck16x9: "deck16x9",
  slide: "deck16x9",
  slides: "deck16x9",
  presentation: "deck16x9",
  "16x9": "deck16x9",
  a4: "deckA4",
  decka4: "deckA4",
  a4deck: "deckA4",
  print: "deckA4",
  document: "document",
  doc: "document",
  report: "document",
  paper: "document",
};

export interface RequestedFormat {
  format: DocumentFormat;
  /** True when the caller asked for a PDF download rather than inline HTML. */
  download: boolean;
  /** Set when the caller passed a `format` we do not recognise — surface it instead of silently defaulting. */
  invalid?: string;
}

/**
 * Resolve the requested format from a URL. Unknown values are reported (never silently coerced) so a
 * typo produces a clear 400 rather than the wrong artifact landing in front of a client.
 */
export function resolveRequestedFormat(url: string, fallback: DocumentFormat): RequestedFormat {
  const params = new URL(url).searchParams;
  const raw = params.get("format");
  const download = ["1", "true", "yes", "pdf"].includes((params.get("download") ?? "").toLowerCase());
  if (raw === null || raw.trim() === "") return { format: fallback, download };
  const key = raw.trim().toLowerCase().replace(/[\s_-]/g, "");
  const resolved = FORMAT_ALIASES[key];
  if (!resolved) return { format: fallback, download, invalid: raw };
  return { format: resolved, download };
}

/** The formats a UI can offer, with founder-facing labels. Sizes come from the design-system spec. */
export function formatChoices(): Array<{ id: DocumentFormat; label: string; hint: string }> {
  const size = (f: DocumentFormat) => `${FORMATS[f].pageWidth}×${FORMATS[f].pageHeight}${FORMATS[f].pageUnit}`;
  return [
    { id: "deck16x9", label: "Slides (16:9)", hint: `${size("deck16x9")} — present on screen` },
    { id: "deckA4", label: "A4 deck", hint: `${size("deckA4")} — print / leave-behind` },
    { id: "document", label: "Document", hint: `${size("document")} — prose report to read and annotate` },
  ];
}

/** Content-Disposition + filename for a PDF download, slugged from the artifact title. */
export function pdfFilename(title: string, format: DocumentFormat): string {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "wobble-document";
  const suffix = format === "deck16x9" ? "deck" : format === "deckA4" ? "a4" : "document";
  return `${slug}-${suffix}.pdf`;
}
