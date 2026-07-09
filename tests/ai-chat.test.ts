import { describe, expect, it } from "vitest";
import { buildGreeting, dayPartForHour } from "@/lib/domain/greeting";
import { classifyAttachment, buildAttachmentParts, buildUserContent, extensionOf } from "@/lib/domain/attachments";
import { chatWithWobble } from "@/lib/ai-chat";
import type { ProviderChatMessage } from "@/lib/providers";

describe("greeting domain", () => {
  it("maps hours to day parts", () => {
    expect(dayPartForHour(2)).toBe("late_night");
    expect(dayPartForHour(9)).toBe("morning");
    expect(dayPartForHour(14)).toBe("afternoon");
    expect(dayPartForHour(19)).toBe("evening");
    expect(dayPartForHour(23)).toBe("night");
  });
  it("greets a founder by first name, deterministically for a given pick", () => {
    const g = buildGreeting({ founder: "Moiz Khan", hour: 9, pick: 0 });
    expect(g.greeting).toContain("Moiz");
    expect(g.greeting).not.toContain("Khan");
    expect(g.dayPart).toBe("morning");
    // same pick -> same greeting
    expect(buildGreeting({ founder: "Moiz", hour: 9, pick: 0 }).greeting).toBe(g.greeting);
  });
  it("falls back to 'there' with no founder and handles late night", () => {
    const g = buildGreeting({ founder: null, hour: 3, pick: 0.5 });
    expect(g.name).toBe("there");
    expect(g.dayPart).toBe("late_night");
  });
});

describe("attachment domain", () => {
  it("classifies by mime and extension", () => {
    expect(extensionOf("deck.PDF")).toBe("pdf");
    expect(classifyAttachment({ filename: "shot.png" })).toBe("image");
    expect(classifyAttachment({ filename: "x", mimeType: "image/jpeg" })).toBe("image");
    expect(classifyAttachment({ filename: "report.pdf" })).toBe("pdf");
    expect(classifyAttachment({ filename: "data.csv" })).toBe("text");
    expect(classifyAttachment({ filename: "weird.bin" })).toBe("unsupported");
  });
  it("builds an image_url part for images", () => {
    const b = buildAttachmentParts({ filename: "a.png", dataBase64: "AAAA" });
    expect(b.kind).toBe("image");
    expect(b.parts[0]).toMatchObject({ type: "image_url" });
    expect((b.parts[0] as { image_url: { url: string } }).image_url.url).toContain("data:image/png;base64,AAAA");
  });
  it("inlines text files and folds attachments into multimodal content", () => {
    const text = Buffer.from("hello world", "utf-8").toString("base64");
    const { content, hasBinary } = buildUserContent("summarize", [{ filename: "n.txt", dataBase64: text }]);
    expect(Array.isArray(content)).toBe(true);
    expect(hasBinary).toBe(false);
    expect(JSON.stringify(content)).toContain("hello world");
  });
});

describe("chatWithWobble", () => {
  it("assembles messages, passes the file-parser plugin for PDFs, and audits", async () => {
    let captured: { messages: ProviderChatMessage[]; plugins?: unknown } | null = null;
    let audited = false;
    const res = await chatWithWobble(
      { message: "read this", attachments: [{ filename: "deck.pdf", dataBase64: "JVBERi0x" }], founder: "Moiz" },
      {
        runProvider: async (i) => { captured = { messages: i.messages, plugins: i.plugins }; return { text: "done", run: { id: "run_1" } }; },
        recordAudit: async () => { audited = true; },
      },
    );
    expect(res.text).toBe("done");
    expect(res.runId).toBe("run_1");
    expect(captured!.plugins).toBeTruthy(); // PDF -> file-parser plugin
    expect(captured!.messages[0].role).toBe("system");
    expect(audited).toBe(true);
  });
  it("rejects an empty turn", async () => {
    await expect(chatWithWobble({ message: "", attachments: [] })).rejects.toThrow();
  });
});
