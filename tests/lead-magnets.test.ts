import { describe, expect, it } from "vitest";
import { parseLeadMagnet, buildLeadMagnetRow, LEAD_MAGNET_TYPES } from "@/lib/domain/lead-magnets";
import { generateLeadMagnet, reviewLeadMagnet, type LeadMagnetStore, type LeadMagnetDeps } from "@/lib/lead-magnets";
import type { LeadMagnetRow } from "@/lib/domain/lead-magnets";

/**
 * Lead magnets — a deeply-educational, USABLE portfolio, review-gated. These prove the parse (never invents),
 * generation lands pending_review, and the human gate (approve idempotent; retire only from approved).
 */
const validJson = JSON.stringify({
  title: "The Missed-Call Text-Back Workflow Pack",
  magnetType: "workflow_pack",
  audience: "Pakistan clinic + service-business owners",
  promise: "A working n8n flow that texts back every missed call in under 60 seconds",
  sections: [
    { heading: "What it does", body: "Recovers lost bookings from missed calls automatically." },
    { heading: "The nodes", body: "Twilio missed-call webhook → n8n → SMS with a booking link → log to CRM." },
  ],
  deliverable: "n8n nodes: 1) Twilio Webhook 2) IF landline→skip 3) Twilio SMS 'Sorry we missed you — book here: {link}' 4) Airtable log. Failure route: if SMS fails, notify owner.",
});

function memStore(): LeadMagnetStore & { rows: LeadMagnetRow[] } {
  const rows: LeadMagnetRow[] = [];
  return {
    rows,
    async insert(r) { rows.push(r); },
    async list(f) { return rows.filter((x) => (!f.status || x.status === f.status) && (!f.magnetType || x.magnetType === f.magnetType)); },
    async get(id) { return rows.find((x) => x.id === id) ?? null; },
    async update(id, fields) { const i = rows.findIndex((x) => x.id === id); if (i >= 0) rows[i] = { ...rows[i], ...fields }; },
  };
}

describe("lead magnet parsing", () => {
  it("parses a valid magnet with type, promise, sections, and a real deliverable", () => {
    const m = parseLeadMagnet(validJson);
    expect(m?.magnetType).toBe("workflow_pack");
    expect(m?.sections.length).toBeGreaterThanOrEqual(2);
    expect(m?.deliverable).toContain("Twilio");
    expect(LEAD_MAGNET_TYPES).toContain(m!.magnetType);
  });

  it("returns null on malformed / fewer than 2 sections (never invents)", () => {
    expect(parseLeadMagnet("no json")).toBeNull();
    expect(parseLeadMagnet(JSON.stringify({ title: "x", magnetType: "workflow_pack", audience: "a", promise: "p", sections: [{ heading: "h", body: "b" }], deliverable: "d" }))).toBeNull(); // <2 sections
  });

  it("buildLeadMagnetRow lands pending_review with a usable outcome", () => {
    const row = buildLeadMagnetRow({ spec: parseLeadMagnet(validJson)!, pillar: "buildable_automations", topicId: "t1" });
    expect(row.status).toBe("pending_review");
    expect(row.usableOutcome).toBe(true);
    expect(row.topicId).toBe("t1");
  });
});

describe("lead magnet service (generate → review)", () => {
  const deps = (store: LeadMagnetStore): LeadMagnetDeps => ({ store, runProvider: async () => ({ text: validJson }), recordAudit: async () => {} });

  it("generates a magnet, landing pending_review", async () => {
    const store = memStore();
    const m = await generateLeadMagnet({ topicTitle: "Missed-call recovery", teachingJob: "text-back flow", requestedBy: "moiz" }, deps(store));
    expect(m?.status).toBe("pending_review");
    expect(store.rows).toHaveLength(1);
  });

  it("returns null (audited) when the model output is unparseable — never a fake magnet", async () => {
    const store = memStore();
    const m = await generateLeadMagnet({ topicTitle: "x", teachingJob: "y", requestedBy: "moiz" }, { store, runProvider: async () => ({ text: "sorry no json" }), recordAudit: async () => {} });
    expect(m).toBeNull();
    expect(store.rows).toHaveLength(0);
  });

  it("review is idempotent, and only an approved magnet can retire", async () => {
    const store = memStore();
    const m = (await generateLeadMagnet({ topicTitle: "x", teachingJob: "y", requestedBy: "moiz" }, deps(store)))!;
    const approved = await reviewLeadMagnet({ magnetId: m.id, decision: "approved", reviewedBy: "moiz" }, deps(store));
    expect(approved?.status).toBe("approved");
    const again = await reviewLeadMagnet({ magnetId: m.id, decision: "rejected", reviewedBy: "moiz" }, deps(store));
    expect(again?.status).toBe("approved"); // idempotent
    const retired = await reviewLeadMagnet({ magnetId: m.id, decision: "retired", reviewedBy: "moiz" }, deps(store));
    expect(retired?.status).toBe("retired");
  });
});
