import { describe, expect, it } from "vitest";
import type { CompanyRow, ContactRow, LeadRow, OpportunityRow, StageHistoryRow } from "@/lib/domain/crm";
import type { CrmStore } from "@/lib/crm";
import {
  classifyLinks,
  extractDomain,
  isDecisionMaker,
  mapAiStage,
  mapContextSharing,
  mapPaidAuditOpenness,
  mapRelationship,
  formatIntakeForAudit,
  mapSubmissionToCrm,
  mapTeamSize,
  mapUrgency,
  normalizeUrl,
  qualify,
  readinessSubmissionSchema,
  resolveWhatsapp,
  snapshotFromLead,
  stageForSubmission,
  tierForScore,
  validateSubmission,
} from "@/lib/domain/intake";
import { intakeReadinessSubmission, IntakeValidationError } from "@/lib/intake";

const now = new Date("2026-08-10T12:00:00.000Z");

/**
 * The EXACT payload the live website form posted to n8n (execution 204120), so the mapping is pinned
 * against production reality rather than an assumption about field names.
 */
const REAL_SUBMISSION = {
  form: "AI Readiness Call Request",
  submitted_at: "2026-08-10T10:58:10.376Z",
  contact: {
    name: "Haad Alvi",
    email: "founder@acmeclinic.com",
    phone: "+923012211454",
    whatsapp_is_same_number: "Yes, same number",
    whatsapp_number: "+923012211454",
  },
  business: {
    company_name: "Acme Clinic",
    online_presence: ["acmeclinic.com", "https://instagram.com/acme", "https://www.linkedin.com/company/acme"],
    city_market: "pakistan, usa ,uk",
    role: "Founder / owner",
    team_size: "2–10",
  },
  context: {
    business_description: "Dental clinic chain",
    focus_areas: ["Sales / lead follow-up", "Customer support", "Admin / operations"],
    pain_points: "Front desk answers the same questions all day and no-shows are high",
  },
  readiness: {
    ai_workflow_stage: "Experimenting personally",
    current_tools: "WhatsApp, Excel",
    urgency: "Immediately",
    open_to_paid_audit: "Yes",
    can_share_workflow_context: "Some context, depends what is needed",
    what_makes_call_useful: "Know if AI is useful for us",
    lower_readiness_flag: false,
    future_lead_flag: false,
  },
  meta: {
    source_page: "https://wobblepk.com/",
    cta_clicked: "Nav AI Readiness Call",
    utm_source: "",
    utm_campaign: "",
    utm_medium: "",
    page_url: "https://wobblepk.com/ai-readiness-call?cta=Nav%20AI%20Readiness%20Call",
  },
};

const parse = (raw: unknown) => readinessSubmissionSchema.parse(raw);

describe("intake — links", () => {
  it("normalises bare and full URLs, rejects junk", () => {
    expect(normalizeUrl("wobblepk.com")).toBe("https://wobblepk.com");
    expect(normalizeUrl("https://x.io/path")).toBe("https://x.io/path");
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });

  it("extracts the bare domain without www", () => {
    expect(extractDomain("https://www.Acme.com/contact")).toBe("acme.com");
    expect(extractDomain("garbage")).toBeNull();
  });

  it("picks the first NON-social link as the website and files the rest by platform", () => {
    const { website, socialLinks } = classifyLinks(REAL_SUBMISSION.business.online_presence);
    expect(website).toBe("https://acmeclinic.com");
    expect(socialLinks.instagram).toContain("instagram.com/acme");
    expect(socialLinks.linkedin).toContain("linkedin.com/company/acme");
  });

  it("handles a lead with ONLY social links (no website) — common for local businesses", () => {
    const { website, socialLinks } = classifyLinks(["https://instagram.com/shop", "https://facebook.com/shop"]);
    expect(website).toBeNull();
    expect(socialLinks.instagram).toBeTruthy();
    expect(socialLinks.facebook).toBeTruthy();
  });

  it("keeps the FIRST link per platform rather than clobbering", () => {
    const { socialLinks } = classifyLinks(["https://instagram.com/one", "https://instagram.com/two"]);
    expect(socialLinks.instagram).toContain("one");
  });
});

describe("intake — answer mapping", () => {
  it("maps urgency wording onto levels", () => {
    expect(mapUrgency("Immediately")).toBe("high");
    expect(mapUrgency("Within a month")).toBe("medium");
    expect(mapUrgency("Just exploring")).toBe("low");
    expect(mapUrgency("")).toBe("unknown");
    // A reworded option on the marketing site degrades to unknown, never to a wrong level.
    expect(mapUrgency("Sometime in the vague future maybe")).toBe("unknown");
  });

  it("maps paid-audit openness, context sharing and AI stage", () => {
    expect(mapPaidAuditOpenness("Yes")).toBe("high");
    expect(mapPaidAuditOpenness("Maybe, depends on price")).toBe("medium");
    expect(mapPaidAuditOpenness("No")).toBe("low");
    expect(mapContextSharing("Some context, depends what is needed")).toBe("medium");
    expect(mapContextSharing("Yes, fully")).toBe("high");
    expect(mapAiStage("Experimenting personally")).toBe("medium");
    expect(mapAiStage("Already using in the business")).toBe("high");
    expect(mapAiStage("Nothing yet")).toBe("low");
  });

  it("reads team size out of range labels", () => {
    expect(mapTeamSize("2–10")).toBe("low");
    expect(mapTeamSize("11-25")).toBe("medium");
    expect(mapTeamSize("50+")).toBe("high");
    expect(mapTeamSize("")).toBe("unknown");
  });

  it("detects the decision-maker and maps the CRM relationship", () => {
    expect(isDecisionMaker("Founder / owner")).toBe(true);
    expect(isDecisionMaker("Marketing executive")).toBe(false);
    expect(mapRelationship("Founder / owner")).toBe("founder");
    expect(mapRelationship("Head of Marketing")).toBe("marketing_head");
    expect(mapRelationship("Intern")).toBe("other");
  });

  it("resolves whatsapp from the same-number toggle", () => {
    expect(resolveWhatsapp({ phone: "+111", whatsapp_is_same_number: "Yes, same number" })).toBe("+111");
    expect(resolveWhatsapp({ phone: "+111", whatsapp_is_same_number: "No, different number", whatsapp_number: "+222" })).toBe("+222");
  });
});

describe("intake — qualification", () => {
  it("qualifies the real submission as high intent with a described pain", () => {
    const q = qualify(parse(REAL_SUBMISSION));
    expect(q.intentLevel).toBe("high"); // open to audit + immediate + wrote out a real pain
    expect(q.urgencyLevel).toBe("high");
    expect(q.fitLevel).not.toBe("unknown");
  });

  it("a tyre-kicker scores low across the board", () => {
    const q = qualify(
      parse({
        ...REAL_SUBMISSION,
        context: { ...REAL_SUBMISSION.context, pain_points: "" },
        readiness: { ...REAL_SUBMISSION.readiness, urgency: "Just exploring", open_to_paid_audit: "No", can_share_workflow_context: "No", ai_workflow_stage: "Nothing yet" },
      }),
    );
    expect(q.intentLevel).toBe("low");
    expect(q.fitLevel).toBe("low");
  });

  it("routes stages from the form's own flags", () => {
    const s = parse(REAL_SUBMISSION);
    expect(stageForSubmission(s, qualify(s))).toBe("qualified");
    const future = parse({ ...REAL_SUBMISSION, readiness: { ...REAL_SUBMISSION.readiness, future_lead_flag: true } });
    expect(stageForSubmission(future, qualify(future))).toBe("nurture");
    const lower = parse({ ...REAL_SUBMISSION, readiness: { ...REAL_SUBMISSION.readiness, lower_readiness_flag: true } });
    expect(stageForSubmission(lower, qualify(lower))).toBe("new_lead");
  });

  it("tiers on the same thresholds as the Lead Magnet pipeline", () => {
    expect(tierForScore(85)).toBe("Hot");
    expect(tierForScore(50)).toBe("Warm");
    expect(tierForScore(20)).toBe("Cold");
  });
});

describe("intake — submission validation", () => {
  it("accepts the real payload", () => {
    expect(validateSubmission(parse(REAL_SUBMISSION))).toBeNull();
  });

  it("rejects a submission with no identity or no way to reach them", () => {
    expect(validateSubmission(parse({ contact: { email: "a@b.com" } }))).toMatch(/company name nor a contact name/);
    expect(validateSubmission(parse({ business: { company_name: "Acme" } }))).toMatch(/email nor a phone/);
  });

  it("passes through unknown NEW fields instead of rejecting the lead", () => {
    // Marketing adds a field to the form -> must never 400 a real lead into the void.
    const s = parse({ ...REAL_SUBMISSION, brand_new_field: "surprise", contact: { ...REAL_SUBMISSION.contact, extra: 1 } });
    expect(validateSubmission(s)).toBeNull();
  });
});

describe("intake — mapping to CRM", () => {
  it("maps every part of the real submission onto the client container", () => {
    const m = mapSubmissionToCrm(parse(REAL_SUBMISSION), { now });
    expect(m.displayName).toBe("Acme Clinic");
    expect(m.domain).toBe("acmeclinic.com");
    expect(m.company.website).toBe("https://acmeclinic.com");
    expect(m.company.companySize).toBe("2–10");
    expect(m.company.status).toBe("qualified_prospect"); // high intent
    expect(m.contact?.relationshipType).toBe("founder");
    expect(m.contact?.preferredChannel).toBe("whatsapp");
    expect(m.lead.serviceInterest).toContain("Customer support");
    expect(m.lead.problemStated).toContain("no-shows");
    expect(m.opportunity.stage).toBe("qualified");
    expect(m.opportunity.priority).toBe("high");
  });

  it("keeps every answer that has no CRM column, for the question engine + audit", () => {
    const m = mapSubmissionToCrm(parse(REAL_SUBMISSION), { now });
    const meta = m.lead.metadata as Record<string, unknown>;
    const readiness = meta.readiness as Record<string, unknown>;
    expect(readiness.currentTools).toBe("WhatsApp, Excel");
    expect(readiness.aiWorkflowStage).toBe("Experimenting personally");
    expect(readiness.whatMakesCallUseful).toBe("Know if AI is useful for us");
    expect(meta.cityMarket).toBe("pakistan, usa ,uk");
  });

  it("falls back to the contact name when no company name is given", () => {
    const m = mapSubmissionToCrm(parse({ ...REAL_SUBMISSION, business: { ...REAL_SUBMISSION.business, company_name: "" } }), { now });
    expect(m.displayName).toBe("Haad Alvi");
  });
});

// ---------------------------------------------------------------- service

function makeStore() {
  const companies = new Map<string, CompanyRow>();
  const contacts = new Map<string, ContactRow>();
  const leads = new Map<string, LeadRow>();
  const opps = new Map<string, OpportunityRow>();
  const history: StageHistoryRow[] = [];
  const store: CrmStore = {
    insertCompany: async (r) => void companies.set(r.id, r),
    listCompanies: async (q) => [...companies.values()].slice(0, q.limit),
    getCompany: async (id) => companies.get(id) ?? null,
    updateCompany: async (id, f) => { const c = companies.get(id); if (c) companies.set(id, { ...c, ...f } as CompanyRow); },
    insertContact: async (r) => void contacts.set(r.id, r),
    listContacts: async (q) => [...contacts.values()].filter((c) => !q.companyId || c.companyId === q.companyId).slice(0, q.limit),
    insertLead: async (r) => void leads.set(r.id, r),
    listLeads: async (q) => [...leads.values()].slice(0, q.limit),
    getLead: async (id) => leads.get(id) ?? null,
    updateLead: async (id, f) => { const l = leads.get(id); if (l) leads.set(id, { ...l, ...f }); },
    markLeadConverted: async () => true,
    insertOpportunity: async (r) => void opps.set(r.id, r),
    listOpportunities: async (q) => [...opps.values()].slice(0, q.limit),
    getOpportunity: async (id) => opps.get(id) ?? null,
    updateOpportunity: async (id, f) => { const o = opps.get(id); if (o) opps.set(id, { ...o, ...f }); },
    insertStageHistory: async (r) => void history.push(r),
    listStageHistory: async (oid) => history.filter((h) => h.opportunityId === oid),
    transaction: async (fn) => fn(store),
  };
  return { store, companies, contacts, leads, opps, history };
}

/** No DB in unit tests: the finder is injected and matches on domain/name across what's been inserted. */
function finderFor(companies: Map<string, CompanyRow>) {
  return async (input: { domain: string | null; name: string; email?: string }) => {
    const all = [...companies.values()];
    return (
      (input.domain ? all.find((c) => (c.website ?? "").toLowerCase().includes(input.domain!)) : undefined) ??
      all.find((c) => c.name.toLowerCase() === input.name.toLowerCase()) ??
      null
    );
  };
}

describe("intakeReadinessSubmission", () => {
  it("creates the WHOLE client container from one submission", async () => {
    const { store, companies, contacts, leads, opps, history } = makeStore();
    const res = await intakeReadinessSubmission(REAL_SUBMISSION, { store, findExistingCompany: finderFor(companies), recordAudit: async () => {}, now });

    expect(companies.size).toBe(1);
    expect(contacts.size).toBe(1);
    expect(leads.size).toBe(1);
    expect(opps.size).toBe(1);
    expect(history).toHaveLength(1);

    // everything is LINKED — the whole point of the container
    expect(res.contact?.companyId).toBe(res.company.id);
    expect(res.lead.companyId).toBe(res.company.id);
    expect(res.lead.contactId).toBe(res.contact?.id);
    expect(res.opportunity.companyId).toBe(res.company.id);
    expect(res.deduped).toBe(false);
    expect(res.score).toBeGreaterThan(0);
    expect(["Hot", "Warm", "Cold"]).toContain(res.tier);
  });

  it("a SECOND submission from the same company joins the container instead of forking a twin", async () => {
    const { store, companies, contacts, leads, opps } = makeStore();
    const find = finderFor(companies);
    const first = await intakeReadinessSubmission(REAL_SUBMISSION, { store, findExistingCompany: find, recordAudit: async () => {}, now });

    // A different colleague at the same business, months later.
    const second = await intakeReadinessSubmission(
      { ...REAL_SUBMISSION, contact: { ...REAL_SUBMISSION.contact, name: "Ops Manager", email: "ops@acmeclinic.com" } },
      { store, findExistingCompany: find, recordAudit: async () => {}, now },
    );

    expect(second.deduped).toBe(true);
    expect(second.company.id).toBe(first.company.id);
    expect(companies.size).toBe(1); // NO twin container
    expect(contacts.size).toBe(2); // but the new human is added
    expect(leads.size).toBe(2); // each submission stays its own event
    expect(opps.size).toBe(2);
  });

  it("re-submitting the SAME person reuses their contact record", async () => {
    const { store, companies, contacts } = makeStore();
    const find = finderFor(companies);
    await intakeReadinessSubmission(REAL_SUBMISSION, { store, findExistingCompany: find, recordAudit: async () => {}, now });
    const again = await intakeReadinessSubmission(REAL_SUBMISSION, { store, findExistingCompany: find, recordAudit: async () => {}, now });
    expect(again.contactExisted).toBe(true);
    expect(contacts.size).toBe(1);
  });

  it("a resubmission never BLANKS known data and unions the social links", async () => {
    const { store, companies } = makeStore();
    const find = finderFor(companies);
    await intakeReadinessSubmission(REAL_SUBMISSION, { store, findExistingCompany: find, recordAudit: async () => {}, now });

    // Same company, but this time they filled almost nothing in.
    const sparse = {
      ...REAL_SUBMISSION,
      business: { company_name: "Acme Clinic", online_presence: ["https://facebook.com/acme"], city_market: "", role: "", team_size: "" },
      context: { business_description: "", focus_areas: [], pain_points: "" },
    };
    const res = await intakeReadinessSubmission(sparse, { store, findExistingCompany: find, recordAudit: async () => {}, now });

    expect(res.company.website).toBe("https://acmeclinic.com"); // preserved
    expect(res.company.companySize).toBe("2–10"); // preserved
    expect(res.company.socialLinks.instagram).toBeTruthy(); // preserved
    expect(res.company.socialLinks.facebook).toBeTruthy(); // newly added
    expect(res.company.tags).toContain("resubmitted");
  });

  it("never DOWNGRADES an existing company's status", async () => {
    const { store, companies } = makeStore();
    const find = finderFor(companies);
    const first = await intakeReadinessSubmission(REAL_SUBMISSION, { store, findExistingCompany: find, recordAudit: async () => {}, now });
    // Simulate them becoming a live client.
    companies.set(first.company.id, { ...companies.get(first.company.id)!, status: "client_active" });

    const weak = { ...REAL_SUBMISSION, readiness: { ...REAL_SUBMISSION.readiness, open_to_paid_audit: "No", urgency: "Just exploring" } };
    const res = await intakeReadinessSubmission(weak, { store, findExistingCompany: find, recordAudit: async () => {}, now });
    expect(res.company.status).toBe("client_active");
  });

  it("rejects an unusable submission rather than creating a junk container", async () => {
    const { store, companies } = makeStore();
    await expect(
      intakeReadinessSubmission({ contact: {}, business: {} }, { store, findExistingCompany: finderFor(companies), recordAudit: async () => {}, now }),
    ).rejects.toBeInstanceOf(IntakeValidationError);
    expect(companies.size).toBe(0);
  });

  it("audits the intake with the qualification it decided", async () => {
    const { store, companies } = makeStore();
    const events: Array<{ eventType: string; metadata?: Record<string, unknown> }> = [];
    await intakeReadinessSubmission(REAL_SUBMISSION, {
      store,
      findExistingCompany: finderFor(companies),
      recordAudit: async (e) => void events.push({ eventType: e.eventType, metadata: e.metadata as Record<string, unknown> }),
      now,
    });
    expect(events[0].eventType).toBe("intake.readiness_form_received");
    expect(events[0].metadata).toMatchObject({ deduped: false, stage: "qualified" });
  });
});

// ---------------------------------------------------------------- reading the intake back out

describe("intake read-back (what the audit + question engine consume)", () => {
  /** A lead row exactly as intakeReadinessSubmission stores it. */
  function storedLead(overrides: Record<string, unknown> = {}) {
    const mapped = mapSubmissionToCrm(parse(REAL_SUBMISSION), { now });
    return {
      contactName: mapped.lead.contactName ?? null,
      problemStated: mapped.lead.problemStated ?? null,
      serviceInterest: mapped.lead.serviceInterest ?? [],
      score: 100,
      createdAt: now,
      metadata: mapped.lead.metadata as Record<string, unknown>,
      ...overrides,
    };
  }
  const company = { notes: "Dental clinic chain", companySize: "2–10", city: "pakistan, usa ,uk" };

  it("rebuilds every readiness answer from the stored lead", () => {
    const s = snapshotFromLead(storedLead(), company);
    expect(s.painPoints).toContain("no-shows");
    expect(s.currentTools).toBe("WhatsApp, Excel");
    expect(s.aiWorkflowStage).toBe("Experimenting personally");
    expect(s.urgency).toBe("Immediately");
    expect(s.openToPaidAudit).toBe("Yes");
    expect(s.whatMakesCallUseful).toBe("Know if AI is useful for us");
    expect(s.focusAreas).toContain("Customer support");
    expect(s.businessDescription).toBe("Dental clinic chain");
    expect(s.teamSize).toBe("2–10");
    expect(s.tier).toBe("Hot");
  });

  it("renders an audit block that frames answers as CLAIMS, not findings", () => {
    const block = formatIntakeForAudit([snapshotFromLead(storedLead(), company)]);
    // The framing is the point: an audit that parrots the form back adds nothing.
    expect(block).toMatch(/their own words — treat as claims to verify, not findings/);
    expect(block).toContain("MOST RECENT SUBMISSION");
    expect(block).toContain("no-shows");
    expect(block).toContain("WhatsApp, Excel");
    expect(block).toContain("100/100 (Hot)");
  });

  it("keeps older submissions (a changed answer is itself a signal) but caps at three", () => {
    const many = [1, 2, 3, 4, 5].map(() => snapshotFromLead(storedLead(), company));
    const block = formatIntakeForAudit(many);
    expect(block.match(/EARLIER SUBMISSION/g) ?? []).toHaveLength(2); // 1 most-recent + 2 earlier
  });

  it("returns nothing at all when the client never came through the form", () => {
    expect(formatIntakeForAudit([])).toBe("");
  });

  it("survives a lead with no readiness metadata rather than throwing", () => {
    const s = snapshotFromLead({ contactName: "Walk-in", metadata: null, score: null });
    expect(s.contactName).toBe("Walk-in");
    expect(s.urgency).toBeNull();
    expect(s.tier).toBeNull();
    expect(formatIntakeForAudit([s])).toContain("MOST RECENT SUBMISSION");
  });

  it("getClientIntakeContext composes snapshots + the audit block, newest first", async () => {
    const { getClientIntakeContext } = await import("@/lib/intake/context");
    const ctx = await getClientIntakeContext("co_1", {
      loadLeads: async () => ({
        company,
        leads: [storedLead({ score: 100 }), storedLead({ score: 40, problemStated: "older answer" })],
      }),
    });
    expect(ctx.snapshots).toHaveLength(2);
    expect(ctx.snapshots[0].score).toBe(100);
    expect(ctx.auditBlock).toContain("older answer");
  });
});
