import { describe, expect, it } from "vitest";
import {
  appendNegotiation,
  buildVariants,
  negotiationEventSchema,
  objectionOpening,
  summariseNegotiation,
  variantsAreUseful,
  type Negotiation,
} from "@/lib/domain/proposal-commercials";
import {
  assessReactivation,
  describeLocations,
  locationsSchema,
  referralSchema,
} from "@/lib/domain/client-relationships";
import { routeTranscript, isOurAddress, isPublicMailbox, type RoutingCandidate } from "@/lib/domain/transcript-routing";

const NOW = new Date("2026-08-11T12:00:00.000Z");

const services = [
  { name: "Front-desk AI OS build", priceCents: 900_000 },
  { name: "Discovery and mapping", priceCents: 200_000 },
  { name: "Team training", priceCents: 100_000 },
];

describe("proposal variants", () => {
  it("keeps the build in the cheap tier, not the cheapest line items", () => {
    const [essential] = buildVariants(services, 1_200_000);
    expect(essential.tier).toBe("essential");
    expect(essential.services).toHaveLength(1);
    expect(essential.services[0].name).toBe("Front-desk AI OS build");
    expect(essential.totalCents).toBe(900_000);
  });

  it("names what the cheap tier drops, so the number is defensible", () => {
    const [essential] = buildVariants(services, 1_200_000);
    expect(essential.tradeoff).toContain("Discovery and mapping");
    expect(essential.tradeoff).toContain("Team training");
  });

  it("never re-prices the recommended tier, since the audit produced it", () => {
    const recommended = buildVariants(services, 1_200_000).find((v) => v.tier === "recommended")!;
    expect(recommended.totalCents).toBe(1_200_000);
    expect(recommended.services).toEqual(services);
  });

  it("offers no third tier until a continuation has actually been priced", () => {
    expect(buildVariants(services, 1_200_000).some((v) => v.tier === "complete")).toBe(false);
    const withComplete = buildVariants(services, 1_200_000, 300_000);
    const complete = withComplete.find((v) => v.tier === "complete")!;
    expect(complete.totalCents).toBe(1_500_000);
  });

  it("offers no choice at all on a single-service proposal, rather than inventing one", () => {
    const one = buildVariants([{ name: "One workflow", priceCents: 400_000 }], 400_000);
    expect(one).toHaveLength(1);
    expect(variantsAreUseful(one)).toBe(false);
  });
});

describe("the objections a client already stated, in the document", () => {
  it("opens by quoting them and answering", () => {
    const out = objectionOpening("Zamzam Dental", [
      { objection: "We have been sold vapourware before.", answer: "You will see the no-show reminder running on your own numbers in week two, before the second invoice." },
      { objection: "It has to live inside WhatsApp.", answer: "It does. Nothing here asks your front desk to open a new tool." },
    ]);
    expect(out).toContain("Zamzam Dental");
    expect(out).toContain("vapourware");
    expect(out).toContain("inside WhatsApp");
  });

  it("says nothing when there is nothing to answer, rather than a filler paragraph", () => {
    expect(objectionOpening("Zamzam Dental", [])).toBe("");
    expect(objectionOpening("Zamzam Dental", [{ objection: "too dear", answer: "   " }])).toBe("");
  });

  it("keeps it to three, since a proposal that opens with eight rebuttals sounds defensive", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ objection: `objection ${i}`, answer: `answer ${i}` }));
    const out = objectionOpening("Zamzam Dental", many);
    expect(out).toContain("objection 2");
    expect(out).not.toContain("objection 3");
  });
});

describe("negotiation history", () => {
  const opened = { kind: "asked" as const, amountCents: 1_200_000, currency: "USD", by: "wobble" as const, note: "Opened at the audit price." };
  const countered = { kind: "countered" as const, amountCents: 900_000, currency: "USD", by: "client" as const, note: "Said the board would not sign off above 9k." };

  it("stamps the time so history cannot be written out of order", () => {
    const n = appendNegotiation(undefined, opened, NOW);
    expect(n.events[0].at).toBe(NOW.toISOString());
  });

  it("reports where it opened, where it stands, and which way it moved", () => {
    const n: Negotiation = { events: [opened, countered] };
    const s = summariseNegotiation(n);
    expect(s.opened).toBe(1_200_000);
    expect(s.current).toBe(900_000);
    expect(s.movedPct).toBe(-25);
    expect(s.headline).toContain("down 25%");
  });

  it("shouts when the number on the table is under the walk-away", () => {
    const s = summariseNegotiation({ walkAwayCents: 1_000_000, events: [opened, countered] });
    expect(s.belowWalkAway).toBe(true);
    expect(s.headline).toContain("would not go under");
  });

  it("says nothing has been negotiated when nothing has", () => {
    expect(summariseNegotiation({ events: [] }).headline).toBe("Nothing negotiated yet.");
  });

  it("insists on a reason, because the number alone teaches nothing", () => {
    expect(negotiationEventSchema.safeParse({ ...opened, note: "" }).success).toBe(false);
    expect(negotiationEventSchema.safeParse(opened).success).toBe(true);
  });
});

describe("reactivation", () => {
  const base = { daysSinceTouch: 200, dealStatus: "lost", lostReason: null as string | null, approvedFindingCount: 12, hadAudit: true, hadProposal: true };

  it("leaves a client alone who is still warm", () => {
    expect(assessReactivation({ ...base, daysSinceTouch: 10 }).verdict).toBe("not_yet");
  });

  it("goes back when we lost on timing, and says which words say so", () => {
    const r = assessReactivation({ ...base, lostReason: "No budget until next quarter." });
    expect(r.verdict).toBe("worth_waking");
    expect(r.because).toContain("next quarter");
    expect(r.angle).toContain("do not re-run discovery");
  });

  it("leaves it alone when we lost on fit", () => {
    expect(assessReactivation({ ...base, lostReason: "Went with a competitor." }).verdict).toBe("leave_it");
  });

  it("goes back to a delivered client who has been quiet a long time", () => {
    const r = assessReactivation({ ...base, dealStatus: "won", lostReason: null, daysSinceTouch: 150 });
    expect(r.verdict).toBe("worth_waking");
    expect(r.angle).toContain("Expansion");
  });

  it("does not chase a client we delivered for last month", () => {
    expect(assessReactivation({ ...base, dealStatus: "won", daysSinceTouch: 60 }).verdict).toBe("not_yet");
  });

  it("reopens a loss with no recorded reason, because nothing says it cannot be", () => {
    const r = assessReactivation({ ...base, lostReason: null });
    expect(r.verdict).toBe("worth_waking");
    expect(r.angle).toContain("Even a no is worth having");
  });

  it("argues from how much context we already hold on an open but silent deal", () => {
    const r = assessReactivation({ ...base, dealStatus: "open", lostReason: null, daysSinceTouch: 120 });
    expect(r.verdict).toBe("worth_waking");
    expect(r.because).toContain("points of context");
  });
});

describe("multi-site clients", () => {
  it("describes one site plainly", () => {
    expect(describeLocations([{ name: "Gulberg branch", city: "Lahore" }])).toContain("one site");
  });

  it("lists several, with what is different about each", () => {
    const out = describeLocations([
      { name: "Gulberg", city: "Lahore", note: "Own booking system" },
      { name: "DHA", city: "Lahore" },
      { name: "Johar Town", city: "Lahore" },
    ]);
    expect(out).toContain("3 sites");
    expect(out).toContain("Own booking system");
  });

  it("says nothing when no sites are recorded", () => {
    expect(describeLocations([])).toBe("");
  });

  it("rejects a site with no name and a referral with no referrer", () => {
    expect(locationsSchema.safeParse([{ city: "Lahore" }]).success).toBe(false);
    expect(referralSchema.safeParse({ note: "a friend" }).success).toBe(false);
    expect(referralSchema.safeParse({ referredByName: "Bright Smile Dental" }).success).toBe(true);
  });
});

describe("routing a transcript to a client, or refusing to", () => {
  const candidates: RoutingCandidate[] = [
    { companyId: "co_a", companyName: "Zamzam Dental", contactEmails: ["sana@zamzam.pk"], companyEmail: "hello@zamzam.pk", companyDomain: "zamzam.pk" },
    { companyId: "co_b", companyName: "Bright Smile", contactEmails: ["ali@brightsmile.pk"], companyEmail: null, companyDomain: "brightsmile.pk" },
    { companyId: "co_c", companyName: "Gmail Client", contactEmails: ["someone@gmail.com"], companyEmail: null, companyDomain: null },
  ];

  it("is certain when an attendee is a contact we hold", () => {
    const d = routeTranscript({ attendeeEmails: ["moiz@wobblepk.com", "Sana@Zamzam.pk"] }, candidates);
    expect(d.companyId).toBe("co_a");
    expect(d.confidence).toBe("certain");
    expect(d.reason).toContain("contact on Zamzam Dental");
  });

  it("falls back to the client's own web domain, and says it is only likely", () => {
    const d = routeTranscript({ attendeeEmails: ["newperson@brightsmile.pk"] }, candidates);
    expect(d.companyId).toBe("co_b");
    expect(d.confidence).toBe("likely");
  });

  it("REFUSES when two different clients are on the call", () => {
    const d = routeTranscript({ attendeeEmails: ["sana@zamzam.pk", "ali@brightsmile.pk"] }, candidates);
    expect(d.companyId).toBeNull();
    expect(d.confidence).toBe("refused");
    expect(d.ambiguousCompanyIds).toHaveLength(2);
  });

  it("refuses a call where only WOBBLE was present", () => {
    const d = routeTranscript({ attendeeEmails: ["moiz@wobblepk.com", "ali@wobblepk.com"] }, candidates);
    expect(d.confidence).toBe("refused");
    expect(d.reason).toContain("No attendee outside WOBBLE");
  });

  it("never routes on a free mailbox domain, however many clients use one", () => {
    const d = routeTranscript({ attendeeEmails: ["stranger@gmail.com"] }, candidates);
    expect(d.companyId).toBeNull();
    expect(d.reason).toContain("free mailbox");
  });

  it("still matches a free-mailbox address when it is a contact we hold exactly", () => {
    const d = routeTranscript({ attendeeEmails: ["someone@gmail.com"] }, candidates);
    expect(d.companyId).toBe("co_c");
    expect(d.confidence).toBe("certain");
  });

  it("knows our own addresses and the public mailboxes", () => {
    expect(isOurAddress("moiz@wobblepk.com")).toBe(true);
    expect(isOurAddress("sana@zamzam.pk")).toBe(false);
    expect(isPublicMailbox("gmail.com")).toBe(true);
    expect(isPublicMailbox("zamzam.pk")).toBe(false);
  });
});
