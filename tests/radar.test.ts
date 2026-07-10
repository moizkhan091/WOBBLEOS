import { describe, expect, it } from "vitest";
import { buildRadarScanRow, radarOutputSchema, topSignals, type RadarScanRow } from "@/lib/domain/radar";
import { addRadarScan, generateRadarScan, setRadarStatus, listRadarScans, type RadarStore } from "@/lib/radar";

const now = new Date("2026-07-10T12:00:00Z");

describe("radar domain", () => {
  it("builds a new scan + ranks signals", () => {
    expect(buildRadarScanRow({ focus: "AI voice agents" }, { now, id: "radar_1" }).status).toBe("new");
    const top = topSignals([{ title: "a", score: 30 }, { title: "b", score: 90 }, { title: "c", score: 60 }], 2);
    expect(top.map((s) => s.title)).toEqual(["b", "c"]);
  });
  it("parses LLM signal output", () => {
    const p = radarOutputSchema.parse({ signals: [{ title: "X", category: "market", score: 80 }] });
    expect(p.signals[0].category).toBe("market");
  });
});

function store() {
  const m = new Map<string, RadarScanRow>();
  const s: RadarStore = {
    insertScan: async (r) => void m.set(r.id, r),
    listScans: async (q) => [...m.values()].filter((r) => (!q.status || r.status === q.status) && (q.includeArchived || !r.archivedAt)).slice(0, q.limit),
    getScan: async (id) => m.get(id) ?? null,
    updateScan: async (id, f) => { const r = m.get(id); if (r) m.set(id, { ...r, ...f }); },
  };
  return s;
}

describe("radar service", () => {
  it("generates + scores signals, then dismiss archives", async () => {
    const s = store();
    const scan = await addRadarScan({ focus: "SMB automation in Pakistan" }, { store: s, now, recordAudit: async () => {} });
    const gen = await generateRadarScan(scan.id, {}, {
      store: s, now, recordAudit: async () => {},
      runProvider: async () => ({ text: JSON.stringify({ signals: [{ title: "WhatsApp Business API adoption rising", category: "technology", summary: "s", implication: "sell chatbots", score: 150 }] }), run: { id: "run_1" } }),
    });
    expect(gen?.signals).toHaveLength(1);
    expect(gen?.signals[0].score).toBe(100); // clamped
    expect(gen?.status).toBe("reviewed");
    const dismissed = await setRadarStatus(scan.id, "dismissed", {}, { store: s, now, recordAudit: async () => {} });
    expect(dismissed?.status).toBe("dismissed");
    expect(await listRadarScans({}, { store: s })).toHaveLength(0); // archived hidden
  });
});
