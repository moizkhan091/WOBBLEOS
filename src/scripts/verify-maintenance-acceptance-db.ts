/**
 * ACCEPTANCE proof (against live Postgres) that the recent batch's four OBSERVABLE state effects actually
 * fire end-to-end — not just that the code exists. Each is a business-visible change a founder would see:
 *
 *   1. PROPOSAL AUTO-EXPIRY  — a `sent` proposal past its validity window is swept to `expired` (stops
 *      counting as open pipeline). Idempotent (a second sweep is a no-op).
 *   2. INVOICE OVERDUE SWEEP — a `sent` invoice past its dueDate with an open balance is swept to `overdue`
 *      (the invoice STATUS matches reality, not just a derived dashboard figure).
 *   3. DECISION-POLICY READ-BACK — activating a founder-approved decision policy actually INJECTS its
 *      statement into the decision scorer's prompt (activation changes a decision; it is not write-only).
 *   4. N8N CALLBACK RETURN-LEG — an inbound signed n8n callback reporting a post `published` flips the
 *      scheduled post to `published` (the callback ADVANCES business state, not only logs). Idempotent.
 *
 * No paid LLM calls: the decision scorer's provider is stubbed to CAPTURE the prompt it receives, so we prove
 * the real read-back path (defaultLoadPolicyGuidance → real DB → scorer messages) without spending tokens.
 * ISOLATED (unique ids) + finally-cleanup. Run:  DATABASE_URL=... npx tsx src/scripts/verify-maintenance-acceptance-db.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "@/db";
import {
  proposals as proposalsTable,
  invoices as invoicesTable,
  decisions as decisionsTable,
  decisionPolicies as decisionPoliciesTable,
  contentAssets,
  contentPackets,
  contentTracks,
  scheduledPosts,
  webhookEvents,
} from "@/db/schema";
import { createProposal, sweepExpiredProposals, defaultStore as proposalStore, PROPOSAL_EXPIRY_MS } from "@/lib/proposals";
import { createInvoice, invoiceAction, sweepOverdueInvoices, defaultStore as financeStore } from "@/lib/finance";
import { addDecision, scoreDecisionOptions } from "@/lib/decisions";
import { createDbDecisionPolicyStore } from "@/lib/decision-learning";
import { createContentTrack, defaultStore as contentStore } from "@/lib/content";
import { buildContentPacketRow } from "@/lib/domain/content-command";
import { importFromContentPacket, schedulePost, markPostPublished, defaultStore as libraryStore } from "@/lib/library";
import { receiveN8nCallback } from "@/lib/n8n";
import { signWebhookPayload } from "@/lib/security/webhooks";
import { newId } from "@/lib/ids";
import type { AuditEventInput } from "@/lib/domain/audit";
import type { ProviderChatMessage } from "@/lib/providers";
import type { DecisionPolicyProposal } from "@/lib/domain/decision-learning";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const db = getDb();
  const now = new Date();
  const stamp = Date.now();
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAIL: ${m}`); console.log(`  ✓ ${m}`); };
  const noAudit = async (_: AuditEventInput) => {};

  // Track ids for cleanup.
  const proposalIds: string[] = [];
  const invoiceIds: string[] = [];
  const decisionIds: string[] = [];
  const policyIds: string[] = [];
  const packetIds: string[] = [];
  const assetIds: string[] = [];
  const trackSlugs: string[] = [];
  const webhookIds: string[] = [];

  try {
    // ═══ 1. PROPOSAL AUTO-EXPIRY ═══════════════════════════════════════════════════════════════════
    console.log("1. proposal auto-expiry sweep");
    const pStore = proposalStore(db);
    const prop = await createProposal(
      { title: `Acceptance proposal ${stamp}`, scope: "acceptance", pricingCents: 500_000, createdBy: "Moiz" },
      { store: pStore, recordAudit: noAudit, now },
    );
    proposalIds.push(prop.id);
    // Simulate a proposal that was SENT just past the validity window (default 30d) and never actioned.
    const sentLongAgo = new Date(now.getTime() - PROPOSAL_EXPIRY_MS - 60_000);
    await pStore.updateProposal(prop.id, { status: "sent", sentAt: sentLongAgo, updatedAt: sentLongAgo });
    // A fresh sent proposal (inside the window) must NOT be swept — control.
    const fresh = await createProposal(
      { title: `Fresh proposal ${stamp}`, scope: "acceptance", pricingCents: 100_000, createdBy: "Moiz" },
      { store: pStore, recordAudit: noAudit, now },
    );
    proposalIds.push(fresh.id);
    await pStore.updateProposal(fresh.id, { status: "sent", sentAt: now, updatedAt: now });

    const swept = await sweepExpiredProposals({ store: pStore, recordAudit: noAudit, now });
    assert(swept.expired >= 1, "the expiry sweep expires at least the stale proposal");
    const propAfter = (await db.select().from(proposalsTable).where(eq(proposalsTable.id, prop.id)))[0];
    const freshAfter = (await db.select().from(proposalsTable).where(eq(proposalsTable.id, fresh.id)))[0];
    assert(propAfter.status === "expired", "the stale (past-window) sent proposal is flipped to 'expired'");
    assert(freshAfter.status === "sent", "a fresh (in-window) sent proposal is NOT expired (control holds)");
    // Idempotent: a re-sweep does not touch the already-expired row.
    const reSwept = await sweepExpiredProposals({ store: pStore, recordAudit: noAudit, now });
    const propReExpired = (await db.select().from(proposalsTable).where(eq(proposalsTable.id, prop.id)))[0];
    assert(propReExpired.status === "expired", "re-sweep leaves the expired proposal expired (idempotent)");
    void reSwept;

    // ═══ 2. INVOICE OVERDUE SWEEP ══════════════════════════════════════════════════════════════════
    console.log("2. invoice overdue sweep");
    const fStore = financeStore(db);
    const pastDue = new Date(now.getTime() - 5 * 86_400_000); // due 5 days ago
    const inv = await createInvoice(
      {
        lineItems: [{ description: "AI OS retainer", quantity: 1, unitPriceCents: 250_000 }],
        dueDate: pastDue,
        notes: `Acceptance Co ${stamp}`,
        createdBy: "Moiz",
      },
      { store: fStore, recordAudit: noAudit, now: new Date(now.getTime() - 10 * 86_400_000) },
    );
    invoiceIds.push(inv.id);
    // Move it to 'sent' (approve → send) so it is an overdue candidate with an open balance.
    await invoiceAction(inv.id, "approve", { actor: "Moiz" }, { store: fStore, recordAudit: noAudit, now });
    await invoiceAction(inv.id, "send", { actor: "Moiz" }, { store: fStore, recordAudit: noAudit, now });
    const invSent = (await db.select().from(invoicesTable).where(eq(invoicesTable.id, inv.id)))[0];
    assert(invSent.status === "sent", "the invoice is 'sent' with an open balance before the sweep");

    const invSwept = await sweepOverdueInvoices({ store: fStore, recordAudit: noAudit, now });
    assert(invSwept.marked >= 1, "the overdue sweep marks at least the past-due invoice");
    const invAfter = (await db.select().from(invoicesTable).where(eq(invoicesTable.id, inv.id)))[0];
    assert(invAfter.status === "overdue", "the past-due open invoice is flipped to 'overdue'");

    // ═══ 3. DECISION-POLICY READ-BACK INTO SCORING ═════════════════════════════════════════════════
    console.log("3. decision-policy read-back into the scorer");
    const category = `acc_pricing_${stamp}`;
    const uniqueStatement = `ACCEPTANCE-POLICY-${stamp}: when pricing a retainer, prefer value-based tiers over hourly.`;
    const policyStore = createDbDecisionPolicyStore(db);
    const activePolicy: DecisionPolicyProposal = {
      id: newId("pol"),
      scope: "wobble",
      scopeId: "wobble",
      category,
      direction: "value-based tiers",
      statement: uniqueStatement,
      status: "active",
      confidence: 0.9,
      repetitionCount: 3,
      agreementRatio: 1,
      contested: false,
      dissentCount: 0,
      evidence: [],
      effectiveFrom: now,
      effectiveTo: null,
      supersedes: null,
      origin: "explicit_approval",
      createdAt: now,
    };
    await policyStore.insertPolicy(activePolicy);
    policyIds.push(activePolicy.id);

    const decision = await addDecision(
      { title: `How to price the ${stamp} retainer`, category, context: "New enterprise retainer", options: [
        { label: "Value-based tiers" }, { label: "Hourly billing" },
      ], createdBy: "Moiz" } as Parameters<typeof addDecision>[0],
      { store: undefined, recordAudit: noAudit, now },
    );
    decisionIds.push(decision.id);

    // CAPTURE the scorer's prompt without a paid call. Return a valid score JSON for the real options.
    let capturedSystemText = "";
    const captureProvider = async (input: { messages: ProviderChatMessage[] }) => {
      capturedSystemText = input.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
      const opts = decision.options.map((o, i) => ({ id: o.id, score: i === 0 ? 88 : 40, rationale: "captured" }));
      return { text: JSON.stringify(opts), run: { id: newId("run") } };
    };
    await scoreDecisionOptions(decision.id, { actor: "Moiz" }, { runProvider: captureProvider, recordAudit: noAudit, now });
    assert(capturedSystemText.includes(uniqueStatement), "the ACTIVE decision policy's statement is injected into the scorer's system prompt (activation changes scoring)");

    // Control: a scorer for a DIFFERENT category must NOT receive this policy.
    const otherDecision = await addDecision(
      { title: `Unrelated ${stamp}`, category: `other_${stamp}`, options: [{ label: "A" }, { label: "B" }], createdBy: "Moiz" } as Parameters<typeof addDecision>[0],
      { recordAudit: noAudit, now },
    );
    decisionIds.push(otherDecision.id);
    let otherSystemText = "";
    await scoreDecisionOptions(otherDecision.id, { actor: "Moiz" }, {
      runProvider: async (input: { messages: ProviderChatMessage[] }) => {
        otherSystemText = input.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
        return { text: JSON.stringify(otherDecision.options.map((o) => ({ id: o.id, score: 50 }))), run: { id: newId("run") } };
      }, recordAudit: noAudit, now,
    });
    assert(!otherSystemText.includes(uniqueStatement), "an unrelated-category decision does NOT get this policy (scope-correct read-back)");

    // ═══ 4. N8N CALLBACK RETURN-LEG FLIPS A POST ═══════════════════════════════════════════════════
    console.log("4. n8n callback flips a scheduled post to published");
    const lStore = libraryStore(db);
    const cStore = contentStore(db);
    const trackSlug = `acc_track_${stamp}`;
    trackSlugs.push(trackSlug);
    await createContentTrack({ slug: trackSlug, label: "Acceptance Track", ownerType: "company", approvalRequired: true }, { recordAudit: noAudit });
    const packet = buildContentPacketRow({
      contentTrackId: trackSlug, platform: "instagram", format: "carousel", objective: "book calls", targetAudience: "founders",
      angle: "specificity beats volume", hook: `Hook ${stamp}`, mainCopy: "Copy", caption: "Caption", cta: "CTA", designDirection: "clean premium",
      selfReview: { usefulness: 8, originality: 8, brandFit: 8, clarity: 8, aggressionControl: 8, proofStrength: 8, postWorthiness: "pass" },
      approvalStatus: "approved", createdBy: "Moiz",
    }, { now });
    await cStore.insertPacket(packet);
    packetIds.push(packet.id);
    const asset = await importFromContentPacket(packet.id, { store: lStore, recordAudit: noAudit });
    assert(asset !== null, "an approved packet promotes to a publishable Library asset");
    assetIds.push(asset!.id);
    const post = await schedulePost(
      { assetId: asset!.id, platform: "instagram", scheduledAt: new Date(now.getTime() - 60_000), publisher: "manual", createdBy: "Moiz" },
      { store: lStore, recordAudit: noAudit },
    );
    assert(post.status === "scheduled", "the post starts 'scheduled' before the callback");

    // Build a VALID signed inbound callback the way n8n would (HMAC over timestamp.payload with the shared secret).
    const secret = "acceptance-secret";
    const payloadText = JSON.stringify({ entityType: "scheduled_post", entityId: post.id, status: "published", publisherRef: `n8n-${stamp}` });
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const signature = await signWebhookPayload({ payload: payloadText, timestamp, secret });
    const idempotencyKey = `acc-cb-${stamp}`;
    const result = await receiveN8nCallback(
      { payloadText, timestamp, signature, idempotencyKey, eventType: "n8n.callback" },
      { getSecret: () => secret, recordAudit: noAudit, now },
    );
    assert(result.status === "accepted", "the signed n8n callback is accepted");
    webhookIds.push(result.event.id);
    const postAfter = (await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, post.id)))[0];
    assert(postAfter.status === "published", "the callback's return-leg flips the scheduled post to 'published'");
    assert(postAfter.publisherRef === `n8n-${stamp}`, "the publisher reference from the callback is recorded on the post");
    const assetAfter = (await db.select().from(contentAssets).where(eq(contentAssets.id, asset!.id)))[0];
    assert(assetAfter.status === "published", "the parent asset is rolled up to 'published' too");
    // Idempotent: a manual re-mark of an already-published post is a no-op (no throw, returns false).
    const reMarked = await markPostPublished(post.id, { actor: "n8n" }, { store: lStore, recordAudit: noAudit, now });
    assert(reMarked === false, "re-marking an already-published post is a safe no-op (idempotent return-leg)");

    console.log("\n✅ maintenance-acceptance DB proof passed — all four batch effects fire end-to-end against live Postgres");
  } finally {
    // Cleanup — best-effort, order respects FKs (posts/assets before packets/tracks).
    await db.delete(scheduledPosts).where(inArray(scheduledPosts.assetId, assetIds.length ? assetIds : ["_"])).catch(() => {});
    await db.delete(contentAssets).where(inArray(contentAssets.id, assetIds.length ? assetIds : ["_"])).catch(() => {});
    await db.delete(contentPackets).where(inArray(contentPackets.id, packetIds.length ? packetIds : ["_"])).catch(() => {});
    if (webhookIds.length) await db.delete(webhookEvents).where(inArray(webhookEvents.id, webhookIds)).catch(() => {});
    if (decisionIds.length) await db.delete(decisionsTable).where(inArray(decisionsTable.id, decisionIds)).catch(() => {});
    if (policyIds.length) await db.delete(decisionPoliciesTable).where(inArray(decisionPoliciesTable.id, policyIds)).catch(() => {});
    if (invoiceIds.length) await db.delete(invoicesTable).where(inArray(invoicesTable.id, invoiceIds)).catch(() => {});
    if (proposalIds.length) await db.delete(proposalsTable).where(inArray(proposalsTable.id, proposalIds)).catch(() => {});
    if (trackSlugs.length) await db.delete(contentTracks).where(inArray(contentTracks.slug, trackSlugs)).catch(() => {});
    await closeDb().catch(() => {});
  }
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
