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
  ask: { id: "ask", label: "Ask WOBBLE", title: "Ask WOBBLE", icon: "Sparkles", status: "wired", chunk: 11, api: "/api/ask", tagline: "A direct line into the OS. Ask across every module, kick off the golden workflow, or interrogate memory in natural language." },
  brain: { id: "brain", label: "WOBBLE Brain", title: "WOBBLE Brain", icon: "Brain", status: "wired", chunk: 10, api: "/api/memory", tagline: "The shared knowledge core - everything the workforce has learned, embedded and retrievable." },
  agents: { id: "agents", label: "Agent Registry", title: "Agent Registry", icon: "Bot", status: "wired", chunk: 52, api: "/api/agents", tagline: "The AI workforce - every agent, what it does, its runs, cost and quality. The hive-mind, made visible." },

  // PIPELINE
  radar: { id: "radar", label: "Research Radar", title: "Research Radar", icon: "Radar", status: "planned", chunk: 12, tagline: "Continuous signal scan across markets, competitors and culture. Surfaced, scored and ready to feed learning." },
  sources: { id: "sources", label: "Source Registry", title: "Source Registry", icon: "Library", status: "wired", chunk: 53, api: "/api/sources,/api/sources/types", tagline: "Every source type, intake run, connected agent, processing status, memory route and approval gate that feeds the hive mind." },
  intelligence: { id: "intelligence", label: "Intelligence Inbox", title: "Intelligence Review Inbox", icon: "Inbox", status: "wired", chunk: 55, api: "/api/intelligence/inbox", tagline: "The review gate where raw agent/source findings become approved knowledge, get rejected with reasons, merge, or route into Memory." },
  learning: { id: "learning", label: "Learning Engine", title: "Learning Engine", icon: "GraduationCap", status: "wired", chunk: 13, api: "/api/knowledge", tagline: "The Knowledge Compiler: approved sources become atomic, interlinked knowledge notes that compound — the compiled brain every agent reads." },
  content: { id: "content", label: "Content Command", title: "Content Command", icon: "PenTool", status: "wired", chunk: 14, api: "/api/content", tagline: "Every piece of content from idea to handoff. Nothing publishes without a founder." },
  library: { id: "library", label: "Library & Scheduler", title: "Content Library & Scheduler", icon: "CalendarClock", status: "wired", api: "/api/library", tagline: "Every publishable asset in one place - your existing content plus approved packs - queued and scheduled to each platform through a pluggable publisher." },
  media: { id: "media", label: "Media Studio", title: "Media Studio", icon: "Clapperboard", status: "planned", chunk: 21, tagline: "Video and visual production. Render jobs are isolated from web and API compute." },
  presentations: { id: "presentations", label: "Presentation Maker", title: "Presentation Maker", icon: "Presentation", status: "planned", chunk: 23, tagline: "Turn research, decisions and content into investor updates, client pitches and brand decks - approved by a founder." },

  // STRATEGY
  decision: { id: "decision", label: "Decision Room", title: "Decision Room", icon: "Scale", status: "planned", chunk: 24, tagline: "Where strategy is debated, scored and committed. Each decision keeps its reasoning trail." },
  offers: { id: "offers", label: "Offer Lab", title: "Offer Lab", icon: "Tag", status: "planned", chunk: 25, tagline: "Design, test and iterate offers. Low-confidence experiments never reach a founder cold." },

  // REVENUE (Wobble ERP Control Layer)
  crm: { id: "crm", label: "Pipeline / CRM", title: "Pipeline & CRM", icon: "Kanban", status: "wired", api: "/api/crm", tagline: "The connected business backbone — companies, contacts, leads and the Wobble sales pipeline. Every stage move is audited; leads convert into the whole chain." },
  free_audit: { id: "free_audit", label: "Free Audit", title: "Free AI Audit", icon: "ClipboardCheck", status: "wired", api: "/api/audit/free", tagline: "The top-of-funnel converter — map a prospect's gaps to the full Wobble service menu, surface quick wins, and turn the diagnosis into a pipeline deal. Deep multi-agent + paid McKinsey audit layer on top." },
  paid_audit: { id: "paid_audit", label: "Paid Audit", title: "Paid AI Audit", icon: "ClipboardList", status: "wired", api: "/api/audit/paid", tagline: "The McKinsey-depth engagement — a team of AI consultants maps the business, finds AI opportunities across the full Wobble menu, prioritises by impact, and builds a 12-month roadmap + ROI. Runs on an LLM key." },

  // GROWTH & BUSINESS
  seo: { id: "seo", label: "SEO & Blog Engine", title: "SEO & Blog Engine", icon: "SearchCheck", status: "planned", chunk: 37, tagline: "Keyword targets, blog pipeline and AI-search visibility - drafted by the workforce, published on your say-so." },
  social: { id: "social", label: "Social Intelligence", title: "Social Intelligence", icon: "Share2", status: "planned", chunk: 38, tagline: "Platform stats, post performance and competitor patterns - feeding the next post back into Content Command." },
  webstats: { id: "webstats", label: "Website Analytics", title: "Website Analytics", icon: "BarChart3", status: "planned", chunk: 39, tagline: "Traffic, top pages and conversion signals for wobblepk.com - rolled up into Memory and Ask WOBBLE." },
  invoices: { id: "invoices", label: "Invoices & Finance", title: "Invoices & Finance", icon: "ReceiptText", status: "wired", api: "/api/finance", tagline: "Draft, approve and track client invoices + a live revenue dashboard. AI drafts; a founder approves, sends, and marks paid — the OS never moves money on its own." },
  docs: { id: "docs", label: "Proposals", title: "Proposals", icon: "FileStack", status: "wired", api: "/api/proposals", tagline: "Build a client proposal from an audit's findings — services, scope, timeline, pricing. A founder approves before it's sent, and an accepted proposal auto-drafts the invoice." },

  // OPERATIONS
  automations: { id: "automations", label: "Automations", title: "Automations", icon: "Workflow", status: "planned", chunk: 19, tagline: "Recurring jobs and triggers that keep the OS moving while you sleep." },
  connections: { id: "connections", label: "Connections", title: "Connections Registry", icon: "Cable", status: "wired", chunk: 35, api: "/api/connections", tagline: "The permission map for every API, scraper, model gateway, webhook, media tool, storage rail and external service WOBBLE OS is allowed to call." },
  skills: { id: "skills", label: "Skill Registry", title: "Prompt / Skill Registry", icon: "Wand2", status: "wired", chunk: 34, api: "/api/skills", tagline: "Versioned, approval-gated SOPs the workers run. Edit a skill, approve it, and behavior changes with no code." },
  approvals: { id: "approvals", label: "Approvals", title: "Approvals", icon: "BadgeCheck", status: "wired", chunk: 4, api: "/api/approvals", tagline: "The single gate. Every output here cleared self-review - your decision is logged with explicit attribution." },
  workers: { id: "workers", label: "Workers", title: "Workers", icon: "Cpu", status: "planned", chunk: 20, tagline: "Persistent worker processes running outside the web lifecycle. Live load, queue and health." },
  handoff: { id: "handoff", label: "n8n Handoff", title: "n8n Handoff", icon: "Webhook", status: "backend-ready", chunk: 18, api: "/api/n8n", tagline: "The bridge to execution - HMAC-signed, replay-protected, idempotent webhooks with dead-letter recovery." },

  // SYSTEM
  memory: { id: "memory", label: "Memory", title: "Memory", icon: "Database", status: "wired", chunk: 10, api: "/api/memory", tagline: "Long-term recall across the workforce. What WOBBLE remembers, and why." },
  taste: { id: "taste", label: "Taste Learning", title: "Taste + Feedback Learning", icon: "HeartHandshake", status: "wired", chunk: 56, api: "/api/taste/profiles,/api/taste/feedback", tagline: "How approvals, rejections, edits, founder preferences and client/project taste become usable learning without overwriting WOBBLE brand truth." },
  costs: { id: "costs", label: "Costs", title: "Costs", icon: "Receipt", status: "wired", chunk: 5, api: "/api/costs", tagline: "Spend across every model, render and service - against budget, in real time." },
  audit: { id: "audit", label: "Audit Log", title: "Audit Log", icon: "ScrollText", status: "wired", chunk: 3, api: "/api/audit", tagline: "Immutable record of every action, approval and system event with founder attribution." },
  backup: { id: "backup", label: "Backup & Restore", title: "Backup & Restore", icon: "HardDrive", status: "planned", chunk: 27, tagline: "Point-in-time snapshots. Company assets are never auto-deleted." },
  settings: { id: "settings", label: "Settings", title: "Settings", icon: "Settings", status: "planned", chunk: 28, tagline: "Models, security, secrets and operational controls for the whole OS." },
};

export const NAV_GROUPS: NavGroup[] = [
  { label: "WORKSPACE", items: ["command", "ask", "brain", "agents"] },
  { label: "PIPELINE", items: ["radar", "sources", "intelligence", "learning", "content", "library", "media", "presentations"] },
  { label: "STRATEGY", items: ["decision", "offers"] },
  { label: "REVENUE", items: ["free_audit", "paid_audit", "crm", "docs", "invoices"] },
  { label: "GROWTH & BUSINESS", items: ["seo", "social", "webstats"] },
  { label: "OPERATIONS", items: ["automations", "connections", "approvals", "skills", "workers", "handoff"] },
  { label: "SYSTEM", items: ["memory", "taste", "costs", "audit", "backup", "settings"] },
];

export const DEFAULT_MODULE = "command";

export function getModule(id: string): ModuleDef | undefined {
  return MODULES[id];
}
