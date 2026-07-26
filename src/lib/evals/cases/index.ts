/**
 * WOBBLE OS — Golden eval set.
 * ============================
 *
 * ~8 realistic cases across three output shapes WOBBLE actually ships:
 *   - CONTENT  (LinkedIn founder post, JSON content packet, social caption)
 *   - PROPOSAL (AI OS Audit proposal, finance-automation payment-boundary section)
 *   - ASK      (cited answer, JSON answer envelope, insufficient-evidence answer)
 *
 * Each case is paired with a RECORDED OUTPUT (`output`) — a realistic, brand-correct
 * sample of what the producer should emit. The deterministic runner replays these
 * via `replayProducer`, so `npm run eval` is free, offline, and reproducible: it
 * regression-tests the ASSERTIONS and the fixtures, no LLM required. To eval a live
 * model instead, swap in a producer that calls it (see scripts/run-evals.ts header).
 *
 * The recorded outputs are deliberately written in WOBBLE's voice (docs/
 * WOBBLE_COMPANY_OS.md) so the assertions are meaningful, not toy.
 */

import { z } from "zod";
import type { EvalCase } from "../harness";
import { brandAssertions, citationAssertion, humanApprovesMoneyAssertion } from "../wobble-rules";

/** A golden case bundled with the fixture output the deterministic runner replays. */
export interface GoldenRecording {
  case: EvalCase;
  /** Recorded producer output for this case's input. Replayed by `replayProducer`. */
  output: string;
}

// --- Schemas used by matches_schema assertions -----------------------------

/** A WOBBLE content packet the content worker emits as JSON. */
const contentPacketSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  cta: z.string().min(1),
  hashtags: z.array(z.string()).optional(),
});

/** The Ask-WOBBLE answer envelope (mirrors AskAnswer/AskCitation in src/lib/domain/ask.ts). */
const askEnvelopeSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(
    z.object({
      kind: z.enum(["memory", "source"]),
      id: z.string().min(1),
      label: z.string(),
    }),
  ),
  confidence: z.enum(["low", "medium", "high"]),
  hasSufficientEvidence: z.boolean(),
});

// ---------------------------------------------------------------------------
// CONTENT
// ---------------------------------------------------------------------------

const contentLinkedIn: GoldenRecording = {
  case: {
    id: "content-linkedin-anti-agency",
    description: "Founder-voice LinkedIn post attacking agency dependency; must be on-brand, short, and clean.",
    input: {
      shape: "linkedin_post",
      voice: "founder",
      brief: "Attack the agency-dependency model and pitch installing an AI OS inside the business.",
    },
    assertions: [
      { kind: "non_empty" },
      { kind: "max_length", max: 180, unit: "words", label: "linkedin:length" },
      { kind: "must_include", value: /wobble/i, label: "mentions-wobble" },
      { kind: "must_include", value: /agenc/i, label: "names-the-enemy" },
      ...brandAssertions(),
      // OPT-IN judge check: SKIPPED under `npm run eval` (no judge injected), never fails CI.
      {
        kind: "llm_judge",
        rubric:
          "Score 0..1 how strongly this reads in WOBBLE's rebellious, cut-throat, anti-agency founder voice while staying business-serious. Return pass=true if >=0.6.",
        threshold: 0.6,
        label: "voice:cut-throat-founder",
      },
    ],
  },
  output: [
    "Agencies keep the process. You get the invoice.",
    "",
    "Here's the uncomfortable part: if your agency's real skill is turning your brief into AI output and hiding the process, you are not buying expertise. You are buying dependency.",
    "",
    "Wobble flips that model. We install a custom AI OS inside your business: AI employees, automations, dashboards, and team training that live where your company actually runs.",
    "",
    "Stop renting the output. Build the machine.",
    "",
    "Book an AI Readiness Call.",
  ].join("\n"),
};

const contentPacketJson: GoldenRecording = {
  case: {
    id: "content-packet-json",
    description: "Content worker returns a structured content packet as JSON; must parse and match the packet schema.",
    input: { shape: "content_packet", channel: "linkedin", topic: "AI middlemen" },
    assertions: [
      { kind: "non_empty" },
      { kind: "json_parses" },
      { kind: "matches_schema", schema: contentPacketSchema, label: "content-packet-schema" },
      ...brandAssertions(),
    ],
  },
  output: [
    "```json",
    "{",
    '  "type": "linkedin_post",',
    '  "title": "The agency era is wobbling",',
    '  "body": "Most agencies are becoming middlemen between your business and AI. Wobble installs the capability inside your business instead of renting it back to you.",',
    '  "cta": "Book an AI Readiness Call",',
    '  "hashtags": ["#Wobble", "#AIOS", "#Pakistan"]',
    "}",
    "```",
  ].join("\n"),
};

const contentCaption: GoldenRecording = {
  case: {
    id: "content-caption-safe",
    description: "Short social caption; must be brand-safe and fit a tight character budget.",
    input: { shape: "caption", channel: "instagram" },
    assertions: [
      { kind: "non_empty" },
      { kind: "max_length", max: 280, unit: "chars", label: "caption:length" },
      { kind: "must_include", value: /wobble/i, label: "mentions-wobble" },
      ...brandAssertions(),
    ],
  },
  output:
    "They sell deliverables. We install capability. Wobble AI OS puts AI employees, automations, and dashboards inside your business. #Wobble",
};

// ---------------------------------------------------------------------------
// PROPOSAL
// ---------------------------------------------------------------------------

const proposalAudit: GoldenRecording = {
  case: {
    id: "proposal-ai-os-audit",
    description: "Company-voice proposal draft for the paid Wobble AI OS Audit; premium, on-brand, no banned claims.",
    input: {
      shape: "proposal",
      offer: "Wobble AI OS Audit",
      client: "owner-led SMB",
    },
    assertions: [
      { kind: "non_empty" },
      { kind: "max_length", max: 4000, unit: "chars", label: "proposal:length" },
      { kind: "must_include", value: /audit/i, label: "names-the-offer" },
      { kind: "must_include", value: /Wobble AI OS/i, label: "uses-the-category" },
      ...brandAssertions(),
    ],
  },
  output: [
    "Proposal: Wobble AI OS Audit",
    "",
    "Most agencies are becoming middlemen between your business and AI. Wobble takes a different path: we audit how your company actually runs, then install the capability inside your business.",
    "",
    "Scope of the Wobble AI OS Audit",
    "- Current-state business and workflow map across sales, marketing, operations, and admin.",
    "- Bottleneck and AI-opportunity map, prioritised by revenue, speed, cost, and control.",
    "- Recommended Wobble AI OS architecture: AI employees, automations, dashboards, and a knowledge/SOP layer.",
    "- Implementation roadmap in phases, with human-review checkpoints where they matter.",
    "",
    "The audit is real work and it is paid. The call is free; the diagnosis is not. Even if you never hire us to build, the audit alone should make your business smarter.",
    "",
    "Next step: Book an AI Readiness Call to confirm fit, then we scope the audit.",
  ].join("\n"),
};

const proposalPaymentBoundary: GoldenRecording = {
  case: {
    id: "proposal-payment-boundary",
    description: "Finance-automation section of a proposal; must honour the payment boundary (humans approve the money).",
    input: { shape: "proposal_section", topic: "finance automation" },
    assertions: [
      { kind: "non_empty" },
      humanApprovesMoneyAssertion(),
      { kind: "must_include", value: /invoice/i, label: "scopes-invoicing" },
      // Extra explicit banned claims for the finance context (beyond the shared brand set).
      { kind: "must_not_include", value: /ai (will )?(send|approve|move)s? (money|payments|funds)/i, label: "no-ai-money-movement" },
      ...brandAssertions(),
    ],
  },
  output: [
    "Finance & Invoicing Automation",
    "",
    "Wobble will draft invoices, prepare payment reminders, organise receivables and payables, and produce reconciliation reports so your team stops doing this by hand.",
    "",
    "The boundary is deliberate: AI prepares the paperwork; humans approve the money. No funds move, and no payment details change, without a human approval step. This keeps the system serious and safe, not reckless.",
  ].join("\n"),
};

// ---------------------------------------------------------------------------
// ASK WOBBLE
// ---------------------------------------------------------------------------

const askCited: GoldenRecording = {
  case: {
    id: "ask-answer-cited",
    description: "Ask WOBBLE strategic answer grounded in approved evidence; must cite claims with [n] and stay on-brand.",
    input: {
      shape: "ask_answer",
      question: "Which Pakistani market should we go after first?",
    },
    assertions: [
      { kind: "non_empty" },
      citationAssertion(2),
      { kind: "must_include", value: /wedge|market|SMB/i, label: "answers-the-question" },
      ...brandAssertions(),
    ],
  },
  output: [
    "Your strongest early market is owner-led SMBs with real revenue and messy, manual workflows [1]. They already pay monthly salaries and retainers for repetitive work, so the leverage is obvious.",
    "",
    "The best first wedges are ecommerce/retail brands drowning in WhatsApp and ad chaos, and real estate businesses with lead, documentation, and reporting friction [2].",
    "",
    "Risk to weigh: adoption depends on founder urgency, so qualify seriousness on the AI Readiness Call before scoping an audit [1].",
  ].join("\n"),
};

const askEnvelope: GoldenRecording = {
  case: {
    id: "ask-answer-json-envelope",
    description: "Ask WOBBLE answer serialised as the structured envelope; must parse and match the envelope schema.",
    input: { shape: "ask_envelope", question: "What should I focus on in the pipeline?" },
    assertions: [
      { kind: "non_empty" },
      { kind: "json_parses" },
      { kind: "matches_schema", schema: askEnvelopeSchema, label: "ask-envelope-schema" },
    ],
  },
  output: [
    "{",
    '  "answer": "Three deals are close to closing; focus on the two already in proposal stage this week.",',
    '  "citations": [',
    '    { "kind": "memory", "id": "mem_pipeline_1", "label": "pipeline snapshot" },',
    '    { "kind": "source", "id": "src_crm_export", "label": "CRM export" }',
    "  ],",
    '  "confidence": "medium",',
    '  "hasSufficientEvidence": true',
    "}",
  ].join("\n"),
};

const askInsufficient: GoldenRecording = {
  case: {
    id: "ask-answer-insufficient-evidence",
    description:
      "Ask WOBBLE with no approved evidence must say what is missing and NOT invent numbers — the grounding rule.",
    input: { shape: "ask_answer", question: "What was our Q3 ad spend ROI?" },
    assertions: [
      { kind: "non_empty" },
      { kind: "must_include", value: /missing|insufficient|no approved|don't have|do not have/i, label: "flags-the-gap" },
      // It must not fabricate confidence or a guarantee it cannot back.
      { kind: "must_not_include", value: /guaranteed/i, label: "no-fabricated-guarantee" },
      {
        kind: "custom",
        name: "no-invented-percentage",
        predicate: (output) =>
          /\b\d+(\.\d+)?\s?%/.test(output)
            ? "answer invented a numeric percentage despite having no approved evidence"
            : null,
      },
      ...brandAssertions(),
    ],
  },
  output: [
    "I don't have approved sources on your Q3 ad spend or revenue yet, so I can't give you a grounded ROI figure.",
    "",
    "What's missing: connected ad-account data and an approved performance source in the OS.",
    "",
    "Suggested next step: add the Meta Ads export as a source, get it approved, then re-ask — I won't guess at numbers you'd act on.",
  ].join("\n"),
};

// ---------------------------------------------------------------------------
// Golden set + replay producer
// ---------------------------------------------------------------------------

export const goldenRecordings: GoldenRecording[] = [
  contentLinkedIn,
  contentPacketJson,
  contentCaption,
  proposalAudit,
  proposalPaymentBoundary,
  askCited,
  askEnvelope,
  askInsufficient,
];

/** The cases alone, for callers that supply their own (e.g. live) producer. */
export const goldenCases: EvalCase[] = goldenRecordings.map((r) => r.case);

/**
 * Build a deterministic stub producer that replays each case's recorded output.
 * Keyed by a stable JSON serialization of the case input, so the harness's
 * `produce(input)` contract is honoured with zero I/O. Throws on an unknown input
 * so a mis-wired suite fails loudly rather than silently passing.
 */
export function replayProducer(
  recordings: GoldenRecording[] = goldenRecordings,
): (input: unknown) => Promise<string> {
  const byKey = new Map<string, string>();
  for (const rec of recordings) {
    byKey.set(JSON.stringify(rec.case.input), rec.output);
  }
  return async (input: unknown): Promise<string> => {
    const key = JSON.stringify(input);
    const output = byKey.get(key);
    if (output === undefined) {
      throw new Error(`replayProducer: no recorded output for input ${key}`);
    }
    return output;
  };
}
