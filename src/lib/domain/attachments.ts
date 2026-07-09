// Attachment intelligence — pure domain. Classifies an attached file and builds
// the right provider content part so ANY LLM call can "see" it:
//   image  -> image_url part (vision model reads the pixels)
//   pdf    -> file part (document-capable model reads the PDF)
//   text   -> inline text (code, csv, md, json, plain text)
// No IO — the caller supplies bytes as base64. Deterministic + testable.

export type AttachmentKind = "image" | "pdf" | "text" | "unsupported";

export interface AttachmentInput {
  filename: string;
  mimeType?: string;
  /** base64-encoded file bytes (no data: prefix). */
  dataBase64: string;
  /** decoded UTF-8 text, when the caller already has it (text files). Optional. */
  text?: string;
}

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic"];
const TEXT_EXT = ["txt", "md", "markdown", "csv", "tsv", "json", "yaml", "yml", "xml", "html", "htm", "js", "ts", "tsx", "jsx", "py", "sql", "css", "log", "env"];

export function extensionOf(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return m ? m[1].toLowerCase() : "";
}

export function classifyAttachment(a: { filename: string; mimeType?: string }): AttachmentKind {
  const ext = extensionOf(a.filename);
  const mime = (a.mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/") || IMAGE_EXT.includes(ext)) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("text/") || mime.includes("json") || mime.includes("xml") || TEXT_EXT.includes(ext)) return "text";
  return "unsupported";
}

export function mimeForImage(a: { filename: string; mimeType?: string }): string {
  if (a.mimeType && a.mimeType.startsWith("image/")) return a.mimeType;
  const ext = extensionOf(a.filename);
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "svg") return "image/svg+xml";
  if (ext) return `image/${ext}`;
  return "image/png";
}

/** OpenAI/OpenRouter-compatible content parts. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

const MAX_INLINE_TEXT = 200_000; // guard against pathological pastes

/** Decode base64 to UTF-8 text without Buffer typing headaches (Node runtime has Buffer). */
function decodeText(a: AttachmentInput): string {
  if (typeof a.text === "string") return a.text;
  try {
    return Buffer.from(a.dataBase64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

export interface BuiltAttachment {
  kind: AttachmentKind;
  filename: string;
  parts: ContentPart[]; // parts to append to the user message content
  note: string; // short human note ("🖼 image attached", etc.) for the audit/log
}

/** Turn one attachment into provider content parts. Unsupported files degrade to a labelled note. */
export function buildAttachmentParts(a: AttachmentInput): BuiltAttachment {
  const kind = classifyAttachment(a);
  if (kind === "image") {
    const url = `data:${mimeForImage(a)};base64,${a.dataBase64}`;
    return { kind, filename: a.filename, parts: [{ type: "image_url", image_url: { url } }], note: `🖼 image: ${a.filename}` };
  }
  if (kind === "pdf") {
    const url = `data:application/pdf;base64,${a.dataBase64}`;
    return { kind, filename: a.filename, parts: [{ type: "file", file: { filename: a.filename, file_data: url } }], note: `📄 pdf: ${a.filename}` };
  }
  if (kind === "text") {
    const body = decodeText(a).slice(0, MAX_INLINE_TEXT);
    return { kind, filename: a.filename, parts: [{ type: "text", text: `\n\n--- Attached file: ${a.filename} ---\n${body}\n--- end ${a.filename} ---` }], note: `📎 text: ${a.filename}` };
  }
  return { kind, filename: a.filename, parts: [{ type: "text", text: `\n\n[Attached file "${a.filename}" is a type I can't read directly (${a.mimeType || extensionOf(a.filename) || "unknown"}). Ask the user to describe it or convert it.]` }], note: `⚠ unsupported: ${a.filename}` };
}

/** Build a full multimodal user message from text + attachments. */
export function buildUserContent(text: string, attachments: AttachmentInput[]): { content: ContentPart[] | string; notes: string[]; hasBinary: boolean } {
  if (!attachments.length) return { content: text, notes: [], hasBinary: false };
  const built = attachments.map(buildAttachmentParts);
  const parts: ContentPart[] = [{ type: "text", text: text || "Please analyze the attached file(s)." }];
  for (const b of built) parts.push(...b.parts);
  const hasBinary = built.some((b) => b.kind === "image" || b.kind === "pdf");
  return { content: parts, notes: built.map((b) => b.note), hasBinary };
}
