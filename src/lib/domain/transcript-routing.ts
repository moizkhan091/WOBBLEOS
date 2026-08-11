/**
 * Deciding which client a meeting transcript belongs to.
 *
 * Fathom and Read.ai can drop a transcript into a mailbox or a webhook. What they cannot do is know
 * which WOBBLE client it belongs to, and getting that wrong is expensive in a way most mistakes are
 * not: one client's private call filed under another client's container, with the audit and the
 * proposal built from it.
 *
 * So the rule here is: match on an identity, or refuse. Never guess from a title, never fall back to
 * "the only client with an open deal", never fuzzy-match a company name. An unrouted transcript sitting
 * in a tray waiting for a founder to point at the right client is a mild annoyance. A misrouted one is
 * a breach.
 */

export type RoutingConfidence = "certain" | "likely" | "refused";

export interface RoutingCandidate {
  companyId: string;
  companyName: string;
  /** Contact emails on that container, lowercased. */
  contactEmails: string[];
  /** The company's own email, when it has one. */
  companyEmail: string | null;
  /** Bare domain from the company's website, when it has one. */
  companyDomain: string | null;
}

export interface RoutingInput {
  /** Every attendee address on the calendar invite, in any case. */
  attendeeEmails: string[];
  /** The meeting title, used only for the human-readable reason, never to decide. */
  title?: string;
}

export interface RoutingDecision {
  companyId: string | null;
  confidence: RoutingConfidence;
  /** What matched, or why nothing did. Shown to the founder in the unrouted tray. */
  reason: string;
  /** More than one client matched. Never auto-file these. */
  ambiguousCompanyIds?: string[];
}

/** Everything WOBBLE's own people use, so our attendance never decides whose call it was. */
const OUR_DOMAINS = ["wobblepk.com", "wobble.pk"];

export function isOurAddress(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return OUR_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function domainOfEmail(email: string): string | null {
  const domain = email.trim().toLowerCase().split("@")[1];
  return domain && domain.includes(".") ? domain : null;
}

/** Free mailbox providers. A shared gmail domain says nothing about which business someone is from. */
const PUBLIC_MAILBOXES = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com", "yandex.com", "mail.com",
]);

export function isPublicMailbox(domain: string): boolean {
  return PUBLIC_MAILBOXES.has(domain);
}

/**
 * Route a transcript, or refuse to.
 *
 * Order of evidence, strongest first:
 *   1. An attendee address that exactly matches a contact we hold. Certain.
 *   2. An attendee address that exactly matches the company's own address. Certain.
 *   3. An attendee on the company's own web domain, where that domain is not a public mailbox. Likely.
 * Anything matching two different clients is refused, not resolved by preference.
 */
export function routeTranscript(input: RoutingInput, candidates: RoutingCandidate[]): RoutingDecision {
  const external = input.attendeeEmails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@") && !isOurAddress(e));

  if (!external.length) {
    return { companyId: null, confidence: "refused", reason: "No attendee outside WOBBLE was on the invite, so there is nothing to identify the client by." };
  }

  const byContact = new Map<string, string>();
  const byCompanyEmail = new Map<string, string>();
  const byDomain = new Map<string, string[]>();

  for (const c of candidates) {
    for (const e of c.contactEmails) if (e) byContact.set(e.trim().toLowerCase(), c.companyId);
    if (c.companyEmail) byCompanyEmail.set(c.companyEmail.trim().toLowerCase(), c.companyId);
    if (c.companyDomain && !isPublicMailbox(c.companyDomain)) {
      byDomain.set(c.companyDomain, [...(byDomain.get(c.companyDomain) ?? []), c.companyId]);
    }
  }
  const nameOf = (id: string) => candidates.find((c) => c.companyId === id)?.companyName ?? id;

  const contactHits = [...new Set(external.map((e) => byContact.get(e)).filter((x): x is string => Boolean(x)))];
  if (contactHits.length === 1) {
    const email = external.find((e) => byContact.get(e) === contactHits[0]);
    return { companyId: contactHits[0], confidence: "certain", reason: `${email} is a contact on ${nameOf(contactHits[0])}.` };
  }
  if (contactHits.length > 1) {
    return { companyId: null, confidence: "refused", reason: `Attendees are contacts on ${contactHits.length} different clients (${contactHits.map(nameOf).join(", ")}). Filing this would put one client's call in another's container.`, ambiguousCompanyIds: contactHits };
  }

  const companyHits = [...new Set(external.map((e) => byCompanyEmail.get(e)).filter((x): x is string => Boolean(x)))];
  if (companyHits.length === 1) {
    return { companyId: companyHits[0], confidence: "certain", reason: `An attendee used ${nameOf(companyHits[0])}'s own address.` };
  }
  if (companyHits.length > 1) {
    return { companyId: null, confidence: "refused", reason: `Attendee addresses belong to ${companyHits.length} different clients.`, ambiguousCompanyIds: companyHits };
  }

  const domainHits = [...new Set(external.flatMap((e) => {
    const d = domainOfEmail(e);
    return d && !isPublicMailbox(d) ? byDomain.get(d) ?? [] : [];
  }))];
  if (domainHits.length === 1) {
    return { companyId: domainHits[0], confidence: "likely", reason: `An attendee is on ${nameOf(domainHits[0])}'s web domain, though not a contact we hold. Worth a glance before trusting it.` };
  }
  if (domainHits.length > 1) {
    return { companyId: null, confidence: "refused", reason: `The attendee domain matches ${domainHits.length} clients.`, ambiguousCompanyIds: domainHits };
  }

  const publicOnly = external.every((e) => { const d = domainOfEmail(e); return d ? isPublicMailbox(d) : true; });
  return {
    companyId: null,
    confidence: "refused",
    reason: publicOnly
      ? `Every external attendee is on a free mailbox (${external.join(", ")}), which identifies a person but not a business. Add one of them as a contact and this will file itself next time.`
      : `No attendee matches a contact, a client address, or a client domain (${external.join(", ")}).`,
  };
}
