import { z } from "zod";

/**
 * What a build costs WOBBLE to deliver and to run. Not what to charge for it.
 *
 * The audit used to emit an `estimatedImplementationCents` that became the client's quote, and it was
 * wrong in both directions at once: wrong in units (a rupee figure sent as dollars) and wrong in kind
 * (a model guessing a market price it has no basis for). WOBBLE's own pricing analyst refused it.
 *
 * The separation this file exists to enforce:
 *
 *   COST   is arithmetic. Which tools a system needs, what each one's subscription is, what the API
 *          usage runs to at the client's volume, what a one-off setup fee is. It has a right answer,
 *          it can be computed, and it is OURS.
 *   PRICE  is a decision. It depends on the client's economics, what the market bears, how badly we
 *          want the logo, and what a founder is willing to sign their name to. It is not arithmetic
 *          and nothing in this system may invent it.
 *
 * So the OS computes cost, shows the founder the margin at any price they type, and produces no quote
 * until a human sets one. Deliberately EXCLUDED from cost: WOBBLE's own time. Founder hours are not a
 * cash cost, treating them as one buries the real number, and pricing off a made-up hourly rate is how
 * an agency ends up working for nothing.
 */

export type CostCadence = "one_off" | "monthly";

/**
 * Cash actually leaves the bank. Effort is our own build time, valued in cash for comparison only.
 *
 * They must never be added together. A founder pricing off a total that quietly includes their own
 * labour is pricing off a number that overstates what the work costs them, which makes the margin look
 * worse than it is and tempts a higher quote than the client's economics support.
 */
export type CostKind = "cash" | "effort";

export interface CostLine {
  /** What it is, in the founder's words. */
  label: string;
  /** The tool or account this is paid to. Empty when it is our own build effort. */
  vendor?: string;
  cadence: CostCadence;
  amountCents: number;
  /** Why this is needed. Shown so a founder can strike a line they disagree with. */
  because: string;
  /** True when the amount scales with the client's volume rather than being a flat subscription. */
  usageBased?: boolean;
  /** Cash out of the door, or our own time. Absent on rows written before the split; treat as cash. */
  kind?: CostKind;
}

export interface DeliveryCost {
  currency: string;
  /**
   * Cash paid once to get it live. CASH ONLY: integration build effort is deliberately not in here,
   * because founder hours are not a cash cost and the founder asked for tools, not dev cost.
   */
  oneOffCents: number;
  /** Cash paid every month it keeps running. */
  monthlyCents: number;
  /**
   * What the build effort would be worth if we charged ourselves for it. Shown beside the cash cost,
   * never inside it, so a founder can see the shape of the work without it distorting the margin.
   */
  effortOneOffCents: number;
  lines: CostLine[];
  /** Things we could not cost, named rather than silently omitted. */
  unknowns: string[];
}

/**
 * The tools a WOBBLE system is actually built on, with what they cost us.
 *
 * Prices are the published list rates at the time of writing, in USD, and are stated as such rather
 * than hidden: a rate that has moved should be visibly wrong so it gets corrected, not quietly folded
 * into a total nobody can check.
 */
export interface ToolCost {
  key: string;
  vendor: string;
  label: string;
  /** Flat monthly subscription in USD cents. Zero for pure usage-based tools. */
  monthlyUsdCents: number;
  /** One-off setup or number-provisioning cost in USD cents. */
  setupUsdCents: number;
  /** Rough usage cost per 1,000 conversations/messages handled, USD cents. */
  perThousandUsdCents: number;
  note: string;
}

export const TOOL_COSTS: ToolCost[] = [
  { key: "whatsapp_business_api", vendor: "Meta / BSP", label: "WhatsApp Business API", monthlyUsdCents: 0, setupUsdCents: 0, perThousandUsdCents: 800, note: "Meta charges per conversation; a BSP may add a platform fee on top." },
  { key: "twilio_sms", vendor: "Twilio", label: "SMS and voice numbers", monthlyUsdCents: 200, setupUsdCents: 0, perThousandUsdCents: 750, note: "Number rental plus per-message. Rates vary a lot by country." },
  { key: "llm_usage", vendor: "OpenRouter", label: "Model usage", monthlyUsdCents: 0, setupUsdCents: 0, perThousandUsdCents: 1500, note: "Depends entirely on the model chosen in Model Control, which is why that page exists." },
  { key: "n8n_hosting", vendor: "Self-hosted", label: "Automation runtime", monthlyUsdCents: 1500, setupUsdCents: 0, perThousandUsdCents: 0, note: "A share of the VPS the workflows run on." },
  { key: "app_hosting", vendor: "VPS", label: "App and database hosting", monthlyUsdCents: 2000, setupUsdCents: 0, perThousandUsdCents: 0, note: "A share of the box, database and backups." },
  { key: "calendar_sync", vendor: "Cal.com / Google", label: "Calendar and booking", monthlyUsdCents: 1200, setupUsdCents: 0, perThousandUsdCents: 0, note: "Per-seat on the paid tier once more than one calendar is connected." },
  { key: "crm_seat", vendor: "CRM", label: "CRM seat", monthlyUsdCents: 2500, setupUsdCents: 0, perThousandUsdCents: 0, note: "Only when the client has no CRM of their own to build on." },
  { key: "review_platform", vendor: "Google / platform", label: "Review requests", monthlyUsdCents: 0, setupUsdCents: 0, perThousandUsdCents: 200, note: "Sent over the messaging channel already in the build." },
  { key: "ads_platform", vendor: "Meta / Google", label: "Ad account plumbing", monthlyUsdCents: 0, setupUsdCents: 5000, perThousandUsdCents: 0, note: "Pixel, conversions API and tracking setup. Ad SPEND is the client's, never ours." },
  { key: "analytics", vendor: "Plausible / GA", label: "Analytics and tracking", monthlyUsdCents: 900, setupUsdCents: 0, perThousandUsdCents: 0, note: "Traffic-tier dependent." },
  { key: "media_generation", vendor: "fal / OpenRouter", label: "Image and video generation", monthlyUsdCents: 0, setupUsdCents: 0, perThousandUsdCents: 9000, note: "Per generated asset. The single most expensive line when creative volume is high." },
  { key: "email_sending", vendor: "Resend / SES", label: "Email sending", monthlyUsdCents: 0, setupUsdCents: 0, perThousandUsdCents: 100, note: "Per thousand emails, plus domain warm-up on a new sender." },
  { key: "integration_build", vendor: "", label: "Integration into their existing tools", monthlyUsdCents: 0, setupUsdCents: 0, perThousandUsdCents: 0, note: "Costed per integration below, since it is the part that varies most between clients." },
];

export const TOOL_BY_KEY = new Map(TOOL_COSTS.map((t) => [t.key, t]));

/**
 * Which tools each kind of WOBBLE system needs.
 *
 * Keyed by the service category so a new service inherits a sensible default rather than costing zero,
 * which would be the dangerous failure: a system that looks free.
 */
const CATEGORY_TOOLS: Record<string, string[]> = {
  speed_to_lead: ["whatsapp_business_api", "twilio_sms", "llm_usage", "n8n_hosting"],
  booking: ["whatsapp_business_api", "calendar_sync", "llm_usage", "n8n_hosting"],
  sales_followup: ["whatsapp_business_api", "email_sending", "llm_usage", "n8n_hosting"],
  ops: ["llm_usage", "n8n_hosting", "app_hosting"],
  retention: ["email_sending", "whatsapp_business_api", "llm_usage", "n8n_hosting"],
  reputation: ["review_platform", "whatsapp_business_api", "n8n_hosting"],
  support: ["whatsapp_business_api", "llm_usage", "n8n_hosting"],
  content: ["media_generation", "llm_usage", "app_hosting"],
  ads: ["ads_platform", "analytics", "llm_usage"],
  analytics: ["analytics", "app_hosting"],
  lead_capture: ["analytics", "llm_usage", "n8n_hosting"],
  ecommerce: ["email_sending", "llm_usage", "n8n_hosting", "analytics"],
};

/** Anything uncategorised still costs the floor: a runtime and some model usage. */
const DEFAULT_TOOLS = ["llm_usage", "n8n_hosting"];

/**
 * What it costs us to connect to something the client already runs.
 *
 * The most client-specific number in the build and the one most often forgotten. A documented API is
 * an afternoon; a paper diary and a WhatsApp group is a migration.
 */
export const INTEGRATION_COSTS = [
  { key: "documented_api", label: "A tool with a documented API", setupUsdCents: 15_000, because: "Connecting to something with real documentation is predictable work." },
  { key: "no_api", label: "A tool with no API", setupUsdCents: 60_000, because: "No API means scraping, exports or a browser robot, all of which need watching afterwards." },
  { key: "spreadsheets", label: "Spreadsheets", setupUsdCents: 20_000, because: "Structure has to be imposed on something that has none, and it changes under you." },
  { key: "paper", label: "Paper records", setupUsdCents: 45_000, because: "Nothing to connect to. The data has to be entered before anything can read it." },
  { key: "legacy_db", label: "A legacy database", setupUsdCents: 50_000, because: "Access, schema archaeology, and usually a read-only mirror so nothing breaks." },
] as const;

export const INTEGRATION_KEYS = INTEGRATION_COSTS.map((i) => i.key) as unknown as [IntegrationKey, ...IntegrationKey[]];
export type IntegrationKey = (typeof INTEGRATION_COSTS)[number]["key"];
export const INTEGRATION_BY_KEY = new Map(INTEGRATION_COSTS.map((i) => [i.key, i]));

export interface CostInput {
  /** The systems being built, by service category. */
  categories: string[];
  /** What we have to connect into on the client's side. */
  integrations: IntegrationKey[];
  /** Roughly how many conversations, messages or generations a month this will handle. */
  monthlyVolume: number;
  /** What currency to report in, and what one unit of it is worth in USD cents. */
  currency: string;
  /** e.g. 280 for PKR, meaning 1 USD is 280 PKR. Omit for USD. */
  usdRate?: number;
}

/**
 * Compute what this build costs us, one-off and monthly.
 *
 * Every line names itself and says why, so a founder can strike one they disagree with rather than
 * arguing with a total. Nothing here is a price and nothing here includes our time.
 */
export function computeDeliveryCost(input: CostInput): DeliveryCost {
  const rate = input.usdRate && input.usdRate > 0 ? input.usdRate : 1;
  const toLocal = (usdCents: number) => Math.round(usdCents * rate);
  const lines: CostLine[] = [];
  const unknowns: string[] = [];

  const toolKeys = [...new Set(input.categories.flatMap((c) => CATEGORY_TOOLS[c] ?? DEFAULT_TOOLS))];
  if (!input.categories.length) unknowns.push("No systems were named, so only the runtime floor is costed.");

  // A FLOOR of a thousand a month, not a floor of one. `Math.max(1, volume)` made every usage line a
  // thousandth of its real size when volume was unknown, so a build that runs on model calls and
  // WhatsApp conversations looked like it cost pennies. A cost that is silently too small is worse
  // than no cost at all, because it survives into a price.
  const thousands = Math.max(1000, input.monthlyVolume) / 1000;

  for (const key of toolKeys) {
    const tool = TOOL_BY_KEY.get(key);
    if (!tool) continue;
    if (tool.setupUsdCents > 0) {
      lines.push({ label: `${tool.label} setup`, vendor: tool.vendor, cadence: "one_off", amountCents: toLocal(tool.setupUsdCents), because: tool.note, kind: "cash" });
    }
    if (tool.monthlyUsdCents > 0) {
      lines.push({ label: tool.label, vendor: tool.vendor, cadence: "monthly", amountCents: toLocal(tool.monthlyUsdCents), because: tool.note, kind: "cash" });
    }
    if (tool.perThousandUsdCents > 0) {
      lines.push({
        label: `${tool.label} usage`,
        vendor: tool.vendor,
        cadence: "monthly",
        amountCents: toLocal(Math.round(tool.perThousandUsdCents * thousands)),
        because: `${tool.note} Costed at about ${Math.round(input.monthlyVolume).toLocaleString()} a month.`,
        usageBased: true,
        kind: "cash",
      });
    }
  }

  for (const key of [...new Set(input.integrations)]) {
    const integration = INTEGRATION_BY_KEY.get(key);
    if (!integration) continue;
    // Effort, not cash. Nobody invoices us for connecting to a documented API; it costs time. The
    // founder was explicit that cost means tools, not dev cost, so it is shown and not counted.
    lines.push({ label: `Integration: ${integration.label}`, cadence: "one_off", amountCents: toLocal(integration.setupUsdCents), because: integration.because, kind: "effort" });
  }
  if (!input.integrations.length) {
    unknowns.push("Nothing was named on the client's side to integrate with, so no integration cost is included. That is rarely true, and it is the line that varies most.");
  }
  if (!input.monthlyVolume) {
    unknowns.push("No monthly volume given, so usage-based lines are costed at the floor of 1,000 a month. Ask them how many enquiries they actually handle.");
  }

  // A line with no kind predates the split and is treated as cash, which is what it was.
  const isCash = (l: CostLine) => (l.kind ?? "cash") === "cash";
  return {
    currency: input.currency,
    oneOffCents: lines.filter((l) => isCash(l) && l.cadence === "one_off").reduce((n, l) => n + l.amountCents, 0),
    monthlyCents: lines.filter((l) => isCash(l) && l.cadence === "monthly").reduce((n, l) => n + l.amountCents, 0),
    effortOneOffCents: lines.filter((l) => !isCash(l)).reduce((n, l) => n + l.amountCents, 0),
    lines,
    unknowns,
  };
}

// -------------------------------------------------------------------------- margin, once a founder prices it

export interface MarginView {
  /** Gross margin on the one-off, 0-1. Null when nothing has been priced yet. */
  setupMargin: number | null;
  /** Monthly gross margin, 0-1, when there is a recurring price. */
  runMargin: number | null;
  /** How many months of running cost the one-off price covers before it stops paying for itself. */
  runwayMonths: number | null;
  /** Plain sentence for the founder. */
  verdict: string;
}

/**
 * What a founder's chosen price actually leaves, given the cost.
 *
 * This is the whole point of separating the two: the OS says what it costs, the founder says what it is
 * worth, and this shows the gap. It never suggests a price.
 */
export function marginAt(price: { oneOffCents: number; monthlyCents?: number }, cost: DeliveryCost): MarginView {
  const setupMargin = price.oneOffCents > 0 ? (price.oneOffCents - cost.oneOffCents) / price.oneOffCents : null;
  const runMargin = price.monthlyCents && price.monthlyCents > 0 ? (price.monthlyCents - cost.monthlyCents) / price.monthlyCents : null;
  const surplus = price.oneOffCents - cost.oneOffCents;
  const runwayMonths = cost.monthlyCents > 0 && surplus > 0 ? Math.floor(surplus / cost.monthlyCents) : cost.monthlyCents > 0 ? 0 : null;

  if (price.oneOffCents <= 0) {
    return { setupMargin: null, runMargin: null, runwayMonths: null, verdict: "No price set. Nothing goes out to a client until you set one." };
  }
  if (setupMargin !== null && setupMargin < 0) {
    return { setupMargin, runMargin, runwayMonths, verdict: `This price is BELOW what the build costs us. You would be paying ${Math.abs(Math.round(setupMargin * 100))}% of it yourself.` };
  }
  if (runMargin !== null && runMargin < 0) {
    return { setupMargin, runMargin, runwayMonths, verdict: "The setup covers itself but the monthly price does not cover the monthly cost, so this loses money the longer it runs." };
  }
  // Once our own time is out of the cost, most builds have NO cash setup cost at all: no vendor charges
  // us to start. A "100% margin on the build" would be arithmetically true and useless, so it says the
  // real thing instead, which is how long the one-off covers the running cost.
  if (cost.oneOffCents === 0 && cost.monthlyCents > 0) {
    const effort = cost.effortOneOffCents > 0 ? ` It is about ${Math.round(cost.effortOneOffCents / 100).toLocaleString()} ${cost.currency} of our own build time, which is not a cash cost and is not in this.` : "";
    return {
      setupMargin,
      runMargin,
      runwayMonths,
      verdict: `Nothing is paid out to start this build, so the one-off is all yours.${effort} It covers ${runwayMonths} month${runwayMonths === 1 ? "" : "s"} of running cost${runMargin !== null ? `, and the monthly price leaves ${Math.round(runMargin * 100)}%` : " and there is no recurring price against it"}.`,
    };
  }
  if (runMargin === null && cost.monthlyCents > 0) {
    return {
      setupMargin,
      runMargin,
      runwayMonths,
      verdict: `${Math.round((setupMargin ?? 0) * 100)}% on the build, and no recurring price against a running cost. The surplus covers ${runwayMonths} month${runwayMonths === 1 ? "" : "s"} before this starts costing you.`,
    };
  }
  return { setupMargin, runMargin, runwayMonths, verdict: `${Math.round((setupMargin ?? 0) * 100)}% on the build, ${Math.round((runMargin ?? 0) * 100)}% on the monthly.` };
}

// -------------------------------------------------------------------------- correcting what we guessed

/**
 * What a founder can correct about a cost, and what the OS guessed.
 *
 * Volume and integrations are read out of the audit's prose, which is a guess dressed as a fact. When
 * it guesses wrong the cost is wrong, and a founder who can see the number but not fix it will stop
 * trusting the number. So both are editable, the guess is shown next to the correction, and the origin
 * of every input is stated.
 */
export interface CostInputsView {
  monthlyVolume: number;
  integrations: IntegrationKey[];
  categories: string[];
  /** Where each came from, so a corrected input reads differently from a guessed one. */
  volumeSource: "guessed" | "founder" | "unknown";
  integrationsSource: "guessed" | "founder";
}

export const costCorrectionSchema = z.object({
  monthlyVolume: z.number().int().min(0).max(10_000_000).optional(),
  integrations: z.array(z.enum(INTEGRATION_KEYS)).max(10).optional(),
}).refine((v) => v.monthlyVolume !== undefined || v.integrations !== undefined, { message: "nothing to correct" });
export type CostCorrection = z.infer<typeof costCorrectionSchema>;

/** The questions worth asking on the next call to make this cost real rather than assumed. */
export function costQuestions(view: CostInputsView): string[] {
  const out: string[] = [];
  if (view.volumeSource !== "founder") {
    out.push(view.volumeSource === "unknown"
      ? "How many enquiries, messages or bookings do they handle in a month? Nothing in the audit said, so usage is costed at the floor."
      : `We read their volume as about ${view.monthlyVolume.toLocaleString()} a month from what they told us. Worth confirming, since every usage line scales with it.`);
  }
  if (view.integrationsSource !== "founder") {
    out.push(view.integrations.length
      ? `We think we have to connect into: ${view.integrations.map((k) => INTEGRATION_BY_KEY.get(k)?.label ?? k).join(", ")}. Anything missing here is cost we have not priced.`
      : "Nothing was identified on their side to integrate with. That is rarely true, and it is the line that varies most.");
  }
  return out;
}

// -------------------------------------------------------------------------- reading volume from prose

/**
 * How much this system will actually handle in a month, read out of an audit's own words.
 *
 * Volume drives every usage line, so getting it wrong is not cosmetic. A first attempt allowed any
 * three words between the number and the period, and on a real report that matched an unrelated "75"
 * instead of the "400 weekly WhatsApp enquiries" the audit plainly stated, understating the running
 * cost roughly fourfold.
 *
 * So the words between a number and its period must be a UNIT we recognise. "240 appointments a week"
 * counts; "PKR 8,000 per appointment, and separately something weekly" does not.
 */
const VOLUME_UNITS = "appointments?|enquir(?:y|ies)|inquir(?:y|ies)|messages?|bookings?|leads?|calls?|patients?|customers?|clients?|conversations?|orders?|tickets?|visits?|jobs?|requests?|chats?";

export function extractMonthlyVolume(text: string): number {
  // Both orders occur in real reports, and only handling one of them silently loses the number:
  //   "240 appointments a week"          number, unit, period
  //   "400 weekly WhatsApp enquiries"    number, period, unit
  const forPeriod = (period: string): number[] => {
    const unitThenPeriod = String.raw`(\d[\d,]{0,8})\s+(?:${VOLUME_UNITS})\s*(?:${period})`;
    const periodThenUnit = String.raw`(\d[\d,]{0,8})\s+(?:${period})\s+(?:[\w-]+\s+){0,2}(?:${VOLUME_UNITS})`;
    return [
      ...text.matchAll(new RegExp(unitThenPeriod, "gi")),
      ...text.matchAll(new RegExp(periodThenUnit, "gi")),
    ]
      .map((m) => Number(m[1].replace(/,/g, "")))
      .filter((n) => Number.isFinite(n) && n > 0);
  };

  const weekly = forPeriod(String.raw`per week|a week|weekly|/week`);
  const monthly = forPeriod(String.raw`per month|a month|monthly|/month|/mo`);

  // 4.3 weeks to a month. The LARGEST stated figure wins: an audit mentions several volumes and the
  // system has to carry the busiest of them, not the most convenient.
  const fromWeekly = weekly.length ? Math.max(...weekly) * 4.3 : 0;
  const fromMonthly = monthly.length ? Math.max(...monthly) : 0;
  return Math.round(Math.max(fromWeekly, fromMonthly));
}
