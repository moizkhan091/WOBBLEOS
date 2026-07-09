/**
 * Premium client-facing document renderer (pure). Turns an audit report or a proposal into a
 * standalone, on-brand HTML document the founder opens and prints to PDF (Ctrl+P). No dependencies —
 * inline CSS, print-optimised. This is the "looks like a million-dollar deliverable" layer.
 */

const BRAND = "#B6FF3B"; // Wobble lime
const INK = "#0b0b0d";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

function money(cents?: number): string {
  if (!cents && cents !== 0) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{--brand:${BRAND};--ink:${INK};--muted:#6b6b73;--line:#e7e7ea;--soft:#f6f6f4}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,-apple-system,Helvetica,Arial,sans-serif;color:var(--ink);background:#fff;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:900px;margin:0 auto;padding:56px 64px}
.cover{min-height:88vh;display:flex;flex-direction:column;justify-content:space-between;padding:64px;background:var(--ink);color:#fff}
.cover .brand{font-size:15px;letter-spacing:3px;text-transform:uppercase;color:var(--brand);font-weight:700}
.cover h1{font-size:52px;line-height:1.05;margin:0;font-weight:800;letter-spacing:-1.5px}
.cover .sub{font-size:17px;color:#b9b9c2;max-width:560px}
.cover .foot{font-size:12.5px;color:#8a8a95;display:flex;justify-content:space-between;border-top:1px solid #26262b;padding-top:18px}
.kicker{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:700;margin:0 0 6px}
h2{font-size:26px;font-weight:800;letter-spacing:-.5px;margin:0 0 4px}
h3{font-size:14px;font-weight:700;margin:22px 0 8px}
.section{padding:40px 0;border-top:1px solid var(--line)}
.lead{font-size:16px;color:#26262b}
.stats{display:flex;gap:14px;flex-wrap:wrap;margin:20px 0}
.stat{flex:1;min-width:150px;background:var(--soft);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.stat .n{font-size:26px;font-weight:800;letter-spacing:-.5px}
.stat .l{font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-top:2px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.card{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:#fff}
.card .t{font-weight:700;font-size:12.5px;margin-bottom:6px}
.card ul{margin:0;padding-left:16px;font-size:12.5px;color:#333}
.opp{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--line)}
.opp:last-child{border-bottom:none}
.opp .name{font-weight:700;font-size:13.5px;flex:1}
.opp .desc{font-size:12px;color:var(--muted)}
.pill{font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:999px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}
.hi{background:#e9ffcf;color:#4a7000}.me{background:#e6efff;color:#2a5bd7}.lo{background:#eee;color:#666}
.phase{border-left:3px solid var(--brand);padding:2px 0 16px 16px;position:relative;margin-left:6px}
.phase:before{content:"";position:absolute;left:-7px;top:4px;width:11px;height:11px;border-radius:50%;background:var(--brand);border:2px solid #fff}
.phase .h{font-weight:800;font-size:14px}
.phase .m{font-size:11.5px;color:var(--muted);margin-bottom:4px}
.phase .i{font-size:12.5px;color:#333}
table{width:100%;border-collapse:collapse;font-size:12.5px}
td,th{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line)}
th{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)}
.total{font-weight:800;font-size:16px}
.foot-note{font-size:11px;color:var(--muted);margin-top:36px;border-top:1px solid var(--line);padding-top:14px}
@media print{.cover{min-height:96vh}.section{break-inside:avoid}.no-print{display:none}}
</style></head><body>${body}</body></html>`;
}

interface AuditReportShape {
  businessName?: string; industry?: string | null; executiveSummary?: string;
  currentState?: { acquisition?: string[]; delivery?: string[]; support?: string[]; bottlenecks?: { area?: string; pain?: string; severity?: string }[] };
  opportunities?: { title?: string; area?: string; service?: string; description?: string; impact?: string; difficulty?: string }[];
  roadmap?: { title?: string; months?: string; focus?: string; items?: string[] }[];
  roi?: { estimatedMonthlyUpsideCents?: number; estimatedImplementationCents?: number; paybackMonths?: number };
}

function levelPill(v?: string): string {
  const cls = v === "high" ? "hi" : v === "medium" ? "me" : "lo";
  return `<span class="pill ${cls}">${esc(v ?? "—")}</span>`;
}

export function renderAuditReportHtml(report: AuditReportShape): string {
  const biz = report.businessName ?? "Client";
  const cs = report.currentState ?? {};
  const opps = report.opportunities ?? [];
  const roadmap = report.roadmap ?? [];
  const roi = report.roi ?? {};
  const cover = `<div class="cover">
    <div class="brand">Wobble · AI Transformation Audit</div>
    <div><h1>${esc(biz)}</h1><p class="sub">A McKinsey-depth AI opportunity audit — current-state map, prioritised opportunities, and a 12-month transformation roadmap.</p></div>
    <div class="foot"><span>${esc(report.industry ?? "AI Readiness")}</span><span>Prepared by Wobble</span></div>
  </div>`;

  const roiBlock = roi.estimatedMonthlyUpsideCents ? `<div class="stats">
    <div class="stat"><div class="n">${money(roi.estimatedMonthlyUpsideCents)}</div><div class="l">Est. monthly upside</div></div>
    <div class="stat"><div class="n">${money(roi.estimatedImplementationCents)}</div><div class="l">Implementation</div></div>
    <div class="stat"><div class="n">${roi.paybackMonths ?? "—"} mo</div><div class="l">Payback</div></div>
  </div>` : "";

  const csBlock = `<div class="grid3">
    <div class="card"><div class="t">Acquisition</div><ul>${(cs.acquisition ?? []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li>—</li>"}</ul></div>
    <div class="card"><div class="t">Delivery</div><ul>${(cs.delivery ?? []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li>—</li>"}</ul></div>
    <div class="card"><div class="t">Support</div><ul>${(cs.support ?? []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li>—</li>"}</ul></div>
  </div>${(cs.bottlenecks ?? []).length ? `<h3>Bottlenecks</h3>${(cs.bottlenecks ?? []).map((b) => `<div class="opp"><span class="name">${esc(b.area)}</span><span class="desc">${esc(b.pain)}</span>${levelPill(b.severity)}</div>`).join("")}` : ""}`;

  const oppBlock = opps.map((o) => `<div class="opp"><div style="flex:1"><div class="name">${esc(o.title)}</div><div class="desc">${esc(o.description ?? o.area ?? "")}${o.service ? ` · ${esc(o.service)}` : ""}</div></div>${levelPill(o.impact)}${levelPill(o.difficulty)}</div>`).join("");

  const roadBlock = roadmap.map((ph) => `<div class="phase"><div class="h">${esc(ph.title)}</div><div class="m">${esc(ph.months ?? "")}${ph.focus ? ` · ${esc(ph.focus)}` : ""}</div>${(ph.items ?? []).map((it) => `<div class="i">• ${esc(it)}</div>`).join("")}</div>`).join("");

  const body = `${cover}<div class="page">
    <div class="section" style="border-top:none">
      <p class="kicker">Executive Summary</p><h2>${esc(biz)} — AI Audit</h2>
      <p class="lead">${esc(report.executiveSummary ?? "")}</p>${roiBlock}
    </div>
    <div class="section"><p class="kicker">Current State</p><h2>How the business runs today</h2>${csBlock}</div>
    <div class="section"><p class="kicker">Opportunities · impact / effort</p><h2>${opps.length} AI opportunities</h2>${oppBlock || "<p>—</p>"}</div>
    <div class="section"><p class="kicker">Transformation roadmap</p><h2>12-month plan</h2>${roadBlock || "<p>—</p>"}</div>
    <div class="foot-note">Wobble AI Transformation Audit · confidential · prepared for ${esc(biz)}. Estimates are directional and refined during buildout.</div>
  </div>`;
  return shell(`${biz} — Wobble AI Audit`, body);
}

/** Premium, self-contained HTML SLIDE DECK of an audit — one slide per section, arrow-key nav. */
export function renderAuditDeckHtml(report: AuditReportShape): string {
  const biz = report.businessName ?? "Client";
  const cs = report.currentState ?? {};
  const opps = report.opportunities ?? [];
  const roadmap = report.roadmap ?? [];
  const roi = report.roi ?? {};

  const slides: string[] = [];
  slides.push(`<section class="s cover"><div class="brand">Wobble · AI Transformation Audit</div><h1>${esc(biz)}</h1><p class="sub">Current state · opportunities · a 12-month roadmap</p></section>`);
  slides.push(`<section class="s"><p class="k">Executive Summary</p><p class="big">${esc(report.executiveSummary ?? "")}</p>${roi.estimatedMonthlyUpsideCents ? `<div class="stats"><div class="stat"><div class="n">${money(roi.estimatedMonthlyUpsideCents)}</div><div class="l">Monthly upside</div></div><div class="stat"><div class="n">${money(roi.estimatedImplementationCents)}</div><div class="l">Investment</div></div><div class="stat"><div class="n">${roi.paybackMonths ?? "—"} mo</div><div class="l">Payback</div></div></div>` : ""}</section>`);
  slides.push(`<section class="s"><p class="k">Current State</p><h2>How the business runs today</h2><div class="g3"><div class="c"><div class="t">Acquisition</div>${(cs.acquisition ?? []).map((x) => `<div>• ${esc(x)}</div>`).join("") || "—"}</div><div class="c"><div class="t">Delivery</div>${(cs.delivery ?? []).map((x) => `<div>• ${esc(x)}</div>`).join("") || "—"}</div><div class="c"><div class="t">Support</div>${(cs.support ?? []).map((x) => `<div>• ${esc(x)}</div>`).join("") || "—"}</div></div></section>`);
  slides.push(`<section class="s"><p class="k">Opportunities</p><h2>${opps.length} AI opportunities</h2>${opps.slice(0, 8).map((o) => `<div class="opp"><span class="name">${esc(o.title)}</span>${levelPill(o.impact)}${o.difficulty ? levelPill(o.difficulty) : ""}</div>`).join("")}</section>`);
  if (roadmap.length) slides.push(`<section class="s"><p class="k">Transformation Roadmap</p><h2>12-month plan</h2>${roadmap.map((ph) => `<div class="phase"><div class="h">${esc(ph.title)}</div><div class="m">${esc(ph.months ?? "")}${ph.focus ? ` · ${esc(ph.focus)}` : ""}</div></div>`).join("")}</section>`);
  slides.push(`<section class="s cover"><div class="brand">Next step</div><h1>Let's build it.</h1><p class="sub">Wobble — your AI transformation partner.</p></section>`);

  const css = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',system-ui,sans-serif;background:${INK};color:#fff;overflow:hidden}
.deck{height:100vh;width:100vw;position:relative}
.s{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;padding:8vh 10vw;background:#fff;color:${INK}}
.s.active{display:flex}
.s.cover{background:${INK};color:#fff;justify-content:center}
.brand{font-size:14px;letter-spacing:3px;text-transform:uppercase;color:${BRAND};font-weight:700;margin-bottom:20px}
.cover h1{font-size:6vw;font-weight:800;letter-spacing:-2px;line-height:1.02}
.cover .sub{font-size:20px;color:#b9b9c2;margin-top:16px}
.k{font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#6b6b73;font-weight:700;margin-bottom:10px}
h2{font-size:38px;font-weight:800;letter-spacing:-1px;margin-bottom:24px}
.big{font-size:26px;line-height:1.4;font-weight:500;max-width:900px}
.stats{display:flex;gap:18px;margin-top:32px}
.stat{background:#f6f6f4;border:1px solid #e7e7ea;border-radius:16px;padding:20px 24px}
.stat .n{font-size:34px;font-weight:800}.stat .l{font-size:12px;color:#6b6b73;text-transform:uppercase;letter-spacing:.6px;margin-top:4px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;font-size:16px}
.c{border:1px solid #e7e7ea;border-radius:14px;padding:18px 20px}.c .t{font-weight:800;margin-bottom:10px;font-size:15px}
.opp{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid #eee;font-size:19px}.opp .name{flex:1;font-weight:600}
.pill{font-size:12px;font-weight:700;padding:4px 11px;border-radius:999px;text-transform:uppercase}.hi{background:#e9ffcf;color:#4a7000}.me{background:#e6efff;color:#2a5bd7}.lo{background:#eee;color:#666}
.phase{border-left:3px solid ${BRAND};padding:2px 0 18px 18px;margin-left:6px}.phase .h{font-weight:800;font-size:20px}.phase .m{color:#6b6b73;font-size:14px}
.nav{position:fixed;bottom:22px;right:26px;display:flex;gap:8px;align-items:center;z-index:10}
.nav button{background:${BRAND};color:${INK};border:none;border-radius:10px;width:40px;height:40px;font-size:20px;cursor:pointer;font-weight:800}
.count{position:fixed;bottom:30px;left:26px;color:#8a8a95;font-size:13px;z-index:10}`;

  const js = `let i=0;const S=[...document.querySelectorAll('.s')];const C=document.querySelector('.count');
function show(n){i=Math.max(0,Math.min(S.length-1,n));S.forEach((s,k)=>s.classList.toggle('active',k===i));C.textContent=(i+1)+' / '+S.length;}
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' ')show(i+1);if(e.key==='ArrowLeft')show(i-1);});
document.querySelector('.deck').addEventListener('click',e=>{if(!e.target.closest('.nav'))show(i+1);});
show(0);`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(biz)} — Wobble Audit Deck</title><style>${css}</style></head><body><div class="deck">${slides.join("")}</div><div class="count"></div><div class="nav"><button onclick="show(i-1)">‹</button><button onclick="show(i+1)">›</button></div><script>${js}</script></body></html>`;
}

interface ProposalShape {
  title?: string; businessName?: string; currency?: string; pricingCents?: number; scope?: string | null;
  services?: { name?: string; description?: string; priceCents?: number }[];
  timeline?: { phase?: string; months?: string; focus?: string }[];
  terms?: string | null;
}

export function renderProposalHtml(proposal: ProposalShape): string {
  const title = proposal.title ?? "Proposal";
  const services = proposal.services ?? [];
  const timeline = proposal.timeline ?? [];
  const cover = `<div class="cover">
    <div class="brand">Wobble · Proposal</div>
    <div><h1>${esc(title)}</h1><p class="sub">Scope, services, timeline and investment for your Wobble AI OS engagement.</p></div>
    <div class="foot"><span>Valid 30 days</span><span>Prepared by Wobble</span></div>
  </div>`;
  const svcRows = services.map((s) => `<tr><td><strong>${esc(s.name)}</strong>${s.description ? `<div class="desc">${esc(s.description)}</div>` : ""}</td><td style="text-align:right">${s.priceCents ? money(s.priceCents) : "Included"}</td></tr>`).join("");
  const timeBlock = timeline.map((ph) => `<div class="phase"><div class="h">${esc(ph.phase)}</div><div class="m">${esc(ph.months ?? "")}${ph.focus ? ` · ${esc(ph.focus)}` : ""}</div></div>`).join("");
  const body = `${cover}<div class="page">
    ${proposal.scope ? `<div class="section" style="border-top:none"><p class="kicker">Overview</p><p class="lead">${esc(proposal.scope)}</p></div>` : ""}
    <div class="section"><p class="kicker">Services</p><h2>What's included</h2><table><thead><tr><th>Service</th><th style="text-align:right">Investment</th></tr></thead><tbody>${svcRows || "<tr><td>—</td><td></td></tr>"}<tr><td class="total">Total investment</td><td class="total" style="text-align:right">${money(proposal.pricingCents ?? 0)}</td></tr></tbody></table></div>
    ${timeline.length ? `<div class="section"><p class="kicker">Timeline</p><h2>How we'll deliver</h2>${timeBlock}</div>` : ""}
    ${proposal.terms ? `<div class="section"><p class="kicker">Terms</p><p>${esc(proposal.terms)}</p></div>` : ""}
    <div class="foot-note">Wobble · this proposal is confidential and valid for 30 days from issue.</div>
  </div>`;
  return shell(title, body);
}
