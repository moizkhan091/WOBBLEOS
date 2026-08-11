import { describe, expect, it } from "vitest";
import {
  contextIsEmpty,
  dealCritiqueSchema,
  dealReviewSystemPrompt,
  followUpDraftSchema,
  followUpSystemPrompt,
  objectionBriefSchema,
  objectionSystemPrompt,
  pricingOpinionSchema,
  pricingSystemPrompt,
  renderContext,
  centsToMoney,
  type DealTeamContext,
} from "@/lib/domain/deal-team";
import { DEFAULT_AGENTS } from "@/lib/domain/agents";
import { containsBannedDash } from "@/lib/domain/house-style";
import { FREE_AUDIT_SOURCE, runAuditSchema } from "@/lib/domain/free-audit";

const ctx: DealTeamContext = {
  companyName: "Zameen Clinics",
  industry: "healthcare",
  intake: "Losing appointments to no-shows. Runs on WhatsApp and a paper diary.",
  approvedFindings: ["[pain] Loses ~70 appointment slots a week to no-shows (30% of ~240 weekly appointments across 3 clinics)."],
  qualification: "grade B, score 74. Pursue.",
  services: ["AI OS Audit", "Workflow Build"],
  proposal: { title: "Front-desk AI OS", totalCents: 1_200_000, currency: "USD", scope: "Three clinics", services: [{ name: "Discovery", priceCents: 200_000 }], terms: "50% up front" },
  pastQuotes: [{ title: "Dental group OS", totalCents: 900_000, currency: "USD", status: "accepted", industry: "healthcare" }],
  lastMessages: ["Sana Malik last contacted 2026-08-01 on whatsapp"],
};

describe("deal team — the context every agent reads", () => {
  it("puts the client's own words in, not our summary of them", () => {
    const out = renderContext(ctx);
    expect(out).toContain("Losing appointments to no-shows");
    expect(out).toContain("70 appointment slots");
  });

  it("shows money the way a founder writes it", () => {
    expect(centsToMoney(1_200_000)).toBe("USD 12,000");
    expect(renderContext(ctx)).toContain("USD 12,000");
  });

  it("includes what WOBBLE quoted other clients, with their industry, so a comparison is arguable", () => {
    const out = renderContext(ctx);
    expect(out).toContain("Dental group OS");
    expect(out).toContain("(healthcare)");
  });

  it("leaves out sections it has nothing for, instead of printing empty headings", () => {
    const bare = renderContext({ ...ctx, intake: "", approvedFindings: [], proposal: null, pastQuotes: [], lastMessages: [], qualification: null });
    expect(bare).not.toContain("APPROVED FINDINGS");
    expect(bare).not.toContain("PROPOSAL ON THE TABLE");
    expect(bare).toContain("Zameen Clinics");
  });

  it("knows when there is genuinely nothing to reason from", () => {
    expect(contextIsEmpty(ctx)).toBe(false);
    expect(contextIsEmpty({ ...ctx, intake: "", approvedFindings: [], proposal: null, qualification: null })).toBe(true);
    // Services and past quotes are OUR data, not this client's, so they must not count as context.
    expect(contextIsEmpty({ ...ctx, intake: "   ", approvedFindings: [], proposal: null, qualification: null, services: ["AI OS Audit"], pastQuotes: ctx.pastQuotes })).toBe(true);
  });
});

describe("deal team — the prompts", () => {
  const prompts = [
    ["objection handler", objectionSystemPrompt()],
    ["deal reviewer", dealReviewSystemPrompt()],
    ["pricing analyst", pricingSystemPrompt()],
    ["follow-up writer", followUpSystemPrompt("whatsapp", "direct")],
  ] as const;

  it("all demand strict JSON, so nothing is parsed out of prose", () => {
    for (const [name, p] of prompts) expect(p, name).toContain("STRICT JSON only");
  });

  it("all carry the house style, so no output can contain a banned dash", () => {
    for (const [name, p] of prompts) expect(containsBannedDash(p), `${name} prompt itself`).toBe(false);
  });

  it("the reviewer is told to be adversarial, not encouraging", () => {
    const p = dealReviewSystemPrompt();
    expect(p).toContain("Never congratulate");
    expect(p).toMatch(/would_sign is allowed only/);
  });

  it("the pricing analyst must refuse a benchmark it does not have", () => {
    expect(pricingSystemPrompt()).toContain("not_enough_history");
    expect(pricingSystemPrompt()).toContain("You never set a price");
  });

  it("each channel gets its own length and shape rules", () => {
    expect(followUpSystemPrompt("whatsapp", "direct")).toContain("under 90 words");
    expect(followUpSystemPrompt("email", "direct")).toContain("subject line");
    expect(followUpSystemPrompt("linkedin", "direct")).toContain("under 70 words");
  });

  it("the follow-up writer is told it never sends", () => {
    expect(followUpSystemPrompt("email", "direct")).toContain("never send");
  });
});

describe("deal team — the shapes reject useless output", () => {
  it("an objection with no answer is rejected", () => {
    expect(objectionBriefSchema.safeParse({ objections: [{ objection: "too expensive for us", rootedIn: "the quote", likelihood: "high", answer: "" }] }).success).toBe(false);
  });

  it("an empty objection brief is rejected, since that is a failed run not a clean bill", () => {
    expect(objectionBriefSchema.safeParse({ objections: [] }).success).toBe(false);
  });

  it("a critique must commit to a verdict", () => {
    expect(dealCritiqueSchema.safeParse({ headline: "Priced with no reason given", items: [] }).success).toBe(false);
    expect(dealCritiqueSchema.safeParse({ verdict: "would_refuse", headline: "Priced with no reason given", items: [] }).success).toBe(true);
  });

  it("a critique item must say where and what to change", () => {
    const bad = { verdict: "would_hesitate", headline: "Scope is vague in two places", items: [{ issue: "Scope is vague and could mean two things", severity: "serious", where: "Scope" }] };
    expect(dealCritiqueSchema.safeParse(bad).success).toBe(false);
  });

  it("a pricing opinion may have no notes but must have a verdict and a headline", () => {
    expect(pricingOpinionSchema.safeParse({ verdict: "not_enough_history", headline: "Only one comparable quote exists" }).success).toBe(true);
    expect(pricingOpinionSchema.safeParse({ headline: "Only one comparable quote exists" }).success).toBe(false);
  });

  it("a follow-up must say what it is asking for", () => {
    const body = "Hi Sana, thinking about the 70 slots a week you lose to no-shows. Worth 20 minutes on Thursday?";
    expect(followUpDraftSchema.safeParse({ channel: "whatsapp", body, groundedIn: "their no-show number" }).success).toBe(false);
    expect(followUpDraftSchema.safeParse({ channel: "whatsapp", body, asksFor: "a 20 minute call", groundedIn: "their no-show number" }).success).toBe(true);
  });

  it("rejects a channel we do not actually write for", () => {
    expect(followUpDraftSchema.safeParse({ channel: "sms", body: "x".repeat(40), asksFor: "a call", groundedIn: "context" }).success).toBe(false);
  });
});

describe("deal team — the four are no longer decorative", () => {
  const bySlug = new Map(DEFAULT_AGENTS.map((a) => [a.slug, a]));

  it("all four are active, since each now has code that runs it", () => {
    for (const slug of ["objection_handler", "follow_up_writer", "deal_reviewer", "pricing_analyst"]) {
      expect(bySlug.get(slug)?.status ?? "active", slug).toBe("active");
    }
  });

  it("each has its own model role, so one can be made cheaper without touching the others", () => {
    const roles = ["objection_handler", "follow_up_writer", "deal_reviewer", "pricing_analyst"].map((s) => bySlug.get(s)?.modelRole);
    expect(roles).toEqual(["objection_handling", "follow_up_writing", "deal_review", "pricing_analysis"]);
    expect(new Set(roles).size).toBe(4);
  });
});

describe("the free audit is a lead magnet, so it must land in the pipeline", () => {
  it("accepts the identity fields it needs to find an existing container", () => {
    const parsed = runAuditSchema.safeParse({ businessName: "Zameen Clinics", website: "https://zameenclinics.pk", email: "hi@zameenclinics.pk" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.website).toBe("https://zameenclinics.pk");
      expect(parsed.data.email).toBe("hi@zameenclinics.pk");
    }
  });

  it("still runs for a business with nothing but a name, since that is the common case", () => {
    expect(runAuditSchema.safeParse({ businessName: "Zameen Clinics" }).success).toBe(true);
  });

  it("rejects an email that is not one, rather than creating a container keyed on junk", () => {
    expect(runAuditSchema.safeParse({ businessName: "Zameen Clinics", email: "not-an-email" }).success).toBe(false);
  });

  it("stamps a source a founder can filter on", () => {
    expect(FREE_AUDIT_SOURCE).toBe("free_audit");
  });
});
