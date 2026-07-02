import { DEFAULT_SOURCE_TYPE_DEFINITIONS } from "@/lib/domain/sources";

export const initialFounderProfiles = [
  {
    id: "founder_moiz",
    displayName: "Moiz",
    role: "Founder / WOBBLE OS operator",
    approvalDefault: true,
  },
  {
    id: "founder_haad",
    displayName: "Haad",
    role: "Founder",
    approvalDefault: false,
  },
  {
    id: "founder_3",
    displayName: "Founder 3",
    role: "Founder",
    approvalDefault: false,
  },
  {
    id: "founder_4",
    displayName: "Founder 4",
    role: "Founder",
    approvalDefault: false,
  },
] as const;

export const initialSourceTrustLevels = [
  {
    id: "trust_tier_1_core_wobble",
    slug: "tier_1_core_wobble",
    label: "Tier 1: Core WOBBLE",
    priority: 1,
    description: "Founder-approved WOBBLE Brain, internal strategy, brand, and operating doctrine.",
    canUpdateBrain: true,
  },
  {
    id: "trust_tier_2_approved_expert",
    slug: "tier_2_approved_expert",
    label: "Tier 2: Approved Expert",
    priority: 2,
    description: "Founder-approved expert sources that can support strategy and content with citation.",
    canUpdateBrain: false,
  },
  {
    id: "trust_tier_3_monitored",
    slug: "tier_3_monitored",
    label: "Tier 3: Monitored",
    priority: 3,
    description: "Known sources watched for trends, but not allowed to override WOBBLE Brain.",
    canUpdateBrain: false,
  },
  {
    id: "trust_tier_4_experimental",
    slug: "tier_4_experimental",
    label: "Tier 4: Experimental",
    priority: 4,
    description: "Discovered or unproven sources that require founder review before serious use.",
    canUpdateBrain: false,
  },
  {
    id: "trust_blocked",
    slug: "blocked",
    label: "Blocked",
    priority: 99,
    description: "Sources the OS must not use.",
    canUpdateBrain: false,
  },
] as const;

export const initialSourceTypeDefinitions = DEFAULT_SOURCE_TYPE_DEFINITIONS;

export const initialApprovalActions = [
  { id: "approval_action_approve", slug: "approve", label: "Approve", description: "Approve the item as final-ready.", riskLevel: "normal", requiresConfirmation: false },
  { id: "approval_action_reject", slug: "reject", label: "Reject", description: "Reject the item; it will not proceed.", riskLevel: "normal", requiresConfirmation: false },
  { id: "approval_action_request_revision", slug: "request_revision", label: "Request Revision", description: "Send the item back for changes.", riskLevel: "normal", requiresConfirmation: false },
  { id: "approval_action_regenerate", slug: "regenerate", label: "Regenerate", description: "Regenerate the item from scratch.", riskLevel: "normal", requiresConfirmation: false },
  { id: "approval_action_edit_manually", slug: "edit_manually", label: "Edit Manually", description: "Edit the item by hand before deciding.", riskLevel: "normal", requiresConfirmation: false },
  { id: "approval_action_archive", slug: "archive", label: "Archive", description: "Archive the item out of the active queue.", riskLevel: "normal", requiresConfirmation: false },
  { id: "approval_action_send_to_n8n", slug: "send_to_n8n", label: "Send to n8n", description: "Hand the approved item to n8n for external action.", riskLevel: "high", requiresConfirmation: true },
  { id: "approval_action_retry_handoff", slug: "retry_handoff", label: "Retry Handoff", description: "Retry a failed n8n handoff.", riskLevel: "high", requiresConfirmation: true },
  { id: "approval_action_mark_final", slug: "mark_final", label: "Mark as Final", description: "Mark the item as the final approved version.", riskLevel: "normal", requiresConfirmation: false },
] as const;

export const initialContentTracks = [
  {
    id: "track_wobble_company",
    slug: "wobble_company",
    label: "WOBBLE Company",
    ownerType: "company",
    voiceProfile: {
      tone: "teach-first, sharp, premium, rebellious, anti-agency dependency",
      audience: "Pakistani owner-led growth businesses",
    },
    goals: ["AI OS education", "WOBBLE authority", "anti-agency dependency positioning"],
    allowedTopics: ["AI operating systems", "AI employees", "automation", "agency dependency", "Pakistan business AI adoption"],
    bannedPhrases: ["generic AI agency", "fully replace your team", "automate everything"],
    aggressionRange: { min: 2, max: 8 },
    platformPriorities: ["linkedin", "instagram", "x"],
    approvalRequired: true,
    status: "active",
    metadata: { primary: true },
  },
  {
    id: "track_moiz_founder",
    slug: "moiz_founder_pov",
    label: "Moiz Founder POV",
    ownerType: "founder",
    voiceProfile: {
      tone: "founder-led, direct, educational, operator POV",
      audience: "business owners, founders, operators",
    },
    goals: ["founder authority", "education", "market point of view"],
    allowedTopics: ["AI adoption", "WOBBLE builds", "business operating systems", "agency dependency"],
    bannedPhrases: ["guru", "easy money", "guaranteed results"],
    aggressionRange: { min: 3, max: 9 },
    platformPriorities: ["linkedin", "x", "instagram"],
    approvalRequired: true,
    status: "active",
    metadata: { primaryFounder: "Moiz" },
  },
] as const;

export const initialWobbleBrainRecords = [
  {
    id: "brain_about_wobble",
    slug: "about-wobble",
    title: "About WOBBLE",
    area: "brand",
    memoryTier: "core",
    content:
      "WOBBLE builds digital employees for growing businesses. The old way is wobbling; WOBBLE makes work faster, smarter, and less dependent on repetitive human effort.",
  },
  {
    id: "brain_brand_voice",
    slug: "brand-voice",
    title: "Brand Voice",
    area: "brand",
    memoryTier: "core",
    content:
      "Bold, fast, intelligent, rebellious, premium, clear, and direct. WOBBLE should sound like an operator building the future, not a generic AI agency.",
  },
  {
    id: "brain_icp",
    slug: "icp",
    title: "Ideal Customer Profile",
    area: "icp",
    memoryTier: "core",
    content:
      "Growing businesses and founders who need AI employees, workflow automation, content systems, and operating leverage without drowning in tools or manual work.",
  },
  {
    id: "brain_offers",
    slug: "offers",
    title: "Offers",
    area: "offer",
    memoryTier: "core",
    content:
      "WOBBLE offers AI workforce systems, AI operating systems, automation rails, content engines, and client-specific digital employee builds.",
  },
  {
    id: "brain_content_strategy",
    slug: "content-strategy",
    title: "Content Strategy",
    area: "content",
    memoryTier: "core",
    content:
      "Teach-first content is the center. Aggressive or rage-bait angles can be used between educational posts, but the main goal is to teach, prove, and build authority.",
  },
  {
    id: "brain_do_not_say",
    slug: "do-not-say",
    title: "Do Not Say Rules",
    area: "brand",
    memoryTier: "core",
    content:
      "Avoid generic AI agency language, weak hype, unsupported claims, fake certainty, and competitor attacks without proof. Claims that need evidence must carry citations or be held for review.",
  },
  {
    id: "brain_founder_preferences",
    slug: "founder-preferences",
    title: "Founder Preferences",
    area: "founder",
    memoryTier: "core",
    content:
      "Moiz wants WOBBLE OS built fully, locally first, with no shortcuts, no scaled-down fake paths, and clean handoff between Codex, Claude, Gemini, and Antigravity.",
  },
  {
    id: "brain_team_and_roles",
    slug: "team-and-roles",
    title: "Team And Roles",
    area: "team",
    memoryTier: "core",
    content:
      "V2 uses one shared private login, but approvals must capture an approver name: Moiz, Haad, Founder 3, or Founder 4.",
  },
  {
    id: "brain_current_priorities",
    slug: "current-priorities",
    title: "Current Priorities",
    area: "strategy",
    memoryTier: "core",
    content:
      "Build WOBBLE OS V2 locally first, starting with the database, Brain, approvals, audit, model cost tracking, workers, sources, memory, Ask WOBBLE, content, media, and n8n handoff.",
  },
  {
    id: "brain_competitor_landscape",
    slug: "competitor-landscape",
    title: "Competitor Landscape",
    area: "market",
    memoryTier: "core",
    content:
      "WOBBLE should monitor Pakistan and international AI landscape, approved YouTubers, competitor content, source transcripts, AI product changes, and market shifts before creating strategy or content.",
  },
] as const;

export const initialBudgetCaps = [
  { id: "budget_openrouter_daily", category: "openrouter", period: "daily", amount: "25", currency: "USD", maxBatchSize: 50 },
  { id: "budget_search_daily", category: "search", period: "daily", amount: "15", currency: "USD", maxBatchSize: 25 },
  { id: "budget_media_daily", category: "media", period: "daily", amount: "30", currency: "USD", maxBatchSize: 8 },
  { id: "budget_video_daily", category: "video", period: "daily", amount: "50", currency: "USD", maxBatchSize: 3 },
] as const;

export const initialProviderConnections = [
  {
    id: "provider_openrouter",
    slug: "openrouter",
    label: "OpenRouter",
    providerType: "llm_gateway",
    credentialKeyName: "OPENROUTER_API_KEY",
    costCategory: "openrouter",
    allowedModules: ["ask_wobble", "research", "content", "decision_room", "offer_lab", "client_aios_lab"],
    referenceDocPath: "docs/provider-references/openrouter.md",
  },
  {
    id: "provider_search",
    slug: "search_api",
    label: "Search API",
    providerType: "search",
    credentialKeyName: "SEARCH_API_KEY",
    costCategory: "search",
    allowedModules: ["research", "source_library", "ask_wobble"],
    referenceDocPath: "docs/provider-references/search.md",
  },
  {
    id: "provider_fal_seedance",
    slug: "fal_seedance",
    label: "fal.ai Seedance",
    providerType: "video_generation",
    credentialKeyName: "FAL_API_KEY",
    costCategory: "video",
    allowedModules: ["media_studio"],
    referenceDocPath: "docs/provider-references/fal-seedance.md",
  },
  {
    id: "provider_n8n",
    slug: "n8n",
    label: "n8n",
    providerType: "automation",
    credentialKeyName: "N8N_WEBHOOK_SECRET",
    costCategory: "automation",
    allowedModules: ["handoff", "automations", "source_library"],
    referenceDocPath: "docs/provider-references/n8n-webhooks.md",
  },
] as const;

export const initialPromptSkills = [
  {
    id: "skill_wobble_linkedin_post",
    slug: "wobble_linkedin_post",
    name: "WOBBLE LinkedIn Post",
    module: "content_command",
    trigger: "Use when creating WOBBLE company LinkedIn text posts or thought leadership.",
    goal: "Create a teach-first LinkedIn post with WOBBLE voice, evidence, CTA, and quality self-review.",
    promptBody:
      "Load WOBBLE Brain, content strategy, do-not-say rules, approved sources, and the requested angle. Create a useful LinkedIn post, cite serious claims, score quality, and create an approval item.",
    rules: ["Teach first", "Avoid generic AI agency language", "Use citations for serious claims", "Do not hand off without approval"],
    referencePaths: ["docs/AI_OS_TRANSCRIPT_LESSONS_FOR_WOBBLE.md", "docs/FINAL_V2_MASTER_BUILD_PLAN.md"],
  },
  {
    id: "skill_research_radar",
    slug: "research_radar",
    name: "Research Radar",
    module: "research_radar",
    trigger: "Use when scanning AI market, competitor content, or source updates.",
    goal: "Create cited research insights and propose source approvals or memory updates.",
    promptBody:
      "Search approved domains and configured discovery targets, summarize findings, separate facts from assumptions, propose source trust levels, and never update Core Brain without approval.",
    rules: ["Cite sources", "New sources require approval", "Company Brain wins over unapproved research", "Create audit trail"],
    referencePaths: ["docs/AI_OS_TRANSCRIPT_LESSONS_FOR_WOBBLE.md"],
  },
  {
    id: "skill_decision_brief",
    slug: "decision_brief",
    name: "Decision Brief",
    module: "decision_room",
    trigger: "Use when WOBBLE needs to make or review an important decision.",
    goal: "Produce an evidence-backed decision brief with options, risks, recommendation, and founder confirmation.",
    promptBody:
      "Load current priorities, prior decisions, relevant Brain records, approved evidence, and constraints. Present options, recommendation, risk, opposing view, and what requires founder judgment.",
    rules: ["Do not pretend certainty", "Show opposing view", "Require confirmation for high-risk execution", "Log decision outcome"],
    referencePaths: ["docs/FINAL_V2_MASTER_BUILD_PLAN.md"],
  },
] as const;
