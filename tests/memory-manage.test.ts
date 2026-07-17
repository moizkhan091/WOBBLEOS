import { describe, expect, it } from "vitest";
import { canEditMemoryBanks, identityScopedBanks } from "@/lib/domain/memory";
import {
  archiveMemoryRecord,
  bulkMemoryOperation,
  correctFounderMemory,
  createMemoryRecord,
  editMemoryRecord,
  getFounderMemory,
  listMemoryVersions,
  mergeMemoryRecords,
  pinMemory,
  purgeExpiredArchivedMemory,
  restoreMemoryRecord,
  restoreMemoryVersion,
  splitMemoryRecord,
  type MemoryStore,
} from "@/lib/memory";
import { deriveAuditCategory } from "@/lib/domain/audit";
import {
  buildMemoryBankRow,
  DEFAULT_MEMORY_BANKS,
  type MemoryBankRow,
  type MemoryChunkRow,
  type MemoryRecordRow,
  type MemoryRecordVersionRow,
  type MemoryUpdateProposalRow,
} from "@/lib/domain/memory";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { Embedder } from "@/lib/embeddings";

const now = new Date("2026-07-09T12:00:00.000Z");
const embedder: Embedder = { model: "fake", embed: async (texts) => texts.map((t) => [t.length]) };

function makeStore() {
  const banks: MemoryBankRow[] = DEFAULT_MEMORY_BANKS.map((b) => buildMemoryBankRow(b, { id: `memorybank_${b.slug}`, now }));
  const records: MemoryRecordRow[] = [];
  const chunks: MemoryChunkRow[] = [];
  const versions: MemoryRecordVersionRow[] = [];
  const store: MemoryStore = {
    insertProposal: async () => {},
    getProposalById: async () => null,
    updateProposal: async () => {},
    listMemoryBanks: async (q) => banks.slice(0, q?.limit ?? banks.length),
    insertMemoryBankLinks: async () => {},
    insertMemoryRecord: async (r) => void records.push(r),
    insertMemoryChunks: async (rows) => void chunks.push(...rows),
    retrieveMemoryCandidates: async () => [],
    listMemoryRecords: async () => records,
    listMemoryProposals: async () => [],
    getMemoryRecordById: async (id) => records.find((r) => r.id === id) ?? null,
    updateMemoryRecordFields: async (id, fields) => {
      const r = records.find((x) => x.id === id);
      if (r) Object.assign(r, fields);
    },
    listChunkIdsForRecord: async (recordId) => chunks.filter((c) => c.memoryRecordId === recordId).map((c) => ({ id: c.id, content: c.content })),
    updateChunk: async (id, fields) => {
      const c = chunks.find((x) => x.id === id);
      if (c) Object.assign(c, fields);
    },
    setChunksStatusForRecord: async (recordId, status, archived) => {
      for (const c of chunks) if (c.memoryRecordId === recordId) Object.assign(c, { status, archived });
    },
    insertRecordVersion: async (row) => void versions.push(row),
    listRecordVersions: async (recordId) => versions.filter((v) => v.memoryRecordId === recordId).sort((a, b) => b.versionNumber - a.versionNumber),
    getRecordVersion: async (id) => versions.find((v) => v.id === id) ?? null,
    countRecordVersions: async (recordId) => versions.filter((v) => v.memoryRecordId === recordId).length,
    listExpiredArchivedRecords: async (before) => records.filter((r) => r.status === "archived" && r.purgeAfter !== null && r.purgeAfter < before),
    deleteRecordCascade: async (recordId) => {
      for (let i = records.length - 1; i >= 0; i--) if (records[i].id === recordId) records.splice(i, 1);
      for (let i = chunks.length - 1; i >= 0; i--) if (chunks[i].memoryRecordId === recordId) chunks.splice(i, 1);
      for (let i = versions.length - 1; i >= 0; i--) if (versions[i].memoryRecordId === recordId) versions.splice(i, 1);
    },
  };
  return { store, records, chunks, versions };
}

describe("canEditMemoryBanks", () => {
  it("lets a founder edit their own bank + shared banks, but not another founder's", () => {
    expect(canEditMemoryBanks("Moiz", ["founder_moiz"]).allowed).toBe(true);
    expect(canEditMemoryBanks("Moiz", ["company", "brand"]).allowed).toBe(true);
    expect(canEditMemoryBanks("Moiz", ["founder_ali"]).allowed).toBe(false);
    expect(canEditMemoryBanks("Moiz", ["company", "founder_ali"]).allowed).toBe(false);
  });
});

/**
 * Identity-safe personalization — NOT an access control. Founder memory is transparent, so this never
 * decides whether Ali MAY READ Moiz's profile (he may). It decides only which banks may be auto-applied
 * as the speaker's OWN context, so WOBBLE never answers Ali using Moiz's preferences as the default.
 * "Visibility is not ownership."
 */
describe("identityScopedBanks", () => {
  it("scopes out other founders' personal banks, never shared or own", () => {
    expect(identityScopedBanks("Moiz", ["founder_moiz"])).toEqual([]);
    expect(identityScopedBanks("Moiz", ["company", "brand", "founder_taste"])).toEqual([]);
    expect(identityScopedBanks("Moiz", ["founder_ali"])).toEqual(["founder_ali"]);
    expect(identityScopedBanks("Moiz", ["company", "founder_ali", "founder_haad"])).toEqual(["founder_ali", "founder_haad"]);
  });

  it("normalizes the actor the same way the edit rule does", () => {
    expect(identityScopedBanks("founder_moiz", ["founder_moiz"])).toEqual([]);
    expect(identityScopedBanks("  MOIZ  ", ["founder_moiz"])).toEqual([]);
  });

  it("treats `founder_taste` as SHARED, not as a founder named 'taste'", () => {
    expect(identityScopedBanks("Ali", ["founder_taste"])).toEqual([]);
  });

  /**
   * Fails closed on identity: if we cannot resolve who is speaking, NO founder's personal preferences
   * are auto-applied. The store's `personalizationFounder` check is `!== undefined` rather than a
   * truthiness test precisely so an empty actor reaches this branch instead of skipping the filter.
   */
  it("scopes out EVERY personal bank when the actor is unknown", () => {
    expect(identityScopedBanks("", ["founder_moiz", "founder_ali"])).toEqual(["founder_moiz", "founder_ali"]);
    expect(identityScopedBanks(undefined, ["founder_moiz"])).toEqual(["founder_moiz"]);
  });
});

/**
 * BINDING FOUNDER CORRECTION #3 — governed super-admin correction of ANOTHER founder's memory. A super-admin
 * may fix a colleague's wrong entry, but only through this path, with target+reason+confirm+before/after+
 * audit+notify. A silent cross-founder edit stays blocked (that is `canEditMemoryBanks`, tested above).
 */
describe("correctFounderMemory (governed super-admin correction)", () => {
  async function aliRecord() {
    const { store, records, versions } = makeStore();
    const rec = await createMemoryRecord(
      { title: "Ali prefers Fridays", content: "Ali prefers Friday demos", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_ali"], createdBy: "Ali" },
      { store, embedder, recordAudit: async () => {}, now },
    );
    return { store, records, versions, rec };
  }

  it("applies a governed correction: before/after + version snapshot + attributed audit + notification", async () => {
    const { store, versions, rec } = await aliRecord();
    const audit: AuditEventInput[] = [];
    const notes: { founder: string; actor: string; recordId: string }[] = [];
    const result = await correctFounderMemory(
      { recordId: rec.id, targetFounder: "ali", actor: "Moiz", content: "Ali prefers Tuesday demos", reason: "Ali told me in standup his preference changed", confirm: true },
      { store, embedder, recordAudit: async (e) => void audit.push(e), notifyFounder: async (n) => void notes.push({ founder: n.founder, actor: n.actor, recordId: n.recordId }), now },
    );
    expect(result.before.content).toBe("Ali prefers Friday demos");
    expect(result.after.content).toBe("Ali prefers Tuesday demos");
    // Prior state versioned → Ali can restore it.
    expect(versions.some((v) => v.memoryRecordId === rec.id && v.content === "Ali prefers Friday demos")).toBe(true);
    // Audit attributes the SUPER-ADMIN as actor over ALI's record, with reason + before/after.
    const ev = audit.find((e) => e.eventType === "memory.founder_corrected");
    expect(ev).toBeTruthy();
    expect(ev!.actor).toBe("Moiz");
    expect((ev!.metadata as { targetFounder: string }).targetFounder).toBe("ali");
    expect((ev!.metadata as { reason: string }).reason).toContain("standup");
    expect((ev!.metadata as { superAdminOverride: boolean }).superAdminOverride).toBe(true);
    // The affected founder was notified.
    expect(notes).toEqual([{ founder: "ali", actor: "Moiz", recordId: rec.id }]);
  });

  it("REFUSES without explicit confirmation", async () => {
    const { store, rec } = await aliRecord();
    await expect(
      correctFounderMemory({ recordId: rec.id, targetFounder: "ali", actor: "Moiz", content: "x", reason: "r", confirm: false }, { store, embedder, now }),
    ).rejects.toThrow(/confirmation/i);
  });

  it("REFUSES without a reason", async () => {
    const { store, rec } = await aliRecord();
    await expect(
      correctFounderMemory({ recordId: rec.id, targetFounder: "ali", actor: "Moiz", content: "x", reason: "   ", confirm: true }, { store, embedder, now }),
    ).rejects.toThrow(/reason/i);
  });

  it("REFUSES a target mismatch — a record owned by Ali cannot be corrected as Haad's", async () => {
    const { store, rec } = await aliRecord();
    await expect(
      correctFounderMemory({ recordId: rec.id, targetFounder: "haad", actor: "Moiz", content: "x", reason: "r", confirm: true }, { store, embedder, now }),
    ).rejects.toThrow(/belongs to 'ali'.*not 'haad'|different founder/i);
  });

  it("REFUSES a record that is not a founder personal memory (shared company bank)", async () => {
    const { store, records } = makeStore();
    const rec = await createMemoryRecord(
      { title: "Company positioning", content: "We sell outcomes", area: "company", memoryTier: "core", trustLevel: "founder_core", bankSlugs: ["company"], createdBy: "Moiz" },
      { store, embedder, recordAudit: async () => {}, now },
    );
    void records;
    await expect(
      correctFounderMemory({ recordId: rec.id, targetFounder: "moiz", actor: "Moiz", content: "x", reason: "r", confirm: true }, { store, embedder, now }),
    ).rejects.toThrow(/not a founder personal memory/i);
  });
});

describe("memory management", () => {
  it("creates a memory directly with an embedding + audit", async () => {
    const { store, records, chunks } = makeStore();
    const audit: AuditEventInput[] = [];
    const rec = await createMemoryRecord(
      { title: "Punchy hooks", content: "Moiz likes punchy hooks", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_moiz"], createdBy: "Moiz" },
      { store, embedder, recordAudit: async (e) => void audit.push(e), now },
    );
    expect(records).toHaveLength(1);
    expect(chunks[0].embedding).not.toBeNull();
    expect(audit.some((e) => e.eventType === "memory_record.created")).toBe(true);
    expect(rec.bankSlugs).toContain("founder_moiz");
  });

  it("refuses to write into another founder's personal bank", async () => {
    const { store } = makeStore();
    await expect(
      createMemoryRecord({ title: "x", content: "x", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_ali"], createdBy: "Moiz" }, { store, embedder, now }),
    ).rejects.toThrow(/personal memory bank/);
  });

  it("re-embeds the chunk when content is edited (search never goes stale)", async () => {
    const { store, chunks } = makeStore();
    const rec = await createMemoryRecord(
      { title: "t", content: "short", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_moiz"], createdBy: "Moiz" },
      { store, embedder, recordAudit: async () => {}, now },
    );
    expect(chunks[0].embedding).toEqual([5]); // "short".length
    const audit: AuditEventInput[] = [];
    await editMemoryRecord({ id: rec.id, content: "a much longer memory", editedBy: "Moiz" }, { store, embedder, recordAudit: async (e) => void audit.push(e), now });
    expect(chunks[0].content).toBe("a much longer memory");
    expect(chunks[0].embedding).toEqual([20]); // re-embedded with new length
    const edited = audit.find((e) => e.eventType === "memory_record.edited");
    expect((edited?.metadata as Record<string, unknown>).reEmbedded).toBe(true);
  });

  it("preserves the existing embedding when edited WITHOUT an embedder (never wipes search vector)", async () => {
    const { store, chunks } = makeStore();
    const rec = await createMemoryRecord(
      { title: "t", content: "orig", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_moiz"], createdBy: "Moiz" },
      { store, embedder, recordAudit: async () => {}, now },
    );
    expect(chunks[0].embedding).toEqual([4]); // "orig".length via fake embedder
    // Edit content with NO embedder configured — the old vector must be kept, not nulled.
    await editMemoryRecord({ id: rec.id, content: "changed content", editedBy: "Moiz" }, { store, embedder: null, recordAudit: async () => {}, now });
    expect(chunks[0].content).toBe("changed content");
    expect(chunks[0].embedding).toEqual([4]);
  });

  it("archives (soft-delete) and restores a memory", async () => {
    const { store, records, chunks } = makeStore();
    const rec = await createMemoryRecord(
      { title: "t", content: "c", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_moiz"], createdBy: "Moiz" },
      { store, embedder, recordAudit: async () => {}, now },
    );
    await archiveMemoryRecord({ id: rec.id, archivedBy: "Moiz", reason: "outdated" }, { store, recordAudit: async () => {}, now });
    expect(records[0].status).toBe("archived");
    expect(chunks[0].archived).toBe(true);
    await restoreMemoryRecord({ id: rec.id, restoredBy: "Moiz" }, { store, recordAudit: async () => {}, now });
    expect(records[0].status).toBe("active");
    expect(chunks[0].archived).toBe(false);
  });
});

describe("version history + 48h purge", () => {
  it("keeps edit history and can restore a prior version", async () => {
    const { store } = makeStore();
    const audit = async () => {};
    const rec = await createMemoryRecord(
      { title: "t", content: "v1 content", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_moiz"], createdBy: "Moiz" },
      { store, embedder, recordAudit: audit, now },
    );
    await editMemoryRecord({ id: rec.id, content: "v2 content", editedBy: "Moiz" }, { store, embedder, recordAudit: audit, now });
    const history = await listMemoryVersions(rec.id, { store });
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe("v1 content"); // the prior state was snapshotted

    await restoreMemoryVersion({ recordId: rec.id, versionId: history[0].id, restoredBy: "Moiz" }, { store, embedder, recordAudit: audit, now });
    const restored = await store.getMemoryRecordById(rec.id);
    expect(restored?.content).toBe("v1 content");
    // restoring is non-destructive: current (v2) was snapshotted, so 2 versions now
    expect((await listMemoryVersions(rec.id, { store })).length).toBe(2);
  });

  it("keeps an archived memory restorable for 48h, then purges it", async () => {
    const { store, records } = makeStore();
    const audit = async () => {};
    const rec = await createMemoryRecord(
      { title: "t", content: "c", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_moiz"], createdBy: "Moiz" },
      { store, embedder, recordAudit: audit, now },
    );
    await archiveMemoryRecord({ id: rec.id, archivedBy: "Moiz" }, { store, recordAudit: audit, now });
    expect(records[0].purgeAfter).not.toBeNull();

    const early = await purgeExpiredArchivedMemory({}, { store, recordAudit: audit, now: new Date(now.getTime() + 60 * 60 * 1000) });
    expect(early.purged).toBe(0); // still within the 48h window
    expect(records).toHaveLength(1);

    const late = await purgeExpiredArchivedMemory({}, { store, recordAudit: audit, now: new Date(now.getTime() + 49 * 60 * 60 * 1000) });
    expect(late.purged).toBe(1);
    expect(records).toHaveLength(0);
  });
});

describe("pinning + founder export", () => {
  it("pins a memory (sets pinned + importance) with permission + audit", async () => {
    const { store, records } = makeStore();
    const audit = async () => {};
    const rec = await createMemoryRecord(
      { title: "t", content: "important fact", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_moiz"], createdBy: "Moiz" },
      { store, embedder, recordAudit: audit, now },
    );
    await pinMemory({ id: rec.id, pinned: true, actor: "Moiz" }, { store, recordAudit: audit, now });
    const pinnedRec = records.find((r) => r.id === rec.id);
    expect(pinnedRec?.pinned).toBe(true);
    expect(pinnedRec?.importance).toBeGreaterThanOrEqual(1);
  });

  it("blocks pinning a memory in another founder's bank", async () => {
    const { store } = makeStore();
    const audit = async () => {};
    // seed a record owned by Ali, then Moiz tries to pin it
    const rec = await createMemoryRecord(
      { title: "t", content: "ali fact", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_ali"], createdBy: "Ali" },
      { store, embedder, recordAudit: audit, now },
    );
    await expect(pinMemory({ id: rec.id, pinned: true, actor: "Moiz" }, { store, recordAudit: audit, now })).rejects.toThrow(/personal memory bank/);
  });

  it("exports a founder's personal memory", async () => {
    const { store } = makeStore();
    const audit = async () => {};
    await createMemoryRecord(
      { title: "t", content: "moiz fact", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_moiz"], createdBy: "Moiz" },
      { store, embedder, recordAudit: audit, now },
    );
    const dump = await getFounderMemory("Moiz", "Moiz", { store });
    expect(dump.bank).toBe("founder_moiz");
    expect(dump.count).toBeGreaterThanOrEqual(1);
  });

  /**
   * Founder transparency is a PRODUCT REQUIREMENT, not an oversight: WOBBLE runs on founders being
   * able to see each other's company context. Asserted explicitly so a future well-meaning
   * "shouldn't this be private?" change has to argue with a failing test — an earlier pass at
   * WOB-UAT-005 made exactly that mistake and had to be reversed.
   */
  it("lets any founder READ another founder's company memory (transparency by design)", async () => {
    const { store } = makeStore();
    const audit = async () => {};
    await createMemoryRecord(
      { title: "pricing view", content: "MOIZ-COMPANY-NOTE", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_moiz"], createdBy: "Moiz" },
      { store, embedder, recordAudit: audit, now },
    );
    const dump = await getFounderMemory("Moiz", "Ali", { store });
    expect(dump.count).toBeGreaterThanOrEqual(1);
    expect(dump.records.some((r) => r.content === "MOIZ-COMPANY-NOTE")).toBe(true);
  });

  /** Transparent to read, owner-only to edit. `editable` is what the UI keys read-only mode off. */
  it("marks another founder's memory read-only and your own editable", async () => {
    const { store } = makeStore();
    expect((await getFounderMemory("Moiz", "Moiz", { store })).editable).toBe(true);
    expect((await getFounderMemory("Moiz", "Ali", { store })).editable).toBe(false);
  });

  /**
   * The real WOB-UAT-005 defect is on the WRITE side, and it stays closed: transparency must not
   * become a licence to silently rewrite a colleague's memory. Read is open; edit is owner-only.
   */
  it("still refuses to let one founder EDIT another founder's memory", async () => {
    const { store } = makeStore();
    const audit = async () => {};
    const rec = await createMemoryRecord(
      { title: "t", content: "moiz fact", area: "content", memoryTier: "working", trustLevel: "approved_expert", bankSlugs: ["founder_moiz"], createdBy: "Moiz" },
      { store, embedder, recordAudit: audit, now },
    );
    await expect(pinMemory({ id: rec.id, pinned: true, actor: "Ali" }, { store, recordAudit: audit, now })).rejects.toThrow(/personal memory bank/);
  });
});

describe("bulk ops + merge/split", () => {
  const mk = { area: "content", memoryTier: "working" as const, trustLevel: "approved_expert" as const, bankSlugs: ["founder_moiz"], createdBy: "Moiz" };
  const audit = async () => {};

  it("bulk-archives many memories and reports success/failure", async () => {
    const { store, records } = makeStore();
    const a = await createMemoryRecord({ ...mk, title: "a", content: "one" }, { store, embedder, recordAudit: audit, now });
    const b = await createMemoryRecord({ ...mk, title: "b", content: "two" }, { store, embedder, recordAudit: audit, now });
    const res = await bulkMemoryOperation({ recordIds: [a.id, b.id], operation: "archive", actor: "Moiz" }, { store, recordAudit: audit, now });
    expect(res.succeeded).toHaveLength(2);
    expect(res.failed).toHaveLength(0);
    expect(records.filter((r) => r.status === "archived")).toHaveLength(2);
  });

  it("captures partial failure (cross-founder) without aborting the batch", async () => {
    const { store } = makeStore();
    const mine = await createMemoryRecord({ ...mk, title: "mine", content: "mine" }, { store, embedder, recordAudit: audit, now });
    const theirs = await createMemoryRecord({ ...mk, bankSlugs: ["founder_ali"], createdBy: "Ali", title: "theirs", content: "theirs" }, { store, embedder, recordAudit: audit, now });
    const res = await bulkMemoryOperation({ recordIds: [mine.id, theirs.id], operation: "archive", actor: "Moiz" }, { store, recordAudit: audit, now });
    expect(res.succeeded).toEqual([mine.id]);
    expect(res.failed[0].id).toBe(theirs.id);
  });

  it("merges memories into one and archives the sources", async () => {
    const { store, records } = makeStore();
    const a = await createMemoryRecord({ ...mk, title: "a", content: "likes red" }, { store, embedder, recordAudit: audit, now });
    const b = await createMemoryRecord({ ...mk, title: "b", content: "likes blue" }, { store, embedder, recordAudit: audit, now });
    const merged = await mergeMemoryRecords({ sourceIds: [a.id, b.id], title: "colors", content: "likes red and blue", actor: "Moiz" }, { store, embedder, recordAudit: audit, now });
    expect(merged.content).toBe("likes red and blue");
    expect(records.find((r) => r.id === a.id)?.status).toBe("archived");
    expect(records.find((r) => r.id === b.id)?.status).toBe("archived");
  });

  it("splits a memory into several and archives the original", async () => {
    const { store, records } = makeStore();
    const rec = await createMemoryRecord({ ...mk, title: "combo", content: "likes red and blue" }, { store, embedder, recordAudit: audit, now });
    const parts = await splitMemoryRecord({ recordId: rec.id, parts: [{ title: "r", content: "likes red" }, { title: "b", content: "likes blue" }], actor: "Moiz" }, { store, embedder, recordAudit: audit, now });
    expect(parts).toHaveLength(2);
    expect(records.find((r) => r.id === rec.id)?.status).toBe("archived");
  });
});

describe("audit categorization", () => {
  it("labels events so the audit log is readable/filterable", () => {
    expect(deriveAuditCategory("memory_record.archived")).toBe("deletion");
    expect(deriveAuditCategory("memory_record.purged")).toBe("deletion");
    expect(deriveAuditCategory("memory_record.edited")).toBe("edit");
    expect(deriveAuditCategory("memory_record.created")).toBe("creation");
    expect(deriveAuditCategory("memory_record.restored")).toBe("restore");
    expect(deriveAuditCategory("approval.reject")).toBe("approval");
  });
});
