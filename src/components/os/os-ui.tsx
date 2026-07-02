"use client";

// WOBBLE OS dashboard shell + shared UI + wired live pages.
// Design ported from dashboard-interface-design-brief/project/WOBBLE OS.dc.html
// (black / electric-lime Liquid Glass). Live pages read real APIs and show
// honest loading / empty / error / 503 states. No fake data, no fake buttons.

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Lucide from "lucide-react";
import { MODULES, NAV_GROUPS, getModule, type ModuleDef } from "@/lib/os/modules";

const C = { lime: "#B8FF2C", blue: "#2563FF", orange: "#FF6B00", white: "#F2F4F1", gray: "#7a7f74", bg: "#06070A" };

const glass: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "linear-gradient(152deg,rgba(255,255,255,0.072),rgba(255,255,255,0.022))",
  backdropFilter: "blur(22px) saturate(135%)",
  WebkitBackdropFilter: "blur(22px) saturate(135%)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.13), 0 26px 54px -30px rgba(0,0,0,0.85)",
};
const card: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.085)",
  background: "linear-gradient(152deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)",
};
const muted = "rgba(242,244,241,0.5)";
const faint = "rgba(242,244,241,0.4)";

type IconCmp = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
const ICONS = Lucide as unknown as Record<string, IconCmp>;
export function Icon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
  const Cmp: IconCmp = ICONS[name] ?? ICONS.Circle;
  return <Cmp size={size} color={color} strokeWidth={1.7} />;
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color, padding: "4px 9px", borderRadius: 7, background: color + "14", border: "1px solid " + color + "33" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: "0 0 7px " + color }} />
      {label}
    </span>
  );
}
function Tag({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.04em", padding: "3px 7px", borderRadius: 6, color, background: color + "1f", border: "1px solid " + color + "3a" }}>{text}</span>
  );
}

interface ApiState<T> { loading: boolean; error: string | null; status: number | null; data: T | null; }

function useApi<T = unknown>(url: string): ApiState<T> & { reload: () => void } {
  const [s, setS] = useState<ApiState<T>>({ loading: true, error: null, status: null, data: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    setS({ loading: true, error: null, status: null, data: null });
    fetch(url)
      .then(async (r) => {
        let j: Record<string, unknown> = {};
        try { j = (await r.json()) as Record<string, unknown>; } catch { j = {}; }
        if (!on) return;
        if (!r.ok || j.ok === false) setS({ loading: false, error: String(j.error ?? "HTTP " + r.status), status: r.status, data: null });
        else setS({ loading: false, error: null, status: r.status, data: j as T });
      })
      .catch((e) => { if (on) setS({ loading: false, error: String(e), status: null, data: null }); });
    return () => { on = false; };
  }, [url, tick]);
  return { ...s, reload: () => setTick((t) => t + 1) };
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...glass, padding: "22px 24px", ...style }}>{children}</div>;
}

function StateBlock({ kind, message }: { kind: "loading" | "empty" | "error" | "offline"; message?: string }) {
  const map = {
    loading: { icon: "Loader", color: C.blue, title: "Loading live data…", body: message ?? "Reading from the backend." },
    empty: { icon: "Inbox", color: C.gray, title: "Nothing here yet", body: message ?? "No records to show. This is a real empty state, not a placeholder." },
    error: { icon: "TriangleAlert", color: C.orange, title: "Could not load", body: message ?? "The request failed." },
    offline: { icon: "DatabaseZap", color: C.blue, title: "Database not connected", body: message ?? "Set DATABASE_URL and run the migrations to see live data here. The page and API are wired - they just need a database." },
  } as const;
  const v = map[kind];
  return (
    <div style={{ ...glass, padding: 56, textAlign: "center" }}>
      <span style={{ display: "inline-flex", justifyContent: "center", color: v.color, marginBottom: 12 }}><Icon name={v.icon} size={30} /></span>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{v.title}</div>
      <div style={{ fontSize: 13, color: muted, marginTop: 6, maxWidth: 460, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>{v.body}</div>
    </div>
  );
}

function PlannedState({ mod }: { mod: ModuleDef }) {
  const ready = mod.status === "backend-ready";
  const color = ready ? C.blue : C.gray;
  return (
    <div style={{ ...glass, padding: 56, textAlign: "center" }}>
      <span style={{ display: "inline-flex", justifyContent: "center", color, marginBottom: 14 }}><Icon name={ready ? "PlugZap" : "Hammer"} size={32} /></span>
      <div style={{ marginBottom: 10 }}><Tag text={ready ? "BACKEND READY - UI WIRING QUEUED" : "PLANNED - CHUNK " + (mod.chunk ?? "?")} color={color} /></div>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{mod.title}</div>
      <div style={{ fontSize: 13.5, color: muted, marginTop: 8, maxWidth: 520, marginLeft: "auto", marginRight: "auto", lineHeight: 1.55 }}>
        {ready
          ? "The backend for this module is built and CI-green (" + (mod.api ?? "API") + "). The live UI is queued in the dashboard build and will render real data here - no fake data until it does."
          : "This module backend (Chunk " + (mod.chunk ?? "?") + ") is not built yet. It appears here so the full product is visible, but it stays a planned state until its chunk lands - no fake data."}
      </div>
    </div>
  );
}

function PageHeader({ mod }: { mod: ModuleDef }) {
  const group = NAV_GROUPS.find((g) => g.items.includes(mod.id))?.label ?? "";
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
        <span style={{ color: C.lime, display: "inline-flex" }}><Icon name={mod.icon} size={18} /></span>
        <span style={{ fontSize: 11, letterSpacing: "0.14em", color: faint, fontWeight: 500 }}>{group}</span>
      </div>
      <h1 style={{ margin: 0, fontWeight: 500, fontSize: 32, letterSpacing: "-0.025em", lineHeight: 1.04 }}>{mod.title}</h1>
      <p style={{ margin: "7px 0 0", fontSize: 13.5, color: muted, maxWidth: 640, lineHeight: 1.5 }}>{mod.tagline}</p>
    </div>
  );
}

function Sidebar({ activeId }: { activeId: string }) {
  return (
    <aside style={{ width: 262, flex: "none", height: "100%", padding: "18px 14px", display: "flex", flexDirection: "column", gap: 14, borderRight: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))", backdropFilter: "blur(26px) saturate(130%)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px 2px" }}>
        <div style={{ fontWeight: 600, fontSize: 25, letterSpacing: "-0.04em", lineHeight: 1 }}>wobble<span style={{ color: C.lime }}>.</span></div>
        <div style={{ fontSize: 9, letterSpacing: "0.22em", color: faint, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "3px 6px", fontWeight: 500 }}>OS</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, overflowY: "auto", flex: 1, padding: "2px 2px 10px" }}>
        {NAV_GROUPS.map((g) => (
          <div key={g.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9.5, letterSpacing: "0.2em", color: "rgba(242,244,241,0.32)", fontWeight: 600, padding: "0 10px 4px" }}>{g.label}</div>
            {g.items.map((id) => {
              const m = MODULES[id];
              if (!m) return null;
              const on = id === activeId;
              return (
                <Link key={id} href={"/" + id} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "9px 11px", borderRadius: 11, textDecoration: "none", border: "1px solid " + (on ? "rgba(184,255,44,0.22)" : "transparent"), background: on ? "linear-gradient(135deg,rgba(184,255,44,0.13),rgba(184,255,44,0.03))" : "transparent", color: on ? C.white : "rgba(242,244,241,0.66)" }}>
                  <span style={{ color: on ? C.lime : "rgba(242,244,241,0.55)", display: "inline-flex", flex: "none" }}><Icon name={m.icon} size={16} /></span>
                  <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: on ? 600 : 500, letterSpacing: "-0.01em" }}>{m.label}</span>
                  {m.status === "wired" ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.lime, boxShadow: "0 0 7px " + C.lime }} /> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 14, border: "1px solid rgba(184,255,44,0.18)", background: "linear-gradient(135deg, rgba(184,255,44,0.10), rgba(184,255,44,0.02))" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.lime, boxShadow: "0 0 10px " + C.lime, flex: "none" }} />
        <div style={{ flex: 1, lineHeight: 1.25 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600 }}>Dashboard build in progress</div>
          <div style={{ fontSize: 10, color: faint }}>live pages wired · rest honest</div>
        </div>
      </div>
    </aside>
  );
}

function Topbar() {
  return (
    <header style={{ flex: "none", height: 62, padding: "0 22px", display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.008))", backdropFilter: "blur(22px) saturate(130%)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, width: 330, maxWidth: "38%", padding: "9px 13px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", color: muted }}>
        <Icon name="Search" size={15} />
        <span style={{ flex: 1, fontSize: 12.5 }}>Ask WOBBLE or jump to anything…</span>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}>
        <span style={{ color: C.lime, display: "inline-flex" }}><Icon name="Activity" size={13} /></span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(242,244,241,0.8)" }}>live data</span>
      </div>
    </header>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const activeId = pathname.replace(/^\//, "").split("/")[0] || "command";
  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", background: "radial-gradient(120% 120% at 78% -10%, #0d1206 0%, #08090C 38%, #06070A 100%)", color: C.white, fontFamily: "'General Sans', system-ui, sans-serif" }}>
      <Sidebar activeId={activeId} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar />
        <main style={{ flex: 1, overflowY: "auto", padding: "26px 30px 50px" }}>{children}</main>
      </div>
    </div>
  );
}

function fmtMoney(v: unknown): string {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return "$0.00";
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtTime(v: unknown): string {
  if (!v) return "—";
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}
function offlineIf(s: ApiState<unknown>): React.ReactNode | null {
  if (s.loading) return <StateBlock kind="loading" />;
  if (s.status === 503) return <StateBlock kind="offline" />;
  if (s.error) return <StateBlock kind="error" message={s.error} />;
  return null;
}

const FOUNDERS = ["Moiz", "Ali", "Ibrahim", "Haad"];
const selectStyle: React.CSSProperties = { padding: "8px 11px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: C.white, fontSize: 12.5 };
const primaryBtn: React.CSSProperties = { padding: "10px 14px", borderRadius: 11, border: "none", background: C.lime, color: "#0A0A0A", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const rejectBtn: React.CSSProperties = { padding: "10px 14px", borderRadius: 11, border: "1px solid rgba(255,107,0,0.35)", background: "rgba(255,107,0,0.08)", color: C.orange, fontSize: 12, fontWeight: 600, cursor: "pointer" };
const disabledBtn: React.CSSProperties = { padding: "9px 14px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: muted, fontSize: 12.5, fontWeight: 600, opacity: 0.6, cursor: "not-allowed" };
const PLATFORMS = ["instagram", "linkedin", "x", "youtube", "multi"];
const FORMATS = ["static", "carousel", "text", "thread", "reel_script", "youtube_script"];
const MEM_TIERS = ["core", "working", "episodic"];
const MEM_TRUST = ["founder_core", "approved_expert", "monitored", "experimental"];
const inputStyle: React.CSSProperties = { width: "100%", padding: "11px 13px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: C.white, fontSize: 13, outline: "none" };
const labelStyle: React.CSSProperties = { fontSize: 10.5, letterSpacing: "0.06em", color: faint, fontWeight: 600, marginBottom: 6 };
function toggleBtn(active: boolean): React.CSSProperties {
  return { padding: "8px 14px", borderRadius: 10, border: "1px solid " + (active ? "rgba(184,255,44,0.4)" : "rgba(255,255,255,0.12)"), background: active ? "rgba(184,255,44,0.12)" : "rgba(255,255,255,0.03)", color: active ? C.lime : muted, fontSize: 12, fontWeight: 600, cursor: "pointer" };
}
function Field({ label, value }: { label: string; value: unknown }) {
  const v = value == null || value === "" ? "—" : String(value);
  return (
    <div>
      <div style={{ fontSize: 10.5, letterSpacing: "0.06em", color: faint, fontWeight: 600, marginBottom: 4 }}>{label.toUpperCase()}</div>
      <div style={{ ...card, padding: "10px 12px", fontSize: 12.5, color: C.white, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{v}</div>
    </div>
  );
}

function AuditPage() {
  const s = useApi<{ events: Record<string, unknown>[] }>("/api/audit?limit=50");
  const guard = offlineIf(s);
  if (guard) return guard;
  const events = s.data?.events ?? [];
  if (!events.length) return <StateBlock kind="empty" message="No audit events recorded yet." />;
  return (
    <div style={{ ...glass, padding: "8px 10px" }}>
      {events.map((e, i) => (
        <div key={String(e.id ?? i)} style={{ display: "flex", gap: 14, padding: "14px", borderBottom: i < events.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
          <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: C.lime, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}><Icon name="ScrollText" size={15} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{String(e.eventType ?? "event")}</span>
              <Tag text={String(e.module ?? "system")} color={C.blue} />
            </div>
            <div style={{ fontSize: 11.5, color: faint, marginTop: 5 }}>{String(e.entityType ?? "")}{e.entityId ? " · " + String(e.entityId) : ""}{e.actor ? " · " + String(e.actor) : ""}</div>
          </div>
          <span style={{ fontSize: 11, color: faint, whiteSpace: "nowrap" }}>{fmtTime(e.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

function CostsPage() {
  const s = useApi<{ summary: Record<string, unknown>; runs: Record<string, unknown>[] }>("/api/costs?limit=30");
  const guard = offlineIf(s);
  if (guard) return guard;
  const summary = (s.data?.summary ?? {}) as Record<string, unknown>;
  const runs = s.data?.runs ?? [];
  const cells = [
    { label: "Spend · today", value: fmtMoney(summary.today) },
    { label: "Spend · 7d", value: fmtMoney(summary.week) },
    { label: "Spend · 30d", value: fmtMoney(summary.month) },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
        {cells.map((c) => (
          <div key={c.label} style={{ ...card, padding: "18px 20px" }}>
            <div style={{ fontSize: 11.5, color: muted, fontWeight: 500, marginBottom: 10 }}>{c.label}</div>
            <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1 }}>{c.value}</div>
          </div>
        ))}
      </div>
      <Panel style={{ padding: "8px 10px" }}>
        <div style={{ display: "flex", padding: "11px 14px 12px", fontSize: 10.5, letterSpacing: "0.08em", color: faint, fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ flex: 1 }}>MODEL RUN</span>
          <span style={{ width: 110 }}>STATUS</span>
          <span style={{ width: 90 }}>LATENCY</span>
          <span style={{ width: 90, textAlign: "right" }}>COST</span>
        </div>
        {runs.length === 0 ? (
          <div style={{ padding: 22, textAlign: "center", color: muted, fontSize: 13 }}>No model runs logged yet.</div>
        ) : (
          runs.map((r, i) => {
            const status = String(r.status ?? "—");
            const col = status === "succeeded" ? C.lime : status === "error" ? C.orange : C.blue;
            return (
              <div key={String(r.id ?? i)} style={{ display: "flex", alignItems: "center", padding: "13px 14px", borderBottom: i < runs.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{String(r.provider ?? "provider")} · {String(r.model ?? "model")}</div>
                  <div style={{ fontSize: 10.5, color: faint }}>{String(r.module ?? r.role ?? "")} · {fmtTime(r.createdAt)}</div>
                </div>
                <div style={{ width: 110 }}><StatusPill label={status} color={col} /></div>
                <div style={{ width: 90, fontSize: 12, color: muted }}>{r.latencyMs != null ? String(r.latencyMs) + "ms" : "—"}</div>
                <div style={{ width: 90, textAlign: "right", fontSize: 12, color: muted }}>{fmtMoney(r.costEstimate)}</div>
              </div>
            );
          })
        )}
      </Panel>
    </div>
  );
}

function MemoryApproveModal({ approvalId, entityId, who, onClose, onDone }: { approvalId: string; entityId: string; who: string; onClose: () => void; onDone: () => void }) {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [tier, setTier] = useState(MEM_TIERS[1]);
  const [trust, setTrust] = useState(MEM_TRUST[2]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function go(action: "approve" | "reject") {
    setBusy(true);
    setMsg(null);
    try {
      const body =
        action === "approve"
          ? { action, approvalId, approvedBy: who, slug: slug.trim() || "memory_" + entityId.slice(-6), title: title.trim() || slug.trim() || "Memory note", memoryTier: tier, trustLevel: trust }
          : { action, approvalId, rejectedBy: who, reason: reason.trim() || "rejected by founder" };
      const r = await fetch("/api/memory/proposals/" + entityId + "/approval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok || j.ok === false) setMsg("Error: " + String(j.error ?? "HTTP " + r.status));
      else { setMsg(action === "approve" ? "Approved - memory created." : "Rejected."); setTimeout(onDone, 800); }
    } catch (e) { setMsg("Error: " + String(e)); }
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,5,8,0.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...glass, width: 520, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", padding: "24px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Review memory update</div>
          <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Close</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12, color: muted }}>Approving inserts this into WOBBLE memory. Set how it should be filed.</div>
          <div><div style={labelStyle}>SLUG</div><input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="brand_voice_rule" style={inputStyle} /></div>
          <div><div style={labelStyle}>TITLE</div><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short human title" style={inputStyle} /></div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div><div style={labelStyle}>TIER</div><select value={tier} onChange={(e) => setTier(e.target.value)} style={selectStyle}>{MEM_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><div style={labelStyle}>TRUST</div><select value={trust} onChange={(e) => setTrust(e.target.value)} style={selectStyle}>{MEM_TRUST.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          </div>
          <div><div style={labelStyle}>REJECT REASON <span style={{ color: faint, fontWeight: 400 }}>(if rejecting)</span></div><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why not" style={inputStyle} /></div>
          {msg ? <div style={{ fontSize: 12.5, color: msg.startsWith("Error") ? C.orange : C.lime }}>{msg}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={() => go("reject")} disabled={busy} style={{ ...rejectBtn, opacity: busy ? 0.6 : 1 }}>Reject</button>
            <button onClick={() => go("approve")} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Working…" : "Approve"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApprovalsPage() {
  const s = useApi<{ items: Record<string, unknown>[]; pendingCount: number }>("/api/approvals?status=pending&limit=50");
  const [who, setWho] = useState(FOUNDERS[0]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [memItem, setMemItem] = useState<{ approvalId: string; entityId: string } | null>(null);
  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setNote(null);
    try {
      const r = await fetch("/api/approvals/" + id + "/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, approvedBy: who }) });
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok || j.ok === false) setNote("Could not " + action + ": " + String(j.error ?? "HTTP " + r.status));
      else { setNote(action === "approve" ? "Approved by " + who + " · logged to audit." : "Rejected · returned to the agent."); s.reload(); }
    } catch (e) { setNote("Error: " + String(e)); }
    setBusyId(null);
  }
  const guard = offlineIf(s);
  if (guard) return guard;
  const items = s.data?.items ?? [];
  if (!items.length)
    return (
      <div style={{ ...glass, padding: 56, textAlign: "center" }}>
        <span style={{ display: "inline-flex", justifyContent: "center", color: C.lime, marginBottom: 12 }}><Icon name="CheckCheck" size={30} /></span>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Approval queue clear</div>
        <div style={{ fontSize: 13, color: muted, marginTop: 6 }}>Every AI output is either approved or handed to n8n. Nothing pending.</div>
      </div>
    );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: muted }}>Acting as</span>
        <select value={who} onChange={(e) => setWho(e.target.value)} style={selectStyle}>{FOUNDERS.map((f) => <option key={f} value={f}>{f}</option>)}</select>
        {note ? <span style={{ fontSize: 12, color: C.lime }}>{note}</span> : null}
      </div>
      {items.map((a, i) => {
        const id = String(a.id ?? i);
        const busy = busyId === id;
        const isMem = a.approvalType === "memory_update";
        const eid = String(a.entityId ?? "");
        return (
          <div key={id} style={{ ...glass, padding: "20px 22px", display: "flex", gap: 18, alignItems: "flex-start" }}>
            <span style={{ width: 44, height: 44, flex: "none", borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", color: C.lime, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}><Icon name="BadgeCheck" size={19} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{String(a.title ?? a.approvalType ?? "Approval item")}</span>
                <Tag text={String(a.approvalType ?? "item")} color={C.blue} />
                {a.riskLevel === "high" ? <Tag text="HIGH RISK" color={C.orange} /> : null}
              </div>
              <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.55, maxWidth: 680 }}>{String(a.summary ?? "")}</div>
              <div style={{ fontSize: 11, color: faint, marginTop: 12 }}>{String(a.entityType ?? "")}{a.entityId ? " · " + String(a.entityId) : ""} · {fmtTime(a.createdAt)}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "none", width: 160 }}>
              <button onClick={() => (isMem ? setMemItem({ approvalId: id, entityId: eid }) : act(id, "approve"))} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.55 : 1, cursor: busy ? "wait" : "pointer" }}>{busy ? "Working…" : isMem ? "Review & approve" : "Approve as " + who.split(" ")[0]}</button>
              <button onClick={() => (isMem ? setMemItem({ approvalId: id, entityId: eid }) : act(id, "reject"))} disabled={busy} style={{ ...rejectBtn, opacity: busy ? 0.55 : 1, cursor: busy ? "wait" : "pointer" }}>Reject</button>
            </div>
          </div>
        );
      })}
      {memItem ? <MemoryApproveModal approvalId={memItem.approvalId} entityId={memItem.entityId} who={who} onClose={() => setMemItem(null)} onDone={() => { setMemItem(null); s.reload(); }} /> : null}
    </div>
  );
}

function Kpi({ label, value, icon, color, sub }: { label: string; value: string; icon: string; color: string; sub?: string }) {
  return (
    <div style={{ ...card, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: muted, fontWeight: 500 }}>{label}</span>
        <span style={{ color, display: "inline-flex" }}><Icon name={icon} size={16} /></span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {sub ? <div style={{ fontSize: 10.5, color: faint, marginTop: 7 }}>{sub}</div> : null}
    </div>
  );
}

function CommandPage() {
  const ap = useApi<{ pendingCount: number }>("/api/approvals?status=pending&limit=1");
  const co = useApi<{ summary: Record<string, unknown> }>("/api/costs?limit=1");
  const au = useApi<{ events: Record<string, unknown>[] }>("/api/audit?limit=6");
  const anyLoading = ap.loading || co.loading || au.loading;
  const offline = ap.status === 503 || co.status === 503 || au.status === 503;
  if (offline) return <StateBlock kind="offline" />;
  if (anyLoading) return <StateBlock kind="loading" />;
  const pending = ap.data?.pendingCount ?? 0;
  const today = fmtMoney((co.data?.summary as Record<string, unknown> | undefined)?.today);
  const events = au.data?.events ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
        <Kpi label="Approvals pending" value={String(pending)} icon="BadgeCheck" color={pending > 0 ? C.orange : C.lime} sub="awaiting a founder" />
        <Kpi label="Spend · today" value={today} icon="Receipt" color={C.lime} sub="real model_runs" />
        <Kpi label="Live pages wired" value="9" icon="PlugZap" color={C.blue} sub="of 26 modules" />
        <Kpi label="Backend chunks green" value="17" icon="CircleCheck" color={C.lime} sub="CI passing" />
      </div>
      <Panel style={{ padding: "8px 10px" }}>
        <div style={{ padding: "13px 14px 10px", fontSize: 10.5, letterSpacing: "0.08em", color: faint, fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>RECENT ACTIVITY (audit log)</div>
        {events.length === 0 ? (
          <div style={{ padding: 22, textAlign: "center", color: muted, fontSize: 13 }}>No activity yet.</div>
        ) : (
          events.map((e, i) => (
            <div key={String(e.id ?? i)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: i < events.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <span style={{ color: C.lime, display: "inline-flex" }}><Icon name="Dot" size={16} /></span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{String(e.eventType ?? "event")}</span>
              <Tag text={String(e.module ?? "system")} color={C.blue} />
              <span style={{ fontSize: 11, color: faint, whiteSpace: "nowrap" }}>{fmtTime(e.createdAt)}</span>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}

function PacketDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useApi<Record<string, unknown>>("/api/content/packets/" + id);
  const d = s.data;
  const packet = (d?.packet ?? d) as Record<string, unknown> | null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,5,8,0.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 540, maxWidth: "100%", height: "100%", overflowY: "auto", padding: 26, background: "#0b0d0a", borderLeft: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Content packet</div>
          <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Close</button>
        </div>
        {s.loading ? <StateBlock kind="loading" /> : s.status === 503 ? <StateBlock kind="offline" /> : s.error ? <StateBlock kind="error" message={s.error} /> : packet ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <Tag text={String(packet.platform ?? "")} color={C.blue} />
              <Tag text={String(packet.format ?? "")} color={C.gray} />
              <Tag text={String(packet.approvalStatus ?? "")} color={C.lime} />
              <Tag text={String(packet.qualityStatus ?? "")} color={packet.qualityStatus === "passed" ? C.lime : C.orange} />
            </div>
            <Field label="Hook" value={packet.hook} />
            <Field label="Body" value={packet.bodyCopy ?? packet.body} />
            <Field label="Caption" value={packet.caption} />
            <Field label="CTA" value={packet.cta} />
            <Field label="Track" value={packet.contentTrackId} />
            <Field label="Created" value={fmtTime(packet.createdAt)} />
            {d && Array.isArray(d.sources) ? <div style={{ fontSize: 11.5, color: faint }}>{(d.sources as unknown[]).length} approved source(s) · {Array.isArray(d.memoryChunks) ? (d.memoryChunks as unknown[]).length : 0} memory chunk(s)</div> : null}
          </div>
        ) : <StateBlock kind="empty" message="Packet not found." />}
      </div>
    </div>
  );
}

function GenerateModal({ tracks, defaultTrack, onClose, onDone }: { tracks: Record<string, unknown>[]; defaultTrack: string; onClose: () => void; onDone: () => void }) {
  const [trackId, setTrackId] = useState(defaultTrack || (tracks[0] ? String(tracks[0].id) : "track_wobble_company"));
  const [objective, setObjective] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [maxPackets, setMaxPackets] = useState(3);
  const [by, setBy] = useState(FOUNDERS[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  function toggle(list: string[], set: (v: string[]) => void, v: string) { set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]); }
  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { contentTrackId: trackId, requestedBy: by, platformFocus: platforms, formatFocus: formats, maxPackets };
      if (objective.trim()) body.objective = objective.trim();
      const r = await fetch("/api/content/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok || j.ok === false) setMsg("Error: " + String(j.error ?? "HTTP " + r.status) + (r.status === 503 ? " (connect the database)" : ""));
      else { setMsg((j.deduped ? "Already queued (deduped)." : "Generation job enqueued.") + " Packets appear here once the content worker runs."); setTimeout(onDone, 1000); }
    } catch (e) { setMsg("Error: " + String(e)); }
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,5,8,0.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...glass, width: 520, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", padding: "24px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Generate WOBBLE content</div>
          <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Close</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={labelStyle}>TRACK</div>
            <select value={trackId} onChange={(e) => setTrackId(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
              {tracks.length === 0 ? <option value="track_wobble_company">track_wobble_company</option> : tracks.map((t) => <option key={String(t.id)} value={String(t.id)}>{String(t.name ?? t.slug ?? t.id)}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>OBJECTIVE <span style={{ color: faint, fontWeight: 400 }}>(optional)</span></div>
            <input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="e.g. drive demo signups from the pricing teardown" style={{ width: "100%", padding: "11px 13px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: C.white, fontSize: 13, outline: "none" }} />
          </div>
          <div>
            <div style={labelStyle}>PLATFORM FOCUS</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{PLATFORMS.map((pf) => <button key={pf} onClick={() => toggle(platforms, setPlatforms, pf)} style={toggleBtn(platforms.includes(pf))}>{pf}</button>)}</div>
          </div>
          <div>
            <div style={labelStyle}>FORMAT FOCUS</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{FORMATS.map((ff) => <button key={ff} onClick={() => toggle(formats, setFormats, ff)} style={toggleBtn(formats.includes(ff))}>{ff}</button>)}</div>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={labelStyle}>MAX PACKETS</div>
              <input type="number" min={1} max={10} value={maxPackets} onChange={(e) => setMaxPackets(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} style={{ width: 90, padding: "11px 13px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: C.white, fontSize: 13, outline: "none" }} />
            </div>
            <div>
              <div style={labelStyle}>REQUESTED BY</div>
              <select value={by} onChange={(e) => setBy(e.target.value)} style={selectStyle}>{FOUNDERS.map((f) => <option key={f} value={f}>{f}</option>)}</select>
            </div>
          </div>
          {msg ? <div style={{ fontSize: 12.5, color: msg.startsWith("Error") ? C.orange : C.lime }}>{msg}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
            <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Cancel</button>
            <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}>{busy ? "Enqueuing…" : "Generate"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContentPage() {
  const tracksApi = useApi<{ tracks: Record<string, unknown>[] }>("/api/content/tracks?limit=50");
  const [track, setTrack] = useState<string>("");
  const [genOpen, setGenOpen] = useState(false);
  const url = "/api/content/packets?limit=100" + (track ? "&contentTrackId=" + encodeURIComponent(track) : "");
  const s = useApi<{ packets: Record<string, unknown>[] }>(url);
  const [openId, setOpenId] = useState<string | null>(null);
  const tracks = tracksApi.data?.tracks ?? [];
  const guard = offlineIf(s);
  if (guard) return guard;
  const packets = s.data?.packets ?? [];
  const groups: Record<string, Record<string, unknown>[]> = {};
  for (const p of packets) { const k = String(p.approvalStatus ?? "draft"); (groups[k] ||= []).push(p); }
  const order = Object.keys(groups);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: muted }}>Track</span>
        <select value={track} onChange={(e) => setTrack(e.target.value)} style={selectStyle}>
          <option value="">All tracks</option>
          {tracks.map((t) => <option key={String(t.id)} value={String(t.id)}>{String(t.name ?? t.slug ?? t.id)}</option>)}
        </select>
        <button onClick={() => setGenOpen(true)} style={primaryBtn}>Generate WOBBLE content</button>
      </div>
      {packets.length === 0 ? (
        <StateBlock kind="empty" message="No content packets yet. They appear here once generated (Chunk 15 worker) or created via /api/content/packets." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 14, alignItems: "start" }}>
          {order.map((k) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", color: faint, fontWeight: 600, textTransform: "uppercase" }}>{k} · {groups[k].length}</div>
              {groups[k].map((p, i) => (
                <button key={String(p.id ?? i)} onClick={() => setOpenId(String(p.id))} style={{ ...card, padding: "14px 15px", textAlign: "left", cursor: "pointer", color: C.white }}>
                  <div style={{ display: "flex", gap: 7, marginBottom: 8, flexWrap: "wrap" }}>
                    <Tag text={String(p.platform ?? "")} color={C.blue} />
                    <Tag text={String(p.format ?? "")} color={C.gray} />
                    <Tag text={String(p.qualityStatus ?? "")} color={p.qualityStatus === "passed" ? C.lime : C.orange} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{String(p.hook ?? p.title ?? "Untitled packet")}</div>
                  <div style={{ fontSize: 10.5, color: faint, marginTop: 6 }}>{fmtTime(p.createdAt)}</div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {openId ? <PacketDrawer id={openId} onClose={() => setOpenId(null)} /> : null}
      {genOpen ? <GenerateModal tracks={tracks} defaultTrack={track} onClose={() => setGenOpen(false)} onDone={() => { setGenOpen(false); s.reload(); }} /> : null}
    </div>
  );
}

function AskPage() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<{ role: "you" | "wob"; text: string; meta?: string }[]>([]);
  async function send() {
    const question = q.trim();
    if (!question || busy) return;
    setTurns((t) => [...t, { role: "you", text: question }]);
    setQ("");
    setBusy(true);
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, maxTokens: 600 }) });
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok || j.ok === false) setTurns((t) => [...t, { role: "wob", text: "Error: " + String(j.error ?? "HTTP " + r.status) + (r.status === 503 ? " (connect the database)" : "") }]);
      else {
        const res = (j.result ?? {}) as Record<string, unknown>;
        const text = String(res.answer ?? res.message ?? (res.type === "route" ? "Intent recognized and routed." : JSON.stringify(res)));
        const meta = res.confidence != null ? "confidence " + String(res.confidence) : undefined;
        setTurns((t) => [...t, { role: "wob", text, meta }]);
      }
    } catch (e) { setTurns((t) => [...t, { role: "wob", text: "Error: " + String(e) }]); }
    setBusy(false);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820 }}>
      <div style={{ ...glass, padding: 16, display: "flex", gap: 10 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder="Ask WOBBLE across the OS…" style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: C.white, fontSize: 13.5, outline: "none" }} />
        <button onClick={send} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}>{busy ? "Thinking…" : "Run"}</button>
      </div>
      {turns.length === 0 ? (
        <StateBlock kind="empty" message="Ask a question. Answers come from approved Brain + sources with citations. Needs a database plus OPENROUTER_API_KEY and model roles configured to answer live." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {turns.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "you" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "78%", padding: "12px 15px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.55, border: "1px solid " + (m.role === "you" ? "rgba(184,255,44,0.28)" : "rgba(255,255,255,0.09)"), background: m.role === "you" ? "linear-gradient(135deg,rgba(184,255,44,0.16),rgba(184,255,44,0.06))" : "rgba(255,255,255,0.05)" }}>
                {m.text}
                {m.meta ? <div style={{ fontSize: 10.5, color: faint, marginTop: 6 }}>{m.meta}</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MemoryRecords({ url, emptyMsg }: { url: string; emptyMsg: string }) {
  const s = useApi<{ records: Record<string, unknown>[] }>(url);
  const guard = offlineIf(s);
  if (guard) return guard;
  const recs = s.data?.records ?? [];
  if (!recs.length) return <StateBlock kind="empty" message={emptyMsg} />;
  return (
    <div style={{ ...glass, padding: "8px 10px" }}>
      {recs.map((r, i) => (
        <div key={String(r.id ?? i)} style={{ display: "flex", gap: 14, padding: 14, borderBottom: i < recs.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
          <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: C.lime, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}><Icon name="Database" size={15} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{String(r.title ?? r.summary ?? r.content ?? "memory")}</span>
              {r.memoryTier ? <Tag text={String(r.memoryTier)} color={C.lime} /> : null}
              {r.trustLevel ? <Tag text={String(r.trustLevel)} color={C.blue} /> : null}
            </div>
            <div style={{ fontSize: 11.5, color: faint, marginTop: 5 }}>{String(r.area ?? r.entityType ?? "")} · {fmtTime(r.createdAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
function BrainPage() {
  const [open, setOpen] = useState(false);
  const [k, setK] = useState(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><button onClick={() => setOpen(true)} style={primaryBtn}>Add knowledge</button></div>
      <MemoryRecords key={k} url="/api/memory?memoryTier=core&limit=50" emptyMsg="No Core Brain records yet." />
      {open ? <AddMemoryModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); setK((x) => x + 1); }} /> : null}
    </div>
  );
}
function MemoryPage() {
  const [open, setOpen] = useState(false);
  const [k, setK] = useState(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><button onClick={() => setOpen(true)} style={primaryBtn}>Add memory</button></div>
      <MemoryRecords key={k} url="/api/memory?limit=50" emptyMsg="No memory records yet." />
      {open ? <AddMemoryModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); setK((x) => x + 1); }} /> : null}
    </div>
  );
}

function SourcesPage() {
  const [pendingOnly, setPendingOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const url = "/api/sources?limit=100" + (pendingOnly ? "&approvalStatus=pending" : "");
  const s = useApi<{ sources: Record<string, unknown>[] }>(url);
  const guard = offlineIf(s);
  if (guard) return guard;
  const items = s.data?.sources ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={() => setPendingOnly(false)} style={toggleBtn(!pendingOnly)}>All</button>
        <button onClick={() => setPendingOnly(true)} style={toggleBtn(pendingOnly)}>Pending approval</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setOpen(true)} style={primaryBtn}>Add source</button>
      </div>
      {open ? <AddSourceModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); s.reload(); }} /> : null}
      {items.length === 0 ? (
        <StateBlock kind="empty" message={pendingOnly ? "No sources pending approval." : "No sources captured yet."} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
          {items.map((r, i) => {
            const st = String(r.approvalStatus ?? "pending");
            const col = st === "approved" ? C.lime : st === "rejected" ? C.orange : C.blue;
            return (
              <div key={String(r.id ?? i)} style={{ ...card, padding: "16px 17px" }}>
                <div style={{ display: "flex", gap: 7, marginBottom: 9, flexWrap: "wrap" }}>
                  <Tag text={String(r.sourceType ?? "source")} color={C.gray} />
                  <Tag text={st} color={col} />
                  {r.processingStatus ? <Tag text={String(r.processingStatus)} color={String(r.processingStatus).includes("failed") ? C.orange : C.lime} /> : null}
                  {r.trustLevel ? <Tag text={String(r.trustLevel)} color={C.blue} /> : null}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>{String(r.title ?? "Untitled source")}</div>
                <div style={{ fontSize: 11.5, color: muted, lineHeight: 1.5, marginTop: 7 }}>
                  owner {String(r.ownerScope ?? "company")} - refresh {String(r.refreshFrequency ?? "manual")}
                </div>
                <div style={{ fontSize: 11, color: faint, lineHeight: 1.5, marginTop: 5 }}>
                  banks {Array.isArray(r.memoryBanksFed) ? r.memoryBanksFed.length : 0} - agents {Array.isArray(r.connectedAgents) ? r.connectedAgents.length : 0} - cost ${String(r.costUsed ?? "0")}
                </div>
                {Array.isArray(r.intendedUse) && r.intendedUse.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>{r.intendedUse.slice(0, 3).map((item) => <Tag key={String(item)} text={String(item)} color={C.blue} />)}</div>
                ) : null}
                <div style={{ fontSize: 10.5, color: faint, marginTop: 7 }}>{fmtTime(r.createdAt)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type SourceTypeOption = {
  slug: string;
  label: string;
  category: string;
  description: string;
  defaultRefreshFrequency: string;
};

const FALLBACK_SOURCE_TYPES: SourceTypeOption[] = [
  { slug: "website", label: "Website", category: "web", description: "Website or page set.", defaultRefreshFrequency: "weekly" },
  { slug: "youtube_video", label: "YouTube Video", category: "video", description: "Video transcript and metadata.", defaultRefreshFrequency: "never" },
  { slug: "instagram_reel", label: "Instagram Reel", category: "social", description: "Reel caption, transcript, frames and engagement.", defaultRefreshFrequency: "weekly" },
  { slug: "instagram_carousel", label: "Instagram Carousel", category: "social", description: "Carousel slides, copy and visual hierarchy.", defaultRefreshFrequency: "weekly" },
  { slug: "manual_note", label: "Manual Note", category: "manual", description: "Founder-entered source note.", defaultRefreshFrequency: "never" },
];

function AddSourceModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [who, setWho] = useState(FOUNDERS[0]);
  const [title, setTitle] = useState("");
  const typeApi = useApi<{ types: SourceTypeOption[] }>("/api/sources/types?limit=200");
  const sourceTypes = typeApi.data?.types?.length ? typeApi.data.types : FALLBACK_SOURCE_TYPES;
  const [sourceType, setSourceType] = useState(FALLBACK_SOURCE_TYPES[0].slug);
  const [ownerScope, setOwnerScope] = useState("company");
  const [ownerId, setOwnerId] = useState("");
  const [refreshFrequency, setRefreshFrequency] = useState("manual");
  const [intendedUse, setIntendedUse] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const selectedType = sourceTypes.find((type) => type.slug === sourceType) ?? sourceTypes[0];
  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        sourceType,
        ownerScope,
        refreshFrequency,
        intendedUse: intendedUse.split(",").map((item) => item.trim()).filter(Boolean),
        addedBy: who,
      };
      if (ownerId.trim()) body.ownerId = ownerId.trim();
      if (url.trim()) body.url = url.trim();
      const r = await fetch("/api/sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok || j.ok === false) setMsg("Error: " + String(j.error ?? "HTTP " + r.status));
      else { setMsg("Source added - pending approval."); setTimeout(onDone, 900); }
    } catch (e) { setMsg("Error: " + String(e)); }
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,5,8,0.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...glass, width: 520, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", padding: "24px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Add source</div>
          <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Close</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: muted }}>New sources start pending and enter the approval queue before the workforce can use them.</div>
          <div><div style={labelStyle}>TITLE</div><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Competitor pricing teardown" style={inputStyle} /></div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div><div style={labelStyle}>TYPE</div><select value={sourceType} onChange={(e) => setSourceType(e.target.value)} style={selectStyle}>{sourceTypes.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}</select></div>
            <div><div style={labelStyle}>ADDED BY</div><select value={who} onChange={(e) => setWho(e.target.value)} style={selectStyle}>{FOUNDERS.map((fo) => <option key={fo} value={fo}>{fo}</option>)}</select></div>
          </div>
          <div style={{ fontSize: 11.5, color: faint, lineHeight: 1.5 }}>{selectedType?.category ?? "source"} - {selectedType?.description ?? "Per-type intake runs after approval."}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div><div style={labelStyle}>OWNER</div><select value={ownerScope} onChange={(e) => setOwnerScope(e.target.value)} style={selectStyle}>{["global", "company", "client", "project"].map((scope) => <option key={scope} value={scope}>{scope}</option>)}</select></div>
            <div style={{ flex: 1, minWidth: 160 }}><div style={labelStyle}>OWNER ID <span style={{ color: faint, fontWeight: 400 }}>(optional)</span></div><input value={ownerId} onChange={(e) => setOwnerId(e.target.value)} placeholder="client/project id later" style={inputStyle} /></div>
            <div><div style={labelStyle}>REFRESH</div><select value={refreshFrequency} onChange={(e) => setRefreshFrequency(e.target.value)} style={selectStyle}>{["manual", "hourly", "daily", "weekly", "monthly", "never"].map((freq) => <option key={freq} value={freq}>{freq}</option>)}</select></div>
          </div>
          <div><div style={labelStyle}>INTENDED USE <span style={{ color: faint, fontWeight: 400 }}>(comma separated)</span></div><input value={intendedUse} onChange={(e) => setIntendedUse(e.target.value)} placeholder="content_strategy, design_reference, seo" style={inputStyle} /></div>
          <div><div style={labelStyle}>URL <span style={{ color: faint, fontWeight: 400 }}>(optional)</span></div><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" style={inputStyle} /></div>
          {msg ? <div style={{ fontSize: 12.5, color: msg.startsWith("Error") ? C.orange : C.lime }}>{msg}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Cancel</button>
            <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Adding…" : "Add source"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddMemoryModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [who, setWho] = useState(FOUNDERS[0]);
  const [proposedMemory, setProposedMemory] = useState("");
  const [affectedArea, setAffectedArea] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const body = { proposedMemory: proposedMemory.trim(), affectedArea: affectedArea.trim() || "general", reason: reason.trim() || "founder capture", proposedBy: who };
      const r = await fetch("/api/memory/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok || j.ok === false) setMsg("Error: " + String(j.error ?? "HTTP " + r.status));
      else { setMsg("Proposed - approve it in the queue to file it into memory."); setTimeout(onDone, 1000); }
    } catch (e) { setMsg("Error: " + String(e)); }
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,5,8,0.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...glass, width: 520, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", padding: "24px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Add to WOBBLE memory</div>
          <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Close</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: muted }}>Captured as a proposal that enters the approval queue - nothing is written to Core Brain until you approve it.</div>
          <div><div style={labelStyle}>MEMORY</div><textarea value={proposedMemory} onChange={(e) => setProposedMemory(e.target.value)} rows={5} placeholder="What should WOBBLE remember?" style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} /></div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150 }}><div style={labelStyle}>AREA</div><input value={affectedArea} onChange={(e) => setAffectedArea(e.target.value)} placeholder="brand_voice / client" style={inputStyle} /></div>
            <div><div style={labelStyle}>BY</div><select value={who} onChange={(e) => setWho(e.target.value)} style={selectStyle}>{FOUNDERS.map((fo) => <option key={fo} value={fo}>{fo}</option>)}</select></div>
          </div>
          <div><div style={labelStyle}>REASON</div><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why this matters" style={inputStyle} /></div>
          {msg ? <div style={{ fontSize: 12.5, color: msg.startsWith("Error") ? C.orange : C.lime }}>{msg}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Cancel</button>
            <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Propose"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateSkillModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ slug: "", name: "", module: "ask_wobble", trigger: "", goal: "", promptBody: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));
  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/skills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok || j.ok === false) setMsg("Error: " + String(j.error ?? "HTTP " + r.status));
      else { setMsg("Skill created - pending approval."); setTimeout(onDone, 900); }
    } catch (e) { setMsg("Error: " + String(e)); }
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,5,8,0.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...glass, width: 560, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", padding: "24px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>New skill</div>
          <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Close</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}><div style={labelStyle}>SLUG</div><input value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="lowercase_underscore" style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: 160 }}><div style={labelStyle}>NAME</div><input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Human name" style={inputStyle} /></div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}><div style={labelStyle}>MODULE</div><input value={f.module} onChange={(e) => set("module", e.target.value)} placeholder="ask_wobble / content_command" style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: 160 }}><div style={labelStyle}>TRIGGER</div><input value={f.trigger} onChange={(e) => set("trigger", e.target.value)} placeholder="/command or job.type" style={inputStyle} /></div>
          </div>
          <div><div style={labelStyle}>GOAL</div><input value={f.goal} onChange={(e) => set("goal", e.target.value)} placeholder="What this skill is for" style={inputStyle} /></div>
          <div><div style={labelStyle}>PROMPT BODY</div><textarea value={f.promptBody} onChange={(e) => set("promptBody", e.target.value)} rows={6} placeholder="The instruction the worker will run…" style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} /></div>
          {msg ? <div style={{ fontSize: 12.5, color: msg.startsWith("Error") ? C.orange : C.lime }}>{msg}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Cancel</button>
            <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Creating…" : "Create skill"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillsPage() {
  const s = useApi<{ skills: Record<string, unknown>[] }>("/api/skills?limit=100");
  const [open, setOpen] = useState(false);
  const guard = offlineIf(s);
  if (guard) return guard;
  const skills = s.data?.skills ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><button onClick={() => setOpen(true)} style={primaryBtn}>New skill</button></div>
      {skills.length === 0 ? (
        <StateBlock kind="empty" message="No skills yet. Create one, or run the seed (6 command/core skills ship approved)." />
      ) : (
        <div style={{ ...glass, padding: "8px 10px" }}>
          {skills.map((k, i) => {
            const st = String(k.status ?? "draft");
            const col = st === "approved" ? C.lime : st === "archived" ? C.gray : C.blue;
            return (
              <div key={String(k.id ?? i)} style={{ display: "flex", gap: 14, padding: 14, alignItems: "center", borderBottom: i < skills.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: C.lime, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}><Icon name="Wand2" size={15} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{String(k.name ?? k.slug ?? "skill")}</span>
                    <Tag text={String(k.slug ?? "")} color={C.blue} />
                    <Tag text={"v" + String(k.version ?? 1)} color={C.gray} />
                    <StatusPill label={st} color={col} />
                  </div>
                  <div style={{ fontSize: 11.5, color: faint, marginTop: 5 }}>{String(k.module ?? "")} · {String(k.goal ?? "")}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {open ? <CreateSkillModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); s.reload(); }} /> : null}
    </div>
  );
}

function AgentsPage() {
  const s = useApi<{ agents: Record<string, unknown>[] }>("/api/agents?limit=200");
  const guard = offlineIf(s);
  if (guard) return guard;
  const items = s.data?.agents ?? [];
  if (!items.length) return <StateBlock kind="empty" message="No agents registered yet. Run the seed (npm run db:seed) - it registers the current + creative/research agents." />;
  return (
    <div style={{ ...glass, padding: "8px 10px" }}>
      {items.map((a, i) => {
        const st = String(a.status ?? "active");
        const col = st === "active" ? C.lime : st === "paused" ? C.blue : C.gray;
        return (
          <div key={String(a.id ?? i)} style={{ display: "flex", gap: 14, padding: 14, alignItems: "center", borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
            <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: C.lime, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}><Icon name="Bot" size={15} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{String(a.name ?? a.slug ?? "agent")}</span>
                <Tag text={String(a.role ?? "")} color={C.blue} />
                {a.team ? <Tag text={String(a.team)} color={C.gray} /> : null}
                <Tag text={String(a.costProfile ?? "mid")} color={C.orange} />
                <StatusPill label={st} color={col} />
              </div>
              <div style={{ fontSize: 11.5, color: faint, marginTop: 5 }}>{String(a.purpose ?? "")}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: faint, whiteSpace: "nowrap" }}>
              <div>{String(a.runCount ?? 0)} runs</div>
              <div style={{ color: Number(a.failureCount ?? 0) > 0 ? C.orange : faint }}>{String(a.failureCount ?? 0)} fails</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const WIRED: Record<string, React.ComponentType> = {
  command: CommandPage,
  agents: AgentsPage,
  approvals: ApprovalsPage,
  costs: CostsPage,
  audit: AuditPage,
  content: ContentPage,
  ask: AskPage,
  brain: BrainPage,
  memory: MemoryPage,
  sources: SourcesPage,
  skills: SkillsPage,
};

export function ModuleContent({ id }: { id: string }) {
  const mod = getModule(id);
  if (!mod) {
    return (
      <>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontWeight: 500, fontSize: 32 }}>Not found</h1>
          <p style={{ margin: "7px 0 0", fontSize: 13.5, color: muted }}>No module with id {id}.</p>
        </div>
        <StateBlock kind="empty" message="Pick a module from the sidebar." />
      </>
    );
  }
  const Wired = WIRED[id];
  return (
    <>
      <PageHeader mod={mod} />
      {Wired ? <Wired /> : <PlannedState mod={mod} />}
    </>
  );
}
