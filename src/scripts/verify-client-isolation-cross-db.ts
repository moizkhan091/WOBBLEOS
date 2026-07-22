/**
 * CROSS-SYSTEM client-isolation canary sweep (release-candidate P0 gate) — live Postgres, no paid calls.
 *
 * Three clients, each with a fixed tripwire token that must NEVER appear in another client's scope:
 *   Alpha Dental        ALPHA-ONLY-7QK9
 *   Beta Construction   BETA-ONLY-4M2P
 *   Gamma SaaS          GAMMA-ONLY-9X3D
 *
 * Extends the task_inventory canary proof (verify-client-isolation-ledger-db.ts) to the HIGH-RISK paths:
 *   1. MEMORY retrieval — client-private banks are deny-by-default: a caller granted only Alpha sees only
 *      Alpha's canary; an ungranted caller (the default for Ask/content generation) sees NO client canary.
 *   2. MEETINGS + CRM CONTACTS — the companyId-scoped reads return only their own client's canary.
 *   3. OWNERSHIP INTEGRITY on founder-global artifacts (opportunities, audits, proposals) — every row is
 *      linked to exactly its own company and carries only its own canary (their list endpoints are
 *      founder-facing + session-gated by design in this single-company OS; asserted by route-auth tests).
 *   4. CONTENT — packets are track-scoped; Alpha's track lists only Alpha's canary.
 *   5. PROVIDER PROMPTS — the REAL content-generation prompt for Alpha's track (captured via injected
 *      runProvider, default memory path) contains Alpha's canary and NO foreign canary; the Ask WOBBLE
 *      prompt (default retrievers) contains NO client canary at all (client banks are deny-by-default).
 *   6. MEDIA JOBS — client-scoped rows; a Beta-scoped query cannot see Alpha's job; no foreign canary.
 *   7. JOB QUEUE under CONCURRENCY + RETRY — two workers race two client jobs with execution leases; each
 *      claimed payload carries exactly its own client's canary; a requeued (retry) job keeps its payload
 *      intact (no cross-contamination).
 *   8. N8N CALLBACK — a signed callback publishes exactly the named client's post; the audit trail for it
 *      carries no foreign canary. (Known scope note: entity authorization is the shared HMAC secret — the
 *      callback has no per-entity tenant check; single-company trust model, recorded in the acceptance doc.)
 *
 * Any foreign canary in a scoped read/prompt/payload is a P0 and fails the gate.
 * ISOLATED (unique ids per run) + finally-cleanup. Run: DATABASE_URL=... npx tsx src/scripts/verify-client-isolation-cross-db.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import {
  memoryBanks, memoryRecords, memoryChunks, memoryBankLinks,
  crmCompanies, crmContacts, crmOpportunities, meetings as meetingsTable,
  audits as auditsTable, proposals as proposalsTable,
  contentTracks, contentPackets, contentAssets, scheduledPosts, webhookEvents,
  mediaJobs, jobs as jobsTable, auditLogs,
} from "@/db/schema";
import { buildMemoryBankRow } from "@/lib/domain/memory";
import { createMemoryRecord, retrieveMemoryContext } from "@/lib/memory";
import { addCompany, addContact, addOpportunity, listContacts } from "@/lib/crm";
import { addMeeting, listMeetings } from "@/lib/meetings";
import { runFreeAudit } from "@/lib/free-audit";
import { createProposal } from "@/lib/proposals";
import { createContentTrack, defaultStore as contentStore, listContentPackets } from "@/lib/content";
import { buildContentPacketRow } from "@/lib/domain/content-command";
import { runContentGenerationJob } from "@/lib/content-worker";
import { askWobble } from "@/lib/ask";
import { createMediaJob } from "@/lib/media";
import { enqueueJob, defaultStore as jobStore } from "@/lib/jobs";
import { importFromContentPacket, schedulePost, defaultStore as libraryStore } from "@/lib/library";
import { receiveN8nCallback } from "@/lib/n8n";
import { signWebhookPayload } from "@/lib/security/webhooks";
import type { AuditEventInput } from "@/lib/domain/audit";

const CLIENTS = [
  { key: "alpha", name: "Alpha Dental", canary: "ALPHA-ONLY-7QK9" },
  { key: "beta", name: "Beta Construction", canary: "BETA-ONLY-4M2P" },
  { key: "gamma", name: "Gamma SaaS", canary: "GAMMA-ONLY-9X3D" },
] as const;
type ClientKey = (typeof CLIENTS)[number]["key"];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const db = getDb();
  const stamp = Date.now();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`P0 FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const noAudit = async (_: AuditEventInput) => {};
  const foreignOf = (key: ClientKey) => CLIENTS.filter((c) => c.key !== key).map((c) => c.canary);
  const cid = (key: ClientKey) => `client-${key}-${stamp}`;

  // Cleanup registries
  const bankSlugs: string[] = [];
  const recordIds: string[] = [];
  const companyIds: string[] = [];
  const meetingIds: string[] = [];
  const auditIds: string[] = [];
  const proposalIds: string[] = [];
  const trackSlugs: string[] = [];
  const packetIds: string[] = [];
  const assetIds: string[] = [];
  const mediaIds: string[] = [];
  const webhookIds: string[] = [];
  const jobQueue = `iso-${stamp}`;

  try {
    // ═══ SEED all three clients across every system ══════════════════════════════════════════════
    const seeded: Record<ClientKey, { companyId: string; bankSlug: string; trackSlug: string; trackId: string }> = {} as never;
    for (const c of CLIENTS) {
      const bankSlug = `client_${c.key}_${stamp}`;
      bankSlugs.push(bankSlug);
      await db.insert(memoryBanks).values(buildMemoryBankRow(
        { slug: bankSlug, label: `${c.name} private`, scope: "client", purpose: "client-private facts", description: "isolation proof", defaultTier: "working", allowedTrustLevels: ["founder_core", "approved_expert", "monitored"], ownerScope: "client", ownerId: cid(c.key) },
        { now: new Date() },
      ) as never);
      const rec = await createMemoryRecord({
        title: `${c.name} confidential`, memoryTier: "working", area: "client",
        content: `${c.name} confidential pricing note ${c.canary}`, trustLevel: "approved_expert",
        bankSlugs: [bankSlug], createdBy: "Moiz",
      }, { embedder: null, recordAudit: noAudit });
      recordIds.push(rec.id);

      const co = await addCompany({ name: `${c.name} ${stamp}`, createdBy: "Moiz" }, { recordAudit: noAudit });
      companyIds.push(co.id);
      await addContact({ companyId: co.id, fullName: `${c.name} Contact ${c.canary}` }, { recordAudit: noAudit });
      await addOpportunity({ name: `${c.name} deal ${c.canary}`, companyId: co.id, valueCents: 250_000, createdBy: "Moiz" }, { recordAudit: noAudit });
      const meeting = await addMeeting({ title: `${c.name} kickoff ${c.canary}`, companyId: co.id }, { recordAudit: noAudit });
      meetingIds.push(meeting.id);
      const audit = await runFreeAudit({ businessName: `${c.name}`, companyId: co.id, problems: [`ops notes ${c.canary}`] }, { recordAudit: noAudit });
      auditIds.push(audit.id);
      const prop = await createProposal({ title: `${c.name} proposal ${c.canary}`, companyId: co.id, pricingCents: 500_000, createdBy: "Moiz" }, { recordAudit: noAudit });
      proposalIds.push(prop.id);

      const trackSlug = `track_${c.key}_${stamp}`;
      trackSlugs.push(trackSlug);
      const trackRes = await createContentTrack({
        slug: trackSlug, label: `${c.name} Content`, ownerType: "client", approvalRequired: true,
        voiceProfile: { clientNote: `${c.name} voice ${c.canary}` }, goals: [`grow ${c.key}`],
      }, { recordAudit: noAudit });
      const packet = buildContentPacketRow({
        contentTrackId: trackSlug, platform: "instagram", format: "carousel", objective: "book calls",
        targetAudience: "owners", angle: `${c.key} angle`, hook: `${c.name} hook ${c.canary}`, mainCopy: "Copy",
        caption: "Caption", cta: "CTA", designDirection: "clean",
        selfReview: { usefulness: 8, originality: 8, brandFit: 8, clarity: 8, aggressionControl: 8, proofStrength: 8, postWorthiness: "pass" },
        approvalStatus: "approved", createdBy: "Moiz",
      }, { now: new Date() });
      await contentStore(db).insertPacket(packet);
      packetIds.push(packet.id);

      const media = await createMediaJob({
        kind: "image", prompt: `${c.name} ad visual ${c.canary}`, estimatedCostCents: 1, budgetCapCents: 5,
        scopeType: "client", clientId: cid(c.key), requestedBy: "Moiz", dedupeKey: `iso-media-${c.key}-${stamp}`,
      }, { recordAudit: noAudit });
      if (!media.ok || !media.job) throw new Error(`media seed failed for ${c.key}`);
      mediaIds.push(media.job.id);

      seeded[c.key] = { companyId: co.id, bankSlug, trackSlug, trackId: trackRes.track.id };
    }

    // ═══ 1. MEMORY — deny-by-default client banks ════════════════════════════════════════════════
    console.log("1. memory retrieval isolation");
    for (const c of CLIENTS) {
      const granted = await retrieveMemoryContext({ query: `${c.name} confidential pricing note`, access: { clientIds: [cid(c.key)] }, limit: 20 }, { embedder: null });
      const text = granted.map((r) => r.content).join("\n");
      assert(text.includes(c.canary), `${c.key}: a caller GRANTED ${c.key} retrieves ${c.key}'s private memory`);
      const leaked = foreignOf(c.key).filter((f) => text.includes(f));
      assert(leaked.length === 0, `${c.key}: no foreign client canary in ${c.key}-granted retrieval`);
    }
    const ungranted = await retrieveMemoryContext({ query: "confidential pricing note", limit: 50 }, { embedder: null });
    const ungrantedText = ungranted.map((r) => r.content).join("\n");
    const anyClientCanary = CLIENTS.filter((c) => ungrantedText.includes(c.canary));
    assert(anyClientCanary.length === 0, "an UNGRANTED caller (the Ask/content default) sees NO client-private canary at all (deny-by-default)");

    // ═══ 2. MEETINGS + CONTACTS — companyId-scoped reads ═════════════════════════════════════════
    console.log("2. companyId-scoped reads (meetings, contacts)");
    for (const c of CLIENTS) {
      const ms = await listMeetings({ companyId: seeded[c.key].companyId }, {});
      const mText = JSON.stringify(ms);
      assert(mText.includes(c.canary) && foreignOf(c.key).every((f) => !mText.includes(f)), `${c.key}: meetings scoped to ${c.key}'s company carry ONLY its canary`);
      const cs = await listContacts({ companyId: seeded[c.key].companyId }, {});
      const cText = JSON.stringify(cs);
      assert(cText.includes(c.canary) && foreignOf(c.key).every((f) => !cText.includes(f)), `${c.key}: contacts scoped to ${c.key}'s company carry ONLY its canary`);
    }

    // ═══ 3. OWNERSHIP INTEGRITY on founder-global artifacts ═════════════════════════════════════
    console.log("3. ownership integrity (opportunity, audit, proposal rows)");
    for (const c of CLIENTS) {
      const opp = (await db.select().from(crmOpportunities).where(eq(crmOpportunities.companyId, seeded[c.key].companyId)))[0];
      assert(Boolean(opp) && JSON.stringify(opp).includes(c.canary) && foreignOf(c.key).every((f) => !JSON.stringify(opp).includes(f)), `${c.key}: the opportunity row belongs to its own company and carries only its canary`);
    }
    const propRows = await db.select().from(proposalsTable).where(inArray(proposalsTable.id, proposalIds));
    for (const c of CLIENTS) {
      const own = propRows.find((p) => p.companyId === seeded[c.key].companyId);
      assert(Boolean(own) && JSON.stringify(own).includes(c.canary) && foreignOf(c.key).every((f) => !JSON.stringify(own).includes(f)), `${c.key}: the proposal row is company-linked with only its own canary`);
    }
    const auditRows = await db.select().from(auditsTable).where(inArray(auditsTable.id, auditIds));
    for (const c of CLIENTS) {
      const own = auditRows.find((a) => a.companyId === seeded[c.key].companyId);
      assert(Boolean(own) && foreignOf(c.key).every((f) => !JSON.stringify(own).includes(f)), `${c.key}: the audit row is company-linked with no foreign canary`);
    }

    // ═══ 4. CONTENT — track-scoped packets ═══════════════════════════════════════════════════════
    console.log("4. content packets are track-scoped");
    for (const c of CLIENTS) {
      const packets = await listContentPackets({ contentTrackId: seeded[c.key].trackSlug }, {});
      const text = JSON.stringify(packets);
      assert(text.includes(c.canary) && foreignOf(c.key).every((f) => !text.includes(f)), `${c.key}: listing ${c.key}'s track returns ONLY its canary`);
    }

    // ═══ 5. PROVIDER PROMPTS — captured, real assembly path ═════════════════════════════════════
    console.log("5. provider prompts carry no foreign client text");
    // getContentTrack resolves by track ID; brain/sources are stubbed NEUTRAL (they are company-shared by
    // design) — the paths under test are the TRACK context and the REAL default memory retrieval.
    let contentPrompt = "";
    try {
      await runContentGenerationJob(
        { contentTrackId: seeded.alpha.trackId, requestedBy: "Moiz", objective: "book consults", maxPackets: 1 },
        {
          retrieveBrain: async () => [{ slug: "brand", title: "Brand", area: "brand", content: "WOBBLE company brain (shared)" }],
          retrieveSources: async () => [{ id: "src1", title: "Approved source", sourceType: "article", trustLevel: "approved_expert", chunks: [{ id: "ch1", content: "shared source content" }] }],
          runProvider: async ({ messages }) => { contentPrompt = messages.map((m) => m.content).join("\n"); throw new Error("capture-only"); },
          recordAudit: noAudit,
        },
      );
    } catch { /* capture-only provider aborts the run after the prompt is assembled */ }
    assert(contentPrompt.includes(CLIENTS[0].canary), "alpha's REAL generation prompt contains alpha's track voice (client context flows in)");
    assert(foreignOf("alpha").every((f) => !contentPrompt.includes(f)), "alpha's generation prompt contains NO beta/gamma canary (cross-client prompt isolation)");

    let askPrompt = "";
    try {
      await askWobble(
        { question: "What is our confidential client pricing?" },
        { runProvider: async ({ messages }: { messages: Array<{ content: string }> }) => { askPrompt = messages.map((m) => m.content).join("\n"); throw new Error("capture-only"); }, recordAudit: noAudit } as never,
      );
    } catch { /* capture-only */ }
    assert(askPrompt.length > 0, "the Ask WOBBLE prompt was captured");
    assert(CLIENTS.every((c) => !askPrompt.includes(c.canary)), "the Ask WOBBLE default prompt contains NO client-private canary (client banks are deny-by-default)");

    // ═══ 6. MEDIA JOBS — client-scoped rows ══════════════════════════════════════════════════════
    console.log("6. media jobs are client-scoped");
    for (let i = 0; i < CLIENTS.length; i += 1) {
      const c = CLIENTS[i];
      const row = (await db.select().from(mediaJobs).where(eq(mediaJobs.id, mediaIds[i])))[0];
      assert(row.clientId === cid(c.key), `${c.key}: the media job carries its own clientId`);
      assert(foreignOf(c.key).every((f) => !JSON.stringify(row).includes(f)), `${c.key}: no foreign canary in the media job row`);
      const crossView = await db.select().from(mediaJobs).where(and(eq(mediaJobs.id, mediaIds[i]), eq(mediaJobs.clientId, cid(CLIENTS[(i + 1) % 3].key))));
      assert(crossView.length === 0, `${c.key}: another client's scoped query cannot see this job`);
    }

    // ═══ 7. JOB QUEUE — concurrency + retry keep payloads client-pure ═══════════════════════════
    console.log("7. job queue under concurrency + retry");
    const store = jobStore();
    await enqueueJob({ queue: jobQueue, type: "noop", payload: { clientId: cid("alpha"), note: `work ${CLIENTS[0].canary}` } }, { recordAudit: noAudit });
    await enqueueJob({ queue: jobQueue, type: "noop", payload: { clientId: cid("beta"), note: `work ${CLIENTS[1].canary}` } }, { recordAudit: noAudit });
    const now = new Date();
    const lease = (owner: string) => ({ owner, expiresAt: new Date(now.getTime() + 120_000) });
    const [claimA, claimB] = await Promise.all([
      store.claimNext(jobQueue, now, [], lease("workerA")),
      store.claimNext(jobQueue, now, [], lease("workerB")),
    ]);
    assert(Boolean(claimA) && Boolean(claimB) && claimA!.id !== claimB!.id, "two concurrent workers claim the two jobs exactly once each");
    for (const claim of [claimA!, claimB!]) {
      const payloadText = JSON.stringify(claim.payload);
      const own = CLIENTS.find((c) => payloadText.includes(c.canary));
      assert(Boolean(own), "a claimed payload carries its own client canary");
      assert(foreignOf(own!.key).every((f) => !payloadText.includes(f)), `claimed ${own!.key} payload has NO foreign canary under concurrent claim`);
    }
    // Retry: requeue A's job, reclaim it, payload must be byte-identical (no contamination on retry).
    await store.requeue(claimA!.id, null, new Date(now.getTime() + 1), "retry test", claimA!.leaseOwner ?? undefined);
    const reclaimed = await store.claimNext(jobQueue, new Date(now.getTime() + 5), [], lease("workerC"));
    assert(reclaimed?.id === claimA!.id, "the requeued (retry) job is reclaimed");
    assert(JSON.stringify(reclaimed!.payload) === JSON.stringify(claimA!.payload), "the retried job's payload is UNCHANGED (no cross-contamination on retry)");

    // ═══ 8. N8N CALLBACK — publishes exactly the named client's post ════════════════════════════
    console.log("8. n8n callback entity ownership integrity");
    const lStore = libraryStore(db);
    const alphaAsset = await importFromContentPacket(packetIds[0], { store: lStore, recordAudit: noAudit });
    assert(alphaAsset !== null, "alpha's approved packet promotes to a Library asset");
    assetIds.push(alphaAsset!.id);
    const alphaPost = await schedulePost({ assetId: alphaAsset!.id, platform: "instagram", scheduledAt: new Date(Date.now() - 60_000), publisher: "manual", createdBy: "Moiz" }, { store: lStore, recordAudit: noAudit });
    const capturedAudits: AuditEventInput[] = [];
    const secret = "iso-secret";
    const payloadText = JSON.stringify({ entityType: "scheduled_post", entityId: alphaPost.id, status: "published", publisherRef: `n8n-iso-${stamp}` });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await signWebhookPayload({ payload: payloadText, timestamp, secret });
    const cb = await receiveN8nCallback(
      { payloadText, timestamp, signature, idempotencyKey: `iso-cb-${stamp}`, eventType: "n8n.callback" },
      { getSecret: () => secret, recordAudit: async (i) => { capturedAudits.push(i); } },
    );
    assert(cb.status === "accepted", "the signed callback is accepted");
    webhookIds.push(cb.event.id);
    const postAfter = (await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, alphaPost.id)))[0];
    assert(postAfter.status === "published" && postAfter.assetId === alphaAsset!.id, "exactly the named client's post is published (asset linkage intact)");
    const auditText = JSON.stringify(capturedAudits);
    assert(foreignOf("alpha").every((f) => !auditText.includes(f)), "the callback's audit trail carries NO foreign client canary");

    console.log("\n✅ cross-system client-isolation sweep passed — no foreign canary on any high-risk path (memory, scoped reads, ownership, content, prompts, media, jobs under concurrency+retry, n8n)");
  } finally {
    // Cleanup (FK order: posts/assets → packets/tracks; chunks/links → records → banks; jobs; etc.)
    await db.delete(scheduledPosts).where(inArray(scheduledPosts.assetId, assetIds.length ? assetIds : ["_"])).catch(() => {});
    await db.delete(contentAssets).where(inArray(contentAssets.id, assetIds.length ? assetIds : ["_"])).catch(() => {});
    await db.delete(contentPackets).where(inArray(contentPackets.id, packetIds.length ? packetIds : ["_"])).catch(() => {});
    await db.delete(contentTracks).where(inArray(contentTracks.slug, trackSlugs.length ? trackSlugs : ["_"])).catch(() => {});
    if (webhookIds.length) await db.delete(webhookEvents).where(inArray(webhookEvents.id, webhookIds)).catch(() => {});
    if (mediaIds.length) await db.delete(mediaJobs).where(inArray(mediaJobs.id, mediaIds)).catch(() => {});
    await db.delete(jobsTable).where(eq(jobsTable.queue, jobQueue)).catch(() => {});
    if (recordIds.length) {
      await db.delete(memoryBankLinks).where(inArray(memoryBankLinks.memoryRecordId, recordIds)).catch(() => {});
      await db.delete(memoryChunks).where(inArray(memoryChunks.memoryRecordId, recordIds)).catch(() => {});
      await db.delete(memoryRecords).where(inArray(memoryRecords.id, recordIds)).catch(() => {});
    }
    if (bankSlugs.length) await db.delete(memoryBanks).where(inArray(memoryBanks.slug, bankSlugs)).catch(() => {});
    if (proposalIds.length) await db.delete(proposalsTable).where(inArray(proposalsTable.id, proposalIds)).catch(() => {});
    if (auditIds.length) await db.delete(auditsTable).where(inArray(auditsTable.id, auditIds)).catch(() => {});
    if (meetingIds.length) await db.delete(meetingsTable).where(inArray(meetingsTable.id, meetingIds)).catch(() => {});
    if (companyIds.length) {
      await db.delete(crmOpportunities).where(inArray(crmOpportunities.companyId, companyIds)).catch(() => {});
      await db.delete(crmContacts).where(inArray(crmContacts.companyId, companyIds)).catch(() => {});
      await db.delete(crmCompanies).where(inArray(crmCompanies.id, companyIds)).catch(() => {});
    }
    await db.delete(auditLogs).where(eq(auditLogs.eventType, "__never__")).catch(() => {});
    await closeDb().catch(() => {});
  }
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
