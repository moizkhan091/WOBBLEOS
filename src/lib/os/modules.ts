// WOBBLE OS dashboard module registry.
// Single source of truth for the sidebar, page headers, and each module's
// wiring status. Adding a module here makes it appear in the shell.
//
// status:
//   "wired"         - real React page reading a live backend API (built)
//   "backend-ready" - backend/API exists; UI wiring is queued (honest state)
//   "planned"       - backend chunk not built yet (honest "Planned - Chunk NN")
// icon: a lucide-react PascalCase component name (looked up dynamically).

export type ModuleStatus = "wired" | "backend-ready" | "planned";

export interface ModuleDef {
  id: string;
  label: string; // sidebar label
  title: string; // page header title
  icon: string; // lucide PascalCase name
  tagline: string;
  status: ModuleStatus;
  chunk?: number; // backend chunk number (for planned/backend-ready)
  api?: string; // primary API this page reads/writes
}

export interface NavGroup {
  label: string;
  items: string[]; // module ids in order
}

export const MODULES: Record<string, ModuleDef> = {
  // WORKSPACE
  command: { id: "command", label: "Command Center", title: "Command Center", icon: "LayoutDashboard", status: "wired", api: "/api/approvals,/api/costs,/api/audit", tagline: "One pane of glass over the entire WOBBLE workforce - research, content, media, decisions, and the founder approvals that gate it all." },
  departments: { id: "departments", label: "Departments", title: "Departments & Handoffs", icon: "Network", status: "wired", api: "/api/departments,/api/handoffs", tagline: "The org as independent operating units — each department's truthful health, agent team, live inter-agent handoffs, spend and products. Inspect, retry, redrive or cancel any handoff." },
  ask: { id: "ask", label: "Ask WOBBLE", title: "Ask WOBBLE", icon: "Sparkles", status: "wired", chunk: 11, api: "/api/ask", tagline: "A direct line into the OS. Ask across every module, kick off the golden workflow, or interrogate memory in natural language." },
  brain: { id: "brain", label: "WOBBLE Brain", title: "WOBBLE Brain", icon: "Brain", status: "wired", chunk: 10, api: "/api/memory", tagline: "The shared knowledge core - everything the workforce has learned, embedded and retrievable." },
  agents: { id: "agents", label: "Agent Registry", title: "Agent Registry", icon: "Bot", status: "wired", chunk: 52, api: "/api/agents", tagline: "The AI workforce - every agent, what it does, its runs, cost and quality. The hive-mind, made visible." },

  // PIPELINE
  radar: { id: "radar", label: "Research Radar", title: "Research Radar", icon: "Radar", status: "wired", api: "/api/radar", tagline: "Name a focus — WOBBLE surfaces scored signals across markets, competitors, tech and culture, each with the implication for WOBBLE. Ready to review and feed learning." },
  sources: { id: "sources", label: "Source Registry", title: "Source Registry", icon: "Library", status: "wired", chunk: 53, api: "/api/sources,/api/sources/types", tagline: "Every source type, intake run, connected agent, processing status, memory route and approval gate that feeds the hive mind." },
  intelligence: { id: "intelligence", label: "Intelligence Inbox", title: "Intelligence Review Inbox", icon: "Inbox", status: "wired", chunk: 55, api: "/api/intelligence/inbox", tagline: "The review gate where raw agent/source findings become approved knowledge, get rejected with reasons, merge, or route into Memory." },
  learning: { id: "learning", label: "Learning Engine", title: "Learning Engine", icon: "GraduationCap", status: "wired", chunk: 13, api: "/api/knowledge", tagline: "The Knowledge Compiler: approved sources become atomic, interlinked knowledge notes that compound — the compiled brain every agent reads." },
  topics: { id: "topics", label: "Topic Bank", title: "Content Intelligence — Topic Bank", icon: "Lightbulb", status: "wired", api: "/api/content/topics,/api/content/intelligence", tagline: "The strategist team proposes content topics with real decision stats — search demand, trend velocity, competitor gap, founder-job value, novelty, proof. You pick what is worth making; nothing posts blindly. Run intelligence on demand or on a daily cadence." },
  content: { id: "content", label: "Content Command", title: "Content Command", icon: "PenTool", status: "wired", chunk: 14, api: "/api/content", tagline: "Every piece of content from idea to handoff. Nothing publishes without a founder." },
  library: { id: "library", label: "Library & Scheduler", title: "Content Library & Scheduler", icon: "CalendarClock", status: "wired", api: "/api/library", tagline: "Every publishable asset in one place - your existing content plus approved packs - queued and scheduled to each platform through a pluggable publisher." },
  media: { id: "media", label: "Media Studio", title: "Media Studio", icon: "Clapperboard", status: "wired", api: "/api/media", tagline: "Submit a media generation job — durable, worker-driven, with bounded retries + crash recovery + budget caps. The provider-independent pipeline is BUILT; the live fal.ai call is the only blocked piece (set FAL_KEY). Until a provider is configured a job is truthfully 'blocked', never faked." },

  // STRATEGY
  decision: { id: "decision", label: "Decision Room", title: "Decision Room", icon: "Scale", status: "wired", api: "/api/decisions", tagline: "Where strategy is debated, scored and committed. Add options, let WOBBLE score them 0-100, then commit — every decision keeps its reasoning trail." },
  offers: { id: "offers", label: "Offer Lab", title: "Offer Lab", icon: "Tag", status: "wired", api: "/api/offers", tagline: "Design, test and iterate offers. Run experiments, score what works, promote the winner — low-confidence bets never reach a founder cold." },

  // REVENUE (Wobble ERP Control Layer)
  org: { id: "org", label: "Org Workspace", title: "Organisation Workspace", icon: "Building2", status: "wired", api: "/api/org", tagline: "One organisation's whole commercial journey in one place — qualification grade, discovery meetings, and every artifact (audits, proposals, projects) with the provenance graph that shows how each was derived. Pick a company; the lineage assembles itself." },
  crm: { id: "crm", label: "Pipeline / CRM", title: "Pipeline & CRM", icon: "Kanban", status: "wired", api: "/api/crm", tagline: "The connected business backbone — companies, contacts, leads and the Wobble sales pipeline. Every stage move is audited; leads convert into the whole chain." },
  audit_workspace: { id: "audit_workspace", label: "Audit Workspace", title: "Audit Workspace", icon: "FolderKanban", status: "wired", api: "/api/audit/workspace", tagline: "Run a client through the whole audit in one place — Doc 1 pitch → Doc 2 internal interview roadmap → record findings → Doc 3 final McKinsey deck. Each client's data stays isolated." },
  free_audit: { id: "free_audit", label: "Quick Pitch", title: "Free AI Audit / Pitch", icon: "ClipboardCheck", status: "wired", api: "/api/audit/free", tagline: "The fast top-of-funnel: map a prospect's gaps to the full Wobble service menu + generate a niche-customized pitch. The full 3-stage flow lives in Audit Workspace." },
  paid_audit: { id: "paid_audit", label: "Paid Audit", title: "Paid AI Audit", icon: "ClipboardList", status: "wired", api: "/api/audit/paid", tagline: "The McKinsey-depth engagement — a team of AI consultants maps the business, finds AI opportunities across the full Wobble menu, prioritises by impact, and builds a 12-month roadmap + ROI. Runs on an LLM key." },

  // GROWTH & BUSINESS
  seo: { id: "seo", label: "SEO & Blog Engine", title: "SEO & Blog Engine", icon: "SearchCheck", status: "wired", api: "/api/seo", tagline: "Give a topic — WOBBLE generates a content pillar, target keywords (intent + priority) and blog ideas with outlines. Drafted by the workforce, published on your say-so." },
  social: { id: "social", label: "Social Intelligence", title: "Social Intelligence", icon: "Share2", status: "wired", api: "/api/social", tagline: "Pick a platform + niche — WOBBLE builds positioning, content pillars, scroll-stopping hooks, competitor angles and post ideas, feeding the next post back into Content Command." },
  webstats: { id: "webstats", label: "Website Analytics", title: "Website Analytics", icon: "BarChart3", status: "wired", api: "/api/webstats", tagline: "Live traffic, top pages and sources for wobblepk.com via Plausible. Real data only — connect PLAUSIBLE_API_KEY + PLAUSIBLE_SITE_ID to light it up." },
  invoices: { id: "invoices", label: "Invoices & Finance", title: "Invoices & Finance", icon: "ReceiptText", status: "wired", api: "/api/finance", tagline: "Draft, approve and track client invoices + a live revenue dashboard. AI drafts; a founder approves, sends, and marks paid — the OS never moves money on its own." },
  docs: { id: "docs", label: "Proposals", title: "Proposals", icon: "FileStack", status: "wired", api: "/api/proposals", tagline: "Build a client proposal from an audit's findings — services, scope, timeline, pricing. A founder approves before it's sent, and an accepted proposal auto-drafts the invoice." },

  // OPERATIONS
  tasks: { id: "tasks", label: "Tasks", title: "Tasks & Work", icon: "ListTodo", status: "wired", api: "/api/tasks", tagline: "Every task in the business — assigned, prioritised, due-dated, and linked to the deal/company it belongs to. Overdue work surfaces up top." },
  meetings: { id: "meetings", label: "Meetings", title: "Meetings & Calendar", icon: "CalendarDays", status: "wired", api: "/api/meetings", tagline: "Book and track every call — AI readiness calls, audits, reviews — linked to the deal, with outcomes captured on completion." },
  projects: { id: "projects", label: "Projects / Delivery", title: "Projects & Client Delivery", icon: "FolderKanban", status: "wired", api: "/api/projects", tagline: "Where a won deal becomes delivery. Track each client project's status, milestones, deliverables and a live health score — at-risk work surfaces first." },
  automations: { id: "automations", label: "Automations", title: "Automations", icon: "Workflow", status: "wired", api: "/api/automations", tagline: "Recurring jobs and triggers that keep the OS moving while you sleep. A rule fires a real job — on an event, a schedule, or on demand." },
  connections: { id: "connections", label: "Connections", title: "Connections Registry", icon: "Cable", status: "wired", chunk: 35, api: "/api/connections", tagline: "The permission map for every API, scraper, model gateway, webhook, media tool, storage rail and external service WOBBLE OS is allowed to call." },
  skills: { id: "skills", label: "Skill Registry", title: "Prompt / Skill Registry", icon: "Wand2", status: "wired", chunk: 34, api: "/api/skills", tagline: "Versioned, approval-gated SOPs the workers run. Edit a skill, approve it, and behavior changes with no code." },
  approvals: { id: "approvals", label: "Approvals", title: "Approvals", icon: "BadgeCheck", status: "wired", chunk: 4, api: "/api/approvals", tagline: "The single gate. Every output here cleared self-review - your decision is logged with explicit attribution." },
  workers: { id: "workers", label: "Workers", title: "Workers", icon: "Cpu", status: "wired", api: "/api/workers", tagline: "Persistent worker processes running outside the web lifecycle — live heartbeats (online/stale) and a job-queue summary." },
  handoff: { id: "handoff", label: "n8n Handoff", title: "n8n Handoff", icon: "Webhook", status: "wired", api: "/api/n8n", tagline: "The bridge to execution - HMAC-signed, replay-protected, idempotent webhooks with dead-letter recovery. Endpoints + live event log." },
  comms: { id: "comms", label: "Communications", title: "Communications Outbox", icon: "Send", status: "wired", api: "/api/comms", tagline: "Every outbound message the OS prepares — internal notifications, external comms and proposal-send packages. Earned Autonomy can auto-deliver a low-risk notification or stage a draft ready; the actual external/proposal SEND stays a founder confirm." },

  // SYSTEM
  security: { id: "security", label: "Security & Governance", title: "Security & Governance", icon: "ShieldCheck", status: "wired", api: "/api/security", tagline: "Deterministic governance of access, policy, risk and incidents. Every finding is a computed fact with reproduction steps and evidence — reproducible without a model call — never an opinion. A check that could not run is reported as skipped, because \"I could not check\" is not \"all clear\"." },
  memory: { id: "memory", label: "Memory", title: "Memory", icon: "Database", status: "wired", chunk: 10, api: "/api/memory", tagline: "Long-term recall across the workforce. What WOBBLE remembers, and why." },
  taste: { id: "taste", label: "Taste Learning", title: "Taste + Feedback Learning", icon: "HeartHandshake", status: "wired", chunk: 56, api: "/api/taste/profiles,/api/taste/feedback", tagline: "How approvals, rejections, edits, founder preferences and client/project taste become usable learning without overwriting WOBBLE brand truth." },
  costs: { id: "costs", label: "Costs", title: "Costs", icon: "Receipt", status: "wired", chunk: 5, api: "/api/costs", tagline: "Spend across every model, render and service - against budget, in real time." },
  audit: { id: "audit", label: "Audit Log", title: "Audit Log", icon: "ScrollText", status: "wired", chunk: 3, api: "/api/audit", tagline: "Immutable record of every action, approval and system event with founder attribution." },
  cockpit: { id: "cockpit", label: "Intelligence Cockpit", title: "Intelligence Cockpit", icon: "Gauge", status: "wired", api: "/api/cockpit", tagline: "One glance at the whole OS: measured revenue, the self-optimizer's open proposals, earned-autonomy grants in force, what needs your attention right now, and the media pipeline. A read-only aggregation of real systems — honest zeros/nulls, never fabricated." },
  optimizer: { id: "optimizer", label: "Self-Optimizer", title: "Controlled Dream / Self-Optimizer", icon: "Gauge", status: "wired", api: "/api/optimizer", tagline: "The OS studies its OWN performance — QA failures, revision load, dead letters, provider cost — and PROPOSES evidence-backed improvements. Nothing changes silently: a proposal is only approvable when its historical EVIDENCE is strong (enough samples, a clearly-below-threshold problem), needs your explicit approval, is monitored vs a baseline, and rolls back if it degrades. The improvement target shown is an estimate, not a backtest." },
  backup: { id: "backup", label: "Backup & Restore", title: "Backup & Restore", icon: "HardDrive", status: "wired", api: "/api/backup", tagline: "Point-in-time snapshots — export a full JSON backup of every business table on demand. Company assets are never auto-deleted." },
  settings: { id: "settings", label: "Settings", title: "Settings", icon: "Settings", status: "wired", api: "/api/settings", tagline: "Operational config for the whole OS — which integration keys are connected, the model-role map, and every provider's status." },
};

// Consolidated navigation (V2 restructure): Ask WOBBLE first, Command second, then the primary work areas —
// Intelligence & Sources, Content Studio, Revenue/CRM, Delivery & Ops, WOBBLE HQ — with everything operational
// tucked into a collapsed SYSTEM drawer. Fewer top-level areas, clearer mental model.
export const NAV_GROUPS: NavGroup[] = [
  { label: "WORKSPACE", items: ["ask", "command", "cockpit", "departments", "agents"] },
  { label: "INTELLIGENCE & SOURCES", items: ["radar", "sources", "intelligence", "learning", "brain", "memory"] },
  { label: "CONTENT STUDIO", items: ["topics", "content", "library", "media", "social", "seo", "webstats"] },
  { label: "REVENUE / CRM", items: ["crm", "org", "free_audit", "paid_audit", "audit_workspace", "docs", "invoices"] },
  { label: "DELIVERY & OPS", items: ["projects", "meetings", "tasks", "automations", "comms"] },
  { label: "WOBBLE HQ", items: ["decision", "offers", "taste", "optimizer"] },
  { label: "SYSTEM", items: ["approvals", "security", "connections", "skills", "workers", "handoff", "costs", "audit", "backup", "settings"] },
];

// (The sidebar opens only the active group by default, so SYSTEM and other non-active groups render as
// collapsed drawers automatically — operational modules stay out of the way until opened.)
export const DEFAULT_MODULE = "ask";

export function getModule(id: string): ModuleDef | undefined {
  return MODULES[id];
}
