import Image from "next/image";
import {
  Activity,
  Archive,
  Bell,
  BookOpen,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Database,
  FileText,
  Fingerprint,
  Gauge,
  GitBranch,
  Library,
  LockKeyhole,
  MessageSquareText,
  Orbit,
  PlayCircle,
  Radar,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  TriangleAlert,
  WandSparkles,
  Zap,
} from "lucide-react";

const navItems = [
  ["Command", Activity],
  ["Brain", BrainCircuit],
  ["Research", Radar],
  ["Content", FileText],
  ["Media", PlayCircle],
  ["Clients", Library],
  ["Decisions", GitBranch],
  ["Approvals", CheckCircle2],
  ["Ops", TerminalSquare],
];

const metrics = [
  { label: "Brain tiers", value: "3", detail: "Core, working, episodic", tone: "lime" },
  { label: "Approval gates", value: "7", detail: "Source, memory, content, media", tone: "white" },
  { label: "Cost guard", value: "On", detail: "Daily and weekly caps", tone: "blue" },
  { label: "n8n rail", value: "Ready", detail: "Signed webhook handoff", tone: "orange" },
];

const modules = [
  { title: "Ask WOBBLE", icon: MessageSquareText, copy: "Chat over Core Brain, approved sources, clients, offers, content, decisions, and audit logs with citations." },
  { title: "Research Radar", icon: Radar, copy: "Approved sources feed the OS. New sources are proposed, scored, and held for founder approval." },
  { title: "Content Command", icon: FileText, copy: "Turns research into content packets for Instagram, LinkedIn, X, reels, shorts, and YouTube scripts." },
  { title: "Media Studio", icon: WandSparkles, copy: "Static, carousel, keyframe, Seedance, and HyperFrames workflows with strict self-review gates." },
  { title: "Client AIOS Lab", icon: Library, copy: "Client context, workflow maps, AI employees, automations, dashboard modules, audits, and proposals." },
  { title: "Decision Room", icon: GitBranch, copy: "Founder-level recommendations with evidence, opposing view, risk, confidence, and approval history." },
];

const approvalRows = [
  { item: "AIOS transcript insight pack", type: "Memory", risk: "Low", by: "Moiz", status: "Needs review" },
  { item: "Agency middleman carousel", type: "Content", risk: "Medium", by: "Haad", status: "Quality passed" },
  { item: "Seedance clip batch", type: "Media", risk: "High", by: "Founder 3", status: "Budget approval" },
];

const sourceTiers = [
  { tier: "Tier 1", label: "Core Brain", copy: "Founder-approved WOBBLE docs. Never decays. Overrides external research." },
  { tier: "Tier 2", label: "Working Memory", copy: "Active clients, proposals, content angles, open decisions, and live campaigns." },
  { tier: "Tier 3", label: "Episodic Archive", copy: "Transcripts, old radars, completed audits, and historical market intelligence." },
];

const pipeline = ["Source", "Insight", "Strategy", "Packet", "Media", "Approval", "n8n"];

function StatusPill({ children, tone = "lime" }: { children: React.ReactNode; tone?: "lime" | "blue" | "orange" | "white" }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

export default function Home() {
  return (
    <main className="os-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <aside className="sidebar glass-panel">
        <div className="brand-lockup">
          <div className="brand-mark">w<span>.</span></div>
          <div>
            <p className="eyebrow">AI Workforce Company</p>
            <h1>wobble.</h1>
          </div>
        </div>
        <nav className="nav-stack" aria-label="WOBBLE OS modules">
          {navItems.map(([label, Icon]) => (
            <a href={`#${String(label).toLowerCase()}`} key={String(label)}>
              <Icon size={18} />
              <span>{String(label)}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <StatusPill>Private OS</StatusPill>
          <p>Shared founder login. Every approval still captures who signed off.</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar glass-panel">
          <div>
            <p className="eyebrow">WOBBLE OS V2</p>
            <h2>The system that makes WOBBLE smarter every week.</h2>
          </div>
          <div className="topbar-actions">
            <StatusPill tone="blue">VPS-ready</StatusPill>
            <StatusPill tone="orange">n8n guarded</StatusPill>
            <button className="icon-button" aria-label="Notifications"><Bell size={18} /></button>
          </div>
        </header>

        <section className="hero-grid" id="command">
          <div className="hero-card glass-panel">
            <div className="hero-copy">
              <p className="eyebrow">Command Center</p>
              <h2>Build the machine. Stop renting the output.</h2>
              <p>
                A premium internal operating system for WOBBLE: research radar, content strategist,
                media studio, client AIOS lab, decision room, approvals, cost control, and memory that gets cleaner over time.
              </p>
              <div className="hero-actions">
                <button className="primary-button">Ask WOBBLE <ChevronRight size={18} /></button>
                <button className="secondary-button">Review approvals</button>
              </div>
            </div>
            <div className="orb-stage" aria-hidden="true">
              <div className="orb-core" />
              <div className="orb-ring ring-one" />
              <div className="orb-ring ring-two" />
              <div className="signal-card card-a">Core Brain</div>
              <div className="signal-card card-b">AI Radar</div>
              <div className="signal-card card-c">Content OS</div>
            </div>
          </div>
          <div className="brand-board glass-panel">
            <Image src="/brand/wobble-brand-identity.jpeg" alt="WOBBLE brand identity board" width={640} height={920} priority />
          </div>
        </section>

        <section className="metrics-grid" aria-label="OS metrics">
          {metrics.map((metric) => (
            <article className="metric glass-panel" key={metric.label}>
              <span>{metric.label}</span>
              <strong className={`metric-${metric.tone}`}>{metric.value}</strong>
              <p>{metric.detail}</p>
            </article>
          ))}
        </section>

        <section className="module-grid" id="brain">
          {modules.map((module) => (
            <article className="module-card glass-panel" key={module.title}>
              <module.icon size={22} />
              <h3>{module.title}</h3>
              <p>{module.copy}</p>
            </article>
          ))}
        </section>

        <section className="two-column">
          <article className="glass-panel panel-large" id="research">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Research -&gt; Strategy</p>
                <h3>Global AI frontier plus Pakistan market reality.</h3>
              </div>
              <StatusPill>Approved sources first</StatusPill>
            </div>
            <div className="pipeline">
              {pipeline.map((step, index) => (
                <div className="pipeline-step" key={step}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{step}</strong>
                </div>
              ))}
            </div>
            <div className="source-tiers">
              {sourceTiers.map((source) => (
                <div key={source.tier}>
                  <span>{source.tier}</span>
                  <h4>{source.label}</h4>
                  <p>{source.copy}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="glass-panel panel-large" id="approvals">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Approval Queue</p>
                <h3>Nothing serious ships without attribution.</h3>
              </div>
              <ShieldCheck size={26} />
            </div>
            <div className="approval-table">
              {approvalRows.map((row) => (
                <div className="approval-row" key={row.item}>
                  <div>
                    <strong>{row.item}</strong>
                    <span>{row.type} / {row.risk} risk</span>
                  </div>
                  <div>
                    <span>{row.by}</span>
                    <StatusPill tone={row.risk === "High" ? "orange" : row.risk === "Medium" ? "blue" : "lime"}>{row.status}</StatusPill>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="ops-grid" id="ops">
          <article className="glass-panel ops-card">
            <LockKeyhole size={22} />
            <h3>Signed webhooks</h3>
            <p>HMAC, timestamp replay window, idempotency keys, retries, dead letters, and manual retry.</p>
          </article>
          <article className="glass-panel ops-card">
            <Gauge size={22} />
            <h3>Budget gates</h3>
            <p>OpenRouter, Tavily, fal, video, and media batch caps before expensive jobs run.</p>
          </article>
          <article className="glass-panel ops-card">
            <Database size={22} />
            <h3>pgvector memory</h3>
            <p>Tiered memory, source trust, time-weighted ranking, entity linking, and rollups.</p>
          </article>
          <article className="glass-panel ops-card">
            <Archive size={22} />
            <h3>Permanent assets</h3>
            <p>Company files are retained, checksummed, linked, backed up, and never auto-deleted.</p>
          </article>
        </section>

        <section className="bottom-grid">
          <article className="glass-panel command-console" id="content">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Ask WOBBLE</p>
                <h3>What should we post tomorrow?</h3>
              </div>
              <Sparkles size={24} />
            </div>
            <div className="console-box">
              <p><strong>Recommended:</strong> Teach the invisible AI stack problem, then hit agencies keeping the process.</p>
              <p><strong>Evidence:</strong> WOBBLE Company OS, AIOS transcripts, content mix 70/20/10.</p>
              <p><strong>Output:</strong> LinkedIn text post, Instagram carousel, X thread, reel script, static image brief.</p>
            </div>
          </article>
          <article className="glass-panel decision-card" id="decisions">
            <Fingerprint size={28} />
            <p className="eyebrow">Decision Room</p>
            <h3>Recommendation with evidence, risks, confidence, and founder sign-off.</h3>
            <button className="secondary-button">Open decision brief</button>
          </article>
          <article className="glass-panel cost-card" id="costs">
            <CircleDollarSign size={28} />
            <p className="eyebrow">Cost Watch</p>
            <h3>$0.00 today</h3>
            <p>Model runs will show provider, model, role, latency, linked output, and estimated cost.</p>
          </article>
        </section>
      </section>
    </main>
  );
}
