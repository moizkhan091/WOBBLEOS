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
  unverifiableClaims,
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

describe("a follow-up may not invent a case study", () => {
  const context = "CLIENT: Zamzam Dental\n\nLoses ~70 appointment slots a week to no-shows (30% of ~240 weekly appointments).";

  it("catches the exact fabrication it produced on a live client", () => {
    // Verbatim from a real draft: no such client, no such number, nothing in the context supports it.
    const body = "We built an AI receptionist for a dental group in Karachi that cut no-shows by 64% in the first six weeks.";
    const claims = unverifiableClaims(body, context);
    expect(claims.length).toBeGreaterThanOrEqual(2);
    expect(claims.join(" ")).toContain("64%");
    expect(claims.join(" ")).toContain("done this before");
  });

  it("says nothing about a message built only from their own numbers", () => {
    const body = "You said you lose 70 slots a week to no-shows across the three clinics. Worth 20 minutes this week to see what that is costing you a year?";
    expect(unverifiableClaims(body, context)).toEqual([]);
  });

  it("allows a percentage the client themselves gave us", () => {
    expect(unverifiableClaims("You mentioned a 30% no-show rate.", context)).toEqual([]);
  });

  it("flags a percentage that appears nowhere in what they told us", () => {
    expect(unverifiableClaims("This usually improves things by 45%.", context)[0]).toContain("45%");
  });

  it("flags a described third party even when it is not named", () => {
    expect(unverifiableClaims("A similar clinic group had the same problem.", context).join(" ")).toContain("another client");
  });

  it("tells the writer, in the prompt, that it has no case studies at all", () => {
    const p = followUpSystemPrompt("whatsapp", "direct");
    expect(p).toContain("You have NO case studies");
    expect(p).toContain("put a lie in a founder's");
  });
});

describe("a review is not thrown away over the spelling of one field", () => {
  const item = { issue: "The price is 778 times her signing authority and nothing explains it.", where: "Header", fix: "Break it into phases, with phase one under her solo limit." };

  it("accepts the severity words a reviewer actually writes", () => {
    for (const [written, expected] of [["critical", "blocker"], ["HIGH", "blocker"], ["Major", "serious"], ["low", "minor"], ["blocker", "blocker"]] as const) {
      const r = dealCritiqueSchema.safeParse({ verdict: "would_refuse", headline: "Priced with no reason", items: [{ ...item, severity: written }] });
      expect(r.success, written).toBe(true);
      if (r.success) expect(r.data.items[0].severity, written).toBe(expected);
    }
  });

  it("accepts the verdict in any casing or spacing", () => {
    for (const written of ["would_refuse", "Would Refuse", "WOULD-REFUSE", "refuse"]) {
      const r = dealCritiqueSchema.safeParse({ verdict: written, headline: "Priced with no reason", items: [] });
      expect(r.success, written).toBe(true);
      if (r.success) expect(r.data.verdict, written).toBe("would_refuse");
    }
  });

  it("falls back to the safe middle rather than failing on a word nobody planned for", () => {
    const r = dealCritiqueSchema.safeParse({ verdict: "unclear", headline: "Priced with no reason", items: [{ ...item, severity: "spicy" }] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.verdict).toBe("would_hesitate");
      expect(r.data.items[0].severity).toBe("serious");
    }
  });

  it("has room for a finding that shows its arithmetic", () => {
    // The real run produced issues of 353 to 559 characters against a 400 cap, so six of eight failed.
    const long = "a".repeat(559);
    expect(dealCritiqueSchema.safeParse({ verdict: "would_refuse", headline: "x".repeat(252), items: [{ ...item, issue: long, severity: "blocker" }] }).success).toBe(true);
  });

  it("still refuses an item with no fix, since a complaint without a change is not useful", () => {
    expect(dealCritiqueSchema.safeParse({ verdict: "would_refuse", headline: "Priced with no reason", items: [{ issue: item.issue, where: "Header", severity: "blocker" }] }).success).toBe(false);
  });

  it("normalises the pricing verdict and the objection likelihood the same way", () => {
    const p = pricingOpinionSchema.safeParse({ verdict: "Overpriced", headline: "Three times the comparable quote" });
    expect(p.success).toBe(true);
    if (p.success) expect(p.data.verdict).toBe("high");

    const o = objectionBriefSchema.safeParse({ objections: [{ objection: "too expensive for us here", rootedIn: "the quote", likelihood: "Certain", answer: "It is priced to the revenue we unlock, not to a template." }] });
    expect(o.success).toBe(true);
    if (o.success) expect(o.data.objections[0].likelihood).toBe("high");
  });
});

describe("an absent label is still a failed answer", () => {
  it("rejects a critique with no verdict at all, so the repair round asks for one", () => {
    expect(dealCritiqueSchema.safeParse({ headline: "Priced with no reason given", items: [] }).success).toBe(false);
  });

  it("rejects an item with no severity, rather than quietly calling it serious", () => {
    const item = { issue: "The price is 778 times her signing authority.", where: "Header", fix: "Break it into phases under her limit." };
    expect(dealCritiqueSchema.safeParse({ verdict: "would_refuse", headline: "Priced with no reason given", items: [item] }).success).toBe(false);
  });
});
