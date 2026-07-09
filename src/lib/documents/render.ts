/**
 * Premium client-facing document renderer (pure). Turns an audit report or a proposal into a
 * standalone, on-brand HTML document (long-form report + present-ready slide deck). No dependencies —
 * inline CSS, print-optimised. Handles both the deep PAID-audit shape and the lighter FREE-audit shape.
 */

const BRAND = "#B6FF3B";
const INK = "#0b0b0d";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}
function money(cents?: number): string {
  if (cents === undefined || cents === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}
function levelPill(v?: string): string {
  const cls = v === "high" ? "hi" : v === "medium" ? "me" : v === "low" ? "lo" : "";
  return v ? `<span class="pill ${cls}">${esc(v)}</span>` : "";
}

// A process step can be a plain string (free audit) or {step,detail,tool,pain} (paid audit).
type Step = string | { step?: string; detail?: string; tool?: string; pain?: string };
function stepRow(s: Step): string {
  if (typeof s === "string") return `<div class="srow"><span class="sname">${esc(s)}</span></div>`;
  return `<div class="srow"><span class="sname">${esc(s.step)}</span>${s.detail ? `<span class="sdet">${esc(s.detail)}</span>` : ""}${s.tool ? `<span class="stool">${esc(s.tool)}</span>` : ""}${s.pain ? `<span class="spain">⚠ ${esc(s.pain)}</span>` : ""}</div>`;
}

interface Opp { title?: string; name?: string; area?: string; service?: string; description?: string; reason?: string; howItWorks?: string; expectedOutcome?: string; impact?: string; difficulty?: string; monthlyHoursSaved?: number; estimatedMonthlyValueCents?: number; kpis?: string[] }
interface Phase { title?: string; months?: string; focus?: string; objectives?: string[]; deliverables?: string[]; items?: string[]; expectedOutcome?: string }
interface AuditReportShape {
  businessName?: string; industry?: string | null; executiveSummary?: string; situationSummary?: string;
  currentState?: { acquisition?: Step[]; delivery?: Step[]; support?: Step[]; bottlenecks?: { area?: string; pain?: string; rootCause?: string; severity?: string; businessImpact?: string }[]; keyMetrics?: { label?: string; value?: string }[] };
  opportunities?: Opp[];
  roadmap?: Phase[];
  roi?: { estimatedMonthlyUpsideCents?: number; estimatedImplementationCents?: number; paybackMonths?: number; breakdown?: { area?: string; monthlyValueCents?: number }[] };
  risks?: { risk?: string; mitigation?: string }[];
  successMetrics?: string[];
  recommendedTechStack?: string[];
  nextSteps?: string[];
}

const REPORT_CSS = `
:root{--brand:${BRAND};--ink:${INK};--muted:#6b6b73;--line:#e7e7ea;--soft:#f6f6f4}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,-apple-system,Helvetica,Arial,sans-serif;color:var(--ink);background:#fff;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:900px;margin:0 auto;padding:52px 64px}
.cover{min-height:90vh;display:flex;flex-direction:column;justify-content:space-between;padding:64px;background:var(--ink);color:#fff}
.cover .brand{font-size:15px;letter-spacing:3px;text-transform:uppercase;color:var(--brand);font-weight:700}
.cover h1{font-size:52px;line-height:1.05;margin:0;font-weight:800;letter-spacing:-1.5px}
.cover .sub{font-size:17px;color:#b9b9c2;max-width:600px}
.cover .foot{font-size:12.5px;color:#8a8a95;display:flex;justify-content:space-between;border-top:1px solid #26262b;padding-top:18px}
.toc{background:var(--soft);border-radius:16px;padding:22px 26px;margin:0 0 8px}
.toc h4{margin:0 0 10px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)}
.toc ol{margin:0;padding-left:20px;columns:2;font-size:13px;color:#333}
.kicker{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:700;margin:0 0 6px}
h2{font-size:27px;font-weight:800;letter-spacing:-.5px;margin:0 0 6px}
h3{font-size:14px;font-weight:800;margin:20px 0 8px}
.section{padding:38px 0;border-top:1px solid var(--line)}
.lead{font-size:16px;color:#26262b}
.stats{display:flex;gap:14px;flex-wrap:wrap;margin:20px 0}
.stat{flex:1;min-width:150px;background:var(--soft);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.stat .n{font-size:26px;font-weight:800;letter-spacing:-.5px}.stat .l{font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-top:2px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.col{border:1px solid var(--line);border-radius:12px;padding:14px 16px}.col .t{font-weight:800;font-size:12.5px;margin-bottom:8px}
.srow{padding:7px 0;border-bottom:1px dashed #eee;font-size:12px}.srow:last-child{border:none}
.sname{font-weight:700;display:block}.sdet{color:#555;display:block}.stool{color:var(--muted);font-size:11px;margin-right:8px}.spain{color:#b4530b;font-size:11px}
.bn{border:1px solid var(--line);border-left:3px solid #e0803a;border-radius:10px;padding:12px 14px;margin-bottom:8px}
.bn .h{font-weight:800;font-size:13px;display:flex;justify-content:space-between;align-items:center}
.bn .d{font-size:12px;color:#444;margin-top:4px}.bn .rc{font-size:11px;color:var(--muted);margin-top:3px}
.metrics{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.metric{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:12px}.metric b{display:block;font-size:15px}
.opp{border:1px solid var(--line);border-radius:12px;padding:15px 17px;margin-bottom:10px;break-inside:avoid}
.opp .oh{display:flex;align-items:center;gap:8px;margin-bottom:6px}.opp .on{font-weight:800;font-size:14px;flex:1}
.opp .od{font-size:12.5px;color:#333}.opp .meta{font-size:11.5px;color:var(--muted);margin-top:6px}
.opp .out{font-size:12px;color:#2a6a00;margin-top:5px}
.kpis{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.kpi{background:#f1f7e6;color:#4a7000;border-radius:999px;padding:3px 10px;font-size:10.5px;font-weight:600}
.pill{font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:999px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}
.hi{background:#e9ffcf;color:#4a7000}.me{background:#e6efff;color:#2a5bd7}.lo{background:#eee;color:#666}
.phase{border-left:3px solid var(--brand);padding:2px 0 20px 18px;position:relative;margin-left:6px;break-inside:avoid}
.phase:before{content:"";position:absolute;left:-7px;top:4px;width:11px;height:11px;border-radius:50%;background:var(--brand);border:2px solid #fff}
.phase .h{font-weight:800;font-size:16px}.phase .m{font-size:11.5px;color:var(--muted);margin-bottom:8px}
.phase .lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700;margin-top:8px}
.phase ul{margin:4px 0;padding-left:16px;font-size:12.5px}
.phase .out{font-size:12px;color:#2a6a00;margin-top:6px}
.risk{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);font-size:12.5px}.risk:last-child{border:none}.risk .r{font-weight:700;flex:1}.risk .m{flex:1.4;color:#444}
.chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}.chip{background:var(--ink);color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600}
.steps li{margin-bottom:7px;font-size:13.5px}
.foot-note{font-size:11px;color:var(--muted);margin-top:36px;border-top:1px solid var(--line);padding-top:14px}
@media print{.cover{min-height:96vh}.section,.opp,.phase,.bn{break-inside:avoid}}`;

function shell(title: string, css: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;
}

export function renderAuditReportHtml(report: AuditReportShape): string {
  const biz = report.businessName ?? "Client";
  const cs = report.currentState ?? {};
  const opps = report.opportunities ?? [];
  const roadmap = report.roadmap ?? [];
  const roi = report.roi ?? {};
  const risks = report.risks ?? [];
  const metrics = report.successMetrics ?? [];
  const stack = report.recommendedTechStack ?? [];
  const next = report.nextSteps ?? [];
  const hasCS = (cs.acquisition ?? cs.delivery ?? cs.support ?? cs.bottlenecks ?? []).length > 0 || !!cs.keyMetrics?.length;

  const cover = `<div class="cover"><div class="brand">Wobble · AI Transformation Audit</div><div><h1>${esc(biz)}</h1><p class="sub">A comprehensive AI opportunity audit — current-state map, ${opps.length} prioritised opportunities, a phased roadmap, ROI, risks and success metrics.</p></div><div class="foot"><span>${esc(report.industry ?? "AI Readiness")}</span><span>Prepared by Wobble · Confidential</span></div></div>`;

  const sections: string[] = [];
  sections.push(`<div class="toc"><h4>Contents</h4><ol><li>Executive summary</li><li>Situation &amp; ROI</li>${hasCS ? "<li>Current-state map</li><li>Bottlenecks</li>" : ""}<li>Opportunities (${opps.length})</li>${roadmap.length ? "<li>12-month roadmap</li>" : ""}${risks.length ? "<li>Risks &amp; mitigations</li>" : ""}${metrics.length ? "<li>Success metrics</li>" : ""}${next.length ? "<li>Next steps</li>" : ""}</ol></div>`);

  const roiBlock = roi.estimatedMonthlyUpsideCents ? `<div class="stats"><div class="stat"><div class="n">${money(roi.estimatedMonthlyUpsideCents)}</div><div class="l">Est. monthly upside</div></div><div class="stat"><div class="n">${money(roi.estimatedImplementationCents)}</div><div class="l">Implementation</div></div><div class="stat"><div class="n">${roi.paybackMonths ?? "—"} mo</div><div class="l">Payback</div></div></div>${(roi.breakdown ?? []).length ? `<h3>Value by area</h3>${(roi.breakdown ?? []).map((b) => `<div class="risk"><span class="r">${esc(b.area)}</span><span class="m">${money(b.monthlyValueCents)}/mo</span></div>`).join("")}` : ""}` : "";

  sections.push(`<div class="section"><p class="kicker">Executive Summary</p><h2>${esc(biz)} — AI Audit</h2><p class="lead">${esc(report.executiveSummary ?? "")}</p></div>`);
  if (report.situationSummary || roiBlock) sections.push(`<div class="section"><p class="kicker">Situation &amp; ROI</p>${report.situationSummary ? `<p class="lead">${esc(report.situationSummary)}</p>` : ""}${roiBlock}</div>`);

  if (hasCS) {
    const col = (t: string, arr?: Step[]) => `<div class="col"><div class="t">${t}</div>${(arr ?? []).map(stepRow).join("") || '<div class="srow">—</div>'}</div>`;
    sections.push(`<div class="section"><p class="kicker">Current State</p><h2>How the business runs today</h2><div class="g3">${col("Acquisition", cs.acquisition)}${col("Delivery", cs.delivery)}${col("Support", cs.support)}</div>${(cs.keyMetrics ?? []).length ? `<div class="metrics">${(cs.keyMetrics ?? []).map((m) => `<div class="metric"><b>${esc(m.value)}</b>${esc(m.label)}</div>`).join("")}</div>` : ""}</div>`);
    if ((cs.bottlenecks ?? []).length) sections.push(`<div class="section"><p class="kicker">Bottlenecks</p><h2>Where value leaks</h2>${(cs.bottlenecks ?? []).map((b) => `<div class="bn"><div class="h">${esc(b.area)}${levelPill(b.severity)}</div><div class="d">${esc(b.pain)}</div>${b.rootCause ? `<div class="rc">Root cause: ${esc(b.rootCause)}</div>` : ""}${b.businessImpact ? `<div class="rc">Impact: ${esc(b.businessImpact)}</div>` : ""}</div>`).join("")}</div>`);
  }

  const oppCard = (o: Opp) => `<div class="opp"><div class="oh"><span class="on">${esc(o.title ?? o.name)}</span>${levelPill(o.impact)}${o.difficulty ? levelPill(o.difficulty) : ""}</div><div class="od">${esc(o.description ?? o.reason ?? "")}</div>${o.howItWorks ? `<div class="meta"><b>How it works:</b> ${esc(o.howItWorks)}</div>` : ""}${o.expectedOutcome ? `<div class="out">→ ${esc(o.expectedOutcome)}</div>` : ""}<div class="meta">${o.area ? esc(o.area) : ""}${o.service ? ` · ${esc(o.service)}` : ""}${o.monthlyHoursSaved ? ` · ~${o.monthlyHoursSaved}h/mo saved` : ""}${o.estimatedMonthlyValueCents ? ` · ${money(o.estimatedMonthlyValueCents)}/mo` : ""}</div>${(o.kpis ?? []).length ? `<div class="kpis">${(o.kpis ?? []).map((k) => `<span class="kpi">${esc(k)}</span>`).join("")}</div>` : ""}</div>`;
  sections.push(`<div class="section"><p class="kicker">Opportunities · impact / effort</p><h2>${opps.length} AI opportunities</h2>${opps.map(oppCard).join("") || "<p>—</p>"}</div>`);

  if (roadmap.length) sections.push(`<div class="section"><p class="kicker">Transformation roadmap</p><h2>12-month plan</h2>${roadmap.map((ph) => `<div class="phase"><div class="h">${esc(ph.title)}</div><div class="m">${esc(ph.months ?? "")}${ph.focus ? ` · ${esc(ph.focus)}` : ""}</div>${(ph.objectives ?? []).length ? `<div class="lbl">Objectives</div><ul>${(ph.objectives ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${(ph.deliverables ?? []).length ? `<div class="lbl">Deliverables</div><ul>${(ph.deliverables ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${ph.expectedOutcome ? `<div class="out">→ ${esc(ph.expectedOutcome)}</div>` : ""}</div>`).join("")}</div>`);

  if (risks.length) sections.push(`<div class="section"><p class="kicker">Risks &amp; mitigations</p><h2>What to watch</h2>${risks.map((r) => `<div class="risk"><span class="r">${esc(r.risk)}</span><span class="m">${esc(r.mitigation)}</span></div>`).join("")}</div>`);
  if (metrics.length || stack.length) sections.push(`<div class="section"><p class="kicker">Measurement &amp; stack</p>${metrics.length ? `<h3>Success metrics</h3><ul class="steps">${metrics.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}${stack.length ? `<h3>Recommended stack</h3><div class="chips">${stack.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>` : ""}</div>`);
  if (next.length) sections.push(`<div class="section"><p class="kicker">Next steps</p><h2>Where we start</h2><ol class="steps">${next.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>`);

  sections.push(`<div class="foot-note">Wobble AI Transformation Audit · confidential · prepared for ${esc(biz)}. Estimates are directional and refined during buildout.</div>`);
  return shell(`${biz} — Wobble AI Audit`, REPORT_CSS, `${cover}<div class="page">${sections.join("")}</div>`);
}

// ---------------------------------------------------------------- slide deck

const DECK_CSS = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',system-ui,sans-serif;background:${INK};color:#fff;overflow:hidden}
.deck{height:100vh;width:100vw;position:relative}
.s{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;padding:7vh 9vw;background:#fff;color:${INK};overflow:auto}
.s.active{display:flex}.s.cover{background:${INK};color:#fff;justify-content:center}
.brand{font-size:14px;letter-spacing:3px;text-transform:uppercase;color:${BRAND};font-weight:700;margin-bottom:18px}
.cover h1{font-size:5.5vw;font-weight:800;letter-spacing:-2px;line-height:1.02}.cover .sub{font-size:19px;color:#b9b9c2;margin-top:14px;max-width:800px}
.k{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#6b6b73;font-weight:700;margin-bottom:8px}
h2{font-size:34px;font-weight:800;letter-spacing:-1px;margin-bottom:16px}.big{font-size:22px;line-height:1.45;font-weight:500;max-width:920px}
.stats{display:flex;gap:16px;margin-top:26px;flex-wrap:wrap}.stat{background:#f6f6f4;border:1px solid #e7e7ea;border-radius:16px;padding:18px 22px}.stat .n{font-size:30px;font-weight:800}.stat .l{font-size:12px;color:#6b6b73;text-transform:uppercase;letter-spacing:.6px;margin-top:4px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;font-size:14px}.c{border:1px solid #e7e7ea;border-radius:14px;padding:16px 18px}.c .t{font-weight:800;margin-bottom:8px;font-size:14px}.c .row{padding:5px 0;border-bottom:1px dashed #eee;font-size:12.5px}.c .row:last-child{border:none}
.opp{border:1px solid #e7e7ea;border-radius:12px;padding:13px 16px;margin-bottom:10px}.opp .on{font-weight:800;font-size:16px;display:flex;gap:8px;align-items:center}.opp .on span{flex:1}.opp .od{font-size:13px;color:#444;margin-top:4px}.opp .out{font-size:12px;color:#2a6a00;margin-top:4px}
.pill{font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;text-transform:uppercase}.hi{background:#e9ffcf;color:#4a7000}.me{background:#e6efff;color:#2a5bd7}.lo{background:#eee;color:#666}
.phase .h{font-weight:800;font-size:26px}.phase .m{color:#6b6b73;font-size:15px;margin-bottom:12px}.phase .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b6b73;font-weight:700;margin-top:10px}.phase ul{padding-left:18px;font-size:15px;margin-top:4px}
.ul{padding-left:20px;font-size:17px;line-height:1.7}
.risk{display:flex;gap:16px;padding:11px 0;border-bottom:1px solid #eee;font-size:15px}.risk .r{font-weight:700;flex:1}.risk .m{flex:1.4;color:#444}
.chips{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px}.chip{background:${INK};color:#fff;border-radius:9px;padding:8px 14px;font-size:14px;font-weight:600}
.nav{position:fixed;bottom:22px;right:26px;display:flex;gap:8px;z-index:10}.nav button{background:${BRAND};color:${INK};border:none;border-radius:10px;width:40px;height:40px;font-size:20px;cursor:pointer;font-weight:800}
.count{position:fixed;bottom:30px;left:26px;color:#8a8a95;font-size:13px;z-index:10}`;

export function renderAuditDeckHtml(report: AuditReportShape): string {
  const biz = report.businessName ?? "Client";
  const cs = report.currentState ?? {};
  const opps = report.opportunities ?? [];
  const roadmap = report.roadmap ?? [];
  const roi = report.roi ?? {};
  const risks = report.risks ?? [];
  const metrics = report.successMetrics ?? [];
  const stack = report.recommendedTechStack ?? [];
  const next = report.nextSteps ?? [];
  const S: string[] = [];
  const slide = (inner: string, cover = false) => S.push(`<section class="s${cover ? " cover" : ""}">${inner}</section>`);

  slide(`<div class="brand">Wobble · AI Transformation Audit</div><h1>${esc(biz)}</h1><p class="sub">Current state · ${opps.length} opportunities · a 12-month roadmap · ROI</p>`, true);
  slide(`<p class="k">Executive Summary</p><p class="big">${esc(report.executiveSummary ?? "")}</p>${roi.estimatedMonthlyUpsideCents ? `<div class="stats"><div class="stat"><div class="n">${money(roi.estimatedMonthlyUpsideCents)}</div><div class="l">Monthly upside</div></div><div class="stat"><div class="n">${money(roi.estimatedImplementationCents)}</div><div class="l">Investment</div></div><div class="stat"><div class="n">${roi.paybackMonths ?? "—"} mo</div><div class="l">Payback</div></div></div>` : ""}`);
  if (report.situationSummary) slide(`<p class="k">The Situation</p><p class="big">${esc(report.situationSummary)}</p>`);

  const stepList = (arr?: Step[]) => (arr ?? []).map((s) => `<div class="row">${typeof s === "string" ? esc(s) : `<b>${esc(s.step)}</b>${s.pain ? ` — <span style="color:#b4530b">${esc(s.pain)}</span>` : ""}`}</div>`).join("") || "—";
  if ((cs.acquisition ?? cs.delivery ?? cs.support ?? []).length) slide(`<p class="k">Current State</p><h2>How the business runs today</h2><div class="g3"><div class="c"><div class="t">Acquisition</div>${stepList(cs.acquisition)}</div><div class="c"><div class="t">Delivery</div>${stepList(cs.delivery)}</div><div class="c"><div class="t">Support</div>${stepList(cs.support)}</div></div>`);
  if ((cs.bottlenecks ?? []).length) slide(`<p class="k">Bottlenecks</p><h2>Where value leaks</h2>${(cs.bottlenecks ?? []).map((b) => `<div class="risk"><span class="r">${esc(b.area)} ${levelPill(b.severity)}</span><span class="m">${esc(b.pain)}${b.businessImpact ? ` — ${esc(b.businessImpact)}` : ""}</span></div>`).join("")}`);

  // Opportunities: 3 per slide.
  const oppSlide = (o: Opp) => `<div class="opp"><div class="on"><span>${esc(o.title ?? o.name)}</span>${levelPill(o.impact)}${o.difficulty ? levelPill(o.difficulty) : ""}</div><div class="od">${esc(o.description ?? o.reason ?? "")}</div>${o.expectedOutcome ? `<div class="out">→ ${esc(o.expectedOutcome)}</div>` : ""}</div>`;
  for (let i = 0; i < opps.length; i += 3) {
    const chunk = opps.slice(i, i + 3);
    slide(`<p class="k">Opportunities ${i + 1}–${i + chunk.length} of ${opps.length}</p><h2>AI opportunities</h2>${chunk.map(oppSlide).join("")}`);
  }
  if (!opps.length) slide(`<p class="k">Opportunities</p><h2>No clear gaps from the inputs given</h2>`);

  // Roadmap: one slide per phase.
  for (const ph of roadmap) slide(`<p class="k">Transformation Roadmap</p><div class="phase"><div class="h">${esc(ph.title)}</div><div class="m">${esc(ph.months ?? "")}${ph.focus ? ` · ${esc(ph.focus)}` : ""}</div>${(ph.objectives ?? []).length ? `<div class="lbl">Objectives</div><ul>${(ph.objectives ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${(ph.deliverables ?? []).length ? `<div class="lbl">Deliverables</div><ul>${(ph.deliverables ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>`);

  if (risks.length) slide(`<p class="k">Risks &amp; Mitigations</p><h2>What to watch</h2>${risks.map((r) => `<div class="risk"><span class="r">${esc(r.risk)}</span><span class="m">${esc(r.mitigation)}</span></div>`).join("")}`);
  if (metrics.length) slide(`<p class="k">Success Metrics</p><h2>How we measure it</h2><ul class="ul">${metrics.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>`);
  if (stack.length) slide(`<p class="k">Recommended Stack</p><h2>What we'll build on</h2><div class="chips">${stack.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>`);
  if (next.length) slide(`<p class="k">Next Steps</p><h2>Where we start</h2><ol class="ul">${next.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`);
  slide(`<div class="brand">Next step</div><h1>Let's build it.</h1><p class="sub">Wobble — your AI transformation partner.</p>`, true);

  const js = `let i=0;const S=[...document.querySelectorAll('.s')];const C=document.querySelector('.count');function show(n){i=Math.max(0,Math.min(S.length-1,n));S.forEach((s,k)=>{s.classList.toggle('active',k===i);if(k===i)s.scrollTop=0;});C.textContent=(i+1)+' / '+S.length;}document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')show(i+1);if(e.key==='ArrowLeft')show(i-1);});document.querySelectorAll('.nav button').forEach((b,k)=>b.addEventListener('click',()=>show(i+(k?1:-1))));show(0);`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(biz)} — Wobble Audit Deck</title><style>${DECK_CSS}</style></head><body><div class="deck">${S.join("")}</div><div class="count"></div><div class="nav"><button>‹</button><button>›</button></div><script>${js}</script></body></html>`;
}

// ---------------------------------------------------------------- proposal

interface ProposalShape {
  title?: string; currency?: string; pricingCents?: number; scope?: string | null;
  services?: { name?: string; description?: string; priceCents?: number }[];
  timeline?: { phase?: string; months?: string; focus?: string }[];
  terms?: string | null;
}

export function renderProposalHtml(proposal: ProposalShape): string {
  const title = proposal.title ?? "Proposal";
  const services = proposal.services ?? [];
  const timeline = proposal.timeline ?? [];
  const cover = `<div class="cover"><div class="brand">Wobble · Proposal</div><div><h1>${esc(title)}</h1><p class="sub">Scope, services, timeline and investment for your Wobble AI OS engagement.</p></div><div class="foot"><span>Valid 30 days</span><span>Prepared by Wobble</span></div></div>`;
  const svcRows = services.map((s) => `<div class="opp"><div class="oh"><span class="on">${esc(s.name)}</span><span class="pill hi">${s.priceCents ? money(s.priceCents) : "Included"}</span></div>${s.description ? `<div class="od">${esc(s.description)}</div>` : ""}</div>`).join("");
  const timeBlock = timeline.map((ph) => `<div class="phase"><div class="h">${esc(ph.phase)}</div><div class="m">${esc(ph.months ?? "")}${ph.focus ? ` · ${esc(ph.focus)}` : ""}</div></div>`).join("");
  const body = `${cover}<div class="page">
    ${proposal.scope ? `<div class="section" style="border-top:none"><p class="kicker">Overview</p><p class="lead">${esc(proposal.scope)}</p></div>` : ""}
    <div class="section"><p class="kicker">Services</p><h2>What's included</h2>${svcRows || "<p>—</p>"}<div class="stats"><div class="stat"><div class="n">${money(proposal.pricingCents ?? 0)}</div><div class="l">Total investment</div></div></div></div>
    ${timeline.length ? `<div class="section"><p class="kicker">Timeline</p><h2>How we'll deliver</h2>${timeBlock}</div>` : ""}
    ${proposal.terms ? `<div class="section"><p class="kicker">Terms</p><p>${esc(proposal.terms)}</p></div>` : ""}
    <div class="foot-note">Wobble · this proposal is confidential and valid for 30 days from issue.</div></div>`;
  return shell(title, REPORT_CSS, body);
}
