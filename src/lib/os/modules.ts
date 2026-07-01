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

  // PIPELINE
  radar: { id: "radar", label: "Research Radar", title: "Research Radar", icon: "Radar", status: "planned", chunk: 12, tagline: "Continuous signal scan across markets, competitors and culture. Surfaced, scored and ready to feed learning." },
  sources: { id: "sources", label: "Source Library", title: "Source Library", icon: "Library", status: "wired", chunk: 9, api: "/api/sources", tagline: "Every captured source, document and asset. Company materials are never auto-deleted." },
  learning: { id: "learning", label: "Learning Engine", title: "Learning Engine", icon: "GraduationCap", status: "planned", chunk: 13, tagline: "How raw research becomes structured knowledge the workforce can act on." },
  content: { id: "content", label: "Content Command", title: "Content Command", icon: "PenTool", status: "wired", chunk: 14, api: "/api/content", tagline: "Every piece of content from idea to handoff. Nothing publishes without a founder." },
  media: { id: "media", label: "Media Studio", title: "Media Studio", icon: "Clapperboard", status: "planned", chunk: 21, tagline: "Video and visual production. Render jobs are isolated from web and API compute." },
  presentations: { id: "presentations", label: "Presentation Maker", title: "Presentation Maker", icon: "Presentation", status: "planned", chunk: 23, tagline: "Turn research, decisions and content into investor updates, client pitches and brand decks - approved by a founder." },

  // STRATEGY
  decision: { id: "decision", label: "Decision Room", title: "Decision Room", icon: "Scale", status: "planned", chunk: 24, tagline: "Where strategy is debated, scored and committed. Each decision keeps its reasoning trail." },
  offers: { id: "offers", label: "Offer Lab", title: "Offer Lab", icon: "Tag", status: "planned", chunk: 25, tagline: "Design, test and iterate offers. Low-confidence experiments never reach a founder cold." },
  clients: { id: "clients", label: "Client AIOS Lab", title: "Client AIOS Lab", icon: "Building2", status: "planned", chunk: 26, tagline: "Build and ship AI operating systems for clients - the same engine, pointed outward." },

  // GROWTH & BUSINESS
  seo: { id: "seo", label: "SEO & Blog Engine", title: "SEO & Blog Engine", icon: "SearchCheck", status: "planned", chunk: 37, tagline: "Keyword targets, blog pipeline and AI-search visibility - drafted by the workforce, published on your say-so." },
  social: { id: "social", label: "Social Intelligence", title: "Social Intelligence", icon: "Share2", status: "planned", chunk: 38, tagline: "Platform stats, post performance and competitor patterns - feeding the next post back into Content Command." },
  webstats: { id: "webstats", label: "Website Analytics", title: "Website Analytics", icon: "BarChart3", status: "planned", chunk: 39, tagline: "Traffic, top pages and conversion signals for wobblepk.com - rolled up into Memory and Ask WOBBLE." },
  invoices: { id: "invoices", label: "Invoice Builder", title: "Invoice Builder", icon: "ReceiptText", status: "planned", chunk: 40, tagline: "Draft, send and track client invoices. Every issue and status change lands in the audit trail." },
  docs: { id: "docs", label: "Business Docs", title: "Business Docs", icon: "FileStack", status: "planned", chunk: 42, tagline: "Reports, briefs and proposals built from approved Brain and client context - approved before they leave the building." },

  // OPERATIONS
  automations: { id: "automations", label: "Automations", title: "Automations", icon: "Workflow", status: "planned", chunk: 19, tagline: "Recurring jobs and triggers that keep the OS moving while you sleep." },
  skills: { id: "skills", label: "Skill Registry", title: "Prompt / Skill Registry", icon: "Wand2", status: "wired", chunk: 34, api: "/api/skills", tagline: "Versioned, approval-gated SOPs the workers run. Edit a skill, approve it, and behavior changes with no code." },
  approvals: { id: "approvals", label: "Approvals", title: "Approvals", icon: "BadgeCheck", status: "wired", chunk: 4, api: "/api/approvals", tagline: "The single gate. Every output here cleared self-review - your decision is logged with explicit attribution." },
  workers: { id: "workers", label: "Workers", title: "Workers", icon: "Cpu", status: "planned", chunk: 20, tagline: "Persistent worker processes running outside the web lifecycle. Live load, queue and health." },
  handoff: { id: "handoff", label: "n8n Handoff", title: "n8n Handoff", icon: "Webhook", status: "backend-ready", chunk: 18, api: "/api/n8n", tagline: "The bridge to execution - HMAC-signed, replay-protected, idempotent webhooks with dead-letter recovery." },

  // SYSTEM
  memory: { id: "memory", label: "Memory", title: "Memory", icon: "Database", status: "wired", chunk: 10, api: "/api/memory", tagline: "Long-term recall across the workforce. What WOBBLE remembers, and why." },
  costs: { id: "costs", label: "Costs", title: "Costs", icon: "Receipt", status: "wired", chunk: 5, api: "/api/costs", tagline: "Spend across every model, render and service - against budget, in real time." },
  audit: { id: "audit", label: "Audit Log", title: "Audit Log", icon: "ScrollText", status: "wired", chunk: 3, api: "/api/audit", tagline: "Immutable record of every action, approval and system event with founder attribution." },
  backup: { id: "backup", label: "Backup & Restore", title: "Backup & Restore", icon: "HardDrive", status: "planned", chunk: 27, tagline: "Point-in-time snapshots. Company assets are never auto-deleted." },
  settings: { id: "settings", label: "Settings", title: "Settings", icon: "Settings", status: "planned", chunk: 28, tagline: "Models, security, secrets and operational controls for the whole OS." },
};

export const NAV_GROUPS: NavGroup[] = [
  { label: "WORKSPACE", items: ["command", "ask", "brain"] },
  { label: "PIPELINE", items: ["radar", "sources", "learning", "content", "media", "presentations"] },
  { label: "STRATEGY", items: ["decision", "offers", "clients"] },
  { label: "GROWTH & BUSINESS", items: ["seo", "social", "webstats", "invoices", "docs"] },
  { label: "OPERATIONS", items: ["automations", "approvals", "skills", "workers", "handoff"] },
  { label: "SYSTEM", items: ["memory", "costs", "audit", "backup", "settings"] },
];

export const DEFAULT_MODULE = "command";

export function getModule(id: string): ModuleDef | undefined {
  return MODULES[id];
}
