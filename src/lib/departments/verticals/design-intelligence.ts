import { buildHandoffEnvelope, type HandoffEnvelope } from "@/lib/domain/handoff";
import { runDepartment, type DepartmentPolicy, type DepartmentRunResult, type RunDepartmentDeps } from "@/lib/departments/orchestrator";
import {
  selectReferencesForBatch,
  collectAvoidTags,
  type AssetRequest,
  type AssetType,
  type CreativeReference,
  type ReferenceSelection,
} from "@/lib/domain/reference-selection";
import { runTextProvider } from "@/lib/providers";
import type { ProviderUsageContext } from "@/lib/domain/provider-usage";
import { useDeterministicJudgment } from "@/lib/departments/verticals/deterministic-judgment";

/**
 * Design Intelligence department vertical (WOB-UAT-023).
 *
 * Turns an approved content pack into structured visual direction and a renderable design brief.
 *
 * THE DOCTRINE, same as sales-crm: judgment ADVISES, deterministic code DECIDES.
 *  - `selectReferencesForBatch` (authoritative) picks exactly ONE reference per asset by a scored,
 *    stable rule. It is pure, already tested, and — until now — completely unused production code.
 *  - `visual_reference_analyst` (advisory) may describe a reference; it never picks one. A model that
 *    re-picks a reference every run makes design direction unreproducible, and the founder rule
 *    (exactly ONE reference per asset, never a hybrid blend) is a RULE, not an opinion.
 *  - `brand_voice_guardian` (advisory) critiques the direction; a failed critique escalates and
 *    annotates the brief, it never silently rewrites it.
 *
 * WHAT THIS DOES NOT DO — and must never claim to: it produces a BRIEF, not an asset. The states are
 * kept distinct on purpose (visual direction → brief → generation prompt → queued render → draft →
 * approved → final). Calling generated text a rendered visual asset is the exact fabrication the
 * campaign exists to prevent; Media Production owns everything from `queued render` onward, and
 * truthfully reports `blocked` when it has no provider credential.
 */

export const DESIGN_MEMORY_SCOPES = ["design", "brand", "content", "visual_reference"];

/** The renderable brief. `productSchema: "design_briefs"` — exactly what media_production accepts. */
export interface DesignBrief {
  packetId: string;
  /** Structured visual direction, upgraded from the copywriter's free-text `designDirection`. */
  visualDirection: string;
  layoutRules: string[];
  /** Exactly ONE reference per asset (or null, said explicitly — never invented). */
  selections: ReferenceSelection[];
  /** Style tags drawn from NEGATIVE references — what to avoid, not what to copy. */
  avoidStyleTags: string[];
  /** The flat prompt + structured params `createMediaJob` needs. NOT an asset — an instruction. */
  mediaRequests: { kind: string; prompt: string; params: Record<string, unknown> }[];
  brandCritique: { passed: boolean; notes: string[] } | null;
  /** True when NO eligible reference existed. Stated, never hidden behind a plausible brief. */
  referenceless: boolean;
}

export interface RunDesignIntelligenceInput {
  packetId: string;
  /** The copywriter's free-text design direction — the seed this department upgrades. */
  designDirection: string;
  assets: { assetType: AssetType; platform?: string; objective?: string; desiredStyleTags?: string[]; slideCount?: number; pinnedReferenceId?: string }[];
  /** Approved references available to choose from. An empty list is honest, not an error. */
  references: CreativeReference[];
  companyId?: string | null;
  requestedBy: string;
  workflowId?: string;
}

export interface RunDesignIntelligenceDeps extends RunDepartmentDeps {
  inboundEnvelope?: HandoffEnvelope;
  /** ADVISORY vision descriptor. Injectable; a failure degrades the brief, it never blocks it. */
  describeReferences?: (refs: CreativeReference[]) => Promise<string[]>;
  /** ADVISORY brand critique. Injectable; a failure degrades, never blocks. */
  critiqueBrand?: (direction: string) => Promise<{ passed: boolean; notes: string[] }>;
}

/**
 * DEFAULT advisory vision pass — `visual_reference_analyst` actually executing.
 *
 * Without a default the agent would be registered, seeded as a member, and run by NOTHING in production:
 * a decorative agent wearing a membership. It is ADVISORY — the selection below does not consume it, so a
 * failure loses descriptors and changes no decision.
 */
async function defaultDescribeReferences(refs: CreativeReference[], usageContext: ProviderUsageContext): Promise<string[]> {
  if (!refs.length) return [];
  if (useDeterministicJudgment()) return [];
  const r = await runTextProvider({
    role: "content_strategy",
    module: "design_intelligence",
    maxTokens: 400,
    messages: [
      { role: "system", content: "You are WOBBLE's visual reference analyst. Describe the SHARED visual system of the approved references in at most 3 short clauses (composition, type, colour). Never invent a style that is not present. Reply as a JSON array of strings." },
      { role: "user", content: `Approved references: ${refs.map((x) => `${x.id} [${x.styleTags.join(", ")}]`).join("; ")}` },
    ],
    usageContext,
  });
  try {
    const parsed = JSON.parse(r.text.replace(/^```json\s*|\s*```$/g, "")) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 3) : [];
  } catch {
    // A malformed advisory response degrades to no descriptors — never to a fabricated one.
    return [];
  }
}

/** DEFAULT advisory brand critique — `brand_voice_guardian` actually executing. Advisory only. */
async function defaultCritiqueBrand(direction: string, usageContext: ProviderUsageContext): Promise<{ passed: boolean; notes: string[] }> {
  if (useDeterministicJudgment()) return { passed: true, notes: [] };
  const r = await runTextProvider({
    role: "content_scoring",
    module: "design_intelligence",
    maxTokens: 300,
    messages: [
      { role: "system", content: "You are WOBBLE's brand voice guardian. Judge whether this VISUAL direction respects the WOBBLE brand system (premium, teach-first, no hype, no unsupported claims). Reply as JSON: {\"passed\":boolean,\"notes\":string[]}." },
      { role: "user", content: direction },
    ],
    usageContext,
  });
  try {
    const j = JSON.parse(r.text.replace(/^```json\s*|\s*```$/g, "")) as { passed?: unknown; notes?: unknown };
    return { passed: j.passed !== false, notes: Array.isArray(j.notes) ? j.notes.map(String) : [] };
  } catch {
    // An unparseable critique must not read as a PASS — that would let a broken advisory silently bless
    // off-brand direction. Nor is it a FAIL: nothing was actually judged, and reporting "brand flagged
    // this" would invent a finding. It is an advisory FAILURE, so it throws and the vertical's existing
    // advisory catch reports it honestly as "critique unavailable" — unreviewed, and visibly so.
    throw new Error("brand critique returned an unparseable response");
  }
}

/** Build the flat prompt Media Production's `createMediaJob` needs from structured direction. */
function buildMediaPrompt(direction: string, selection: ReferenceSelection, avoid: string[]): string {
  const ref = selection.reference;
  const parts = [direction.trim()];
  if (ref) parts.push(`Style reference: ${ref.id} (${ref.styleTags.join(", ")}). Match this ONE reference; do not blend others.`);
  else parts.push("No approved style reference was eligible for this asset — do not invent one.");
  if (avoid.length) parts.push(`Avoid: ${avoid.join(", ")}.`);
  return parts.join(" ");
}

export async function runDesignIntelligenceDepartment(
  input: RunDesignIntelligenceInput,
  deps: RunDesignIntelligenceDeps = {},
): Promise<DepartmentRunResult<DesignBrief>> {
  const now = deps.now ?? new Date();
  const workflowId = input.workflowId ?? input.packetId;

  const envelope =
    deps.inboundEnvelope ??
    buildHandoffEnvelope(
      {
        workflowId,
        department: "design_intelligence",
        sourceAgent: "content_orchestrator",
        destinationAgent: "design_intelligence_orchestrator",
        objective: `Produce visual direction for content packet ${input.packetId}`,
        requestedAction: "produce_visual_direction",
        expectedOutputSchema: "content_pack",
        confidence: 0.8,
        companyId: input.companyId ?? null,
        clientWorkspaceId: input.companyId ?? null,
        dataClassification: input.companyId ? "client_confidential" : "internal",
        authorizedMemoryScopes: DESIGN_MEMORY_SCOPES,
        idempotencyKey: `${workflowId}:design_intelligence:inbound`,
      },
      { now },
    );

  const receiverCtx = { clientWorkspaceId: input.companyId ?? null, grantedMemoryScopes: DESIGN_MEMORY_SCOPES };

  const policy: DepartmentPolicy<DesignBrief> = async (api) => {
    // The department must genuinely HAVE the specialists, not merely list them in a seed.
    if (!api.selectSpecialists({ capability: "visual_analysis" }).length) {
      api.escalate("design_intelligence has no registered visual analyst");
    }

    // Validate the real inbound. A packet with no design direction cannot produce visual direction, and
    // inventing one from nothing is exactly the fabrication this department must not do.
    if (!input.designDirection.trim()) throw new Error(`design_intelligence: packet '${input.packetId}' carries no designDirection to upgrade`);

    // ADVISORY vision pass. A failure degrades the brief (it loses descriptors); it never blocks it,
    // because the authoritative selection below does not depend on it.
    const usageContext: ProviderUsageContext = { departmentSlug: "design_intelligence", workflowId, taskId: api.envelope.taskId, companyId: input.companyId ?? null, clientWorkspaceId: input.companyId ?? null };
    let descriptors: string[] = [];
    try {
      // The department budget settles against ACTUAL recorded usage via usageContext — same as content.
      descriptors = await (deps.describeReferences ?? ((refs: CreativeReference[]) => defaultDescribeReferences(refs, usageContext)))(input.references);
    } catch (err) {
      api.escalate(`design_intelligence visual descriptors unavailable (advisory): ${err instanceof Error ? err.message : "error"}`);
    }

    // DETERMINISTIC + AUTHORITATIVE: exactly ONE reference per asset, scored and stable. This is the
    // step a founder can reproduce and argue with; the model above cannot overturn it.
    const requests: AssetRequest[] = input.assets.map((a, index) => ({ ...a, index }));
    const selections = selectReferencesForBatch(requests, input.references);
    const avoidStyleTags = collectAvoidTags(input.references);
    const referenceless = selections.every((s) => s.reference === null);

    // No eligible reference is a REAL state that must be said out loud, not hidden behind a brief that
    // reads complete. The founder decides whether to approve unreferenced work.
    if (referenceless) api.escalate(`design_intelligence found no eligible approved reference for packet ${input.packetId} — the brief is referenceless`);

    // Structured direction, upgraded from free text. The layout rules are derived from what was actually
    // selected, so they never describe a reference that was not chosen.
    const visualDirection = [input.designDirection.trim(), ...descriptors].join(" ").trim();
    const layoutRules = selections
      .filter((s) => s.reference)
      .map((s) => `Asset ${s.assetIndex} (${s.assetType}): follow ${s.reference!.id} — ${s.rationale}`);

    // ADVISORY brand critique. Annotates; never rewrites.
    let brandCritique: DesignBrief["brandCritique"] = null;
    try {
      brandCritique = await (deps.critiqueBrand ?? ((d: string) => defaultCritiqueBrand(d, usageContext)))(visualDirection);
      if (brandCritique && !brandCritique.passed) {
        api.escalate(`design_intelligence brand critique flagged the visual direction for packet ${input.packetId}: ${brandCritique.notes.join("; ")}`);
      }
    } catch (err) {
      api.escalate(`design_intelligence brand critique unavailable (advisory): ${err instanceof Error ? err.message : "error"}`);
    }

    const mediaRequests = selections.map((s) => ({
      // `image` for static/carousel, `video` for video — the kinds `validateMediaRequest` accepts.
      kind: s.assetType === "video" ? "video" : "image",
      prompt: buildMediaPrompt(visualDirection, s, avoidStyleTags),
      params: {
        assetIndex: s.assetIndex,
        assetType: s.assetType,
        referenceId: s.reference?.id ?? null,
        referenceStyleTags: s.reference?.styleTags ?? [],
        avoidStyleTags,
        selectionRationale: s.rationale,
        candidatesConsidered: s.candidatesConsidered,
      },
    }));

    const brief: DesignBrief = { packetId: input.packetId, visualDirection, layoutRules, selections, avoidStyleTags, mediaRequests, brandCritique, referenceless };

    return {
      product: brief,
      // EXACTLY the schema media_production accepts (`design_briefs`, plural). A mismatch here means the
      // route is rejected at dispatch and the brief silently goes nowhere.
      productSchema: "design_briefs",
      outputs: {
        packetId: input.packetId,
        assetCount: selections.length,
        referencedAssets: selections.filter((s) => s.reference).length,
        referenceless,
        avoidStyleTags,
        brandCritiquePassed: brandCritique?.passed ?? null,
        // The media requests ride on the handoff so Media Production can create real jobs from them.
        mediaRequests,
      },
      // Lower when nothing could be referenced: the brief is real but weaker, and saying so is the point.
      confidence: referenceless ? 0.4 : 0.85,
      // routeTo omitted → the seed's declared downstreamConsumers (media_production) is the single
      // source of truth for topology.
    };
  };

  return runDepartment({ departmentSlug: "design_intelligence", inbound: { envelope, receiverCtx }, policy }, deps);
}
