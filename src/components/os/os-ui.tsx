"use client";

// WOBBLE OS dashboard shell + shared UI + wired live pages.
// Design ported from dashboard-interface-design-brief/project/WOBBLE OS.dc.html
// (black / electric-lime Liquid Glass). Live pages read real APIs and show
// honest loading / empty / error / 503 states. No fake data, no fake buttons.

import React, { useEffect, useRef, useState } from "react";
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

function ProfileMenu() {
  const s = useApi<{ authenticated: boolean; founder?: string }>("/api/auth/session");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const founder = s.data?.founder ?? (s.loading ? "…" : "Guest");
  const initial = founder && founder !== "…" && founder !== "Guest" ? founder[0].toUpperCase() : "?";
  async function logout() {
    setBusy(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* proceed to login anyway */ }
    window.location.href = "/login";
  }
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} title="Account" style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 9px 4px 4px", borderRadius: 30, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", color: C.white, cursor: "pointer" }}>
        <span style={{ width: 27, height: 27, borderRadius: "50%", background: C.lime, color: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700 }}>{initial}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{founder}</span>
        <span style={{ color: faint, display: "inline-flex" }}><Icon name="ChevronDown" size={14} /></span>
      </button>
      {open ? (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 230, zIndex: 50, borderRadius: 13, border: "1px solid rgba(255,255,255,0.12)", background: "#0d0e11", boxShadow: "0 18px 55px rgba(0,0,0,0.55)", overflow: "hidden" }}>
            <div style={{ padding: "13px 15px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ width: 34, height: 34, borderRadius: "50%", background: C.lime, color: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700 }}>{initial}</span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{founder}</div>
                <div style={{ fontSize: 11, color: faint, marginTop: 1 }}>{s.data?.authenticated ? "Signed in · WOBBLE founder" : "Not signed in"}</div>
              </div>
            </div>
            <button onClick={logout} disabled={busy} style={{ width: "100%", textAlign: "left", padding: "12px 15px", border: "none", background: "transparent", color: C.orange, fontSize: 12.5, fontWeight: 600, cursor: busy ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 9 }}>
              <Icon name="LogOut" size={15} /> {busy ? "Logging out…" : "Log out"}
            </button>
          </div>
        </>
      ) : null}
    </div>
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
      <ProfileMenu />
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

function formatDetailValue(value: unknown): string {
  if (value == null || value === "") return "-";
  if (value instanceof Date) return value.toLocaleString();
  if (Array.isArray(value)) return value.length ? value.map((item) => String(item)).join(", ") : "-";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function DetailField({ label, value }: { label: string; value: unknown }) {
  return <Field label={label} value={formatDetailValue(value)} />;
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre style={{ ...card, margin: 0, padding: "12px 13px", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11.5, lineHeight: 1.5, color: "rgba(242,244,241,0.72)" }}>
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  );
}

function DetailDrawer({ title, subtitle, tags, fields, raw, children, onClose }: { title: string; subtitle?: string; tags?: { text: string; color: string }[]; fields?: { label: string; value: unknown }[]; raw?: unknown; children?: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(4,5,8,0.62)", backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 610, maxWidth: "100%", height: "100%", overflowY: "auto", padding: 26, background: "linear-gradient(180deg,#0b0d0a,#070807)", borderLeft: "1px solid rgba(255,255,255,0.11)", boxShadow: "-34px 0 60px -44px rgba(0,0,0,0.9)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>{title}</div>
            {subtitle ? <div style={{ fontSize: 11.5, color: faint, marginTop: 5, lineHeight: 1.45 }}>{subtitle}</div> : null}
            {tags?.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>{tags.map((tag) => <Tag key={tag.text} text={tag.text} color={tag.color} />)}</div> : null}
          </div>
          <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", flex: "none" }}>Close</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {fields?.map((field) => <DetailField key={field.label} label={field.label} value={field.value} />)}
          {children}
          {raw !== undefined ? (
            <div>
              <div style={labelStyle}>RAW RECORD</div>
              <JsonBlock value={raw} />
            </div>
          ) : null}
        </div>
      </div>
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
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
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
          <div key={id} onClick={() => setSelected(a)} style={{ ...glass, padding: "20px 22px", display: "flex", gap: 18, alignItems: "flex-start", cursor: "pointer" }}>
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
            <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 8, flex: "none", width: 160 }}>
              <button onClick={() => setSelected(a)} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Open details</button>
              <button onClick={() => (isMem ? setMemItem({ approvalId: id, entityId: eid }) : act(id, "approve"))} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.55 : 1, cursor: busy ? "wait" : "pointer" }}>{busy ? "Working…" : isMem ? "Review & approve" : "Approve as " + who.split(" ")[0]}</button>
              <button onClick={() => (isMem ? setMemItem({ approvalId: id, entityId: eid }) : act(id, "reject"))} disabled={busy} style={{ ...rejectBtn, opacity: busy ? 0.55 : 1, cursor: busy ? "wait" : "pointer" }}>Reject</button>
            </div>
          </div>
        );
      })}
      {selected ? (
        <DetailDrawer
          title={String(selected.title ?? selected.approvalType ?? "Approval item")}
          subtitle={String(selected.id ?? "")}
          tags={[
            { text: String(selected.approvalType ?? "approval"), color: C.blue },
            { text: String(selected.status ?? "pending"), color: C.lime },
            { text: String(selected.riskLevel ?? "normal"), color: selected.riskLevel === "high" ? C.orange : C.gray },
          ]}
          fields={[
            { label: "Summary", value: selected.summary ?? selected.notes },
            { label: "Entity", value: String(selected.entityType ?? "") + (selected.entityId ? " / " + String(selected.entityId) : "") },
            { label: "Requested by", value: selected.requestedBy },
            { label: "Confirmation required", value: selected.confirmationRequired },
            { label: "Metadata", value: selected.metadata },
            { label: "Created", value: fmtTime(selected.createdAt) },
            { label: "Updated", value: fmtTime(selected.updatedAt) },
          ]}
          raw={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
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

interface Readiness {
  status: string;
  checks: { name: string; ok: boolean; critical: boolean }[];
}

/**
 * Readiness needs its own fetch rather than `useApi`: /api/health/ready deliberately answers 503 when a
 * critical subsystem is down (it is an orchestrator gate), and useApi discards the body on any non-2xx.
 * Reusing it would surface "Unknown" for the one case the tile exists to report — and, worse, fall back
 * to a subtitle implying everything was fine. Here the body is parsed on BOTH 200 and 503, so a degraded
 * system can name exactly what is down.
 */
function useReadiness(): { loading: boolean; data: Readiness | null } {
  const [s, setS] = useState<{ loading: boolean; data: Readiness | null }>({ loading: true, data: null });
  useEffect(() => {
    let on = true;
    fetch("/api/health/ready")
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as Readiness | null;
        if (on) setS({ loading: false, data: j && Array.isArray(j.checks) ? j : null });
      })
      .catch(() => { if (on) setS({ loading: false, data: null }); });
    return () => { on = false; };
  }, []);
  return s;
}

function CommandPage() {
  const ap = useApi<{ pendingCount: number }>("/api/approvals?status=pending&limit=1");
  const co = useApi<{ summary: Record<string, unknown> }>("/api/costs?limit=1");
  const au = useApi<{ events: Record<string, unknown>[] }>("/api/audit?limit=6");
  // Aggregate readiness (db + storage + both workers). Public probe, so it never 401s.
  const rd = useReadiness();
  const anyLoading = ap.loading || co.loading || au.loading;
  const offline = ap.status === 503 || co.status === 503 || au.status === 503;
  if (offline) return <StateBlock kind="offline" />;
  if (anyLoading) return <StateBlock kind="loading" />;
  const pending = ap.data?.pendingCount ?? 0;
  const today = fmtMoney((co.data?.summary as Record<string, unknown> | undefined)?.today);
  const events = au.data?.events ?? [];
  // DERIVED from the registry + the WIRED component map — not a hand-typed number. Previously these
  // two tiles were the string literals "9"/"of 26 modules" and "17"/"CI passing", which were both
  // stale and unverifiable from the running system.
  const total = Object.keys(MODULES).length;
  const wired = Object.keys(MODULES).filter((id) => MODULES[id].status === "wired" && id in WIRED).length;
  // Readiness is a live probe; while it is in flight (or unreachable) say so rather than implying health.
  const ready = rd.data?.status === "ready";
  const failing = (rd.data?.checks ?? []).filter((c) => !c.ok);
  const systemValue = rd.loading ? "…" : !rd.data ? "Unknown" : ready ? "Ready" : "Degraded";
  const systemSub = rd.loading
    ? "checking…"
    : !rd.data
      ? "probe unreachable"
      : failing.length
        ? `${failing.map((c) => c.name).join(", ")} down`
        : "db · storage · workers";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
        <Kpi label="Approvals pending" value={String(pending)} icon="BadgeCheck" color={pending > 0 ? C.orange : C.lime} sub="awaiting a founder" />
        <Kpi label="Spend · today" value={today} icon="Receipt" color={C.lime} sub="real model_runs" />
        <Kpi label="Live pages wired" value={String(wired)} icon="PlugZap" color={C.blue} sub={`of ${total} modules`} />
        <Kpi
          label="System"
          value={systemValue}
          icon={ready ? "CircleCheck" : "TriangleAlert"}
          color={rd.loading ? C.blue : ready ? C.lime : C.orange}
          sub={systemSub}
        />
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
            {packet.angle ? <Field label="Angle" value={packet.angle} /> : null}
            <Field label="Hook" value={packet.hook} />
            {Array.isArray(packet.carouselSlides) && packet.carouselSlides.length ? (
              <div>
                <div style={{ fontSize: 10.5, letterSpacing: "0.06em", color: faint, fontWeight: 600, marginBottom: 6 }}>CAROUSEL SLIDES ({(packet.carouselSlides as unknown[]).length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(packet.carouselSlides as unknown[]).map((raw, i) => {
                    const sl = (raw ?? {}) as Record<string, unknown>;
                    const heading = typeof sl.heading === "string" ? sl.heading : typeof sl.title === "string" ? sl.title : "";
                    const body = typeof sl.body === "string" ? sl.body : typeof raw === "string" ? raw : "";
                    return (
                      <div key={i} style={{ ...card, padding: "11px 13px" }}>
                        <div style={{ fontSize: 9.5, letterSpacing: "0.08em", color: C.lime, fontWeight: 700, marginBottom: 4 }}>SLIDE {i + 1}</div>
                        {heading ? <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{heading}</div> : null}
                        <div style={{ fontSize: 12.3, color: muted, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{body}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {packet.mainCopy ? <Field label="Body copy" value={packet.mainCopy} /> : null}
            <Field label="Caption" value={packet.caption} />
            <Field label="CTA" value={packet.cta} />
            {packet.designDirection ? <Field label="Design direction" value={packet.designDirection} /> : null}
            {packet.evidenceSummary ? <Field label="Evidence" value={packet.evidenceSummary} /> : null}
            <div style={{ ...card, padding: "10px 12px", fontSize: 11.5, color: muted, lineHeight: 1.6 }}>
              <div style={{ fontSize: 9.5, letterSpacing: "0.08em", color: faint, fontWeight: 700, marginBottom: 5 }}>GROUNDING &amp; PROVENANCE</div>
              Sources cited: <b style={{ color: C.white }}>{Array.isArray(packet.sourceIdsUsed) ? (packet.sourceIdsUsed as unknown[]).length : 0}</b> · knowledge notes: <b style={{ color: C.white }}>{Array.isArray(packet.insightIdsUsed) ? (packet.insightIdsUsed as unknown[]).length : 0}</b> · memory chunks: <b style={{ color: C.white }}>{Array.isArray(packet.memoryChunksUsed) ? (packet.memoryChunksUsed as unknown[]).length : 0}</b>
              <div style={{ marginTop: 4 }}>Claim risk: {String(packet.claimRiskLevel ?? "low")}</div>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Field label="Audience" value={packet.targetAudience} />
              <Field label="Created" value={fmtTime(packet.createdAt)} />
            </div>
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
  const [objective, setObjective] = useState("");
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamMsg, setTeamMsg] = useState<string | null>(null);
  const tracks = tracksApi.data?.tracks ?? [];
  const guard = offlineIf(s);
  if (guard) return guard;
  const packets = s.data?.packets ?? [];
  const groups: Record<string, Record<string, unknown>[]> = {};
  for (const p of packets) { const k = String(p.approvalStatus ?? "draft"); (groups[k] ||= []).push(p); }
  const order = Object.keys(groups);

  async function runTeam() {
    setTeamMsg(null);
    if (!track) { setTeamMsg("Pick a track first (the team writes in that track's voice)."); return; }
    if (!objective.trim()) { setTeamMsg("Add an objective for the team, e.g. 'book more discovery calls'."); return; }
    setTeamBusy(true);
    try {
      const r = await fetch("/api/content/graph", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentTrackId: track, objective: objective.trim() }) });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) setTeamMsg("Error: " + String(j.error ?? "HTTP " + r.status));
      else { setTeamMsg("Content team queued. A worker runs the 5 agents; the pack appears here when they finish."); setObjective(""); setTimeout(() => s.reload(), 1500); }
    } catch (e) { setTeamMsg("Error: " + String(e)); } finally { setTeamBusy(false); }
  }

  const teamAgents = ["Strategist", "Researcher", "Copywriter", "Scorer"];
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

      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ color: C.lime, display: "inline-flex" }}><Icon name="Users" size={16} /></span>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Content Team — multi-agent</div>
          <StatusPill label="LIVE" color={C.lime} />
        </div>
        <div style={{ fontSize: 12.6, color: muted, lineHeight: 1.55, maxWidth: 720, marginBottom: 12 }}>
          Every pack is produced by a TEAM, not one model: a strategist sets the angle, a researcher grounds it in the compiled knowledge (with provenance), a copywriter drafts then self-critiques, and a scorer gates quality before it reaches your approval queue.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {teamAgents.map((a, i) => (
            <React.Fragment key={a}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: C.white, padding: "5px 10px", borderRadius: 8, background: "rgba(184,255,44,0.10)", border: "1px solid rgba(184,255,44,0.28)" }}>{a}</span>
              {i < teamAgents.length - 1 ? <span style={{ color: faint, fontSize: 12 }}>›</span> : null}
            </React.Fragment>
          ))}
          <span style={{ color: faint, fontSize: 12 }}>›</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "#0A0A0A", padding: "5px 10px", borderRadius: 8, background: C.lime }}>Content Pack</span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input value={objective} onChange={(e) => setObjective(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runTeam()} placeholder="Objective for the team, e.g. book more discovery calls" style={{ ...inputStyle, flex: 1, minWidth: 240 }} />
          <button onClick={runTeam} disabled={teamBusy} style={teamBusy ? disabledBtn : primaryBtn}>{teamBusy ? "Queuing…" : "Run the team"}</button>
        </div>
        <div style={{ fontSize: 10.8, color: faint, marginTop: 8 }}>Runs 5 model calls on the selected track. Grounded in approved sources + the Knowledge Compiler.</div>
        {teamMsg ? <div style={{ fontSize: 12, color: teamMsg.startsWith("Error") ? C.orange : C.lime, marginTop: 8 }}>{teamMsg}</div> : null}
      </Panel>

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

function WobbleMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="presentation" style={{ flex: "none" }}>
      <defs><ellipse id="wm-petal" cx="100" cy="100" rx="92" ry="21" /></defs>
      <g fill={C.lime} fillRule="evenodd" opacity={0.92}>
        <use href="#wm-petal" transform="rotate(0 100 100)" />
        <use href="#wm-petal" transform="rotate(45 100 100)" />
        <use href="#wm-petal" transform="rotate(90 100 100)" />
        <use href="#wm-petal" transform="rotate(135 100 100)" />
      </g>
      <circle cx="100" cy="100" r="17" fill="#06070A" />
    </svg>
  );
}

interface ChatFile { id: string; name: string; size: number; mimeType: string; kind: "image" | "pdf" | "text" | "other"; preview: string | null; dataBase64: string }
const IMG_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i;
function fileKind(f: File): ChatFile["kind"] {
  if (f.type.startsWith("image/") || IMG_EXT_RE.test(f.name)) return "image";
  if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) return "pdf";
  if (f.type.startsWith("text/") || /\.(txt|md|csv|json|ya?ml|xml|html?|js|ts|tsx|jsx|py|sql|css|log)$/i.test(f.name)) return "text";
  return "other";
}
function readFileB64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result ?? ""); resolve(s.includes(",") ? s.split(",")[1] : s); };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

function AskPage() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<ChatFile[]>([]);
  const [drag, setDrag] = useState(false);
  const [turns, setTurns] = useState<{ role: "you" | "wob"; text: string; meta?: string; files?: { name: string; kind: string }[]; citations?: Record<string, unknown>[]; needsFounderJudgment?: string[] }[]>([]);
  const greet = useApi<{ greeting: string; subline: string; dayPart: string }>("/api/ai/greeting");
  const modelState = useApi<{ models: { id: string; label: string; description: string }[] }>("/api/ai/models");
  const [model, setModel] = useState("");
  const [agentMode, setAgentMode] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{ question: string; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const models = modelState.data?.models ?? [];

  async function addFiles(list: FileList | File[]) {
    const MAX = 12 * 1024 * 1024; // 12 MB per file — larger base64 payloads fail the request
    const all = Array.from(list);
    const tooBig = all.filter((f) => f.size > MAX);
    const arr = all.filter((f) => f.size <= MAX).slice(0, 10);
    if (tooBig.length) setTurns((t) => [...t, { role: "wob", text: `Skipped ${tooBig.map((f) => f.name).join(", ")} — over 12 MB. Compress or crop and try again.` }]);
    if (!arr.length) return;
    const built = await Promise.all(arr.map(async (f) => ({ id: Math.random().toString(36).slice(2), name: f.name, size: f.size, mimeType: f.type || "application/octet-stream", kind: fileKind(f), preview: fileKind(f) === "image" ? URL.createObjectURL(f) : null, dataBase64: await readFileB64(f) })));
    setFiles((prev) => [...prev, ...built].slice(0, 10));
  }
  function removeFile(id: string) { setFiles((prev) => prev.filter((f) => f.id !== id)); }

  async function send() {
    const question = q.trim();
    if ((!question && files.length === 0) || busy) return;
    const attached = files.map((f) => ({ name: f.name, kind: f.kind }));
    setTurns((t) => [...t, { role: "you", text: question || "(analyze attached)", files: attached }]);
    const sendFiles = files;
    setQ(""); setFiles([]); setBusy(true);
    try {
      if (agentMode && sendFiles.length === 0) {
        // Agent mode: the orchestrator can inspect + operate the OS (destructive actions need confirm).
        const r = await fetch("/api/ask/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question, confirmActions: false }) });
        const j = (await r.json()) as Record<string, unknown>;
        if (!r.ok || j.ok === false) setTurns((t) => [...t, { role: "wob", text: "Error: " + String(j.error ?? "HTTP " + r.status) }]);
        else {
          const res = (j.result ?? {}) as Record<string, unknown>;
          const pc = res.pendingConfirmation as { message?: string } | undefined;
          if (pc) { setPendingConfirm({ question, message: String(pc.message ?? "This action needs your confirmation.") }); setTurns((t) => [...t, { role: "wob", text: String(res.answer || pc.message || ""), meta: "⚠ needs your confirmation" }]); }
          else { const trace = Array.isArray(res.toolTrace) ? res.toolTrace.length : 0; setTurns((t) => [...t, { role: "wob", text: String(res.answer ?? ""), meta: [trace ? `${trace} tool call${trace === 1 ? "" : "s"}` : null, res.iterations ? `${res.iterations} step${res.iterations === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") }]); }
        }
      } else if (sendFiles.length > 0 || model) {
        // Attachments or an explicit model pick -> universal multimodal chat (images/PDFs/text).
        const r = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question, useMemory: true, model: model || undefined, attachments: sendFiles.map((f) => ({ filename: f.name, mimeType: f.mimeType, dataBase64: f.dataBase64 })) }) });
        const j = (await r.json()) as Record<string, unknown>;
        if (!r.ok || j.ok === false) setTurns((t) => [...t, { role: "wob", text: "Error: " + String(j.error ?? "HTTP " + r.status) + (r.status === 503 ? " (connect the database)" : "") }]);
        else setTurns((t) => [...t, { role: "wob", text: String(j.text ?? ""), meta: [Array.isArray(j.attachments) && j.attachments.length ? (j.attachments as string[]).join(" · ") : null, j.runId ? "run " + String(j.runId) : null].filter(Boolean).join(" — ") }]);
      } else {
        const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, maxTokens: 600 }) });
        const j = (await r.json()) as Record<string, unknown>;
        if (!r.ok || j.ok === false) setTurns((t) => [...t, { role: "wob", text: "Error: " + String(j.error ?? "HTTP " + r.status) + (r.status === 503 ? " (connect the database)" : "") }]);
        else {
          const res = (j.result ?? {}) as Record<string, unknown>;
          if (res.type === "answer") {
            const answer = (res.answer ?? {}) as Record<string, unknown>;
            const citations = Array.isArray(answer.citations) ? answer.citations as Record<string, unknown>[] : [];
            const needsFounderJudgment = Array.isArray(answer.needsFounderJudgment) ? answer.needsFounderJudgment.map((item) => String(item)) : [];
            const metaParts = [answer.confidence != null ? "confidence " + String(answer.confidence) : null, citations.length ? citations.length + " citation" + (citations.length === 1 ? "" : "s") : null, answer.modelRunId ? "run " + String(answer.modelRunId) : null].filter(Boolean);
            setTurns((t) => [...t, { role: "wob", text: String(answer.answer ?? ""), meta: metaParts.join(" - "), citations, needsFounderJudgment }]);
          } else {
            const text = String(res.message ?? (res.type === "route" ? "Intent recognized and routed." : JSON.stringify(res)));
            const meta = [res.intent ? "intent " + String(res.intent) : null, res.module ? "module " + String(res.module) : null, res.status ? "status " + String(res.status) : null].filter(Boolean).join(" - ");
            setTurns((t) => [...t, { role: "wob", text, meta }]);
          }
        }
      }
    } catch (e) { setTurns((t) => [...t, { role: "wob", text: "Error: " + String(e) }]); }
    setBusy(false);
  }

  async function confirmAgent(approve: boolean) {
    const pc = pendingConfirm;
    setPendingConfirm(null);
    if (!pc || !approve) { if (pc) setTurns((t) => [...t, { role: "wob", text: "Cancelled — nothing was applied." }]); return; }
    setBusy(true);
    setTurns((t) => [...t, { role: "you", text: "✓ Confirmed" }]);
    try {
      const r = await fetch("/api/ask/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: pc.question, confirmActions: true }) });
      const j = (await r.json()) as Record<string, unknown>;
      const res = (j.result ?? {}) as Record<string, unknown>;
      if (!r.ok || j.ok === false) setTurns((t) => [...t, { role: "wob", text: "Error: " + String(j.error ?? "HTTP " + r.status) }]);
      else setTurns((t) => [...t, { role: "wob", text: String(res.answer ?? "Applied."), meta: "applied" }]);
    } catch (e) { setTurns((t) => [...t, { role: "wob", text: "Error: " + String(e) }]); }
    setBusy(false);
  }

  const hasContent = q.trim() || files.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={(e) => { e.preventDefault(); setDrag(false); }} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}>
      {turns.length === 0 ? (
        <div style={{ padding: "18px 4px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <WobbleMark size={30} />
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: C.white }}>{greet.data?.greeting ?? "Hey there"}</div>
          </div>
          <div style={{ fontSize: 13.5, color: faint, marginLeft: 42 }}>{greet.data?.subline ?? "What are we building today?"}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {turns.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "you" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "80%", padding: "12px 15px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", border: "1px solid " + (m.role === "you" ? "rgba(184,255,44,0.28)" : "rgba(255,255,255,0.09)"), background: m.role === "you" ? "linear-gradient(135deg,rgba(184,255,44,0.16),rgba(184,255,44,0.06))" : "rgba(255,255,255,0.05)" }}>
                {m.files?.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 7 }}>{m.files.map((f, k) => <Tag key={k} text={(f.kind === "image" ? "🖼 " : f.kind === "pdf" ? "📄 " : "📎 ") + f.name.slice(0, 26)} color={C.blue} />)}</div> : null}
                {m.text}
                {m.meta ? <div style={{ fontSize: 10.5, color: faint, marginTop: 6 }}>{m.meta}</div> : null}
                {m.needsFounderJudgment?.length ? <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 5 }}>{m.needsFounderJudgment.map((item) => <div key={item} style={{ fontSize: 11.5, color: C.orange }}>{item}</div>)}</div> : null}
                {m.citations?.length ? <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 5 }}>{m.citations.slice(0, 8).map((c, idx) => <Tag key={String(c.id ?? idx)} text={String(c.kind ?? "source") + " - " + String(c.label ?? c.id ?? idx).slice(0, 48)} color={String(c.kind) === "source" ? C.blue : C.lime} />)}{m.citations.length > 8 ? <Tag text={"+" + String(m.citations.length - 8) + " more"} color={C.gray} /> : null}</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingConfirm ? (
        <div style={{ ...card, padding: "12px 14px", border: "1px solid rgba(245,197,66,0.4)", background: "rgba(245,197,66,0.06)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "#F5C542" }}>⚠ Confirm this action</div>
          <div style={{ fontSize: 12.5, color: C.white, marginBottom: 10 }}>{pendingConfirm.message}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => confirmAgent(true)} disabled={busy} style={{ ...primaryBtn, padding: "7px 13px", fontSize: 12 }}>Confirm & apply</button>
            <button onClick={() => confirmAgent(false)} disabled={busy} style={{ ...selectStyle, cursor: "pointer", padding: "7px 13px" }}>Cancel</button>
          </div>
        </div>
      ) : null}

      {/* Composer */}
      <div style={{ position: "relative", ...glass, padding: 12, border: drag ? "1px dashed rgba(184,255,44,0.6)" : glass.border }}>
        {files.length > 0 ? (
          <div style={{ display: "flex", gap: 9, overflowX: "auto", paddingBottom: 10, marginBottom: 4 }}>
            {files.map((f) => (
              <div key={f.id} style={{ position: "relative", flex: "none", width: 92, height: 92, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)" }}>
                {f.preview ? <img src={f.preview} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (
                  <div style={{ padding: 9, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <Icon name={f.kind === "pdf" ? "FileText" : "File"} size={17} />
                    <div><div style={{ fontSize: 10.5, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div><div style={{ fontSize: 9.5, color: faint }}>{(f.size / 1024).toFixed(0)} KB</div></div>
                  </div>
                )}
                <button onClick={() => removeFile(f.id)} style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, cursor: "pointer", lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        ) : null}
        <textarea value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask WOBBLE anything — or drop an image / PDF / doc to analyze…" rows={2} style={{ width: "100%", padding: "6px 6px 10px", border: "none", background: "transparent", color: C.white, fontSize: 14, outline: "none", resize: "none", fontFamily: "inherit" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => fileRef.current?.click()} title="Attach a file" style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: C.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="Plus" size={17} /></button>
          {models.length ? (
            <select value={model} onChange={(e) => setModel(e.target.value)} title="Model" style={{ ...selectStyle, padding: "6px 9px", fontSize: 11.5 }}>
              <option value="">Auto</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          ) : null}
          <button onClick={() => setAgentMode((a) => !a)} title="Agent mode — let WOBBLE inspect + operate the OS (actions need your confirmation)" style={{ padding: "6px 11px", borderRadius: 9, fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: "1px solid " + (agentMode ? "rgba(184,255,44,0.5)" : "rgba(255,255,255,0.12)"), background: agentMode ? "rgba(184,255,44,0.14)" : "rgba(255,255,255,0.03)", color: agentMode ? C.lime : muted }}>⚡ Agent{agentMode ? " · ON" : ""}</button>
          <span style={{ fontSize: 10.5, color: faint }}>{agentMode ? "Agent can inspect + operate the OS · changes ask first" : "Images → vision · PDFs & docs → parsed · Shift+Enter for newline"}</span>
          <div style={{ flex: 1 }} />
          <button onClick={send} disabled={!hasContent || busy} style={{ width: 36, height: 36, borderRadius: 11, border: "none", background: hasContent && !busy ? C.lime : "rgba(184,255,44,0.3)", color: "#0A0A0A", cursor: hasContent && !busy ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}>{busy ? <Icon name="Loader2" size={17} /> : <Icon name="ArrowUp" size={18} />}</button>
        </div>
        <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        {drag ? <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: "rgba(6,7,10,0.85)", display: "flex", alignItems: "center", justifyContent: "center", color: C.lime, fontSize: 13, fontWeight: 600, pointerEvents: "none" }}>Drop files to attach</div> : null}
      </div>
    </div>
  );
}

function MemoryRecords({ url, emptyMsg }: { url: string; emptyMsg: string }) {
  const s = useApi<{ records: Record<string, unknown>[] }>(url);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const guard = offlineIf(s);
  if (guard) return guard;
  const recs = s.data?.records ?? [];
  if (!recs.length) return <StateBlock kind="empty" message={emptyMsg} />;
  return (
    <>
    <div style={{ ...glass, padding: "8px 10px" }}>
      {recs.map((r, i) => (
        <button key={String(r.id ?? i)} onClick={() => setSelected(r)} style={{ width: "100%", border: "none", background: "transparent", color: C.white, textAlign: "left", display: "flex", gap: 14, padding: 14, cursor: "pointer", borderBottom: i < recs.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
          <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: C.lime, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}><Icon name="Database" size={15} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{String(r.title ?? r.summary ?? r.content ?? "memory")}</span>
              {r.memoryTier ? <Tag text={String(r.memoryTier)} color={C.lime} /> : null}
              {r.trustLevel ? <Tag text={String(r.trustLevel)} color={C.blue} /> : null}
              {Array.isArray(r.bankSlugs) ? r.bankSlugs.slice(0, 4).map((bank) => <Tag key={String(bank)} text={String(bank)} color={C.orange} />) : null}
            </div>
            <div style={{ fontSize: 11.5, color: faint, marginTop: 5 }}>{String(r.area ?? r.entityType ?? "")} · {fmtTime(r.createdAt)}</div>
          </div>
          <span style={{ color: faint, display: "inline-flex", alignItems: "center" }}><Icon name="ChevronRight" size={16} /></span>
        </button>
      ))}
    </div>
    {selected ? (
      <DetailDrawer
        title={String(selected.title ?? selected.slug ?? "Memory record")}
        subtitle={String(selected.id ?? "")}
        tags={[
          { text: String(selected.memoryTier ?? "memory"), color: C.lime },
          { text: String(selected.trustLevel ?? "trust"), color: C.blue },
          { text: String(selected.status ?? "active"), color: C.gray },
        ]}
        fields={[
          { label: "Content", value: selected.content },
          { label: "Area", value: selected.area },
          { label: "Bank slugs", value: selected.bankSlugs },
          { label: "Source", value: selected.sourceId },
          { label: "Approved by", value: selected.approvedBy },
          { label: "Created", value: fmtTime(selected.createdAt) },
          { label: "Updated", value: fmtTime(selected.updatedAt) },
        ]}
        raw={selected}
        onClose={() => setSelected(null)}
      />
    ) : null}
    </>
  );
}
function BrainPage() {
  const [open, setOpen] = useState(false);
  const [k, setK] = useState(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><button onClick={() => setOpen(true)} style={primaryBtn}>Add knowledge</button></div>
      <div style={{ fontSize: 12, color: muted }}>WOBBLE Brain is the core, always-on tier of Memory. The Memory page shows every tier and bank.</div>
      <MemoryRecords key={k} url="/api/memory?memoryTier=core&limit=50" emptyMsg="No Core Brain records yet." />
      {open ? <AddMemoryModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); setK((x) => x + 1); }} /> : null}
    </div>
  );
}
// ---- Memory management (browse/edit/pin/archive/restore + conflicts + stale review) ----

const actBtn: React.CSSProperties = { padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: C.white, fontSize: 11, fontWeight: 600, cursor: "pointer" };
const chipBtn = (on: boolean): React.CSSProperties => ({ padding: "8px 13px", borderRadius: 10, border: "1px solid " + (on ? "rgba(184,255,44,0.34)" : "rgba(255,255,255,0.10)"), background: on ? "linear-gradient(135deg,rgba(184,255,44,0.14),rgba(184,255,44,0.03))" : "rgba(255,255,255,0.03)", color: on ? C.white : muted, fontSize: 12.5, fontWeight: 600, cursor: "pointer" });

async function memApi(path: string, method: string, body?: unknown): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    const r = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.ok === false) return { ok: false, error: String(j.error ?? "HTTP " + r.status) };
    return { ok: true, data: j };
  } catch (e) { return { ok: false, error: String(e) }; }
}

function EditMemoryModal({ record, actor, onClose, onDone }: { record: Record<string, unknown>; actor: string; onClose: () => void; onDone: () => void }) {
  const id = String(record.id ?? "");
  const [title, setTitle] = useState(String(record.title ?? ""));
  const [content, setContent] = useState(String(record.content ?? ""));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const vs = useApi<{ versions: Record<string, unknown>[] }>("/api/memory/records/" + encodeURIComponent(id) + "/versions");
  async function save() {
    setBusy(true); setMsg(null);
    const res = await memApi("/api/memory/records/" + encodeURIComponent(id), "PATCH", { title, content, editedBy: actor });
    setBusy(false);
    if (!res.ok) { setMsg("Error: " + res.error); return; }
    setMsg("Saved — memory re-embedded so search stays correct."); setTimeout(onDone, 800);
  }
  async function restoreVersion(vid: string) {
    const res = await memApi("/api/memory/records/" + encodeURIComponent(id) + "/versions/" + encodeURIComponent(vid) + "/restore", "POST", { restoredBy: actor });
    if (!res.ok) { setMsg("Error: " + res.error); return; }
    setMsg("Rolled back to that version."); setTimeout(onDone, 800);
  }
  const versions = vs.data?.versions ?? [];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(4,5,8,0.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...glass, width: 560, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", padding: "24px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Edit memory</div>
          <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Close</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><div style={labelStyle}>TITLE</div><input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} /></div>
          <div><div style={labelStyle}>CONTENT</div><textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} /></div>
          {msg ? <div style={{ fontSize: 12.5, color: msg.startsWith("Error") ? C.orange : C.lime }}>{msg}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Cancel</button>
            <button onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save changes"}</button>
          </div>
          {versions.length ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>VERSION HISTORY</div>
              <div style={{ ...card, padding: 4 }}>
                {versions.map((v, i) => (
                  <div key={String(v.id ?? i)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderBottom: i < versions.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                    <Tag text={"v" + String(v.versionNumber ?? "?")} color={C.blue} />
                    <span style={{ flex: 1, fontSize: 12, color: muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(v.content ?? "")}</span>
                    <span style={{ fontSize: 10.5, color: faint }}>{fmtTime(v.createdAt)}</span>
                    <button onClick={() => restoreVersion(String(v.id))} style={actBtn}>Restore</button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ManagedMemoryList({ actor, status }: { actor: string; status: "active" | "archived" }) {
  const [bump, setBump] = useState(0);
  const s = useApi<{ records: Record<string, unknown>[] }>("/api/memory/records?status=" + status + "&limit=100&r=" + bump);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const guard = offlineIf(s); if (guard) return guard;
  const recs = s.data?.records ?? [];
  async function run(r: Record<string, unknown>, act: "pin" | "archive" | "restore") {
    const id = encodeURIComponent(String(r.id));
    const res =
      act === "pin" ? await memApi("/api/memory/records/" + id + "/pin", "POST", { pinned: !r.pinned, actor })
      : act === "archive" ? await memApi("/api/memory/records/" + id, "DELETE", { archivedBy: actor, reason: "removed from dashboard" })
      : await memApi("/api/memory/records/" + id + "/restore", "POST", { restoredBy: actor });
    setNote(res.ok ? null : "Error: " + res.error);
    setBump((x) => x + 1);
  }
  if (!recs.length) return <StateBlock kind="empty" message={status === "archived" ? "Nothing archived. Deleted memories live here for 48h before purge." : "No memories yet."} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {note ? <div style={{ fontSize: 12, color: C.orange }}>{note}</div> : null}
      <div style={{ ...glass, padding: "8px 10px" }}>
        {recs.map((r, i) => (
          <div key={String(r.id ?? i)} style={{ display: "flex", gap: 12, padding: "13px 12px", alignItems: "center", borderBottom: i < recs.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
            <span style={{ width: 32, height: 32, flex: "none", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: r.pinned ? "#0A0A0A" : C.lime, border: "1px solid rgba(255,255,255,0.10)", background: r.pinned ? C.lime : "rgba(255,255,255,0.04)" }}><Icon name={r.pinned ? "Pin" : "Database"} size={14} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{String(r.title ?? r.content ?? "memory")}</span>
                {r.memoryTier ? <Tag text={String(r.memoryTier)} color={C.lime} /> : null}
                {Array.isArray(r.bankSlugs) ? r.bankSlugs.slice(0, 3).map((b) => <Tag key={String(b)} text={String(b)} color={C.orange} />) : null}
                {r.pinned ? <Tag text="PINNED" color={C.lime} /> : null}
              </div>
              <div style={{ fontSize: 11, color: faint, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(r.content ?? "")}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flex: "none" }}>
              {status === "active" ? (
                <>
                  <button onClick={() => run(r, "pin")} style={actBtn}>{r.pinned ? "Unpin" : "Pin"}</button>
                  <button onClick={() => setEditing(r)} style={actBtn}>Edit</button>
                  <button onClick={() => run(r, "archive")} style={{ ...actBtn, color: C.orange, borderColor: "rgba(255,107,0,0.34)" }}>Delete</button>
                </>
              ) : (
                <button onClick={() => run(r, "restore")} style={{ ...actBtn, color: C.lime, borderColor: "rgba(184,255,44,0.34)" }}>Restore</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {editing ? <EditMemoryModal record={editing} actor={actor} onClose={() => setEditing(null)} onDone={() => { setEditing(null); setBump((x) => x + 1); }} /> : null}
    </div>
  );
}

function MemoryConflictsPanel({ actor }: { actor: string }) {
  const [bump, setBump] = useState(0);
  const s = useApi<{ conflicts: Record<string, unknown>[] }>("/api/memory/conflicts?limit=50&r=" + bump);
  const [note, setNote] = useState<string | null>(null);
  const guard = offlineIf(s); if (guard) return guard;
  const conflicts = s.data?.conflicts ?? [];
  async function resolve(id: string, resolution: string) {
    const res = await memApi("/api/memory/conflicts/" + encodeURIComponent(id) + "/resolve", "POST", { resolution, resolvedBy: actor });
    setNote(res.ok ? null : "Error: " + res.error);
    setBump((x) => x + 1);
  }
  if (!conflicts.length) return <StateBlock kind="empty" message="No open conflicts. When a new memory contradicts an existing one, it shows up here to resolve." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {note ? <div style={{ fontSize: 12, color: C.orange }}>{note}</div> : null}
      {conflicts.map((c, i) => (
        <div key={String(c.id ?? i)} style={{ ...glass, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Icon name="GitCompareArrows" size={15} color={C.orange} />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Possible conflict</span>
            {c.similarity ? <Tag text={"sim " + Number(c.similarity).toFixed(2)} color={C.blue} /> : null}
            {c.bankSlug ? <Tag text={String(c.bankSlug)} color={C.orange} /> : null}
          </div>
          <div style={{ fontSize: 11.5, color: muted, marginBottom: 12 }}>New record <code>{String(c.newRecordId).slice(0, 14)}</code> is similar-but-different to existing <code>{String(c.existingRecordId).slice(0, 14)}</code>.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => resolve(String(c.id), "keep_new")} style={{ ...actBtn, color: C.lime, borderColor: "rgba(184,255,44,0.34)" }}>Keep new (archive old)</button>
            <button onClick={() => resolve(String(c.id), "keep_existing")} style={actBtn}>Keep existing (archive new)</button>
            <button onClick={() => resolve(String(c.id), "keep_both")} style={actBtn}>Keep both</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function MemoryReviewPanel({ actor }: { actor: string }) {
  const [bump, setBump] = useState(0);
  const s = useApi<{ records: Record<string, unknown>[] }>("/api/memory/review?limit=50&r=" + bump);
  const guard = offlineIf(s); if (guard) return guard;
  const recs = s.data?.records ?? [];
  async function reviewed(id: string) {
    await memApi("/api/memory/records/" + encodeURIComponent(id) + "/review", "POST", { reviewedBy: actor });
    setBump((x) => x + 1);
  }
  if (!recs.length) return <StateBlock kind="empty" message="Nothing stale. Memories resurface here for re-confirmation as they age." />;
  return (
    <div style={{ ...glass, padding: "8px 10px" }}>
      {recs.map((r, i) => (
        <div key={String(r.id ?? i)} style={{ display: "flex", gap: 12, padding: "13px 12px", alignItems: "center", borderBottom: i < recs.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
          <Icon name="Clock" size={15} color={C.blue} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{String(r.title ?? "memory")}</div>
            <div style={{ fontSize: 11, color: faint, marginTop: 3 }}>due since {fmtTime(r.reviewAfter)}</div>
          </div>
          <button onClick={() => reviewed(String(r.id))} style={{ ...actBtn, color: C.lime, borderColor: "rgba(184,255,44,0.34)" }}>Still true</button>
        </div>
      ))}
    </div>
  );
}

function FounderMemoryPanel({ founder }: { founder: string }) {
  const s = useApi<{ bank: string; count: number; records: Record<string, unknown>[] }>("/api/memory/founder/" + encodeURIComponent(founder));
  const guard = offlineIf(s); if (guard) return guard;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: muted }}>Everything WOBBLE has learned about <b>{founder}</b> personally (bank <code>{s.data?.bank}</code>) — {s.data?.count ?? 0} memories.</div>
      <ManagedMemoryList actor={founder} status="active" />
    </div>
  );
}

const MEM_TABS = [
  { id: "records", label: "All memory" },
  { id: "conflicts", label: "Conflicts" },
  { id: "review", label: "Stale review" },
  { id: "mine", label: "What WOBBLE knows about me" },
  { id: "archived", label: "Recently deleted" },
];

function MemoryPage() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("records");
  const [actor, setActor] = useState(FOUNDERS[0]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={() => setOpen(true)} style={primaryBtn}>Add memory</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <span style={{ fontSize: 11.5, color: faint }}>Acting as</span>
          <select value={actor} onChange={(e) => setActor(e.target.value)} style={selectStyle}>{FOUNDERS.map((f) => <option key={f} value={f}>{f}</option>)}</select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {MEM_TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} style={chipBtn(tab === t.id)}>{t.label}</button>)}
      </div>
      <div style={{ fontSize: 12, color: muted }}>
        Read, edit, pin, and remove memory. Deletions are reversible for 48 hours. Every change is tracked in the Audit Log. Each founder can edit their own personal bank; brand/company memory is shared.
      </div>
      {tab === "records" ? <ManagedMemoryList actor={actor} status="active" /> : null}
      {tab === "archived" ? <ManagedMemoryList actor={actor} status="archived" /> : null}
      {tab === "conflicts" ? <MemoryConflictsPanel actor={actor} /> : null}
      {tab === "review" ? <MemoryReviewPanel actor={actor} /> : null}
      {tab === "mine" ? <FounderMemoryPanel founder={actor} /> : null}
      {open ? <AddMemoryModal onClose={() => setOpen(false)} onDone={() => setOpen(false)} /> : null}
    </div>
  );
}

function SourceDetailDrawer({ source, onClose, onChanged }: { source: Record<string, unknown>; onClose: () => void; onChanged?: () => void }) {
  const id = String(source.id ?? "");
  const chunks = useApi<{ chunks: Record<string, unknown>[] }>(id ? "/api/sources/" + encodeURIComponent(id) + "/chunks?limit=20" : "/api/sources/no-source/chunks");
  const intake = useApi<{ runs: Record<string, unknown>[] }>(id ? "/api/sources/" + encodeURIComponent(id) + "/intake?limit=20" : "/api/sources/no-source/intake");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const status = String(source.status ?? "active");
  const approved = source.approvalStatus === "approved";
  async function reingest() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/sources/" + encodeURIComponent(id) + "/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reingest" }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setMsg("Re-ingest failed: " + String(j.error ?? res.status)); return; }
      setMsg(`Re-ingested via ${j.adapter ?? "adapter"} — ${j.chunks ?? 0} chunk(s).`);
      chunks.reload(); // keep the drawer open so the founder sees the freshly-collected chunks
    } finally { setBusy(false); }
  }
  async function sourceAction(action: "deactivate" | "reactivate") {
    let reason: string | undefined;
    if (action === "deactivate") { const r = window.prompt("Deactivating stops NEW collection + propagation for this source. Existing evidence is preserved and this is reversible. Reason (optional):"); if (r === null) return; reason = r.trim() || undefined; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/sources/" + encodeURIComponent(id) + "/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(reason ? { reason } : {}) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setMsg((action === "deactivate" ? "Deactivate" : "Reactivate") + " failed: " + String(j.error ?? res.status)); return; }
      const preserved = j.impact?.chunksPreserved;
      setMsg(action === "deactivate" ? `Deactivated — collection stopped. ${typeof preserved === "number" ? preserved : 0} evidence chunk(s) preserved (reversible).` : "Reactivated — the source is back in the collection feed.");
      onChanged?.();
    } finally { setBusy(false); }
  }
  return (
    <DetailDrawer
      title={String(source.title ?? "Source")}
      subtitle={id}
      tags={[
        { text: String(source.sourceType ?? "source"), color: C.gray },
        { text: String(source.approvalStatus ?? "pending"), color: source.approvalStatus === "approved" ? C.lime : C.blue },
        { text: String(source.processingStatus ?? "ready"), color: String(source.processingStatus).includes("failed") ? C.orange : C.lime },
        { text: String(source.trustLevel ?? "tier"), color: C.blue },
      ]}
      fields={[
        { label: "URL", value: source.url },
        { label: "Owner", value: String(source.ownerScope ?? "company") + (source.ownerId ? " / " + String(source.ownerId) : "") },
        { label: "Intended use", value: source.intendedUse },
        { label: "Connected agents", value: source.connectedAgents },
        { label: "Memory banks fed", value: source.memoryBanksFed },
        { label: "Refresh frequency", value: source.refreshFrequency },
        { label: "Last scraped", value: fmtTime(source.lastScrapedAt) },
        { label: "Confidence", value: source.confidence },
        { label: "Cost used", value: fmtMoney(source.costUsed) },
        { label: "Last error", value: source.lastError },
        { label: "Extracted data", value: source.extractedData },
      ]}
      raw={source}
      onClose={onClose}
    >
      {approved ? (
        <div>
          <div style={labelStyle}>COLLECTION CONTROL</div>
          <div style={{ ...card, padding: "12px 13px" }}>
            <div style={{ fontSize: 11.5, color: muted, lineHeight: 1.5, marginBottom: 9 }}>
              {status === "archived"
                ? "This source is DEACTIVATED — no new collection or propagation. Existing evidence is preserved. Reactivate to resume."
                : "Deactivating stops new collection + propagation. Existing evidence stays accessible; the action is reversible."}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {status === "archived"
                ? <button disabled={busy} onClick={() => sourceAction("reactivate")} style={primaryBtn}>{busy ? "Working…" : "Reactivate source"}</button>
                : <button disabled={busy} onClick={() => sourceAction("deactivate")} style={{ ...primaryBtn, background: C.orange }}>{busy ? "Working…" : "Deactivate source"}</button>}
              {status !== "archived" ? <button disabled={busy} onClick={reingest} style={{ ...primaryBtn, background: "rgba(255,255,255,0.06)", color: C.white }}>{busy ? "Working…" : "Re-ingest now"}</button> : null}
            </div>
            {msg ? <div style={{ fontSize: 11.5, color: C.lime, marginTop: 8, lineHeight: 1.5 }}>{msg}</div> : null}
          </div>
        </div>
      ) : null}
      <div>
        <div style={labelStyle}>SOURCE CHUNKS</div>
        {chunks.loading ? <StateBlock kind="loading" /> : chunks.error ? <StateBlock kind={chunks.status === 503 ? "offline" : "error"} message={chunks.error} /> : (chunks.data?.chunks ?? []).length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(chunks.data?.chunks ?? []).map((chunk, idx) => <Field key={String(chunk.id ?? idx)} label={"Chunk " + String(chunk.chunkIndex ?? idx)} value={chunk.content} />)}
          </div>
        ) : <StateBlock kind="empty" message="No chunks attached yet. Intake/connector workers will attach them after the source is approved and processed." />}
      </div>
      <div>
        <div style={labelStyle}>INTAKE RUNS</div>
        {intake.loading ? <StateBlock kind="loading" /> : intake.error ? <StateBlock kind={intake.status === 503 ? "offline" : "error"} message={intake.error} /> : (intake.data?.runs ?? []).length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(intake.data?.runs ?? []).map((run, idx) => (
              <div key={String(run.id ?? idx)} style={{ ...card, padding: "11px 12px" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
                  <Tag text={String(run.status ?? "run")} color={String(run.status).includes("failed") ? C.orange : C.lime} />
                  <Tag text={String(run.trigger ?? "manual")} color={C.blue} />
                  <Tag text={String(run.handlerSlug ?? "handler")} color={C.gray} />
                </div>
                <div style={{ fontSize: 11.5, color: muted, lineHeight: 1.5 }}>{String(run.tool ?? "")} {run.error ? "- " + String(run.error) : ""}</div>
                <div style={{ fontSize: 10.5, color: faint, marginTop: 6 }}>{fmtTime(run.createdAt)}</div>
              </div>
            ))}
          </div>
        ) : <StateBlock kind="empty" message="No intake runs yet. A source can exist before a scraper/transcript/vision workflow processes it." />}
      </div>
    </DetailDrawer>
  );
}

function SourcesPage() {
  const [pendingOnly, setPendingOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
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
              <button key={String(r.id ?? i)} onClick={() => setSelected(r)} style={{ ...card, padding: "16px 17px", textAlign: "left", color: C.white, cursor: "pointer" }}>
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
              </button>
            );
          })}
        </div>
      )}
      {selected ? <SourceDetailDrawer source={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); s.reload(); }} /> : null}
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
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
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
              <button key={String(k.id ?? i)} onClick={() => setSelected(k)} style={{ width: "100%", border: "none", background: "transparent", color: C.white, textAlign: "left", display: "flex", gap: 14, padding: 14, alignItems: "center", cursor: "pointer", borderBottom: i < skills.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
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
                <span style={{ color: faint, display: "inline-flex", alignItems: "center" }}><Icon name="ChevronRight" size={16} /></span>
              </button>
            );
          })}
        </div>
      )}
      {open ? <CreateSkillModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); s.reload(); }} /> : null}
      {selected ? (
        <DetailDrawer
          title={String(selected.name ?? selected.slug ?? "Skill")}
          subtitle={String(selected.id ?? "")}
          tags={[
            { text: String(selected.slug ?? "skill"), color: C.blue },
            { text: "v" + String(selected.version ?? 1), color: C.gray },
            { text: String(selected.status ?? "draft"), color: selected.status === "approved" ? C.lime : C.blue },
          ]}
          fields={[
            { label: "Module", value: selected.module },
            { label: "Trigger", value: selected.trigger },
            { label: "Goal", value: selected.goal },
            { label: "Prompt body", value: selected.promptBody },
            { label: "Rules", value: selected.rules },
            { label: "Reference paths", value: selected.referencePaths },
            { label: "Approved by", value: selected.approvedBy },
            { label: "Approved at", value: fmtTime(selected.approvedAt) },
          ]}
          raw={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function AgentDetailDrawer({ agent, onClose }: { agent: Record<string, unknown>; onClose: () => void }) {
  const id = String(agent.id ?? agent.slug ?? "");
  const detail = useApi<{ agent: Record<string, unknown>; runs: Record<string, unknown>[] }>(id ? "/api/agents/" + encodeURIComponent(id) : "/api/agents/no-agent");
  const full = detail.data?.agent ?? agent;
  const runs = detail.data?.runs ?? [];
  return (
    <DetailDrawer
      title={String(full.name ?? full.slug ?? "Agent")}
      subtitle={String(full.id ?? "")}
      tags={[
        { text: String(full.role ?? "agent"), color: C.blue },
        { text: String(full.team ?? full.module ?? "team"), color: C.gray },
        { text: String(full.status ?? "active"), color: full.status === "active" ? C.lime : C.orange },
        { text: String(full.costProfile ?? "mid"), color: C.orange },
      ]}
      fields={[
        { label: "Purpose", value: full.purpose },
        { label: "Module", value: full.module },
        { label: "Model role", value: full.modelRole },
        { label: "Cadence", value: full.cadence },
        { label: "Tools", value: full.tools },
        { label: "Memory banks", value: full.memoryBanks },
        { label: "Input types", value: full.inputTypes },
        { label: "Output types", value: full.outputTypes },
        { label: "Quality score", value: full.qualityScore },
        { label: "Runs / failures", value: String(full.runCount ?? 0) + " / " + String(full.failureCount ?? 0) },
        { label: "Last run", value: fmtTime(full.lastRunAt) },
      ]}
      raw={full}
      onClose={onClose}
    >
      <div>
        <div style={labelStyle}>RECENT RUNS</div>
        {detail.loading ? <StateBlock kind="loading" /> : detail.error ? <StateBlock kind={detail.status === 503 ? "offline" : "error"} message={detail.error} /> : runs.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {runs.map((run, idx) => (
              <div key={String(run.id ?? idx)} style={{ ...card, padding: "11px 12px" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
                  <Tag text={String(run.status ?? "run")} color={String(run.status).includes("failed") ? C.orange : C.lime} />
                  {run.costEstimate ? <Tag text={fmtMoney(run.costEstimate)} color={C.orange} /> : null}
                  {run.qualityScore ? <Tag text={"q " + String(run.qualityScore)} color={C.blue} /> : null}
                </div>
                <div style={{ fontSize: 11.5, color: muted, lineHeight: 1.5 }}>{String(run.outputSummary ?? run.inputSummary ?? run.error ?? "")}</div>
                <div style={{ fontSize: 10.5, color: faint, marginTop: 6 }}>{fmtTime(run.createdAt)}</div>
              </div>
            ))}
          </div>
        ) : <StateBlock kind="empty" message="No agent runs logged yet. The registry defines visible agents; module workers must record runs here when they execute." />}
      </div>
    </DetailDrawer>
  );
}

function AgentsPage() {
  const s = useApi<{ agents: Record<string, unknown>[] }>("/api/agents?limit=200");
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const guard = offlineIf(s);
  if (guard) return guard;
  const items = s.data?.agents ?? [];
  if (!items.length) return <StateBlock kind="empty" message="No agents registered yet. Run the seed (npm run db:seed) - it registers the current + creative/research agents." />;
  return (
    <>
    <div style={{ ...glass, padding: "8px 10px" }}>
      {items.map((a, i) => {
        const st = String(a.status ?? "active");
        const col = st === "active" ? C.lime : st === "paused" ? C.blue : C.gray;
        return (
          <button key={String(a.id ?? i)} onClick={() => setSelected(a)} style={{ width: "100%", border: "none", background: "transparent", color: C.white, textAlign: "left", display: "flex", gap: 14, padding: 14, alignItems: "center", cursor: "pointer", borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
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
            <span style={{ color: faint, display: "inline-flex", alignItems: "center" }}><Icon name="ChevronRight" size={16} /></span>
          </button>
        );
      })}
    </div>
    {selected ? <AgentDetailDrawer agent={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

type ConnectionEntry = {
  id: string;
  slug: string;
  label: string;
  providerType: string;
  credentialKeyName: string;
  credentialConfigured: boolean;
  enabled: boolean;
  allowedModules: string[];
  permissionMode: string;
  costCategory: string;
  healthStatus: string;
  referenceDocPath: string | null;
  metadata: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

function ConnectionDetailDrawer({ connection, onClose, onChanged }: { connection: ConnectionEntry; onClose: () => void; onChanged: () => void }) {
  const [current, setCurrent] = useState(connection);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setCurrent(connection), [connection]);

  async function toggleEnabled() {
    setBusy("toggle");
    setMessage(null);
    try {
      const response = await fetch("/api/connections/" + encodeURIComponent(current.slug), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !current.enabled }),
      });
      const json = await response.json();
      if (!response.ok || json.ok === false) throw new Error(String(json.error ?? "connection update failed"));
      setCurrent(json.connection);
      setMessage(current.enabled ? "Connection disabled. Dependent jobs will now be blocked." : "Connection enabled. Run health check before using it live.");
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "connection update failed");
    } finally {
      setBusy(null);
    }
  }

  async function runHealthCheck() {
    setBusy("health");
    setMessage(null);
    try {
      const response = await fetch("/api/connections/" + encodeURIComponent(current.slug) + "/health", { method: "POST" });
      const json = await response.json();
      if (!response.ok || json.ok === false) throw new Error(String(json.error ?? "health check failed"));
      setCurrent(json.connection);
      setMessage(json.credentialConfigured ? "Health check passed. Env credential is configured." : "Missing env credential. Add it to .env/VPS env before live use.");
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "health check failed");
    } finally {
      setBusy(null);
    }
  }

  const healthColor = current.healthStatus === "healthy" ? C.lime : current.healthStatus === "missing_credential" || current.healthStatus === "disabled" ? C.orange : C.blue;
  return (
    <DetailDrawer
      title={current.label}
      subtitle={current.slug}
      tags={[
        { text: current.enabled ? "ENABLED" : "DISABLED", color: current.enabled ? C.lime : C.orange },
        { text: current.providerType, color: C.blue },
        { text: current.costCategory, color: C.gray },
      ]}
      fields={[
        { label: "Provider type", value: current.providerType },
        { label: "Credential env key", value: current.credentialKeyName },
        { label: "Credential configured", value: current.credentialConfigured ? "yes" : "no" },
        { label: "Permission mode", value: current.permissionMode },
        { label: "Allowed modules", value: current.allowedModules },
        { label: "Health", value: current.healthStatus },
        { label: "Reference docs", value: current.referenceDocPath },
        { label: "Updated", value: current.updatedAt },
      ]}
      raw={current.metadata}
      onClose={onClose}
    >
      <div style={{ ...card, padding: 14, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={runHealthCheck} disabled={busy !== null} style={busy ? disabledBtn : primaryBtn}>
            {busy === "health" ? "Checking..." : "Check health"}
          </button>
          <button onClick={toggleEnabled} disabled={busy !== null} style={busy ? disabledBtn : current.enabled ? rejectBtn : primaryBtn}>
            {busy === "toggle" ? "Saving..." : current.enabled ? "Disable connection" : "Enable connection"}
          </button>
          <StatusPill label={current.healthStatus} color={healthColor} />
        </div>
        <div style={{ fontSize: 12, color: muted, lineHeight: 1.5 }}>
          Secrets are never stored here. WOBBLE only stores the env key name, checks whether that env value exists, and blocks jobs when the connection is disabled or not allowed for that module.
        </div>
        {message ? <div style={{ fontSize: 12, color: message.toLowerCase().includes("failed") || message.toLowerCase().includes("missing") ? C.orange : C.lime }}>{message}</div> : null}
      </div>
    </DetailDrawer>
  );
}

function ConnectionsPage() {
  const s = useApi<{ connections: ConnectionEntry[] }>("/api/connections?limit=200");
  const [selected, setSelected] = useState<ConnectionEntry | null>(null);
  const guard = offlineIf(s);
  if (guard) return guard;
  const items = s.data?.connections ?? [];
  if (!items.length) return <StateBlock kind="empty" message="No connections registered yet. Run the seed to register OpenRouter, search, fal/Seedance, n8n and storage rails." />;

  const enabled = items.filter((item) => item.enabled).length;
  const healthy = items.filter((item) => item.healthStatus === "healthy").length;
  const missing = items.filter((item) => !item.credentialConfigured).length;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 14, marginBottom: 16 }}>
        <Kpi label="Connections" value={String(items.length)} icon="Cable" color={C.lime} sub="registered tools and APIs" />
        <Kpi label="Enabled" value={String(enabled)} icon="Power" color={C.blue} sub="allowed to be called" />
        <Kpi label="Healthy" value={String(healthy)} icon="ShieldCheck" color={C.lime} sub="env key present + enabled" />
        <Kpi label="Missing env" value={String(missing)} icon="KeyRound" color={C.orange} sub="needs .env or VPS secret" />
      </div>

      <Panel style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 6 }}>Connection rules</div>
            <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.55, maxWidth: 760 }}>
              Connections are the permission layer for the hive mind. Agents and workers should declare the connection they need; disabled, missing-credential, or module-blocked connections stop the job and write an audit event.
            </div>
          </div>
          <Tag text="NO SECRETS STORED" color={C.lime} />
        </div>
      </Panel>

      <div style={{ ...glass, padding: "8px 10px" }}>
        {items.map((connection, i) => {
          const healthColor = connection.healthStatus === "healthy" ? C.lime : connection.healthStatus === "missing_credential" || connection.healthStatus === "disabled" ? C.orange : C.blue;
          return (
            <button key={connection.id ?? connection.slug ?? i} onClick={() => setSelected(connection)} style={{ width: "100%", border: "none", background: "transparent", color: C.white, textAlign: "left", display: "flex", gap: 14, padding: 14, alignItems: "center", cursor: "pointer", borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: connection.enabled ? C.lime : C.orange, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}><Icon name="PlugZap" size={15} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{connection.label}</span>
                  <Tag text={connection.providerType} color={C.blue} />
                  <Tag text={connection.permissionMode} color={C.gray} />
                  <Tag text={connection.costCategory} color={C.orange} />
                  <StatusPill label={connection.enabled ? "enabled" : "disabled"} color={connection.enabled ? C.lime : C.orange} />
                  <StatusPill label={connection.healthStatus} color={healthColor} />
                </div>
                <div style={{ fontSize: 11.5, color: faint, marginTop: 5 }}>
                  {connection.credentialKeyName} - {connection.credentialConfigured ? "env configured" : "env missing"} - modules {(connection.allowedModules ?? []).join(", ") || "all"}
                </div>
              </div>
              <span style={{ color: faint, display: "inline-flex", alignItems: "center" }}><Icon name="ChevronRight" size={16} /></span>
            </button>
          );
        })}
      </div>
      {selected ? <ConnectionDetailDrawer connection={selected} onClose={() => setSelected(null)} onChanged={s.reload} /> : null}
    </>
  );
}

type IntelligenceEntry = {
  recordType: string;
  id: string;
  title: string;
  summary: string;
  approvalStatus: string;
  confidence?: string;
  priority?: string | null;
  sourceIds?: string[];
  evidenceItemIds?: string[];
  evidenceInsightIds?: string[];
  appliesToModules?: string[];
  agentSlug?: string | null;
  freshnessStatus?: string | null;
  createdAt?: string;
  updatedAt?: string;
  record?: Record<string, unknown>;
};

function statusColor(status: unknown) {
  const st = String(status ?? "");
  if (st === "approved") return C.lime;
  if (st === "rejected" || st === "archived" || st === "superseded") return C.orange;
  if (st === "needs_review") return C.blue;
  return C.gray;
}

function IntelligenceDrawer({ entry, onClose, onDone }: { entry: IntelligenceEntry; onClose: () => void; onDone: () => void }) {
  const [who, setWho] = useState(FOUNDERS[0]);
  const [reason, setReason] = useState("");
  const [editSummary, setEditSummary] = useState(entry.summary ?? "");
  const [editRecommendation, setEditRecommendation] = useState(String((entry.record ?? {}).recommendation ?? ""));
  const [affectedArea, setAffectedArea] = useState(String((entry.appliesToModules ?? []).includes("content_command") ? "content" : "research"));
  const [banks, setBanks] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const base = "/api/intelligence/inbox/" + encodeURIComponent(entry.recordType) + "/" + encodeURIComponent(entry.id);
  const record = entry.record ?? {};

  async function call(label: string, url: string, init: RequestInit) {
    setBusy(label);
    setMsg(null);
    try {
      const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok || j.ok === false) setMsg("Error: " + String(j.error ?? "HTTP " + r.status));
      else {
        setMsg(label + " saved.");
        onDone();
      }
    } catch (e) {
      setMsg("Error: " + String(e));
    }
    setBusy(null);
  }

  async function review(action: "approve" | "reject" | "needs_review" | "archive") {
    if (action === "reject" && !reason.trim()) {
      setMsg("Error: rejection reason is required.");
      return;
    }
    await call(action, base + "/review", { method: "POST", body: JSON.stringify({ action, reviewedBy: who, reason: reason.trim() || undefined }) });
  }

  async function saveEdit() {
    const patch: Record<string, unknown> = { summary: editSummary };
    if (entry.recordType === "insight") patch.recommendation = editRecommendation;
    await call("edit", base, { method: "PATCH", body: JSON.stringify({ editedBy: who, patch }) });
  }

  async function routeMemory() {
    await call("route", base + "/route-memory", {
      method: "POST",
      body: JSON.stringify({
        proposedBy: who,
        affectedArea,
        suggestedBankSlugs: banks.split(",").map((b) => b.trim()).filter(Boolean),
      }),
    });
  }

  async function merge() {
    if (!mergeInto.trim()) {
      setMsg("Error: primary id is required to merge.");
      return;
    }
    await call("merge", "/api/intelligence/inbox/merge", {
      method: "POST",
      body: JSON.stringify({
        recordType: entry.recordType,
        primaryId: mergeInto.trim(),
        duplicateId: entry.id,
        mergedBy: who,
        reason: reason.trim() || "Duplicate intelligence",
      }),
    });
  }

  return (
    <DetailDrawer
      title={entry.title}
      subtitle={entry.recordType + " / " + entry.id}
      tags={[
        { text: entry.recordType, color: C.blue },
        { text: entry.approvalStatus, color: statusColor(entry.approvalStatus) },
        { text: entry.agentSlug ? String(entry.agentSlug) : "agent unknown", color: C.gray },
        { text: "confidence " + String(entry.confidence ?? "n/a"), color: C.lime },
      ]}
      fields={[
        { label: "Summary", value: entry.summary },
        { label: "Sources", value: entry.sourceIds },
        { label: "Evidence items", value: entry.evidenceItemIds },
        { label: "Evidence insights", value: entry.evidenceInsightIds },
        { label: "Applies to modules", value: entry.appliesToModules },
        { label: "Freshness", value: entry.freshnessStatus },
        { label: "Created", value: fmtTime(entry.createdAt) },
        { label: "Updated", value: fmtTime(entry.updatedAt) },
      ]}
      raw={record}
      onClose={onClose}
    >
      <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div><div style={labelStyle}>ACTING AS</div><select value={who} onChange={(e) => setWho(e.target.value)} style={selectStyle}>{FOUNDERS.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
          <div style={{ flex: 1, minWidth: 220 }}><div style={labelStyle}>REJECT / MERGE REASON</div><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="required for rejection" style={inputStyle} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => review("approve")} disabled={Boolean(busy)} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy === "approve" ? "Saving..." : "Approve"}</button>
          <button onClick={() => review("needs_review")} disabled={Boolean(busy)} style={{ ...disabledBtn, opacity: 1, cursor: busy ? "wait" : "pointer" }}>Needs review</button>
          <button onClick={() => review("archive")} disabled={Boolean(busy)} style={{ ...disabledBtn, opacity: 1, cursor: busy ? "wait" : "pointer" }}>Archive</button>
          <button onClick={() => review("reject")} disabled={Boolean(busy)} style={{ ...rejectBtn, opacity: busy ? 0.6 : 1 }}>Reject</button>
        </div>
      </div>
      <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={labelStyle}>EDIT BEFORE TRUSTING</div>
        <textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
        {entry.recordType === "insight" ? <textarea value={editRecommendation} onChange={(e) => setEditRecommendation(e.target.value)} rows={3} placeholder="Recommendation" style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} /> : null}
        <button onClick={saveEdit} disabled={Boolean(busy)} style={{ ...primaryBtn, alignSelf: "flex-start", opacity: busy ? 0.6 : 1 }}>{busy === "edit" ? "Saving..." : "Save edit"}</button>
      </div>
      <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={labelStyle}>ROUTE INTO MEMORY APPROVAL</div>
        <div style={{ fontSize: 11.5, color: muted, lineHeight: 1.5 }}>This creates a memory proposal. It does not write trusted memory until the approval flow completes.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 170 }}><div style={labelStyle}>AREA</div><input value={affectedArea} onChange={(e) => setAffectedArea(e.target.value)} style={inputStyle} /></div>
          <div style={{ flex: 2, minWidth: 230 }}><div style={labelStyle}>BANKS <span style={{ color: faint, fontWeight: 400 }}>(comma separated, optional)</span></div><input value={banks} onChange={(e) => setBanks(e.target.value)} placeholder="content, hook_library, competitor" style={inputStyle} /></div>
        </div>
        <button onClick={routeMemory} disabled={Boolean(busy)} style={{ ...primaryBtn, alignSelf: "flex-start", opacity: busy ? 0.6 : 1 }}>{busy === "route" ? "Routing..." : "Create memory proposal"}</button>
      </div>
      <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={labelStyle}>MERGE / SUPERSEDE</div>
        <input value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} placeholder="primary intelligence id to keep" style={inputStyle} />
        <button onClick={merge} disabled={Boolean(busy)} style={{ ...disabledBtn, opacity: 1, cursor: busy ? "wait" : "pointer", alignSelf: "flex-start" }}>{busy === "merge" ? "Merging..." : "Mark this as duplicate"}</button>
      </div>
      {msg ? <div style={{ fontSize: 12.5, color: msg.startsWith("Error") ? C.orange : C.lime }}>{msg}</div> : null}
    </DetailDrawer>
  );
}

function IntelligenceControlBar({ onRan }: { onRan: () => void }) {
  const [scoutHandle, setScoutHandle] = useState("");
  const [tgt, setTgt] = useState({ name: "", platform: "instagram", handleOrUrl: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function post(url: string, body: Record<string, unknown>, key: string, okMsg: (j: Record<string, unknown>) => string) {
    setBusy(key); setMsg(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (r.ok && j.ok !== false) { setMsg(okMsg(j)); onRan(); } else setMsg("Error: " + String(j.error ?? r.status));
    } finally { setBusy(null); }
  }
  return (
    <Panel>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Drive the intelligence loop</div>
      <div style={{ fontSize: 11.5, color: faint, marginBottom: 10 }}>Add a competitor to watch, pull their recent posts, then let the analyst propose insights. Everything lands here as <b>pending</b> for your approval before any agent uses it.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <input value={tgt.name} onChange={(e) => setTgt((s) => ({ ...s, name: e.target.value }))} placeholder="Competitor name" style={{ ...inputStyle, width: 160 }} />
        <input value={tgt.handleOrUrl} onChange={(e) => setTgt((s) => ({ ...s, handleOrUrl: e.target.value }))} placeholder="@handle or URL" style={{ ...inputStyle, width: 160 }} />
        <button onClick={() => { if (!tgt.name.trim()) { setMsg("Name the competitor first."); return; } post("/api/intelligence/targets", { targetType: "competitor_account", name: tgt.name, platform: tgt.platform, handleOrUrl: tgt.handleOrUrl || undefined, cadence: "weekly" }, "target", () => `Added "${tgt.name}" to the watchlist.`); }} disabled={busy === "target"} style={busy === "target" ? disabledBtn : { ...primaryBtn, padding: "8px 12px", fontSize: 12 }}>{busy === "target" ? "…" : "+ Watch competitor"}</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={scoutHandle} onChange={(e) => setScoutHandle(e.target.value)} placeholder="IG @handle to scout now" style={{ ...inputStyle, width: 200 }} />
        <button onClick={() => { if (!scoutHandle.trim()) { setMsg("Enter a handle to scout."); return; } post("/api/intelligence/scout", { handleOrUrl: scoutHandle, platform: "instagram" }, "scout", (j) => j.configured === false ? "Set APIFY_API_KEY to enable the scout." : `Scouted — ${Number(j.found ?? 0)} posts ingested pending.`); }} disabled={busy === "scout"} style={busy === "scout" ? disabledBtn : { ...selectStyle, cursor: "pointer", padding: "8px 12px" }}>{busy === "scout" ? "Scouting…" : "⚡ Run scout"}</button>
        <button onClick={() => post("/api/intelligence/analyze", {}, "analyze", (j) => `Analyst proposed ${Number(j.proposedInsights ?? 0)} insight(s).`)} disabled={busy === "analyze"} style={busy === "analyze" ? disabledBtn : { ...selectStyle, cursor: "pointer", padding: "8px 12px" }}>{busy === "analyze" ? "Analyzing…" : "⚡ Run analyst"}</button>
      </div>
      {msg ? <div style={{ fontSize: 12, color: msg.startsWith("Error") ? C.orange : C.lime, marginTop: 9 }}>{msg}</div> : null}
    </Panel>
  );
}

function IntelligencePage() {
  const [status, setStatus] = useState("pending");
  const [selected, setSelected] = useState<IntelligenceEntry | null>(null);
  const statusParam = status === "active" ? "" : "&approvalStatus=" + encodeURIComponent(status);
  const s = useApi<{ entries: IntelligenceEntry[]; counts: Record<string, number> }>("/api/intelligence/inbox?limit=100" + statusParam);
  const guard = offlineIf(s);
  if (guard) return guard;
  const entries = s.data?.entries ?? [];
  const counts = s.data?.counts ?? {};
  const filters = ["pending", "needs_review", "approved", "rejected", "archived", "superseded", "active"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Pending" value={String(counts.pending ?? 0)} icon="Inbox" color={C.blue} sub="awaiting review" />
        <Kpi label="Needs review" value={String(counts.needs_review ?? 0)} icon="AlertCircle" color={C.orange} sub="requires founder judgment" />
        <Kpi label="Approved" value={String(counts.approved ?? 0)} icon="BadgeCheck" color={C.lime} sub="usable by context" />
        <Kpi label="Rejected" value={String(counts.rejected ?? 0)} icon="CircleSlash" color={C.orange} sub="reason stored" />
      </div>
      <IntelligenceControlBar onRan={() => s.reload()} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {filters.map((f) => <button key={f} onClick={() => setStatus(f)} style={toggleBtn(status === f)}>{f === "active" ? "Inbox default" : f}</button>)}
      </div>
      {entries.length === 0 ? (
        <StateBlock kind="empty" message="No intelligence records in this view. Research agents and source intake runs will populate this inbox before knowledge becomes trusted." />
      ) : (
        <div style={{ ...glass, padding: "8px 10px" }}>
          {entries.map((entry, i) => {
            const col = statusColor(entry.approvalStatus);
            return (
              <button key={entry.recordType + entry.id} onClick={() => setSelected(entry)} style={{ width: "100%", border: "none", background: "transparent", color: C.white, textAlign: "left", display: "flex", gap: 14, padding: 14, alignItems: "flex-start", cursor: "pointer", borderBottom: i < entries.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <span style={{ width: 36, height: 36, flex: "none", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: col, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}><Icon name={entry.recordType === "suggestion" ? "Lightbulb" : entry.recordType === "insight" ? "Sparkles" : "FileSearch"} size={16} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{entry.title}</span>
                    <Tag text={entry.recordType} color={C.blue} />
                    <Tag text={entry.approvalStatus} color={col} />
                    {entry.freshnessStatus ? <Tag text={entry.freshnessStatus} color={C.gray} /> : null}
                    {entry.priority ? <Tag text={entry.priority} color={C.orange} /> : null}
                  </div>
                  <div style={{ fontSize: 12.2, color: muted, lineHeight: 1.55, maxWidth: 860 }}>{entry.summary}</div>
                  <div style={{ fontSize: 10.8, color: faint, marginTop: 7 }}>
                    {entry.agentSlug ? "agent " + entry.agentSlug + " - " : ""}{(entry.sourceIds ?? []).length} sources - {(entry.evidenceItemIds ?? []).length} evidence items - {(entry.appliesToModules ?? []).join(", ") || "module not set"}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: faint, whiteSpace: "nowrap" }}>{fmtTime(entry.createdAt)}</span>
                <span style={{ color: faint, display: "inline-flex", alignItems: "center", paddingTop: 8 }}><Icon name="ChevronRight" size={16} /></span>
              </button>
            );
          })}
        </div>
      )}
      {selected ? <IntelligenceDrawer entry={selected} onClose={() => setSelected(null)} onDone={() => { s.reload(); }} /> : null}
    </div>
  );
}

type TasteProfile = {
  id: string;
  profileKey: string;
  scope: string;
  subjectId?: string | null;
  label: string;
  hardConstraints?: string[];
  preferenceWeights?: Record<string, number>;
  positiveSignals?: number;
  negativeSignals?: number;
  confidence?: string;
  lastFeedbackAt?: string | null;
  provenanceEventIds?: string[];
  metadata?: Record<string, unknown>;
};

type FeedbackEntry = {
  id: string;
  targetType: string;
  targetId: string;
  decision: string;
  reasonCategory?: string | null;
  reason?: string | null;
  actor: string;
  module?: string | null;
  agentSlug?: string | null;
  profileKeys?: string[];
  dimensions?: Array<{ key: string; value: string; weight?: number }>;
  createdAt?: string;
};

function topWeights(weights: Record<string, number> | undefined) {
  return Object.entries(weights ?? {})
    .sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1])))
    .slice(0, 10);
}

function TasteProfileDrawer({ profile, onClose }: { profile: TasteProfile; onClose: () => void }) {
  const detail = useApi<{ profile: TasteProfile; feedback: FeedbackEntry[] }>("/api/taste/profiles/" + encodeURIComponent(profile.profileKey));
  const full = detail.data?.profile ?? profile;
  const feedback = detail.data?.feedback ?? [];
  const weights = topWeights(full.preferenceWeights);
  return (
    <DetailDrawer
      title={full.label}
      subtitle={full.profileKey}
      tags={[
        { text: full.scope, color: full.scope === "brand" ? C.lime : full.scope === "founder" ? C.blue : C.gray },
        { text: String((Number(full.positiveSignals ?? 0) + Number(full.negativeSignals ?? 0))) + " signals", color: C.gray },
        { text: "confidence " + String(full.confidence ?? "0"), color: C.orange },
      ]}
      fields={[
        { label: "Subject", value: full.subjectId },
        { label: "Positive signals", value: full.positiveSignals },
        { label: "Negative signals", value: full.negativeSignals },
        { label: "Last feedback", value: fmtTime(full.lastFeedbackAt) },
        { label: "Hard constraints", value: full.hardConstraints },
        { label: "Provenance events", value: full.provenanceEventIds },
      ]}
      raw={full}
      onClose={onClose}
    >
      <div>
        <div style={labelStyle}>TOP LEARNED WEIGHTS</div>
        {weights.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
            {weights.map(([key, value]) => (
              <div key={key} style={{ ...card, padding: "10px 11px" }}>
                <div style={{ fontSize: 12.2, fontWeight: 600 }}>{key}</div>
                <div style={{ fontSize: 11, color: Number(value) >= 0 ? C.lime : C.orange, marginTop: 4 }}>{Number(value).toFixed(3)}</div>
              </div>
            ))}
          </div>
        ) : <StateBlock kind="empty" message="No preference weights yet. Approvals, edits, regenerations and rejections will train this profile." />}
      </div>
      <div>
        <div style={labelStyle}>RECENT FEEDBACK</div>
        {detail.loading ? <StateBlock kind="loading" /> : detail.error ? <StateBlock kind={detail.status === 503 ? "offline" : "error"} message={detail.error} /> : feedback.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {feedback.map((event) => (
              <div key={event.id} style={{ ...card, padding: "11px 12px" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <Tag text={event.decision} color={event.decision === "reject" || event.decision === "archive" ? C.orange : C.lime} />
                  <Tag text={event.actor} color={C.blue} />
                  {event.agentSlug ? <Tag text={event.agentSlug} color={C.gray} /> : null}
                </div>
                <div style={{ fontSize: 12, color: C.white }}>{event.targetType} - {event.targetId}</div>
                {event.reason ? <div style={{ fontSize: 11.5, color: muted, marginTop: 5, lineHeight: 1.45 }}>{event.reason}</div> : null}
                <div style={{ fontSize: 10.5, color: faint, marginTop: 6 }}>{fmtTime(event.createdAt)}</div>
              </div>
            ))}
          </div>
        ) : <StateBlock kind="empty" message="No feedback events connected to this profile yet." />}
      </div>
    </DetailDrawer>
  );
}

function TastePage() {
  const profilesState = useApi<{ profiles: TasteProfile[] }>("/api/taste/profiles?limit=200");
  const eventsState = useApi<{ events: FeedbackEntry[] }>("/api/taste/feedback?limit=60");
  const [selected, setSelected] = useState<TasteProfile | null>(null);
  const [actor, setActor] = useState(FOUNDERS[0]);
  const [decision, setDecision] = useState("approve");
  const [targetType, setTargetType] = useState("content_packet");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [dimensionKey, setDimensionKey] = useState("tone");
  const [dimensionValue, setDimensionValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const guard = offlineIf(profilesState) ?? offlineIf(eventsState);
  if (guard) return guard;

  const profiles = profilesState.data?.profiles ?? [];
  const events = eventsState.data?.events ?? [];
  const brandCount = profiles.filter((profile) => profile.scope === "brand").length;
  const founderCount = profiles.filter((profile) => profile.scope === "founder").length;
  const learnedSignals = profiles.reduce((sum, profile) => sum + Number(profile.positiveSignals ?? 0) + Number(profile.negativeSignals ?? 0), 0);
  const rejections = events.filter((event) => event.decision === "reject").length;

  async function submitFeedback() {
    setMessage(null);
    if (!targetId.trim()) {
      setMessage("Error: target id is required.");
      return;
    }
    if (decision === "reject" && !reason.trim()) {
      setMessage("Error: rejection reason is required.");
      return;
    }
    setBusy(true);
    try {
      const dimensions = dimensionValue.trim() ? [{ key: dimensionKey.trim() || "signal", value: dimensionValue.trim(), weight: 1 }] : [];
      const response = await fetch("/api/taste/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: targetType.trim(),
          targetId: targetId.trim(),
          decision,
          actor,
          reason: reason.trim() || undefined,
          reasonCategory: decision === "reject" ? "other" : undefined,
          module: "manual_dashboard",
          dimensions,
        }),
      });
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok || data.ok === false) setMessage("Error: " + String(data.error ?? "HTTP " + response.status));
      else {
        setMessage("Feedback recorded and taste profiles updated.");
        setTargetId("");
        setReason("");
        setDimensionValue("");
        profilesState.reload();
        eventsState.reload();
      }
    } catch (error) {
      setMessage("Error: " + String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Taste profiles" value={String(profiles.length)} icon="HeartHandshake" color={C.lime} sub={brandCount + " brand - " + founderCount + " founders"} />
        <Kpi label="Feedback events" value={String(events.length)} icon="MessageSquareText" color={C.blue} sub="approval/rejection learning" />
        <Kpi label="Signals learned" value={String(learnedSignals)} icon="Activity" color={C.lime} sub="positive + negative" />
        <Kpi label="Rejections" value={String(rejections)} icon="CircleSlash" color={C.orange} sub="reasons preserved" />
      </div>

      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Record explicit feedback</div>
            <div style={{ fontSize: 11.5, color: muted, marginTop: 4 }}>Use this for manual learning. Approval routes also record feedback automatically.</div>
          </div>
          <Tag text="BRAND TASTE STAYS PROTECTED" color={C.lime} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, alignItems: "end" }}>
          <div><div style={labelStyle}>ACTOR</div><select value={actor} onChange={(e) => setActor(e.target.value)} style={{ ...selectStyle, width: "100%" }}>{FOUNDERS.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
          <div><div style={labelStyle}>DECISION</div><select value={decision} onChange={(e) => setDecision(e.target.value)} style={{ ...selectStyle, width: "100%" }}>{["approve", "reject", "edit", "regenerate", "needs_review"].map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
          <div><div style={labelStyle}>TARGET TYPE</div><input value={targetType} onChange={(e) => setTargetType(e.target.value)} style={inputStyle} /></div>
          <div><div style={labelStyle}>TARGET ID</div><input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="packet_123" style={inputStyle} /></div>
          <div><div style={labelStyle}>SIGNAL KEY</div><input value={dimensionKey} onChange={(e) => setDimensionKey(e.target.value)} placeholder="hook_style" style={inputStyle} /></div>
          <div><div style={labelStyle}>SIGNAL VALUE</div><input value={dimensionValue} onChange={(e) => setDimensionValue(e.target.value)} placeholder="proof_led" style={inputStyle} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}><div style={labelStyle}>REASON <span style={{ color: decision === "reject" ? C.orange : faint, fontWeight: 400 }}>{decision === "reject" ? "required for rejection" : "optional but useful"}</span></div><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What should the OS learn?" style={inputStyle} /></div>
          <button onClick={submitFeedback} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving..." : "Record feedback"}</button>
        </div>
        {message ? <div style={{ fontSize: 12.5, color: message.startsWith("Error") ? C.orange : C.lime, marginTop: 10 }}>{message}</div> : null}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(320px,0.9fr)", gap: 16 }}>
        <Panel style={{ padding: "8px 10px" }}>
          {profiles.length ? profiles.map((profile, i) => {
            const total = Number(profile.positiveSignals ?? 0) + Number(profile.negativeSignals ?? 0);
            return (
              <button key={profile.profileKey} onClick={() => setSelected(profile)} style={{ width: "100%", border: "none", background: "transparent", color: C.white, textAlign: "left", display: "flex", gap: 14, padding: 14, alignItems: "center", cursor: "pointer", borderBottom: i < profiles.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: profile.scope === "brand" ? C.lime : C.blue, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}><Icon name={profile.scope === "brand" ? "ShieldCheck" : "HeartHandshake"} size={15} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{profile.label}</span>
                    <Tag text={profile.scope} color={profile.scope === "brand" ? C.lime : C.blue} />
                    <Tag text={profile.profileKey} color={C.gray} />
                  </div>
                  <div style={{ fontSize: 11.5, color: faint, marginTop: 5 }}>{total} signals - confidence {String(profile.confidence ?? "0")} - last {fmtTime(profile.lastFeedbackAt)}</div>
                </div>
                <span style={{ color: faint, display: "inline-flex", alignItems: "center" }}><Icon name="ChevronRight" size={16} /></span>
              </button>
            );
          }) : <StateBlock kind="empty" message="No taste profiles yet. Run the seed to create WOBBLE brand + founder taste profiles." />}
        </Panel>
        <Panel style={{ padding: "8px 10px" }}>
          {events.length ? events.slice(0, 12).map((event, i) => (
            <div key={event.id} style={{ display: "flex", gap: 12, padding: 12, borderBottom: i < Math.min(events.length, 12) - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <span style={{ width: 32, height: 32, flex: "none", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: event.decision === "reject" ? C.orange : C.lime, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}><Icon name={event.decision === "reject" ? "CircleSlash" : "BadgeCheck"} size={14} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 12.8, fontWeight: 600 }}>{event.targetType}</span>
                  <Tag text={event.decision} color={event.decision === "reject" ? C.orange : C.lime} />
                  <Tag text={event.actor} color={C.blue} />
                </div>
                <div style={{ fontSize: 11, color: faint, marginTop: 5 }}>{event.targetId} - {(event.profileKeys ?? []).join(", ")}</div>
                {event.reason ? <div style={{ fontSize: 11.2, color: muted, marginTop: 5, lineHeight: 1.45 }}>{event.reason}</div> : null}
              </div>
            </div>
          )) : <StateBlock kind="empty" message="No feedback events yet. Approvals and manual feedback will appear here." />}
        </Panel>
      </div>
      {selected ? <TasteProfileDrawer profile={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

interface KnowledgeNote {
  id: string;
  noteType: string;
  topic: string;
  area: string;
  title: string;
  content: string;
  confidence: string | null;
  trustLevel: string;
  timesReinforced: number;
  bankSlugs: string[];
  sourceIds: string[];
  provenanceChunkIds: string[];
  createdAt: string;
  similarity?: number | null;
}
interface RetrievedChunk {
  id: string;
  sourceId: string | null;
  content: string;
  similarity: number;
}

const NOTE_TYPE_COLOR: Record<string, string> = {
  claim: C.blue,
  insight: C.lime,
  framework: "#B87CFF",
  hook_pattern: C.orange,
  objection: "#FF7C9C",
  data_point: "#2DD4BF",
  definition: C.gray,
  process: "#F5C542",
};
const noteColor = (t: string) => NOTE_TYPE_COLOR[t] ?? C.gray;

function LearningPage() {
  const notesState = useApi<{ notes: KnowledgeNote[] }>("/api/knowledge/notes?limit=120");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [retrieval, setRetrieval] = useState<{ notes: KnowledgeNote[]; chunks: RetrievedChunk[]; embedded: boolean } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const guard = offlineIf(notesState);
  if (guard) return guard;

  const notes = notesState.data?.notes ?? [];
  const types = [...new Set(notes.map((n) => n.noteType))].sort();
  const topics = new Set(notes.map((n) => n.topic));
  const reinforced = notes.reduce((s, n) => s + (n.timesReinforced ?? 0), 0);
  const shown = typeFilter ? notes.filter((n) => n.noteType === typeFilter) : notes;

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setSearchErr(null);
    try {
      const r = await fetch("/api/knowledge/retrieve?query=" + encodeURIComponent(query.trim()) + "&limit=6&chunkLimit=4");
      const j = (await r.json()) as { ok?: boolean; error?: string; notes?: KnowledgeNote[]; chunks?: RetrievedChunk[]; embedded?: boolean };
      if (!r.ok || j.ok === false) {
        setSearchErr(String(j.error ?? "HTTP " + r.status));
        setRetrieval(null);
      } else setRetrieval({ notes: j.notes ?? [], chunks: j.chunks ?? [], embedded: Boolean(j.embedded) });
    } catch (e) {
      setSearchErr(String(e));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Knowledge notes" value={String(notes.length)} icon="BookOpen" color={C.lime} sub="compiled + interlinked" />
        <Kpi label="Distinct topics" value={String(topics.size)} icon="Hash" color={C.blue} />
        <Kpi label="Reinforcements" value={String(reinforced)} icon="TrendingUp" color={C.orange} sub="times knowledge compounded" />
        <Kpi label="Note types" value={String(types.length)} icon="Shapes" color="#B87CFF" />
      </div>

      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ color: C.lime, display: "inline-flex" }}><Icon name="GraduationCap" size={16} /></span>
          <div style={{ fontSize: 14, fontWeight: 600 }}>The Knowledge Compiler</div>
          <StatusPill label="LIVE" color={C.lime} />
        </div>
        <div style={{ fontSize: 12.8, color: muted, lineHeight: 1.55, maxWidth: 720 }}>
          Every approved source is <b>compiled</b> — not summarized — into atomic, self-contained notes (a claim, insight, framework, hook, objection or data point), each grounded in exactly where it came from. Knowledge that repeats an existing note <b>reinforces</b> it instead of duplicating, so the brain compounds. Agents read this through one retrieval contract, so new knowledge is used on their next run with no code change.
        </div>
      </Panel>

      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Ask the knowledge base</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} placeholder="e.g. how should I open a cold email?" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={runSearch} disabled={searching || !query.trim()} style={searching || !query.trim() ? disabledBtn : primaryBtn}>{searching ? "Searching…" : "Retrieve"}</button>
        </div>
        {searchErr ? <div style={{ fontSize: 12, color: C.orange, marginTop: 10 }}>{searchErr}</div> : null}
        {retrieval ? (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {!retrieval.embedded ? <div style={{ fontSize: 11.5, color: faint }}>No embeddings key configured — showing recent notes instead of a semantic match.</div> : null}
            {retrieval.notes.length === 0 ? (
              <div style={{ fontSize: 12.5, color: muted }}>No matching knowledge yet.</div>
            ) : (
              retrieval.notes.map((n) => (
                <div key={n.id} style={{ ...card, padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5 }}>
                    <Tag text={n.noteType.replace(/_/g, " ")} color={noteColor(n.noteType)} />
                    <span style={{ fontSize: 11, color: faint }}>{n.topic}</span>
                    {typeof n.similarity === "number" ? <span style={{ fontSize: 10.5, color: C.lime, marginLeft: "auto" }}>{(n.similarity * 100).toFixed(0)}% match</span> : null}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
                  <div style={{ fontSize: 12.3, color: muted, marginTop: 4, lineHeight: 1.5 }}>{n.content}</div>
                </div>
              ))
            )}
            {retrieval.chunks.length ? <div style={{ fontSize: 10.5, letterSpacing: "0.1em", color: faint, marginTop: 4 }}>SUPPORTING RAW SOURCE CHUNKS</div> : null}
            {retrieval.chunks.map((c) => (
              <div key={c.id} style={{ fontSize: 12, color: muted, padding: "8px 12px", borderLeft: "2px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.02)", lineHeight: 1.5 }}>{c.content}</div>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Compiled knowledge ({shown.length})</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setTypeFilter(null)} style={toggleBtn(typeFilter === null)}>all</button>
            {types.map((t) => <button key={t} onClick={() => setTypeFilter(t)} style={toggleBtn(typeFilter === t)}>{t.replace(/_/g, " ")}</button>)}
          </div>
        </div>
        {shown.length === 0 ? (
          <StateBlock kind="empty" message="No compiled knowledge yet. Approve a source in the Source Registry and the Knowledge Compiler turns it into notes here automatically." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {shown.map((n) => (
              <div key={n.id} style={{ ...card, padding: "13px 15px" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                  <Tag text={n.noteType.replace(/_/g, " ")} color={noteColor(n.noteType)} />
                  <span style={{ fontSize: 11, color: faint }}>{n.topic}</span>
                  {n.timesReinforced > 0 ? <span style={{ fontSize: 10.5, color: C.orange, display: "inline-flex", alignItems: "center", gap: 3 }}><Icon name="TrendingUp" size={11} />{n.timesReinforced}×</span> : null}
                  <span style={{ marginLeft: "auto", fontSize: 10.5, color: faint }}>{n.provenanceChunkIds?.length ?? 0} chunks cited</span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{n.title}</div>
                <div style={{ fontSize: 12.5, color: muted, marginTop: 4, lineHeight: 1.5 }}>{n.content}</div>
                {n.bankSlugs?.length ? <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>{n.bankSlugs.map((b) => <Tag key={b} text={b} color={C.gray} />)}</div> : null}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

interface LibMediaRef {
  url?: string;
  path?: string;
  kind?: string;
  order?: number;
}
interface LibAsset {
  id: string;
  title: string;
  kind: string;
  caption: string | null;
  mediaRefs: LibMediaRef[];
  platforms: string[];
  tags: string[];
  status: string;
  sourceType: string;
  sourcePacketId: string | null;
  createdAt: string;
}

function assetMediaUrl(id: string, opts: { download?: boolean; i?: number } = {}): string {
  const params = new URLSearchParams();
  if (opts.i) params.set("i", String(opts.i));
  if (opts.download) params.set("download", "1");
  const qs = params.toString();
  return `/api/library/assets/${id}/media${qs ? "?" + qs : ""}`;
}

function isVideoAsset(asset: LibAsset): boolean {
  return asset.kind === "reel" || asset.kind === "video" || asset.mediaRefs?.[0]?.kind === "video";
}

/** Reel media that auto-plays (muted, looping) only while visible, and pauses off-screen. */
function ReelMedia({ id, rounded = true }: { id: string; rounded?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) el.play().catch(() => {});
          else el.pause();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <video
      ref={ref}
      src={assetMediaUrl(id)}
      muted
      loop
      playsInline
      preload="metadata"
      style={{ width: "100%", height: "auto", display: "block", borderRadius: rounded ? 8 : 0, background: "#0a0a0c" }}
    />
  );
}

/**
 * Adaptive media thumbnail — keeps the media's true aspect ratio (3:4 statics, 9:16 reels,
 * landscape, whatever). Images lazy-load; reels auto-play when scrolled into view.
 */
function AssetThumb({ asset }: { asset: LibAsset }) {
  const hasMedia = Array.isArray(asset.mediaRefs) && asset.mediaRefs.length > 0;
  if (!hasMedia) {
    return <div style={{ width: "100%", height: 120, borderRadius: 8, background: "#0c0c0e", display: "flex", alignItems: "center", justifyContent: "center", color: faint, fontSize: 11, border: "1px solid rgba(255,255,255,0.06)" }}>No media</div>;
  }
  if (isVideoAsset(asset)) return <ReelMedia id={asset.id} />;
  return <img src={assetMediaUrl(asset.id)} loading="lazy" alt={asset.title} style={{ width: "100%", height: "auto", display: "block", borderRadius: 8, background: "#0c0c0e" }} />;
}

const MARK_PLATFORMS: { key: string; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
];

interface FeedPlanItemUI {
  assetId: string;
  title: string;
  kind: string;
  angle: string;
  product: string;
  order: number;
  scheduledAt: string;
  platform: string;
}

/** Review the Content Director's proposed feed sequence, then approve to schedule it all. */
function PlanFeedModal({ plan, onClose, onApplied }: { plan: { items: FeedPlanItemUI[]; summary: string }; onClose: () => void; onApplied: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function apply() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/library/plan/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: plan.items.map((i) => ({ assetId: i.assetId, scheduledAt: i.scheduledAt, platform: i.platform })) }) });
      const j = (await r.json()) as { ok?: boolean; scheduled?: number; error?: string };
      if (!r.ok || j.ok === false) setMsg("Error: " + String(j.error ?? "HTTP " + r.status));
      else onApplied();
    } catch (e) { setMsg("Error: " + String(e)); } finally { setBusy(false); }
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(720px,96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#141417", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, boxShadow: "0 24px 80px rgba(0,0,0,0.6)", overflow: "hidden" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>✨ Proposed feed plan</div>
            <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "4px 9px", fontSize: 13 }}>✕</button>
          </div>
          <div style={{ fontSize: 12, color: muted, marginTop: 6, lineHeight: 1.5 }}>{plan.summary}</div>
          <div style={{ fontSize: 11, color: faint, marginTop: 6 }}>Nothing is scheduled until you approve. Order spreads angle + product; reels are interleaved. (Color/vision sequencing comes next.)</div>
        </div>
        <div style={{ overflow: "auto", padding: "10px 14px", flex: 1 }}>
          {plan.items.map((it) => (
            <div key={it.assetId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 4px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontSize: 11, color: faint, width: 26, textAlign: "right" }}>{it.order + 1}</span>
              <Tag text={it.kind} color={it.kind === "reel" ? "#2DD4BF" : "#B87CFF"} />
              <span style={{ fontSize: 12, flex: 1, minWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
              <span style={{ fontSize: 10.5, color: faint }}>{it.angle} · {it.product}</span>
              <span style={{ fontSize: 11, color: muted, minWidth: 118, textAlign: "right" }}>{fmtTime(it.scheduledAt)}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={apply} disabled={busy} style={{ ...primaryBtn, padding: "8px 14px" }}>{busy ? "Scheduling…" : `Approve & schedule all (${plan.items.length})`}</button>
          <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "8px 14px" }}>Cancel</button>
          {msg ? <span style={{ fontSize: 12, color: C.orange }}>{msg}</span> : null}
        </div>
      </div>
    </div>
  );
}

/** Per-platform posting control: shows this asset's state on one platform + Mark posted / Schedule. */
function PlatformRow({ asset, platform, label, posts, onChanged }: { asset: LibAsset; platform: string; label: string; posts: SchedPost[]; onChanged: () => void }) {
  const mine = posts.filter((p) => p.assetId === asset.id && p.platform === platform);
  const published = mine.find((p) => p.status === "published");
  const scheduled = mine.find((p) => p.status === "scheduled");
  const [mode, setMode] = useState<null | "confirm" | "schedule">(null);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);

  async function markPosted() {
    setBusy(true);
    try {
      await fetch(`/api/library/assets/${asset.id}/mark-posted`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform }) });
      setMode(null); onChanged();
    } finally { setBusy(false); }
  }
  async function doSchedule() {
    if (!when) return;
    setBusy(true);
    try {
      await fetch(`/api/library/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: asset.id, platform, scheduledAt: new Date(when).toISOString(), publisher: "manual" }) });
      setMode(null); setWhen(""); onChanged();
    } finally { setBusy(false); }
  }
  const sm = { padding: "5px 10px", fontSize: 11.5 } as const;

  return (
    <div style={{ ...card, padding: "9px 11px", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 74 }}>{label}</span>
        {published ? <Tag text={`Posted ✓ ${fmtTime(published.publishedAt ?? published.scheduledAt)}`} color={C.lime} />
          : scheduled ? <Tag text={`Scheduled ${fmtTime(scheduled.scheduledAt)}`} color={C.blue} />
          : <span style={{ fontSize: 11.5, color: faint }}>Not posted</span>}
      </div>
      {!published ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {mode === null ? (
            <>
              <button onClick={() => setMode("confirm")} disabled={busy} style={{ ...primaryBtn, ...sm }}>Mark posted</button>
              <button onClick={() => setMode("schedule")} disabled={busy} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", ...sm }}>Schedule</button>
              <span title="Auto-posting arrives when Zernio is wired" style={{ ...disabledBtn, ...sm, cursor: "not-allowed" }}>Post now · soon</span>
            </>
          ) : mode === "confirm" ? (
            <>
              <span style={{ fontSize: 11.5, color: muted }}>Confirm you posted this to {label}?</span>
              <button onClick={markPosted} disabled={busy} style={{ ...primaryBtn, ...sm }}>{busy ? "…" : "Yes, mark posted"}</button>
              <button onClick={() => setMode(null)} disabled={busy} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", ...sm }}>Cancel</button>
            </>
          ) : (
            <>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ ...inputStyle, width: "auto", fontSize: 11.5, padding: "5px 8px" }} />
              <button onClick={doSchedule} disabled={busy || !when} style={{ ...primaryBtn, ...sm }}>{busy ? "…" : "Set"}</button>
              <button onClick={() => setMode(null)} disabled={busy} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", ...sm }}>Cancel</button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Full preview overlay: large media, full caption (copyable), per-platform posting, Download. */
function AssetPreviewModal({ asset, posts, onClose, onChanged }: { asset: LibAsset; posts: SchedPost[]; onClose: () => void; onChanged: () => void }) {
  const [copied, setCopied] = useState(false);
  const isVideo = isVideoAsset(asset);
  async function copyCaption() {
    try { await navigator.clipboard.writeText(asset.caption ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(940px,96vw)", maxHeight: "92vh", overflow: "auto", padding: 0, display: "grid", gridTemplateColumns: "minmax(0,1.05fr) minmax(0,1fr)", background: "#141417", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ background: "#08080a", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320 }}>
          {asset.mediaRefs?.length ? (
            isVideo
              ? <video src={assetMediaUrl(asset.id)} controls autoPlay muted loop playsInline style={{ width: "100%", maxHeight: "92vh", objectFit: "contain", display: "block" }} />
              : <img src={assetMediaUrl(asset.id)} alt={asset.title} style={{ width: "100%", maxHeight: "92vh", objectFit: "contain", display: "block" }} />
          ) : <div style={{ color: faint, fontSize: 12, padding: 40 }}>No media on this asset</div>}
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, minWidth: 0, background: "#141417" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Tag text={asset.kind} color="#B87CFF" />
              <Tag text={asset.status} color={asset.status === "published" ? C.lime : asset.status === "scheduled" ? C.blue : C.gray} />
            </div>
            <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "4px 9px", fontSize: 13 }}>✕</button>
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.35 }}>{asset.title}</div>
          {asset.caption ? <div style={{ fontSize: 12.5, color: muted, whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: "30vh", overflow: "auto", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 11 }}>{asset.caption}</div> : <div style={{ fontSize: 12, color: faint }}>No caption.</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href={assetMediaUrl(asset.id, { download: true })} download style={{ ...primaryBtn, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", fontSize: 12 }}><Icon name="Download" size={14} /> Download original</a>
            {asset.caption ? <button onClick={copyCaption} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "6px 11px", fontSize: 12 }}>{copied ? "Caption copied ✓" : "Copy caption"}</button> : null}
          </div>
          <div style={{ fontSize: 11, color: faint, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>Posting</div>
          {MARK_PLATFORMS.map((p) => <PlatformRow key={p.key} asset={asset} platform={p.key} label={p.label} posts={posts} onChanged={onChanged} />)}
        </div>
      </div>
    </div>
  );
}
interface SchedPost {
  id: string;
  assetId: string;
  platform: string;
  scheduledAt: string;
  status: string;
  publisher: string;
  publisherRef: string | null;
  publishedAt: string | null;
}

const POST_STATUS_COLOR: Record<string, string> = { scheduled: C.blue, publishing: "#F5C542", published: C.lime, failed: C.orange, canceled: C.gray };
const LIB_PLATFORMS = ["instagram", "facebook", "linkedin", "x", "youtube", "tiktok"];

function LibraryPage() {
  const assetsState = useApi<{ assets: LibAsset[] }>("/api/library/assets?limit=500");
  const postsState = useApi<{ posts: SchedPost[] }>("/api/library/scheduled?limit=200");
  const [assetId, setAssetId] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [when, setWhen] = useState("");
  const [publisher, setPublisher] = useState("manual");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<LibAsset | null>(null);
  const [shown, setShown] = useState(36);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all"); // all | image | reel
  const [postedFilter, setPostedFilter] = useState("all"); // all | posted | unposted
  const [sortBy, setSortBy] = useState("type"); // type | title | recent
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ items: FeedPlanItemUI[]; summary: string } | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const guard = offlineIf(assetsState) ?? offlineIf(postsState);
  if (guard) return guard;

  const assets = assetsState.data?.assets ?? [];
  const posts = postsState.data?.posts ?? [];
  const scheduled = posts.filter((p) => p.status === "scheduled").length;
  const published = posts.filter((p) => p.status === "published").length;
  const fromCommand = assets.filter((a) => a.sourceType === "content_pack").length;

  // Per-asset per-platform posted state (from published posts).
  const postedPlatforms = (assetId: string): string[] => posts.filter((p) => p.assetId === assetId && p.status === "published").map((p) => p.platform);
  const isPosted = (assetId: string): boolean => postedPlatforms(assetId).length > 0;

  // Search (title + caption + tags), filter (kind + posted), sort.
  const q = search.trim().toLowerCase();
  const filtered = assets.filter((a) => {
    if (kindFilter === "image" && isVideoAsset(a)) return false;
    if (kindFilter === "reel" && !isVideoAsset(a)) return false;
    if (postedFilter === "posted" && !isPosted(a.id)) return false;
    if (postedFilter === "unposted" && isPosted(a.id)) return false;
    if (!q) return true;
    return (a.title + " " + (a.caption ?? "") + " " + (a.tags ?? []).join(" ")).toLowerCase().includes(q);
  });
  const gridAssets = [...filtered].sort((a, b) => {
    if (sortBy === "title") return a.title.localeCompare(b.title);
    if (sortBy === "recent") return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    // "type": images first (real thumbnails), reels after; stable within kind.
    return (a.kind === "reel" ? 1 : 0) - (b.kind === "reel" ? 1 : 0);
  });

  async function reload() { assetsState.reload(); postsState.reload(); }
  async function runPlan() {
    setPlanBusy(true);
    try {
      const r = await fetch("/api/library/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ perDay: 1, hoursOfDay: [18], reelEvery: 6 }) });
      const j = (await r.json()) as { ok?: boolean; items?: FeedPlanItemUI[]; summary?: string; error?: string };
      if (r.ok && j.ok !== false && j.items) setPlan({ items: j.items, summary: j.summary ?? "" });
    } finally { setPlanBusy(false); }
  }
  async function doSchedule() {
    setMsg(null);
    if (!assetId) { setMsg("Pick an asset to schedule."); return; }
    if (!when) { setMsg("Pick a date + time."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/library/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId, platform, scheduledAt: new Date(when).toISOString(), publisher }) });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) setMsg("Error: " + String(j.error ?? "HTTP " + r.status));
      else { setMsg("Scheduled."); setWhen(""); setAssetId(""); reload(); }
    } catch (e) { setMsg("Error: " + String(e)); } finally { setBusy(false); }
  }
  async function postAction(id: string, action: "cancel" | "publish" | "delete") {
    await fetch(`/api/library/scheduled/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    reload();
  }
  function PostRow({ p }: { p: SchedPost }) {
    const asset = assets.find((a) => a.id === p.assetId);
    const removing = confirmRemoveId === p.id;
    return (
      <div style={{ ...card, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Tag text={p.platform} color={C.blue} />
        <Tag text={p.status} color={POST_STATUS_COLOR[p.status] ?? C.gray} />
        <span style={{ fontSize: 12.5, color: C.white, flex: 1, minWidth: 140 }}>{asset?.title ?? p.assetId}</span>
        <span style={{ fontSize: 11, color: faint }}>{fmtTime(p.publishedAt ?? p.scheduledAt)} · {p.publisher}</span>
        {removing ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: muted }}>Remove this record?</span>
            <button onClick={() => { postAction(p.id, "delete"); setConfirmRemoveId(null); }} style={{ ...primaryBtn, padding: "6px 11px", fontSize: 11.5 }}>Yes</button>
            <button onClick={() => setConfirmRemoveId(null)} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "6px 11px", fontSize: 11.5 }}>No</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            {p.status === "scheduled" ? (
              <>
                {p.publisher === "manual" ? <button onClick={() => postAction(p.id, "publish")} style={{ ...primaryBtn, padding: "6px 11px", fontSize: 11.5 }}>Mark posted</button> : null}
                <button onClick={() => postAction(p.id, "cancel")} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "6px 11px", fontSize: 11.5 }}>Cancel</button>
              </>
            ) : (
              <button onClick={() => setConfirmRemoveId(p.id)} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "6px 11px", fontSize: 11.5 }}>Remove</button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Library assets" value={String(assets.length)} icon="LibraryBig" color={C.lime} />
        <Kpi label="Scheduled" value={String(scheduled)} icon="CalendarClock" color={C.blue} sub="in the queue" />
        <Kpi label="Published" value={String(published)} icon="Send" color="#2DD4BF" />
        <Kpi label="From Content Command" value={String(fromCommand)} icon="PenTool" color="#B87CFF" sub="approved packs" />
      </div>

      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ color: C.lime, display: "inline-flex" }}><Icon name="CalendarClock" size={16} /></span>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Library &amp; Scheduler</div>
          <StatusPill label="LIVE" color={C.lime} />
        </div>
        <div style={{ fontSize: 12.6, color: muted, lineHeight: 1.55, maxWidth: 720 }}>
          Your content lives here — imported assets and packs approved from Content Command. Queue any asset to a platform at a time. Posting is <b>provider-agnostic</b>: <b>manual</b> (prep the post, you fire it + mark done — zero setup) now, and a unified social API (connect accounts once, no Meta app review) as a flip-the-switch upgrade.
        </div>
      </Panel>

      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Schedule a post</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)} style={{ ...selectStyle, minWidth: 200 }}>
            <option value="">Pick an asset…</option>
            {assets.filter((a) => a.status !== "archived").map((a) => <option key={a.id} value={a.id}>{a.title.slice(0, 50)}</option>)}
          </select>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={selectStyle}>
            {LIB_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
          <select value={publisher} onChange={(e) => setPublisher(e.target.value)} style={selectStyle}>
            <option value="manual">manual</option>
            <option value="zernio">zernio</option>
            <option value="ayrshare">ayrshare</option>
            <option value="n8n">n8n</option>
          </select>
          <button onClick={doSchedule} disabled={busy} style={busy ? disabledBtn : primaryBtn}>{busy ? "…" : "Schedule"}</button>
        </div>
        {msg ? <div style={{ fontSize: 12, color: msg.startsWith("Error") ? C.orange : C.lime, marginTop: 8 }}>{msg}</div> : null}
      </Panel>

      {(() => {
        const queuePosts = posts.filter((p) => p.status === "scheduled" || p.status === "publishing");
        const postedPosts = posts.filter((p) => p.status === "published");
        const otherPosts = posts.filter((p) => p.status === "failed" || p.status === "canceled");
        const Section = ({ title, color, list, empty }: { title: string; color: string; list: SchedPost[]; empty: string }) => (
          <Panel>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
              <Tag text={String(list.length)} color={color} />
            </div>
            {list.length === 0 ? <StateBlock kind="empty" message={empty} /> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{list.map((p) => <PostRow key={p.id} p={p} />)}</div>
            )}
          </Panel>
        );
        return (
          <>
            <Section title="Scheduled — in the queue" color={C.blue} list={queuePosts} empty="Nothing scheduled. Schedule an asset above, or use Plan my feed." />
            {postedPosts.length ? <Section title="Posted — already live" color={C.lime} list={postedPosts} empty="Nothing posted yet." /> : null}
            {otherPosts.length ? <Section title="Failed / cancelled" color={C.orange} list={otherPosts} empty="None." /> : null}
          </>
        );
      })()}

      <Panel>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Library <span style={{ color: faint, fontWeight: 400 }}>({gridAssets.length}{gridAssets.length !== assets.length ? ` of ${assets.length}` : ""})</span></div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
            <input value={search} onChange={(e) => { setSearch(e.target.value); setShown(36); }} placeholder="Search caption, title, tag…" style={{ ...inputStyle, width: 220 }} />
            <select value={kindFilter} onChange={(e) => { setKindFilter(e.target.value); setShown(36); }} style={selectStyle}>
              <option value="all">All types</option>
              <option value="image">Images</option>
              <option value="reel">Reels</option>
            </select>
            <select value={postedFilter} onChange={(e) => { setPostedFilter(e.target.value); setShown(36); }} style={selectStyle}>
              <option value="all">All</option>
              <option value="unposted">Not posted</option>
              <option value="posted">Posted</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
              <option value="type">Sort: Type</option>
              <option value="title">Sort: A–Z</option>
              <option value="recent">Sort: Newest</option>
            </select>
            <button onClick={runPlan} disabled={planBusy} title="Let the Content Director sequence your whole feed" style={{ ...primaryBtn, padding: "7px 12px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>{planBusy ? "Planning…" : "✨ Plan my feed"}</button>
          </div>
        </div>
        {assets.length === 0 ? (
          <StateBlock kind="empty" message="No assets yet. Approve a pack in Content Command (it lands here automatically) or import your existing content." />
        ) : gridAssets.length === 0 ? (
          <StateBlock kind="empty" message="No assets match your search / filters." />
        ) : (
          <>
          <div style={{ columnWidth: 224, columnGap: 12 }}>
            {gridAssets.slice(0, shown).map((a) => {
              const igPosted = postedPlatforms(a.id).includes("instagram");
              const liPosted = postedPlatforms(a.id).includes("linkedin");
              return (
              <div key={a.id} onClick={() => setPreview(a)} title="Click to preview" style={{ ...card, padding: 0, overflow: "hidden", cursor: "pointer", breakInside: "avoid", marginBottom: 12, display: "inline-block", width: "100%" }}>
                <div style={{ padding: 6 }}><AssetThumb asset={a} /></div>
                <div style={{ padding: "2px 12px 12px" }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <Tag text={a.kind} color="#B87CFF" />
                    {igPosted ? <Tag text="IG ✓" color={C.lime} /> : null}
                    {liPosted ? <Tag text="in ✓" color={C.lime} /> : null}
                    {a.sourceType === "content_pack" ? <Tag text="from command" color="#2DD4BF" /> : null}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35 }}>{a.title}</div>
                  {a.caption ? <div style={{ fontSize: 11.5, color: muted, marginTop: 5, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.caption}</div> : null}
                  <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                    <a href={assetMediaUrl(a.id, { download: true })} download onClick={(e) => e.stopPropagation()} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", textDecoration: "none", padding: "5px 10px", fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="Download" size={13} /> Download</a>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
          {gridAssets.length > shown ? (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
              <button onClick={() => setShown((n) => n + 36)} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Show more ({gridAssets.length - shown} left)</button>
            </div>
          ) : null}
          </>
        )}
      </Panel>
      {preview ? <AssetPreviewModal asset={preview} posts={posts} onClose={() => setPreview(null)} onChanged={reload} /> : null}
      {plan ? <PlanFeedModal plan={plan} onClose={() => setPlan(null)} onApplied={() => { setPlan(null); reload(); }} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Pipeline / CRM + Finance

const STAGE_LABELS: Record<string, string> = {
  new_lead: "New Lead", contacted: "Contacted", qualified: "Qualified", ai_readiness_call_booked: "Readiness Call",
  call_completed: "Call Done", paid_audit_offered: "Audit Offered", paid_audit_sold: "Audit Sold",
  audit_in_progress: "Audit In Progress", audit_delivered: "Audit Delivered", proposal_sent: "Proposal Sent",
  negotiation: "Negotiation", won: "Won", lost: "Lost", nurture: "Nurture",
};
const STAGE_ORDER = Object.keys(STAGE_LABELS);
const money = (cents: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format((cents ?? 0) / 100);

interface CrmOpp { id: string; name: string; companyId: string; stage: string; valueCents: number; currency: string; probability: number; priority: string; status: string; serviceInterest: string[] }
interface CrmLead { id: string; name: string; source: string | null; score: number; status: string; intentLevel: string; problemStated: string | null; serviceInterest: string[]; convertedOpportunityId: string | null }
interface CrmCompany { id: string; name: string; status: string }

const LEVELS_UI = ["unknown", "low", "medium", "high"];
const LEAD_SOURCES = ["manual", "referral", "inbound", "cold_email", "cold_call", "instagram", "linkedin", "website_form", "whatsapp", "import"];
const fieldLabel: React.CSSProperties = { fontSize: 10.5, color: "#8a8a95", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3, display: "block" };

/** Full lead-capture form — contact + company + qualification, per the ERP brief's Leads spec. */
function AddLeadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ name: "", contactName: "", email: "", phone: "", whatsapp: "", companyName: "", website: "", industry: "", source: "manual", campaign: "", intentLevel: "medium", budgetLevel: "unknown", urgencyLevel: "unknown", fitLevel: "unknown", serviceInterest: "", assignedOwner: "", problemStated: "" });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const F = ({ k, label, w = 1, ph }: { k: string; label: string; w?: number; ph?: string }) => (
    <div style={{ gridColumn: `span ${w}` }}><label style={fieldLabel}>{label}</label><input value={f[k]} onChange={set(k)} placeholder={ph} style={{ ...inputStyle, width: "100%" }} /></div>
  );
  const Sel = ({ k, label, opts }: { k: string; label: string; opts: string[] }) => (
    <div><label style={fieldLabel}>{label}</label><select value={f[k]} onChange={set(k)} style={{ ...selectStyle, width: "100%" }}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
  );
  async function save() {
    if (!f.name.trim() && !f.companyName.trim()) { setMsg("Enter a lead name or company."); return; }
    setBusy(true); setMsg(null);
    try {
      const body = { name: f.name || f.companyName, contactName: f.contactName || undefined, email: f.email || undefined, phone: f.phone || undefined, whatsapp: f.whatsapp || undefined, companyName: f.companyName || undefined, website: f.website || undefined, industry: f.industry || undefined, source: f.source, campaign: f.campaign || undefined, intentLevel: f.intentLevel, budgetLevel: f.budgetLevel, urgencyLevel: f.urgencyLevel, fitLevel: f.fitLevel, serviceInterest: f.serviceInterest ? f.serviceInterest.split(",").map((s) => s.trim()).filter(Boolean) : [], assignedOwner: f.assignedOwner || undefined, problemStated: f.problemStated || undefined };
      const r = await fetch("/api/crm/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) onSaved(); else { const j = await r.json().catch(() => ({})); setMsg("Error: " + (j.error ?? r.status)); }
    } finally { setBusy(false); }
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(680px,96vw)", maxHeight: "92vh", overflow: "auto", background: "#141417", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><div style={{ fontSize: 15, fontWeight: 700 }}>New lead</div><button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "4px 9px", fontSize: 13 }}>✕</button></div>
        <div style={{ fontSize: 11, color: faint, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Contact</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <F k="contactName" label="Contact name" /><F k="email" label="Email" ph="name@company.com" /><F k="phone" label="Phone" /><F k="whatsapp" label="WhatsApp" />
        </div>
        <div style={{ fontSize: 11, color: faint, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Company</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <F k="companyName" label="Company name" /><F k="website" label="Website" /><F k="industry" label="Industry" /><F k="name" label="Lead label (optional)" ph="defaults to company" />
        </div>
        <div style={{ fontSize: 11, color: faint, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Qualification</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <Sel k="intentLevel" label="Intent" opts={LEVELS_UI} /><Sel k="budgetLevel" label="Budget" opts={LEVELS_UI} /><Sel k="urgencyLevel" label="Urgency" opts={LEVELS_UI} /><Sel k="fitLevel" label="Fit" opts={LEVELS_UI} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <Sel k="source" label="Source" opts={LEAD_SOURCES} /><F k="campaign" label="Campaign" /><F k="serviceInterest" label="Service interest (comma-sep)" /><F k="assignedOwner" label="Assigned owner" />
        </div>
        <div style={{ marginBottom: 14 }}><label style={fieldLabel}>Problem stated</label><textarea value={f.problemStated} onChange={set("problemStated")} style={{ ...inputStyle, width: "100%", minHeight: 54, resize: "vertical" }} /></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={save} disabled={busy} style={busy ? disabledBtn : primaryBtn}>{busy ? "Saving…" : "Save lead"}</button>
          <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Cancel</button>
          {msg ? <span style={{ fontSize: 12, color: C.orange }}>{msg}</span> : null}
        </div>
      </div>
    </div>
  );
}

interface Company360Data {
  company: Record<string, unknown> | null;
  contacts: Record<string, unknown>[]; opportunities: Record<string, unknown>[]; tasks: Record<string, unknown>[];
  meetings: Record<string, unknown>[]; projects: Record<string, unknown>[]; invoices: Record<string, unknown>[]; timeline: Record<string, unknown>[];
  stats: { openDeals: number; wonDeals: number; pipelineValueCents: number; invoicedCents: number; paidCents: number; openTasks: number; activeProjects: number };
}
function Company360Drawer({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const s = useApi<Company360Data>(`/api/crm/companies/${companyId}/overview`);
  const d = s.data;
  const co = d?.company as Record<string, unknown> | null | undefined;
  const section = (title: string, rows: Record<string, unknown>[], render: (r: Record<string, unknown>) => React.ReactNode) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.05em", color: faint, fontWeight: 600, textTransform: "uppercase", marginBottom: 7 }}>{title} ({rows.length})</div>
      {rows.length === 0 ? <div style={{ fontSize: 11.5, color: "#4a4a52" }}>None yet.</div> : <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{rows.slice(0, 20).map((r, i) => <div key={String(r.id ?? i)} style={{ ...card, padding: "8px 11px" }}>{render(r)}</div>)}</div>}
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px,96vw)", height: "100%", overflow: "auto", background: "#0d0e11", borderLeft: "1px solid rgba(255,255,255,0.10)", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{String(co?.name ?? "Company")}</div>
            <div style={{ fontSize: 11.5, color: faint, marginTop: 3 }}>{String(co?.industry ?? "")}{co?.website ? " · " + String(co.website) : ""}</div>
          </div>
          <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "4px 9px", fontSize: 13 }}>✕</button>
        </div>
        {s.loading ? <StateBlock kind="loading" /> : !co ? <StateBlock kind="empty" message="Company not found." /> : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
              <MiniStat label="Pipeline" value={money(d!.stats.pipelineValueCents)} />
              <MiniStat label="Invoiced" value={money(d!.stats.invoicedCents)} />
              <MiniStat label="Paid" value={money(d!.stats.paidCents)} />
              <MiniStat label="Open deals" value={String(d!.stats.openDeals)} />
              <MiniStat label="Projects" value={String(d!.stats.activeProjects)} />
              <MiniStat label="Open tasks" value={String(d!.stats.openTasks)} />
            </div>
            {section("Contacts", d!.contacts, (r) => <span style={{ fontSize: 12.5 }}>{String(r.name ?? r.fullName ?? "contact")}{r.email ? <span style={{ color: faint }}> · {String(r.email)}</span> : null}{r.title ? <span style={{ color: faint }}> · {String(r.title)}</span> : null}</span>)}
            {section("Deals", d!.opportunities, (r) => <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><Tag text={String(r.stage ?? "")} color={r.status === "won" ? C.lime : r.status === "lost" ? C.orange : C.blue} /><span style={{ fontSize: 12.5, flex: 1 }}>{String(r.name ?? "deal")}</span><span style={{ fontSize: 11.5, color: C.lime }}>{money(Number(r.valueCents ?? 0), String(r.currency ?? "USD"))}</span></div>)}
            {section("Projects", d!.projects, (r) => <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Tag text={String(r.status ?? "")} color={C.blue} /><span style={{ fontSize: 12.5, flex: 1 }}>{String(r.name ?? "project")}</span>{typeof r.healthScore === "number" ? <span style={{ fontSize: 11, color: faint }}>health {String(r.healthScore)}</span> : null}</div>)}
            {section("Invoices", d!.invoices, (r) => <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><Tag text={String(r.status ?? "")} color={r.status === "paid" ? C.lime : C.gray} /><span style={{ fontSize: 12.5, flex: 1 }}>{String(r.invoiceNumber ?? r.id)}</span><span style={{ fontSize: 11.5, color: C.lime }}>{money(Number(r.totalCents ?? 0), String(r.currency ?? "USD"))}</span></div>)}
            {section("Tasks", d!.tasks, (r) => <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Tag text={String(r.status ?? "")} color={r.status === "completed" ? C.lime : C.gray} /><span style={{ fontSize: 12.5 }}>{String(r.title ?? "task")}</span></div>)}
            {section("Meetings", d!.meetings, (r) => <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Tag text={String(r.status ?? "")} color={C.gray} /><span style={{ fontSize: 12.5 }}>{String(r.title ?? "meeting")}</span></div>)}
            <div style={{ fontSize: 11, letterSpacing: "0.05em", color: faint, fontWeight: 600, textTransform: "uppercase", marginBottom: 7 }}>Activity timeline ({d!.timeline.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {d!.timeline.length === 0 ? <div style={{ fontSize: 11.5, color: "#4a4a52" }}>No activity yet.</div> : d!.timeline.map((e, i) => (
                <div key={String(e.id ?? i)} style={{ display: "flex", gap: 9, alignItems: "baseline", fontSize: 11.5, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ color: C.lime, fontFamily: "monospace", fontSize: 10.5 }}>{String(e.eventType ?? "")}</span>
                  <span style={{ flex: 1, color: faint }}>{String(e.actor ?? "")}{e.module ? " · " + String(e.module) : ""}</span>
                  <span style={{ color: "#4a4a52", whiteSpace: "nowrap" }}>{fmtTime(e.createdAt)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return <div style={{ ...card, padding: "9px 11px" }}><div style={{ fontSize: 9.5, letterSpacing: "0.05em", color: faint, textTransform: "uppercase", fontWeight: 600 }}>{label}</div><div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{value}</div></div>;
}

function CrmPage() {
  const oppState = useApi<{ opportunities: CrmOpp[] }>("/api/crm/opportunities?limit=500");
  const leadState = useApi<{ leads: CrmLead[] }>("/api/crm/leads?limit=200");
  const coState = useApi<{ companies: CrmCompany[] }>("/api/crm/companies?limit=200");
  const [addOpen, setAddOpen] = useState(false);
  const [co360, setCo360] = useState<string | null>(null);
  const guard = offlineIf(oppState) ?? offlineIf(leadState) ?? offlineIf(coState);
  if (guard) return guard;
  const opps = oppState.data?.opportunities ?? [];
  const leads = leadState.data?.leads ?? [];
  const companies = coState.data?.companies ?? [];
  const coName = (id: string) => companies.find((c) => c.id === id)?.name ?? "";
  const openOpps = opps.filter((o) => o.status === "open");
  const pipelineValue = openOpps.reduce((s, o) => s + o.valueCents, 0);
  const wonValue = opps.filter((o) => o.status === "won").reduce((s, o) => s + o.valueCents, 0);
  async function reload() { oppState.reload(); leadState.reload(); coState.reload(); }
  async function moveStage(id: string, stage: string) { await fetch(`/api/crm/opportunities/${id}/stage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) }); reload(); }
  async function convert(lead: CrmLead) {
    if (!window.confirm(`Convert "${lead.name}" into a company + contact + deal?`)) return;
    await fetch(`/api/crm/leads/${lead.id}/convert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    reload();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Companies" value={String(companies.length)} icon="Building2" color={C.lime} />
        <Kpi label="Open deals" value={String(openOpps.length)} icon="Kanban" color={C.blue} />
        <Kpi label="Pipeline value" value={money(pipelineValue)} icon="TrendingUp" color="#B87CFF" sub="open deals" />
        <Kpi label="Won" value={money(wonValue)} icon="Trophy" color="#2DD4BF" />
      </div>

      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Leads ({leads.length})</div>
          <button onClick={() => setAddOpen(true)} style={{ ...primaryBtn, padding: "7px 13px", fontSize: 12 }}>+ Add lead</button>
        </div>
        {leads.length === 0 ? <StateBlock kind="empty" message="No leads yet. Click “Add lead” to capture one." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {leads.map((l) => (
              <div key={l.id} style={{ ...card, padding: "9px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Tag text={`score ${l.score}`} color={l.score >= 60 ? C.lime : l.score >= 30 ? C.blue : C.gray} />
                <Tag text={l.status} color={l.status === "converted" ? C.lime : C.gray} />
                <span style={{ fontSize: 12.5, flex: 1, minWidth: 120 }}>{l.name}</span>
                <span style={{ fontSize: 11, color: faint }}>{l.source ?? ""}</span>
                {l.status !== "converted" ? <button onClick={() => convert(l)} style={{ ...primaryBtn, padding: "5px 10px", fontSize: 11.5 }}>Convert →</button> : null}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Pipeline · all stages</div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6 }}>
          {STAGE_ORDER.map((stage) => {
            const list = opps.filter((o) => o.stage === stage);
            const val = list.reduce((s, o) => s + o.valueCents, 0);
            const accent = stage === "won" ? C.lime : stage === "lost" ? C.orange : "#2a2a30";
            return (
              <div key={stage} style={{ minWidth: 208, flex: "0 0 208px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, borderTop: `2px solid ${accent}`, paddingTop: 7 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: stage === "won" ? C.lime : stage === "lost" ? C.orange : C.white }}>{STAGE_LABELS[stage]}</span>
                  <span style={{ fontSize: 10.5, color: faint }}>{list.length}{val ? ` · ${money(val)}` : ""}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, minHeight: 40 }}>
                  {list.length === 0 ? <div style={{ fontSize: 10.5, color: "#4a4a52", padding: "10px 4px", textAlign: "center", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 8 }}>—</div> : list.map((o) => (
                    <div key={o.id} style={{ ...card, padding: "9px 10px" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{o.name}</div>
                      <div style={{ fontSize: 10.5, color: faint, marginTop: 2 }}>{coName(o.companyId)}</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 7, gap: 6 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: C.lime }}>{money(o.valueCents, o.currency)}</span>
                        <select value={o.stage} onChange={(e) => moveStage(o.id, e.target.value)} style={{ ...selectStyle, padding: "3px 6px", fontSize: 10.5 }}>
                          {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Companies ({companies.length})</div>
        {companies.length === 0 ? <StateBlock kind="empty" message="No companies yet. Convert a lead or win a deal — click any company here to open its 360." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {companies.map((c) => (
              <button key={c.id} onClick={() => setCo360(c.id)} style={{ ...card, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left", border: "1px solid rgba(255,255,255,0.085)", color: C.white }}>
                <span style={{ width: 30, height: 30, flex: "none", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: C.lime, background: "rgba(255,255,255,0.04)" }}><Icon name="Building2" size={14} /></span>
                <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: 11, color: faint }}>{opps.filter((o) => o.companyId === c.id).length} deals</span>
                <Icon name="ChevronRight" size={15} />
              </button>
            ))}
          </div>
        )}
      </Panel>
      {addOpen ? <AddLeadModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); reload(); }} /> : null}
      {co360 ? <Company360Drawer companyId={co360} onClose={() => setCo360(null)} /> : null}
    </div>
  );
}

interface FinInvoice { id: string; invoiceNumber: string; totalCents: number; amountPaidCents: number; currency: string; status: string; companyId: string | null; opportunityId: string | null }
interface RevSummary { paidRevenueCents: number; outstandingCents: number; overdueCents: number; pipelineValueCents: number; weightedPipelineCents: number; wonValueCents: number; invoiceCounts: Record<string, number>; openDeals: number; wonDeals: number; avgDealSizeCents: number; revenueByService: Record<string, number> }

interface LineItemUI { description: string; quantity: string; unitPrice: string }

/** Full invoice builder — bill-to, multiple line items, tax/discount, due date, terms. */
function InvoiceBuilderModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [billTo, setBillTo] = useState({ companyName: "", contactName: "", email: "", address: "" });
  const [items, setItems] = useState<LineItemUI[]>([{ description: "", quantity: "1", unitPrice: "" }]);
  const [tax, setTax] = useState(""); const [discount, setDiscount] = useState(""); const [currency, setCurrency] = useState("USD");
  const [due, setDue] = useState(""); const [terms, setTerms] = useState("Net 14"); const [notes, setNotes] = useState(""); const [oppId, setOppId] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const setItem = (i: number, k: keyof LineItemUI, v: string) => setItems((arr) => arr.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const subtotal = items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * Math.round((parseFloat(it.unitPrice) || 0) * 100), 0);
  const total = Math.max(0, subtotal + Math.round((parseFloat(tax) || 0) * 100) - Math.round((parseFloat(discount) || 0) * 100));
  async function save() {
    const lineItems = items.filter((it) => it.description.trim() && (parseFloat(it.unitPrice) || 0) > 0).map((it) => ({ description: it.description, quantity: parseFloat(it.quantity) || 1, unitPriceCents: Math.round((parseFloat(it.unitPrice) || 0) * 100) }));
    if (!lineItems.length) { setMsg("Add at least one line item with an amount."); return; }
    setBusy(true); setMsg(null);
    try {
      const body = { lineItems, taxCents: Math.round((parseFloat(tax) || 0) * 100), discountCents: Math.round((parseFloat(discount) || 0) * 100), currency, dueDate: due || undefined, paymentTerms: terms || undefined, notes: notes || undefined, opportunityId: oppId || undefined, billingDetails: { companyName: billTo.companyName, contactName: billTo.contactName, email: billTo.email, address: billTo.address } };
      const r = await fetch("/api/finance/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) onSaved(); else { const j = await r.json().catch(() => ({})); setMsg("Error: " + (j.error ?? r.status)); }
    } finally { setBusy(false); }
  }
  const lbl: React.CSSProperties = { fontSize: 10.5, color: "#8a8a95", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3, display: "block" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(720px,96vw)", maxHeight: "92vh", overflow: "auto", background: "#141417", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><div style={{ fontSize: 15, fontWeight: 700 }}>New invoice</div><button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "4px 9px", fontSize: 13 }}>✕</button></div>
        <div style={{ fontSize: 11, color: faint, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Bill to</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div><label style={lbl}>Company</label><input value={billTo.companyName} onChange={(e) => setBillTo((b) => ({ ...b, companyName: e.target.value }))} style={{ ...inputStyle, width: "100%" }} /></div>
          <div><label style={lbl}>Contact</label><input value={billTo.contactName} onChange={(e) => setBillTo((b) => ({ ...b, contactName: e.target.value }))} style={{ ...inputStyle, width: "100%" }} /></div>
          <div><label style={lbl}>Email</label><input value={billTo.email} onChange={(e) => setBillTo((b) => ({ ...b, email: e.target.value }))} style={{ ...inputStyle, width: "100%" }} /></div>
          <div><label style={lbl}>Billing address</label><input value={billTo.address} onChange={(e) => setBillTo((b) => ({ ...b, address: e.target.value }))} style={{ ...inputStyle, width: "100%" }} /></div>
        </div>
        <div style={{ fontSize: 11, color: faint, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Line items</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 110px 28px", gap: 6, alignItems: "center" }}>
              <input value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} placeholder="Description" style={{ ...inputStyle, width: "100%" }} />
              <input value={it.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} placeholder="Qty" inputMode="decimal" style={{ ...inputStyle, width: "100%" }} />
              <input value={it.unitPrice} onChange={(e) => setItem(i, "unitPrice", e.target.value)} placeholder="Unit ($)" inputMode="decimal" style={{ ...inputStyle, width: "100%" }} />
              <button onClick={() => setItems((arr) => arr.length > 1 ? arr.filter((_, j) => j !== i) : arr)} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "6px 0", fontSize: 12 }}>✕</button>
            </div>
          ))}
        </div>
        <button onClick={() => setItems((arr) => [...arr, { description: "", quantity: "1", unitPrice: "" }])} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "5px 10px", fontSize: 11.5, marginBottom: 14 }}>+ Add line</button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div><label style={lbl}>Tax ($)</label><input value={tax} onChange={(e) => setTax(e.target.value)} inputMode="decimal" style={{ ...inputStyle, width: "100%" }} /></div>
          <div><label style={lbl}>Discount ($)</label><input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" style={{ ...inputStyle, width: "100%" }} /></div>
          <div><label style={lbl}>Currency</label><select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...selectStyle, width: "100%" }}>{["USD", "EUR", "GBP", "PKR", "AED"].map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label style={lbl}>Due date</label><input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...inputStyle, width: "100%" }} /></div>
          <div><label style={lbl}>Payment terms</label><input value={terms} onChange={(e) => setTerms(e.target.value)} style={{ ...inputStyle, width: "100%" }} /></div>
          <div><label style={lbl}>Link deal (opp id)</label><input value={oppId} onChange={(e) => setOppId(e.target.value)} style={{ ...inputStyle, width: "100%" }} /></div>
        </div>
        <div style={{ marginBottom: 12 }}><label style={lbl}>Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, width: "100%", minHeight: 44, resize: "vertical" }} /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
          <div style={{ fontSize: 13 }}>Total <b style={{ fontSize: 18, marginLeft: 6 }}>{money(total, currency)}</b></div>
          <div style={{ flex: 1 }} />
          <button onClick={save} disabled={busy} style={busy ? disabledBtn : primaryBtn}>{busy ? "Saving…" : "Draft invoice"}</button>
          <button onClick={onClose} style={{ ...disabledBtn, opacity: 1, cursor: "pointer" }}>Cancel</button>
        </div>
        {msg ? <div style={{ fontSize: 12, color: C.orange, marginTop: 8 }}>{msg}</div> : null}
      </div>
    </div>
  );
}

function InvoicesPage() {
  const sumState = useApi<{ summary: RevSummary }>("/api/finance/summary");
  const invState = useApi<{ invoices: FinInvoice[] }>("/api/finance/invoices?limit=200");
  const [builderOpen, setBuilderOpen] = useState(false);
  const guard = offlineIf(sumState) ?? offlineIf(invState);
  if (guard) return guard;
  const s = sumState.data?.summary;
  const invoices = invState.data?.invoices ?? [];
  async function reload() { sumState.reload(); invState.reload(); }
  async function act(id: string, action: string) { await fetch(`/api/finance/invoices/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); reload(); }
  const actionsFor = (st: string): Array<{ a: string; label: string }> => {
    if (st === "draft" || st === "needs_approval") return [{ a: "approve", label: "Approve" }, { a: "cancel", label: "Cancel" }];
    if (st === "approved") return [{ a: "send", label: "Send" }, { a: "cancel", label: "Cancel" }];
    if (["sent", "viewed", "partially_paid", "overdue"].includes(st)) return [{ a: "mark_paid", label: "Mark paid" }, { a: "cancel", label: "Cancel" }];
    return [];
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Paid revenue" value={money(s?.paidRevenueCents ?? 0)} icon="Wallet" color={C.lime} />
        <Kpi label="Outstanding" value={money(s?.outstandingCents ?? 0)} icon="Hourglass" color={C.blue} sub="unpaid invoices" />
        <Kpi label="Overdue" value={money(s?.overdueCents ?? 0)} icon="AlertTriangle" color={C.orange} />
        <Kpi label="Won revenue" value={money(s?.wonValueCents ?? 0)} icon="Trophy" color="#2DD4BF" sub={`${s?.wonDeals ?? 0} deals`} />
        <Kpi label="Pipeline value" value={money(s?.pipelineValueCents ?? 0)} icon="TrendingUp" color="#B87CFF" sub={`weighted ${money(s?.weightedPipelineCents ?? 0)}`} />
      </div>

      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Invoices & Finance</div>
          <StatusPill label="LIVE" color={C.lime} />
        </div>
        <div style={{ fontSize: 12.4, color: muted, lineHeight: 1.55, maxWidth: 720 }}>Draft invoices from deals, then a founder approves → sends → marks paid. The OS <b>never moves money on its own</b> — every step is logged in the audit trail.</div>
      </Panel>

      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Invoices ({invoices.length})</div>
          <button onClick={() => setBuilderOpen(true)} style={{ ...primaryBtn, padding: "7px 13px", fontSize: 12 }}>+ New invoice</button>
        </div>
        {invoices.length === 0 ? (
          <StateBlock kind="empty" message="No invoices yet. Draft one above." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {invoices.map((inv) => (
              <div key={inv.id} style={{ ...card, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 600, minWidth: 120 }}>{inv.invoiceNumber}</span>
                <Tag text={inv.status} color={inv.status === "paid" ? C.lime : inv.status === "overdue" ? C.orange : inv.status === "sent" ? C.blue : C.gray} />
                <span style={{ fontSize: 12.5, flex: 1, minWidth: 80, color: C.lime, fontWeight: 600 }}>{money(inv.totalCents, inv.currency)}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {actionsFor(inv.status).map((x) => <button key={x.a} onClick={() => act(inv.id, x.a)} style={{ ...(x.a === "cancel" ? { ...disabledBtn, opacity: 1, cursor: "pointer" } : primaryBtn), padding: "6px 11px", fontSize: 11.5 }}>{x.label}</button>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {builderOpen ? <InvoiceBuilderModal onClose={() => setBuilderOpen(false)} onSaved={() => { setBuilderOpen(false); reload(); }} /> : null}
    </div>
  );
}

const AUDIT_SIGNAL_OPTS: { key: string; label: string }[] = [
  { key: "missed_calls", label: "Missed calls" }, { key: "slow_response", label: "Slow lead response" },
  { key: "no_website_chat", label: "No website chat" }, { key: "website_no_booking", label: "No online booking" },
  { key: "no_followup", label: "No follow-up" }, { key: "no_crm", label: "No CRM" },
  { key: "not_running_ads", label: "Not running ads" }, { key: "ads_underperforming", label: "Ads underperform" },
  { key: "few_reviews", label: "Few reviews" }, { key: "no_referrals", label: "No referrals" },
  { key: "no_after_hours", label: "No after-hours cover" }, { key: "slow_dms", label: "Slow DMs" },
  { key: "cart_abandonment", label: "Cart abandonment" }, { key: "no_nurture", label: "No email/SMS nurture" },
  { key: "no_show", label: "No-shows" }, { key: "unpaid_invoices", label: "Unpaid invoices" },
  { key: "not_posting", label: "Not posting content" }, { key: "no_seo", label: "Not found on search" },
  { key: "manual_data_entry", label: "Manual data entry" }, { key: "no_visibility", label: "No reporting/visibility" },
];

interface AuditOpp { service: string; name: string; category: string; quickWin: boolean; reason: string; impact: string }
interface FreeAuditRow { id: string; businessName: string; report: { summary: string; quickWins: AuditOpp[]; opportunities: AuditOpp[]; serviceCount: number; estimatedMonthlyUpsideCents: number | null }; createdAt: string }

function FreeAuditPage() {
  const listState = useApi<{ audits: FreeAuditRow[] }>("/api/audit/free");
  const [name, setName] = useState(""); const [industry, setIndustry] = useState(""); const [problems, setProblems] = useState("");
  const [website, setWebsite] = useState(""); const [instagram, setInstagram] = useState("");
  const [signals, setSignals] = useState<string[]>([]); const [leads, setLeads] = useState(""); const [deal, setDeal] = useState("");
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<FreeAuditRow | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const [pitch, setPitch] = useState<{ auditId: string; usedLlm: boolean; scraped: boolean; pitch: { headline: string; whatWeNoticed: string[]; services: { name: string; whatItDoes: string; outcomeForYou: string }[]; cta: string } } | null>(null);
  const [roadmap, setRoadmap] = useState<{ auditId: string; usedLlm: boolean; plan: { interviewPlan: { role: string }[]; sequence: { week: string }[] } } | null>(null);
  const guard = offlineIf(listState);
  if (guard) return guard;
  const audits = listState.data?.audits ?? [];
  function toggle(k: string) { setSignals((s) => s.includes(k) ? s.filter((x) => x !== k) : [...s, k]); }
  function auditBody() {
    return { businessName: name, industry: industry || undefined, website: website || undefined, instagram: instagram || undefined, signals, problems: problems.split("\n").map((s) => s.trim()).filter(Boolean), monthlyLeads: leads ? Number(leads) : undefined, avgDealValueCents: deal ? Math.round(Number(deal) * 100) : undefined };
  }
  async function run() {
    if (!name.trim()) { setMsg("Enter the business name."); return; }
    setBusy(true); setMsg(null); setResult(null);
    try {
      const r = await fetch("/api/audit/free", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(auditBody()) });
      const j = (await r.json()) as { ok?: boolean; audit?: FreeAuditRow; error?: string };
      if (r.ok && j.ok !== false && j.audit) { setResult(j.audit); listState.reload(); } else setMsg("Error: " + String(j.error ?? r.status));
    } catch (e) { setMsg("Error: " + String(e)); } finally { setBusy(false); }
  }
  async function runPitch() {
    if (!name.trim()) { setMsg("Enter the business name."); return; }
    setBusy(true); setMsg(null); setPitch(null);
    try {
      const r = await fetch("/api/audit/pitch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(auditBody()) });
      const j = await r.json();
      if (r.ok && j.ok !== false) { setPitch(j); setRoadmap(null); } else setMsg("Error: " + String(j.error ?? r.status));
    } catch (e) { setMsg("Error: " + String(e)); } finally { setBusy(false); }
  }
  async function runRoadmap() {
    if (!pitch) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/audit/roadmap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessName: name, industry: industry || undefined, pitchAuditId: pitch.auditId }) });
      const j = await r.json();
      if (r.ok && j.ok !== false) setRoadmap(j); else setMsg("Error: " + String(j.error ?? r.status));
    } catch (e) { setMsg("Error: " + String(e)); } finally { setBusy(false); }
  }
  const impactColor = (i: string) => (i === "high" ? C.lime : i === "medium" ? C.blue : C.gray);
  const rep = result?.report;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ color: C.lime, display: "inline-flex" }}><Icon name="ClipboardCheck" size={16} /></span>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Free AI Audit</div>
          <StatusPill label="LIVE" color={C.lime} />
        </div>
        <div style={{ fontSize: 12.4, color: muted, lineHeight: 1.55, maxWidth: 760 }}>Answer what you learned on the call — the audit maps the prospect's gaps against the <b>full Wobble service menu</b> (34 services), surfaces quick wins, and estimates upside. This is the free, convert-first version; the deep multi-agent + paid McKinsey audit build on top.</div>
      </Panel>

      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Run an audit</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Business name" style={{ ...inputStyle, width: 200 }} />
          <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry / niche" style={{ ...inputStyle, width: 150 }} />
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website (for AI pitch)" style={{ ...inputStyle, width: 180 }} />
          <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="Instagram @" style={{ ...inputStyle, width: 130 }} />
          <input value={leads} onChange={(e) => setLeads(e.target.value)} placeholder="Monthly leads" inputMode="numeric" style={{ ...inputStyle, width: 120 }} />
          <input value={deal} onChange={(e) => setDeal(e.target.value)} placeholder="Avg deal ($)" inputMode="decimal" style={{ ...inputStyle, width: 110 }} />
        </div>
        <div style={{ fontSize: 11.5, color: faint, marginBottom: 6 }}>What's true today? (tap all that apply)</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {AUDIT_SIGNAL_OPTS.map((s) => (
            <button key={s.key} onClick={() => toggle(s.key)} style={{ ...(signals.includes(s.key) ? primaryBtn : { ...disabledBtn, opacity: 1, cursor: "pointer" }), padding: "5px 10px", fontSize: 11 }}>{s.label}</button>
          ))}
        </div>
        <textarea value={problems} onChange={(e) => setProblems(e.target.value)} placeholder="Anything else they said (one problem per line)…" style={{ ...inputStyle, width: "100%", minHeight: 58, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={run} disabled={busy} style={busy ? disabledBtn : { ...disabledBtn, opacity: 1, cursor: "pointer" }}>{busy ? "…" : "Quick diagnosis"}</button>
          <button onClick={runPitch} disabled={busy} title="Doc 1 — the niche-customized 'what Wobble can do' pitch" style={busy ? disabledBtn : primaryBtn}>{busy ? "Writing pitch…" : "✨ Generate AI pitch"}</button>
          {msg ? <span style={{ fontSize: 12, color: C.orange }}>{msg}</span> : null}
        </div>
      </Panel>

      {pitch ? (
        <Panel>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{pitch.pitch.headline}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <a href={`/api/audit/${pitch.auditId}/document`} target="_blank" rel="noreferrer" style={{ ...primaryBtn, textDecoration: "none", padding: "6px 11px", fontSize: 12 }}>Open pitch doc ↗</a>
              <a href={`/api/audit/${pitch.auditId}/deck`} target="_blank" rel="noreferrer" style={{ ...disabledBtn, opacity: 1, cursor: "pointer", textDecoration: "none", padding: "6px 11px", fontSize: 12 }}>Open deck ↗</a>
            </div>
          </div>
          <div style={{ fontSize: 11, color: faint, marginBottom: 8 }}>{pitch.usedLlm ? "AI-written, niche-customized" : "deterministic fallback"}{pitch.scraped ? " · site/social scraped" : ""}</div>
          {pitch.pitch.whatWeNoticed.length ? <div style={{ fontSize: 11, color: faint, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>What we noticed</div> : null}
          <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 12.5, color: muted }}>{pitch.pitch.whatWeNoticed.map((w, i) => <li key={i}>{w}</li>)}</ul>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pitch.pitch.services.map((s, i) => (
              <div key={i} style={{ ...card, padding: "9px 12px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11.8, color: muted, marginTop: 2 }}>{s.whatItDoes}</div>
                <div style={{ fontSize: 11.5, color: "#2a6a00", marginTop: 3 }}>→ {s.outcomeForYou}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: faint }}>Sold the paid audit? Plan the internal interview roadmap (Doc 2):</span>
            <button onClick={runRoadmap} disabled={busy} style={busy ? disabledBtn : { ...primaryBtn, padding: "6px 11px", fontSize: 12 }}>{busy ? "Planning…" : "Plan audit interviews →"}</button>
            {roadmap ? <a href={`/api/audit/${roadmap.auditId}/document`} target="_blank" rel="noreferrer" style={{ ...disabledBtn, opacity: 1, cursor: "pointer", textDecoration: "none", padding: "6px 11px", fontSize: 12 }}>Open roadmap ↗ ({roadmap.plan.interviewPlan.length} interviews)</a> : null}
          </div>
        </Panel>
      ) : null}

      {rep ? (
        <Panel>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{result!.businessName} — audit</div>
          <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.5, marginBottom: 10 }}>{rep.summary}{rep.estimatedMonthlyUpsideCents ? ` Estimated recoverable upside ≈ ${money(rep.estimatedMonthlyUpsideCents)}/mo.` : ""}</div>
          {rep.quickWins.length ? <div style={{ fontSize: 11, color: faint, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Quick wins</div> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rep.opportunities.map((o) => (
              <div key={o.service} style={{ ...card, padding: "9px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {o.quickWin ? <Tag text="quick win" color={C.lime} /> : null}
                <Tag text={o.impact} color={impactColor(o.impact)} />
                <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 140 }}>{o.name}</span>
                <span style={{ fontSize: 11, color: faint }}>{o.reason}</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {audits.length ? (
        <Panel>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Recent audits ({audits.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {audits.map((a) => (
              <div key={a.id} onClick={() => setResult(a)} style={{ ...card, padding: "9px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <Tag text={`${a.report.serviceCount} opps`} color={C.blue} />
                <span style={{ fontSize: 12.5, flex: 1 }}>{a.businessName}</span>
                <a href={`/api/audit/${a.id}/document`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", textDecoration: "none", padding: "5px 10px", fontSize: 11 }}>Report ↗</a>
                <a href={`/api/audit/${a.id}/deck`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", textDecoration: "none", padding: "5px 10px", fontSize: 11 }}>Deck ↗</a>
                <span style={{ fontSize: 11, color: faint }}>{fmtTime(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

interface PaidAuditReportUI {
  businessName: string; executiveSummary: string;
  currentState: { acquisition: string[]; delivery: string[]; support: string[]; bottlenecks: { area: string; pain: string; severity: string }[] };
  opportunities: { title: string; area: string; service: string; description: string; impact: string; difficulty: string }[];
  prioritization: { quickWins: string[]; bigSwings: string[]; rationale: string };
  roadmap: { title: string; months: string; focus: string; items: string[] }[];
  roi: { estimatedMonthlyUpsideCents?: number; estimatedImplementationCents?: number; paybackMonths?: number };
}
interface PaidAuditRowUI { id: string; businessName: string; report: PaidAuditReportUI; createdAt: string }

function PaidAuditPage() {
  const listState = useApi<{ audits: PaidAuditRowUI[] }>("/api/audit/paid");
  const [name, setName] = useState(""); const [industry, setIndustry] = useState(""); const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false); const [report, setReport] = useState<PaidAuditReportUI | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const guard = offlineIf(listState);
  if (guard) return guard;
  const audits = listState.data?.audits ?? [];
  async function run() {
    if (!name.trim() || !notes.trim()) { setMsg("Business name + stakeholder notes are required."); return; }
    setBusy(true); setMsg(null); setReport(null);
    try {
      const r = await fetch("/api/audit/paid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessName: name, industry: industry || undefined, intakeNotes: notes }) });
      const j = (await r.json()) as { ok?: boolean; report?: PaidAuditReportUI; error?: string; needsModelKey?: boolean };
      if (r.ok && j.ok !== false && j.report) { setReport(j.report); listState.reload(); }
      else if (j.needsModelKey) setMsg("The audit team needs an LLM key — set OPENROUTER_API_KEY in .env to run it live.");
      else setMsg("Error: " + String(j.error ?? r.status));
    } catch (e) { setMsg("Error: " + String(e)); } finally { setBusy(false); }
  }
  const lvl = (v: string) => (v === "high" ? C.lime : v === "medium" ? C.blue : C.gray);
  const rep = report;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ color: C.lime, display: "inline-flex" }}><Icon name="ClipboardList" size={16} /></span>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Paid AI Audit</div>
          <StatusPill label="LIVE" color={C.lime} />
        </div>
        <div style={{ fontSize: 12.4, color: muted, lineHeight: 1.55, maxWidth: 760 }}>A <b>team of five AI consultants</b> — discovery → opportunity → prioritisation → roadmap → ROI — runs a McKinsey-depth audit grounded in the full Wobble service menu + brand Brain. Paste the stakeholder-interview notes; it returns the current-state map, opportunity matrix, 12-month roadmap and ROI. Runs live on an <b>OPENROUTER_API_KEY</b>.</div>
      </Panel>

      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Run a paid audit</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Business name" style={{ ...inputStyle, width: 220 }} />
          <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry (optional)" style={{ ...inputStyle, width: 160 }} />
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Stakeholder-interview notes: how they get customers, deliver, support; what's manual; where the bottlenecks are; team size; numbers…" style={{ ...inputStyle, width: "100%", minHeight: 110, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <button onClick={run} disabled={busy} style={busy ? disabledBtn : primaryBtn}>{busy ? "Running audit team…" : "Run paid audit"}</button>
          {msg ? <span style={{ fontSize: 12, color: C.orange }}>{msg}</span> : null}
        </div>
      </Panel>

      {rep ? (
        <>
          <Panel>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{rep.businessName} — AI Audit</div>
            <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.55 }}>{rep.executiveSummary}</div>
            {rep.roi?.estimatedMonthlyUpsideCents ? (
              <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <Kpi label="Monthly upside" value={money(rep.roi.estimatedMonthlyUpsideCents)} icon="TrendingUp" color={C.lime} />
                <Kpi label="Implementation" value={money(rep.roi.estimatedImplementationCents ?? 0)} icon="Wallet" color={C.blue} />
                <Kpi label="Payback" value={`${rep.roi.paybackMonths ?? "—"} mo`} icon="Hourglass" color="#B87CFF" />
              </div>
            ) : null}
          </Panel>

          <Panel>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Opportunities ({rep.opportunities.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rep.opportunities.map((o, i) => (
                <div key={i} style={{ ...card, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Tag text={`impact ${o.impact}`} color={lvl(o.impact)} />
                  <Tag text={`effort ${o.difficulty}`} color={lvl(o.difficulty)} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 160 }}>{o.title}</span>
                  <span style={{ fontSize: 11, color: faint }}>{o.area}{o.service ? ` · ${o.service}` : ""}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>12-month roadmap</div>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
              {rep.roadmap.map((ph, i) => (
                <div key={i} style={{ ...card, padding: "11px 13px", minWidth: 220, flex: "0 0 220px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{ph.title}</div>
                  <div style={{ fontSize: 10.5, color: faint, marginBottom: 6 }}>{ph.months} · {ph.focus}</div>
                  {ph.items.map((it, j) => <div key={j} style={{ fontSize: 11.5, color: muted, lineHeight: 1.5 }}>• {it}</div>)}
                </div>
              ))}
            </div>
          </Panel>
        </>
      ) : null}

      {audits.length ? (
        <Panel>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Recent paid audits ({audits.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {audits.map((a) => (
              <div key={a.id} onClick={() => setReport(a.report)} style={{ ...card, padding: "9px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <Tag text={`${a.report.opportunities?.length ?? 0} opps`} color={C.blue} />
                <span style={{ fontSize: 12.5, flex: 1 }}>{a.businessName}</span>
                <a href={`/api/audit/${a.id}/document`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", textDecoration: "none", padding: "5px 10px", fontSize: 11 }}>Report ↗</a>
                <a href={`/api/audit/${a.id}/deck`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", textDecoration: "none", padding: "5px 10px", fontSize: 11 }}>Deck ↗</a>
                <span style={{ fontSize: 11, color: faint }}>{fmtTime(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

interface ProposalUI { id: string; title: string; status: string; pricingCents: number; currency: string; services: { name: string }[]; timeline: unknown[]; auditId: string | null }
interface AuditPick { id: string; businessName: string }

function ProposalsPage() {
  const listState = useApi<{ proposals: ProposalUI[] }>("/api/proposals");
  const freeState = useApi<{ audits: AuditPick[] }>("/api/audit/free");
  const paidState = useApi<{ audits: AuditPick[] }>("/api/audit/paid");
  const [auditId, setAuditId] = useState(""); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const guard = offlineIf(listState);
  if (guard) return guard;
  const proposals = listState.data?.proposals ?? [];
  const audits = [...(paidState.data?.audits ?? []).map((a) => ({ ...a, kind: "paid" })), ...(freeState.data?.audits ?? []).map((a) => ({ ...a, kind: "free" }))];
  async function build() {
    if (!auditId) { setMsg("Pick an audit to build from."); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/proposals/from-audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auditId }) });
      if (r.ok) { setAuditId(""); listState.reload(); } else setMsg("Error building proposal.");
    } finally { setBusy(false); }
  }
  async function act(id: string, action: string) {
    const r = await fetch(`/api/proposals/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({}));
    if (action === "accept" && j?.invoiceId) setMsg("Accepted — invoice drafted (see Invoices & Finance).");
    listState.reload();
  }
  const actionsFor = (st: string): Array<{ a: string; label: string }> => {
    if (st === "draft" || st === "needs_review") return [{ a: "approve", label: "Approve" }];
    if (st === "approved") return [{ a: "send", label: "Send" }];
    if (["sent", "viewed"].includes(st)) return [{ a: "accept", label: "Mark accepted" }, { a: "reject", label: "Reject" }];
    return [];
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ color: C.lime, display: "inline-flex" }}><Icon name="FileStack" size={16} /></span>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Proposals</div>
          <StatusPill label="LIVE" color={C.lime} />
        </div>
        <div style={{ fontSize: 12.4, color: muted, lineHeight: 1.55, maxWidth: 740 }}>Build a client proposal straight from an audit's findings — services, scope, timeline and pricing. A founder approves before it's sent; <b>accepting a proposal auto-drafts the invoice</b>. This closes the loop: Audit → Proposal → Invoice.</div>
      </Panel>

      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Build from an audit</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={auditId} onChange={(e) => setAuditId(e.target.value)} style={{ ...selectStyle, minWidth: 260 }}>
            <option value="">Pick an audit…</option>
            {audits.map((a) => <option key={a.id} value={a.id}>{a.businessName} ({a.kind})</option>)}
          </select>
          <button onClick={build} disabled={busy} style={busy ? disabledBtn : primaryBtn}>{busy ? "…" : "Build proposal"}</button>
          {msg ? <span style={{ fontSize: 12, color: msg.startsWith("Accepted") ? C.lime : C.orange }}>{msg}</span> : null}
        </div>
      </Panel>

      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Proposals ({proposals.length})</div>
        {proposals.length === 0 ? (
          <StateBlock kind="empty" message="No proposals yet. Build one from an audit above." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {proposals.map((p) => (
              <div key={p.id} style={{ ...card, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Tag text={p.status} color={p.status === "accepted" ? C.lime : p.status === "rejected" ? C.orange : p.status === "sent" ? C.blue : C.gray} />
                <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 160 }}>{p.title}</span>
                <span style={{ fontSize: 11, color: faint }}>{p.services.length} services · {p.timeline.length} phases</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.lime }}>{money(p.pricingCents, p.currency)}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <a href={`/api/proposals/${p.id}/document`} target="_blank" rel="noreferrer" style={{ ...disabledBtn, opacity: 1, cursor: "pointer", textDecoration: "none", padding: "6px 11px", fontSize: 11.5 }}>Document ↗</a>
                  {actionsFor(p.status).map((x) => <button key={x.a} onClick={() => act(p.id, x.a)} style={{ ...(x.a === "reject" ? { ...disabledBtn, opacity: 1, cursor: "pointer" } : primaryBtn), padding: "6px 11px", fontSize: 11.5 }}>{x.label}</button>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

interface WsAudit { id: string; kind: string; companyId: string | null; businessName: string; createdAt: string; headline: string; interviewPlan: { name?: string; expectedOutcome?: string }[] }
interface WsClient { key: string; businessName: string; companyId: string | null; pitch: WsAudit | null; roadmap: WsAudit | null; final: WsAudit | null }

/** The unified audit flow: one client, three stages — pitch → interview roadmap → findings → final deck. */
function AuditWorkspacePage() {
  const state = useApi<{ audits: WsAudit[] }>("/api/audit/workspace");
  const [sel, setSel] = useState<string | null>(null);
  const [nb, setNb] = useState({ name: "", industry: "", website: "", instagram: "" });
  const [findings, setFindings] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const guard = offlineIf(state);
  if (guard) return guard;
  const audits = state.data?.audits ?? [];
  const clients: WsClient[] = (() => {
    const map = new Map<string, WsClient>();
    for (const a of audits) {
      const key = a.companyId || a.businessName;
      if (!map.has(key)) map.set(key, { key, businessName: a.businessName, companyId: a.companyId, pitch: null, roadmap: null, final: null });
      const c = map.get(key)!;
      if (a.kind === "pitch" && !c.pitch) c.pitch = a;
      else if (a.kind === "roadmap" && !c.roadmap) c.roadmap = a;
      else if (a.kind === "paid" && !c.final) c.final = a;
    }
    return [...map.values()];
  })();
  const active = clients.find((c) => c.key === sel) ?? null;

  async function reload() { state.reload(); }
  async function gen(url: string, body: Record<string, unknown>, after?: () => void): Promise<void> {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (r.ok && j.ok !== false) { after?.(); reload(); } else setMsg("Error: " + String(j.error ?? (j.needsModelKey ? "set OPENROUTER_API_KEY to run this" : r.status)));
    } catch (e) { setMsg("Error: " + String(e)); } finally { setBusy(false); }
  }
  async function newPitch() {
    if (!nb.name.trim()) { setMsg("Enter a business name."); return; }
    await gen("/api/audit/pitch", { businessName: nb.name, industry: nb.industry || undefined, website: nb.website || undefined, instagram: nb.instagram || undefined }, () => { setSel(nb.name); setNb({ name: "", industry: "", website: "", instagram: "" }); });
  }
  function DocLinks({ id }: { id: string }) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <a href={`/api/audit/${id}/document`} target="_blank" rel="noreferrer" style={{ ...disabledBtn, opacity: 1, cursor: "pointer", textDecoration: "none", padding: "5px 10px", fontSize: 11.5 }}>Doc ↗</a>
        <a href={`/api/audit/${id}/deck`} target="_blank" rel="noreferrer" style={{ ...disabledBtn, opacity: 1, cursor: "pointer", textDecoration: "none", padding: "5px 10px", fontSize: 11.5 }}>Deck ↗</a>
      </div>
    );
  }
  function Stage({ n, title, done, locked, children }: { n: number; title: string; done: boolean; locked: boolean; children: React.ReactNode }) {
    return (
      <div style={{ ...card, padding: "13px 15px", opacity: locked ? 0.5 : 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: done ? C.lime : "#2a2a30", color: done ? "#0b0b0d" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{done ? "✓" : n}</span>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
        </div>
        {locked ? <div style={{ fontSize: 11.5, color: faint }}>Complete the previous step first.</div> : children}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ color: C.lime, display: "inline-flex" }}><Icon name="FolderKanban" size={16} /></span>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Audit Workspace</div>
          <StatusPill label="LIVE" color={C.lime} />
        </div>
        <div style={{ fontSize: 12.4, color: muted, lineHeight: 1.55, maxWidth: 760 }}>One client, the whole audit: <b>Doc 1</b> niche pitch → <b>Doc 2</b> internal interview roadmap → record findings → <b>Doc 3</b> final McKinsey deck. Each client's data stays isolated — the AI never sees another client's docs.</div>
      </Panel>

      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>New audit — start with the pitch</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={nb.name} onChange={(e) => setNb((s) => ({ ...s, name: e.target.value }))} placeholder="Business name" style={{ ...inputStyle, width: 200 }} />
          <input value={nb.industry} onChange={(e) => setNb((s) => ({ ...s, industry: e.target.value }))} placeholder="Industry / niche" style={{ ...inputStyle, width: 150 }} />
          <input value={nb.website} onChange={(e) => setNb((s) => ({ ...s, website: e.target.value }))} placeholder="Website (scraped)" style={{ ...inputStyle, width: 170 }} />
          <input value={nb.instagram} onChange={(e) => setNb((s) => ({ ...s, instagram: e.target.value }))} placeholder="Instagram @" style={{ ...inputStyle, width: 120 }} />
          <button onClick={newPitch} disabled={busy} style={busy ? disabledBtn : primaryBtn}>{busy ? "…" : "Generate pitch →"}</button>
        </div>
        {msg ? <div style={{ fontSize: 12, color: C.orange, marginTop: 8 }}>{msg}</div> : null}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px,260px) 1fr", gap: 16 }}>
        <Panel>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Clients ({clients.length})</div>
          {clients.length === 0 ? <StateBlock kind="empty" message="No audits yet. Generate a pitch above." /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {clients.map((c) => (
                <div key={c.key} onClick={() => setSel(c.key)} style={{ ...card, padding: "9px 11px", cursor: "pointer", border: c.key === sel ? `1px solid ${C.lime}` : card.border }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.businessName}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                    <Tag text="pitch" color={c.pitch ? C.lime : C.gray} />
                    <Tag text="roadmap" color={c.roadmap ? C.lime : C.gray} />
                    <Tag text="final" color={c.final ? C.lime : C.gray} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          {!active ? <StateBlock kind="empty" message="Pick a client to run their audit stages." /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{active.businessName}</div>
              <Stage n={1} title="Pitch (client-facing)" done={!!active.pitch} locked={false}>
                {active.pitch ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><span style={{ fontSize: 12, color: muted, flex: 1 }}>{active.pitch.headline?.slice(0, 90)}</span><DocLinks id={active.pitch.id} /></div>
                ) : (
                  <button onClick={() => gen("/api/audit/pitch", { businessName: active.businessName, companyId: active.companyId || undefined })} disabled={busy} style={busy ? disabledBtn : { ...primaryBtn, padding: "6px 11px", fontSize: 12 }}>Generate pitch</button>
                )}
              </Stage>
              <Stage n={2} title="Interview roadmap (internal)" done={!!active.roadmap} locked={!active.pitch}>
                {active.roadmap ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><span style={{ fontSize: 12, color: muted, flex: 1 }}>{active.roadmap.interviewPlan.length} interviews planned</span><DocLinks id={active.roadmap.id} /></div>
                ) : (
                  <button onClick={() => gen("/api/audit/roadmap", { businessName: active.businessName, companyId: active.companyId || undefined, pitchAuditId: active.pitch?.id })} disabled={busy} style={busy ? disabledBtn : { ...primaryBtn, padding: "6px 11px", fontSize: 12 }}>Plan the interviews</button>
                )}
              </Stage>
              <Stage n={3} title="Final deck (client-facing)" done={!!active.final} locked={!active.roadmap}>
                {active.final ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><span style={{ fontSize: 12, color: muted, flex: 1 }}>Final McKinsey deck ready</span><DocLinks id={active.final.id} /></div>
                ) : active.roadmap ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, color: faint }}>Paste what you learned in each interview:</div>
                    {active.roadmap.interviewPlan.map((iv, i) => (
                      <div key={i}>
                        <label style={{ fontSize: 11, color: muted, display: "block", marginBottom: 3 }}>{iv.name ?? `Interview ${i + 1}`}</label>
                        <textarea value={findings[`${active.key}:${i}`] ?? ""} onChange={(e) => setFindings((f) => ({ ...f, [`${active.key}:${i}`]: e.target.value }))} placeholder="Findings, pain points, numbers…" style={{ ...inputStyle, width: "100%", minHeight: 44, resize: "vertical" }} />
                      </div>
                    ))}
                    <button onClick={() => gen("/api/audit/final", { businessName: active.businessName, companyId: active.companyId || undefined, pitchAuditId: active.pitch?.id, roadmapAuditId: active.roadmap?.id, findings: active.roadmap!.interviewPlan.map((iv, i) => ({ stakeholder: iv.name ?? `Interview ${i + 1}`, notes: findings[`${active.key}:${i}`] ?? "" })).filter((x) => x.notes.trim()) })} disabled={busy} style={busy ? disabledBtn : { ...primaryBtn, padding: "7px 13px", fontSize: 12 }}>{busy ? "Building deck…" : "Generate final deck"}</button>
                  </div>
                ) : null}
              </Stage>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

interface TaskRowUI { id: string; title: string; taskType: string; priority: string; status: string; assignedTo: string | null; dueDate: string | null; opportunityId: string | null }
const TASK_TYPES_UI = ["call", "whatsapp_followup", "email_followup", "meeting_prep", "proposal_work", "audit_work", "invoice_followup", "client_delivery", "internal_admin", "content_task", "research_task", "finance_task"];
const TASK_STATUS_COLORS: Record<string, string> = { not_started: C.gray, in_progress: C.blue, waiting: "#F5C542", blocked: C.orange, needs_review: "#B87CFF", completed: C.lime, cancelled: C.gray };

function TasksPage() {
  const state = useApi<{ tasks: TaskRowUI[] }>("/api/tasks?limit=300");
  const [f, setF] = useState({ title: "", taskType: "call", priority: "medium", assignedTo: "", dueDate: "", opportunityId: "" });
  const [filter, setFilter] = useState("open");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const guard = offlineIf(state);
  if (guard) return guard;
  const all = state.data?.tasks ?? [];
  const now = Date.now();
  const overdue = (t: TaskRowUI) => t.dueDate && new Date(t.dueDate).getTime() < now && t.status !== "completed" && t.status !== "cancelled";
  const open = all.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const shown = filter === "all" ? all : filter === "overdue" ? all.filter(overdue) : filter === "done" ? all.filter((t) => t.status === "completed") : open;
  async function reload() { state.reload(); }
  async function create() {
    if (!f.title.trim()) { setMsg("Task needs a title."); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: f.title, taskType: f.taskType, priority: f.priority, assignedTo: f.assignedTo || undefined, dueDate: f.dueDate || undefined, opportunityId: f.opportunityId || undefined }) });
      if (r.ok) { setF({ title: "", taskType: "call", priority: "medium", assignedTo: "", dueDate: "", opportunityId: "" }); reload(); } else setMsg("Error saving task.");
    } finally { setBusy(false); }
  }
  async function setStatus(id: string, status: string) { await fetch(`/api/tasks/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", status }) }); reload(); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Open tasks" value={String(open.length)} icon="ListTodo" color={C.blue} />
        <Kpi label="Overdue" value={String(all.filter(overdue).length)} icon="AlertTriangle" color={C.orange} />
        <Kpi label="Completed" value={String(all.filter((t) => t.status === "completed").length)} icon="CheckCircle2" color={C.lime} />
      </div>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>New task</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={f.title} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} placeholder="Task title" style={{ ...inputStyle, width: 220 }} />
          <select value={f.taskType} onChange={(e) => setF((s) => ({ ...s, taskType: e.target.value }))} style={selectStyle}>{TASK_TYPES_UI.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select>
          <select value={f.priority} onChange={(e) => setF((s) => ({ ...s, priority: e.target.value }))} style={selectStyle}>{["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <input value={f.assignedTo} onChange={(e) => setF((s) => ({ ...s, assignedTo: e.target.value }))} placeholder="Assign to" style={{ ...inputStyle, width: 120 }} />
          <input type="date" value={f.dueDate} onChange={(e) => setF((s) => ({ ...s, dueDate: e.target.value }))} style={{ ...inputStyle, width: "auto" }} />
          <input value={f.opportunityId} onChange={(e) => setF((s) => ({ ...s, opportunityId: e.target.value }))} placeholder="Link deal (opp id)" style={{ ...inputStyle, width: 150 }} />
          <button onClick={create} disabled={busy} style={busy ? disabledBtn : primaryBtn}>{busy ? "…" : "Add task"}</button>
        </div>
        {msg ? <div style={{ fontSize: 12, color: C.orange, marginTop: 8 }}>{msg}</div> : null}
      </Panel>
      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Tasks ({shown.length})</div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={selectStyle}>{[["open", "Open"], ["overdue", "Overdue"], ["done", "Completed"], ["all", "All"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
        {shown.length === 0 ? <StateBlock kind="empty" message="No tasks here." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shown.map((t) => (
              <div key={t.id} style={{ ...card, padding: "10px 13px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderLeft: overdue(t) ? `3px solid ${C.orange}` : card.border }}>
                <Tag text={t.priority} color={t.priority === "urgent" ? C.orange : t.priority === "high" ? "#F5C542" : C.gray} />
                <Tag text={t.status.replace(/_/g, " ")} color={TASK_STATUS_COLORS[t.status] ?? C.gray} />
                <span style={{ fontSize: 12.5, flex: 1, minWidth: 140 }}>{t.title}</span>
                <span style={{ fontSize: 11, color: overdue(t) ? C.orange : faint }}>{t.assignedTo ? `${t.assignedTo} · ` : ""}{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : ""}</span>
                {t.status !== "completed" && t.status !== "cancelled" ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    {t.status === "not_started" ? <button onClick={() => setStatus(t.id, "in_progress")} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "5px 10px", fontSize: 11.5 }}>Start</button> : null}
                    <button onClick={() => setStatus(t.id, "completed")} style={{ ...primaryBtn, padding: "5px 10px", fontSize: 11.5 }}>Done</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

interface MeetingRowUI { id: string; title: string; meetingType: string; status: string; startAt: string | null; organizer: string | null; outcome: string | null; opportunityId: string | null }
const MEETING_TYPES_UI = ["ai_readiness_call", "paid_audit", "proposal_review", "internal_founder", "client_onboarding", "delivery_review", "strategy_session", "finance_discussion", "support_call"];
const MEETING_STATUS_COLORS: Record<string, string> = { scheduled: C.blue, completed: C.lime, rescheduled: "#F5C542", cancelled: C.gray, no_show: C.orange, needs_follow_up: "#B87CFF" };

function MeetingsPage() {
  const state = useApi<{ meetings: MeetingRowUI[] }>("/api/meetings?limit=300");
  const [f, setF] = useState({ title: "", meetingType: "ai_readiness_call", startAt: "", organizer: "", opportunityId: "" });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const guard = offlineIf(state);
  if (guard) return guard;
  const meetings = state.data?.meetings ?? [];
  const now = Date.now();
  const upcoming = meetings.filter((m) => m.status === "scheduled" && (!m.startAt || new Date(m.startAt).getTime() >= now));
  async function reload() { state.reload(); }
  async function create() {
    if (!f.title.trim()) { setMsg("Meeting needs a title."); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: f.title, meetingType: f.meetingType, startAt: f.startAt || undefined, organizer: f.organizer || undefined, opportunityId: f.opportunityId || undefined }) });
      if (r.ok) { setF({ title: "", meetingType: "ai_readiness_call", startAt: "", organizer: "", opportunityId: "" }); reload(); } else setMsg("Error saving meeting.");
    } finally { setBusy(false); }
  }
  async function complete(id: string) {
    const outcome = window.prompt("Meeting outcome? (what happened / next step)");
    if (outcome === null) return;
    await fetch(`/api/meetings/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "completed", outcome: outcome || undefined }) });
    reload();
  }
  async function setStatus(id: string, status: string) { await fetch(`/api/meetings/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); reload(); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Upcoming" value={String(upcoming.length)} icon="CalendarClock" color={C.blue} />
        <Kpi label="Completed" value={String(meetings.filter((m) => m.status === "completed").length)} icon="CheckCircle2" color={C.lime} />
        <Kpi label="Need follow-up" value={String(meetings.filter((m) => m.status === "needs_follow_up").length)} icon="Bell" color="#B87CFF" />
      </div>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Book a meeting</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={f.title} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} placeholder="Meeting title" style={{ ...inputStyle, width: 200 }} />
          <select value={f.meetingType} onChange={(e) => setF((s) => ({ ...s, meetingType: e.target.value }))} style={selectStyle}>{MEETING_TYPES_UI.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select>
          <input type="datetime-local" value={f.startAt} onChange={(e) => setF((s) => ({ ...s, startAt: e.target.value }))} style={{ ...inputStyle, width: "auto" }} />
          <input value={f.organizer} onChange={(e) => setF((s) => ({ ...s, organizer: e.target.value }))} placeholder="Organizer" style={{ ...inputStyle, width: 120 }} />
          <input value={f.opportunityId} onChange={(e) => setF((s) => ({ ...s, opportunityId: e.target.value }))} placeholder="Link deal (opp id)" style={{ ...inputStyle, width: 150 }} />
          <button onClick={create} disabled={busy} style={busy ? disabledBtn : primaryBtn}>{busy ? "…" : "Book"}</button>
        </div>
        {msg ? <div style={{ fontSize: 12, color: C.orange, marginTop: 8 }}>{msg}</div> : null}
      </Panel>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Meetings ({meetings.length})</div>
        {meetings.length === 0 ? <StateBlock kind="empty" message="No meetings yet. Book one above." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {meetings.map((m) => (
              <div key={m.id} style={{ ...card, padding: "10px 13px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Tag text={m.meetingType.replace(/_/g, " ")} color={C.gray} />
                <Tag text={m.status.replace(/_/g, " ")} color={MEETING_STATUS_COLORS[m.status] ?? C.gray} />
                <span style={{ fontSize: 12.5, flex: 1, minWidth: 140 }}>{m.title}{m.outcome ? <span style={{ color: faint, fontSize: 11 }}> — {m.outcome.slice(0, 60)}</span> : null}</span>
                <span style={{ fontSize: 11, color: faint }}>{m.startAt ? new Date(m.startAt).toLocaleString() : ""}</span>
                {m.status === "scheduled" || m.status === "rescheduled" || m.status === "needs_follow_up" ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => complete(m.id)} style={{ ...primaryBtn, padding: "5px 10px", fontSize: 11.5 }}>Complete</button>
                    <button onClick={() => setStatus(m.id, "no_show")} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "5px 10px", fontSize: 11.5 }}>No-show</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

interface ProjectRowUI { id: string; name: string; status: string; healthScore: number; owner: string | null; companyId: string | null; opportunityId: string | null; endDate: string | null; milestones: Array<{ title: string; done?: boolean }>; deliverables: Array<{ title: string; done?: boolean }> }
const PROJECT_STATUSES_UI = ["not_started", "onboarding", "in_progress", "waiting_on_client", "at_risk", "completed", "paused", "cancelled"];
const PROJECT_STATUS_COLORS: Record<string, string> = { not_started: C.gray, onboarding: C.blue, in_progress: C.blue, waiting_on_client: "#F5C542", at_risk: C.orange, completed: C.lime, paused: C.gray, cancelled: C.gray };
function healthColor(n: number): string { return n >= 70 ? C.lime : n >= 40 ? "#F5C542" : C.orange; }

function ProjectsPage() {
  const state = useApi<{ projects: ProjectRowUI[] }>("/api/projects?limit=300");
  const [f, setF] = useState({ name: "", owner: "", companyId: "", opportunityId: "", endDate: "" });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const guard = offlineIf(state);
  if (guard) return guard;
  const projects = state.data?.projects ?? [];
  const active = projects.filter((p) => !["completed", "cancelled"].includes(p.status));
  const atRisk = projects.filter((p) => p.status === "at_risk" || p.healthScore < 40);
  const avgHealth = active.length ? Math.round(active.reduce((s, p) => s + p.healthScore, 0) / active.length) : 0;
  function reload() { state.reload(); }
  async function create() {
    if (!f.name.trim()) { setMsg("Project needs a name."); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: f.name, owner: f.owner || undefined, companyId: f.companyId || undefined, opportunityId: f.opportunityId || undefined, endDate: f.endDate || undefined }) });
      if (r.ok) { setF({ name: "", owner: "", companyId: "", opportunityId: "", endDate: "" }); reload(); } else setMsg("Error saving project.");
    } finally { setBusy(false); }
  }
  async function setStatus(id: string, status: string) { await fetch(`/api/projects/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", status }) }); reload(); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Active projects" value={String(active.length)} icon="FolderKanban" color={C.blue} />
        <Kpi label="At risk" value={String(atRisk.length)} icon="AlertTriangle" color={C.orange} />
        <Kpi label="Avg health" value={`${avgHealth}`} icon="Activity" color={healthColor(avgHealth)} />
        <Kpi label="Delivered" value={String(projects.filter((p) => p.status === "completed").length)} icon="CheckCircle2" color={C.lime} />
      </div>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Start a client project</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} placeholder="Project name" style={{ ...inputStyle, width: 200 }} />
          <input value={f.owner} onChange={(e) => setF((s) => ({ ...s, owner: e.target.value }))} placeholder="Owner" style={{ ...inputStyle, width: 120 }} />
          <input value={f.companyId} onChange={(e) => setF((s) => ({ ...s, companyId: e.target.value }))} placeholder="Company id" style={{ ...inputStyle, width: 130 }} />
          <input value={f.opportunityId} onChange={(e) => setF((s) => ({ ...s, opportunityId: e.target.value }))} placeholder="From deal (opp id)" style={{ ...inputStyle, width: 150 }} />
          <input type="date" value={f.endDate} onChange={(e) => setF((s) => ({ ...s, endDate: e.target.value }))} style={{ ...inputStyle, width: "auto" }} />
          <button onClick={create} disabled={busy} style={busy ? disabledBtn : primaryBtn}>{busy ? "…" : "Create"}</button>
        </div>
        {msg ? <div style={{ fontSize: 12, color: C.orange, marginTop: 8 }}>{msg}</div> : null}
      </Panel>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Projects ({projects.length})</div>
        {projects.length === 0 ? <StateBlock kind="empty" message="No projects yet. A won deal becomes a project here." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {projects.map((p) => {
              const items = [...(p.milestones ?? []), ...(p.deliverables ?? [])];
              const done = items.filter((i) => i.done).length;
              return (
                <div key={p.id} style={{ ...card, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 7 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <Tag text={p.status.replace(/_/g, " ")} color={PROJECT_STATUS_COLORS[p.status] ?? C.gray} />
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 140 }}>{p.name}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: healthColor(p.healthScore) }} />
                      health {p.healthScore}
                    </span>
                    {p.owner ? <span style={{ fontSize: 11, color: faint }}>{p.owner}</span> : null}
                    {p.endDate ? <span style={{ fontSize: 11, color: faint }}>due {new Date(p.endDate).toLocaleDateString()}</span> : null}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {items.length ? <span style={{ fontSize: 11, color: faint }}>{done}/{items.length} deliverables</span> : <span style={{ fontSize: 11, color: faint }}>no deliverables yet</span>}
                    <div style={{ flex: 1 }} />
                    {!["completed", "cancelled"].includes(p.status) ? (
                      <select value={p.status} onChange={(e) => setStatus(p.id, e.target.value)} style={{ ...selectStyle, fontSize: 11.5, padding: "4px 8px" }}>
                        {PROJECT_STATUSES_UI.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                      </select>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

interface DecisionRowUI { id: string; title: string; status: string; category: string; confidence: number; options: Array<{ id: string; label: string; score?: number; rationale?: string }>; decidedOptionId: string | null; decisionRationale: string | null; reasoningTrail: Array<{ at: string; note: string; by?: string }> }
const DECISION_STATUS_COLORS: Record<string, string> = { open: C.blue, scoring: "#F5C542", decided: C.lime, revisit: C.orange, archived: C.gray };

function DecisionRoomPage() {
  const state = useApi<{ decisions: DecisionRowUI[] }>("/api/decisions?limit=200");
  const [f, setF] = useState({ title: "", context: "", options: "" });
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const guard = offlineIf(state);
  if (guard) return guard;
  const decisions = state.data?.decisions ?? [];
  function reload() { state.reload(); }
  async function create() {
    if (!f.title.trim()) { setMsg("A decision needs a title."); return; }
    setBusy("create"); setMsg(null);
    try {
      const options = f.options.split("\n").map((s) => s.trim()).filter(Boolean).map((label) => ({ label }));
      const r = await fetch("/api/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: f.title, context: f.context || undefined, options }) });
      if (r.ok) { setF({ title: "", context: "", options: "" }); reload(); } else setMsg("Error creating decision.");
    } finally { setBusy(null); }
  }
  async function act(id: string, body: Record<string, unknown>, key: string) {
    setBusy(key);
    try { await fetch(`/api/decisions/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); reload(); }
    finally { setBusy(null); }
  }
  async function commit(d: DecisionRowUI) {
    const best = d.options.filter((o) => typeof o.score === "number").sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? d.options[0];
    if (!best) { setMsg("Add options first."); return; }
    const rationale = window.prompt(`Commit to "${best.label}"? Add a one-line rationale:`, best.rationale ?? "");
    if (rationale === null) return;
    await act(d.id, { action: "commit", optionId: best.id, rationale: rationale || "Committed.", confidence: best.score }, "commit_" + d.id);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Open" value={String(decisions.filter((d) => d.status === "open" || d.status === "scoring").length)} icon="Scale" color={C.blue} />
        <Kpi label="Decided" value={String(decisions.filter((d) => d.status === "decided").length)} icon="CheckCircle2" color={C.lime} />
        <Kpi label="Total" value={String(decisions.length)} icon="GitBranch" color={C.gray} />
      </div>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Open a decision</div>
        <input value={f.title} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} placeholder="What are we deciding?" style={{ ...inputStyle, marginBottom: 8 }} />
        <textarea value={f.context} onChange={(e) => setF((s) => ({ ...s, context: e.target.value }))} placeholder="Context / the goal this serves…" rows={2} style={{ ...inputStyle, marginBottom: 8, resize: "vertical" }} />
        <textarea value={f.options} onChange={(e) => setF((s) => ({ ...s, options: e.target.value }))} placeholder="Options — one per line" rows={3} style={{ ...inputStyle, marginBottom: 8, resize: "vertical" }} />
        <button onClick={create} disabled={busy === "create"} style={busy === "create" ? disabledBtn : primaryBtn}>{busy === "create" ? "…" : "Open decision"}</button>
        {msg ? <div style={{ fontSize: 12, color: C.orange, marginTop: 8 }}>{msg}</div> : null}
      </Panel>
      {decisions.length === 0 ? <StateBlock kind="empty" message="No decisions yet. Open one above, add options, then let WOBBLE score them." /> : decisions.map((d) => {
        const decided = d.options.find((o) => o.id === d.decidedOptionId);
        return (
          <Panel key={d.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <Tag text={d.status} color={DECISION_STATUS_COLORS[d.status] ?? C.gray} />
              <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 160 }}>{d.title}</span>
              {d.confidence ? <span style={{ fontSize: 11.5, color: faint }}>confidence {d.confidence}</span> : null}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {d.options.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 9, border: "1px solid " + (o.id === d.decidedOptionId ? "rgba(184,255,44,0.4)" : "rgba(255,255,255,0.08)"), background: o.id === d.decidedOptionId ? "rgba(184,255,44,0.08)" : "rgba(255,255,255,0.03)" }}>
                  {typeof o.score === "number" ? <span style={{ fontSize: 12, fontWeight: 700, color: o.score >= 70 ? C.lime : o.score >= 40 ? "#F5C542" : C.orange, width: 30 }}>{o.score}</span> : <span style={{ width: 30, color: faint, fontSize: 11 }}>—</span>}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5 }}>{o.label}</div>
                    {o.rationale ? <div style={{ fontSize: 11, color: faint, marginTop: 2 }}>{o.rationale}</div> : null}
                  </div>
                  {o.id === d.decidedOptionId ? <Tag text="chosen" color={C.lime} /> : null}
                </div>
              ))}
            </div>
            {decided ? <div style={{ fontSize: 11.5, color: faint, marginBottom: 8 }}>Decided: <span style={{ color: C.white }}>{decided.label}</span>{d.decisionRationale ? ` — ${d.decisionRationale}` : ""}</div> : null}
            {d.status !== "decided" && d.status !== "archived" ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => act(d.id, { action: "score" }, "score_" + d.id)} disabled={busy === "score_" + d.id || d.options.length === 0} style={busy === "score_" + d.id ? disabledBtn : { ...primaryBtn, padding: "7px 12px", fontSize: 12 }}>{busy === "score_" + d.id ? "Scoring…" : "⚡ Let WOBBLE score"}</button>
                <button onClick={() => commit(d)} disabled={!!busy} style={{ ...selectStyle, cursor: "pointer", padding: "7px 12px" }}>Commit decision</button>
                <button onClick={() => { const label = window.prompt("New option label:"); if (label) act(d.id, { action: "add_option", label }, "opt_" + d.id); }} style={{ ...selectStyle, cursor: "pointer", padding: "7px 12px" }}>+ Option</button>
              </div>
            ) : null}
          </Panel>
        );
      })}
    </div>
  );
}

interface OfferRowUI { id: string; name: string; status: string; hypothesis: string | null; audience: string | null; promise: string | null; priceCents: number; currency: string; score: number; deliverables: string[]; experiments: Array<{ id: string; name: string; status?: string }> }
const OFFER_STATUS_COLORS: Record<string, string> = { draft: C.gray, testing: C.blue, winning: C.lime, paused: "#F5C542", retired: C.gray };
const OFFER_STATUSES_UI = ["draft", "testing", "winning", "paused", "retired"];

function OfferLabPage() {
  const state = useApi<{ offers: OfferRowUI[] }>("/api/offers?limit=200");
  const [f, setF] = useState({ name: "", hypothesis: "", audience: "", promise: "", price: "", deliverables: "" });
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const guard = offlineIf(state);
  if (guard) return guard;
  const offers = state.data?.offers ?? [];
  function reload() { state.reload(); }
  async function create() {
    if (!f.name.trim()) { setMsg("An offer needs a name."); return; }
    setBusy("create"); setMsg(null);
    try {
      const priceCents = Math.round((parseFloat(f.price) || 0) * 100);
      const deliverables = f.deliverables.split("\n").map((s) => s.trim()).filter(Boolean);
      const r = await fetch("/api/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: f.name, hypothesis: f.hypothesis || undefined, audience: f.audience || undefined, promise: f.promise || undefined, priceCents, deliverables }) });
      if (r.ok) { setF({ name: "", hypothesis: "", audience: "", promise: "", price: "", deliverables: "" }); reload(); } else setMsg("Error creating offer.");
    } finally { setBusy(null); }
  }
  async function setStatus(id: string, status: string) { setBusy(id); try { await fetch(`/api/offers/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", status }) }); reload(); } finally { setBusy(null); } }
  async function addExp(id: string) { const name = window.prompt("Experiment name (e.g. 'LinkedIn DM test'):"); if (!name) return; setBusy(id); try { await fetch(`/api/offers/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_experiment", name }) }); reload(); } finally { setBusy(null); } }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Testing" value={String(offers.filter((o) => o.status === "testing").length)} icon="FlaskConical" color={C.blue} />
        <Kpi label="Winning" value={String(offers.filter((o) => o.status === "winning").length)} icon="Trophy" color={C.lime} />
        <Kpi label="Total offers" value={String(offers.length)} icon="Tag" color={C.gray} />
      </div>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Design an offer</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} placeholder="Offer name" style={inputStyle} />
          <input value={f.audience} onChange={(e) => setF((s) => ({ ...s, audience: e.target.value }))} placeholder="Audience / ICP" style={inputStyle} />
        </div>
        <input value={f.promise} onChange={(e) => setF((s) => ({ ...s, promise: e.target.value }))} placeholder="The promise (the outcome you sell)" style={{ ...inputStyle, marginBottom: 8 }} />
        <textarea value={f.hypothesis} onChange={(e) => setF((s) => ({ ...s, hypothesis: e.target.value }))} placeholder="Hypothesis — why this wins…" rows={2} style={{ ...inputStyle, marginBottom: 8, resize: "vertical" }} />
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, marginBottom: 8 }}>
          <input value={f.price} onChange={(e) => setF((s) => ({ ...s, price: e.target.value }))} placeholder="Price (USD)" type="number" style={inputStyle} />
          <textarea value={f.deliverables} onChange={(e) => setF((s) => ({ ...s, deliverables: e.target.value }))} placeholder="Deliverables — one per line" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        </div>
        <button onClick={create} disabled={busy === "create"} style={busy === "create" ? disabledBtn : primaryBtn}>{busy === "create" ? "…" : "Create offer"}</button>
        {msg ? <div style={{ fontSize: 12, color: C.orange, marginTop: 8 }}>{msg}</div> : null}
      </Panel>
      {offers.length === 0 ? <StateBlock kind="empty" message="No offers yet. Design one, run experiments, promote the winner." /> : offers.map((o) => (
        <Panel key={o.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
            <Tag text={o.status} color={OFFER_STATUS_COLORS[o.status] ?? C.gray} />
            <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 140 }}>{o.name}</span>
            {o.priceCents ? <span style={{ fontSize: 12, color: C.lime }}>{o.currency} {(o.priceCents / 100).toLocaleString()}</span> : null}
            {o.score ? <span style={{ fontSize: 11.5, color: faint }}>score {o.score}</span> : null}
          </div>
          {o.promise ? <div style={{ fontSize: 12.5, marginBottom: 4 }}>{o.promise}</div> : null}
          {o.hypothesis ? <div style={{ fontSize: 11.5, color: faint, marginBottom: 6 }}>{o.hypothesis}</div> : null}
          {o.audience ? <div style={{ fontSize: 11, color: faint, marginBottom: 6 }}>ICP: {o.audience}</div> : null}
          {o.deliverables?.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>{o.deliverables.map((d, i) => <Tag key={i} text={d} color={C.gray} />)}</div> : null}
          {o.experiments?.length ? <div style={{ fontSize: 11.5, color: faint, marginBottom: 8 }}>{o.experiments.length} experiment{o.experiments.length === 1 ? "" : "s"}: {o.experiments.map((e) => e.name).join(", ")}</div> : null}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => addExp(o.id)} disabled={busy === o.id} style={{ ...selectStyle, cursor: "pointer", padding: "6px 11px", fontSize: 12 }}>+ Experiment</button>
            <select value={o.status} onChange={(e) => setStatus(o.id, e.target.value)} style={{ ...selectStyle, padding: "6px 10px", fontSize: 12 }}>
              {OFFER_STATUSES_UI.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </Panel>
      ))}
    </div>
  );
}

interface WorkerViewUI { id: string; workerName: string; workerType: string; status: string; live: boolean; currentJobId: string | null; lastSeenSecondsAgo: number }
function WorkersPage() {
  const state = useApi<{ workers: WorkerViewUI[]; online: number; stale: number; queue: { total: number; byStatus: Record<string, number>; byQueue: Record<string, number> } }>("/api/workers");
  const guard = offlineIf(state);
  if (guard) return guard;
  const d = state.data;
  const workers = d?.workers ?? [];
  const byStatus = d?.queue.byStatus ?? {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Online" value={String(d?.online ?? 0)} icon="Cpu" color={C.lime} />
        <Kpi label="Stale" value={String(d?.stale ?? 0)} icon="AlertTriangle" color={C.orange} />
        <Kpi label="Jobs (recent)" value={String(d?.queue.total ?? 0)} icon="ListChecks" color={C.blue} />
        <Kpi label="Running" value={String(byStatus.processing ?? byStatus.active ?? 0)} icon="Loader2" color="#F5C542" />
      </div>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Worker processes</div>
        {workers.length === 0 ? <StateBlock kind="empty" message="No worker heartbeats yet. Workers register here when the runtime is running." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {workers.map((w) => (
              <div key={w.id} style={{ ...card, padding: "9px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: w.live ? C.lime : C.orange }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 140 }}>{w.workerName}</span>
                <Tag text={w.workerType} color={C.gray} />
                <Tag text={w.status} color={w.live ? C.lime : C.orange} />
                {w.currentJobId ? <span style={{ fontSize: 11, color: faint }}>job {w.currentJobId.slice(0, 12)}</span> : null}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: faint }}>{w.lastSeenSecondsAgo}s ago</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Job queue (last 200)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(byStatus).length === 0 ? <span style={{ fontSize: 12, color: faint }}>No jobs yet.</span> : Object.entries(byStatus).map(([s, n]) => <Tag key={s} text={`${s}: ${n}`} color={s === "completed" ? C.lime : s === "failed" ? C.orange : C.blue} />)}
        </div>
        {Object.entries(d?.queue.byQueue ?? {}).length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>{Object.entries(d!.queue.byQueue).map(([q, n]) => <Tag key={q} text={`${q} · ${n}`} color={C.gray} />)}</div> : null}
      </Panel>
    </div>
  );
}

interface SettingsOverviewUI { modelRoles: Array<{ role: string; provider: string; model: string }>; providers: Array<{ slug: string; label: string; enabled: boolean; permissionMode: string; healthStatus: string; allowedModules: string[] }>; integrations: Array<{ key: string; label: string; configured: boolean; envVar: string }> }
function SettingsPage() {
  const state = useApi<SettingsOverviewUI>("/api/settings");
  const guard = offlineIf(state);
  if (guard) return guard;
  const d = state.data;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Integrations</div>
        <div style={{ fontSize: 11.5, color: faint, marginBottom: 10 }}>Which external keys the OS can see right now. Values are never shown — set them in <code>.env</code>.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 8 }}>
          {(d?.integrations ?? []).map((i) => (
            <div key={i.key} style={{ ...card, padding: "10px 12px", display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: i.configured ? C.lime : "rgba(255,255,255,0.2)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{i.label}</div>
                <div style={{ fontSize: 10.5, color: faint }}>{i.envVar}</div>
              </div>
              <Tag text={i.configured ? "connected" : "not set"} color={i.configured ? C.lime : C.gray} />
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Model roles</div>
        {(d?.modelRoles ?? []).length === 0 ? <StateBlock kind="empty" message="No model roles configured. Seed the OS to map roles → models." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {(d?.modelRoles ?? []).map((r) => (
              <div key={r.role} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 11px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                <span style={{ fontSize: 12, fontWeight: 600, minWidth: 190 }}>{r.role}</span>
                <span style={{ fontSize: 11.5, color: faint }}>{r.provider}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: C.lime }}>{r.model}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Providers</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(d?.providers ?? []).map((p) => (
            <div key={p.slug} style={{ ...card, padding: "9px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Tag text={p.enabled ? "enabled" : "off"} color={p.enabled ? C.lime : C.gray} />
              <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 120 }}>{p.label}</span>
              <span style={{ fontSize: 11, color: faint }}>{p.permissionMode}</span>
              <Tag text={p.healthStatus} color={p.healthStatus === "healthy" ? C.lime : C.gray} />
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: faint }}>{p.allowedModules.length ? p.allowedModules.join(", ") : "all modules"}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

interface AutomationRowUI { id: string; name: string; description: string | null; triggerType: string; triggerEvent: string | null; actionQueue: string; actionType: string; enabled: boolean; runCount: number; lastStatus: string | null; lastRunAt: string | null }
function AutomationsPage() {
  const state = useApi<{ rules: AutomationRowUI[] }>("/api/automations?limit=200");
  const [f, setF] = useState({ name: "", triggerType: "manual", triggerEvent: "", actionQueue: "general", actionType: "" });
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const guard = offlineIf(state);
  if (guard) return guard;
  const rules = state.data?.rules ?? [];
  function reload() { state.reload(); }
  async function create() {
    if (!f.name.trim() || !f.actionType.trim()) { setMsg("A rule needs a name and an action type."); return; }
    if (f.triggerType === "event" && !f.triggerEvent.trim()) { setMsg("Event triggers need an event name (e.g. crm.opportunity_stage_moved)."); return; }
    setBusy("create"); setMsg(null);
    try {
      const r = await fetch("/api/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: f.name, triggerType: f.triggerType, triggerEvent: f.triggerType === "event" ? f.triggerEvent : undefined, actionQueue: f.actionQueue, actionType: f.actionType }) });
      if (r.ok) { setF({ name: "", triggerType: "manual", triggerEvent: "", actionQueue: "general", actionType: "" }); reload(); } else { const j = await r.json(); setMsg("Error: " + String(j.error ?? "failed")); }
    } finally { setBusy(null); }
  }
  async function toggle(id: string, enabled: boolean) { setBusy(id); try { await fetch(`/api/automations/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle", enabled }) }); reload(); } finally { setBusy(null); } }
  async function run(id: string) { setBusy("run_" + id); try { const r = await fetch(`/api/automations/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run" }) }); const j = await r.json(); if (j.ok) setMsg("Ran → job " + String(j.jobId).slice(0, 14)); reload(); } finally { setBusy(null); } }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Rules" value={String(rules.length)} icon="Workflow" color={C.blue} />
        <Kpi label="Enabled" value={String(rules.filter((r) => r.enabled).length)} icon="Power" color={C.lime} />
        <Kpi label="Total runs" value={String(rules.reduce((s, r) => s + r.runCount, 0))} icon="Repeat" color={C.gray} />
      </div>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>New automation rule</div>
        <div style={{ fontSize: 11.5, color: faint, marginBottom: 10 }}>A rule fires an action = it enqueues a real job. Event rules trigger on an audit event; manual rules run on demand.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} placeholder="Rule name" style={inputStyle} />
          <select value={f.triggerType} onChange={(e) => setF((s) => ({ ...s, triggerType: e.target.value }))} style={selectStyle}>
            <option value="manual">Trigger: manual (run on demand)</option>
            <option value="event">Trigger: on event</option>
            <option value="schedule">Trigger: schedule</option>
          </select>
          {f.triggerType === "event" ? <input value={f.triggerEvent} onChange={(e) => setF((s) => ({ ...s, triggerEvent: e.target.value }))} placeholder="Event (e.g. crm.opportunity_stage_moved)" style={inputStyle} /> : <div />}
          <input value={f.actionType} onChange={(e) => setF((s) => ({ ...s, actionType: e.target.value }))} placeholder="Action job type (e.g. content.generate)" style={inputStyle} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={f.actionQueue} onChange={(e) => setF((s) => ({ ...s, actionQueue: e.target.value }))} placeholder="Queue" style={{ ...inputStyle, width: 160 }} />
          <button onClick={create} disabled={busy === "create"} style={busy === "create" ? disabledBtn : primaryBtn}>{busy === "create" ? "…" : "Create rule"}</button>
        </div>
        {msg ? <div style={{ fontSize: 12, color: msg.startsWith("Ran") ? C.lime : C.orange, marginTop: 8 }}>{msg}</div> : null}
      </Panel>
      {rules.length === 0 ? <StateBlock kind="empty" message="No automation rules yet. Create one — it'll enqueue a real job when it fires." /> : rules.map((r) => (
        <Panel key={r.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.enabled ? C.lime : "rgba(255,255,255,0.2)" }} />
            <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 150 }}>{r.name}</span>
            <Tag text={r.triggerType + (r.triggerEvent ? ` · ${r.triggerEvent}` : "")} color={C.blue} />
            <Tag text={`→ ${r.actionQueue}/${r.actionType}`} color={C.gray} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 9, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: faint }}>{r.runCount} run{r.runCount === 1 ? "" : "s"}{r.lastStatus ? ` · last: ${r.lastStatus}` : ""}</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => run(r.id)} disabled={busy === "run_" + r.id} style={{ ...primaryBtn, padding: "6px 11px", fontSize: 12 }}>{busy === "run_" + r.id ? "…" : "Run now"}</button>
            <button onClick={() => toggle(r.id, !r.enabled)} disabled={busy === r.id} style={{ ...selectStyle, cursor: "pointer", padding: "6px 11px" }}>{r.enabled ? "Disable" : "Enable"}</button>
          </div>
        </Panel>
      ))}
    </div>
  );
}

interface SeoPlanUI { id: string; topic: string; audience: string | null; status: string; pillar: string | null; targetKeywords: Array<{ keyword: string; intent?: string; priority?: string }>; blogIdeas: Array<{ title: string; angle?: string; targetKeyword?: string; outline?: string[] }> }
const SEO_STATUS_COLORS: Record<string, string> = { draft: C.gray, planned: C.blue, active: C.lime, archived: C.gray };
function SeoPage() {
  const state = useApi<{ plans: SeoPlanUI[] }>("/api/seo?limit=100");
  const [f, setF] = useState({ topic: "", audience: "" });
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const guard = offlineIf(state);
  if (guard) return guard;
  const plans = state.data?.plans ?? [];
  function reload() { state.reload(); }
  async function create() {
    if (!f.topic.trim()) { setMsg("A plan needs a topic."); return; }
    setBusy("create"); setMsg(null);
    try {
      const r = await fetch("/api/seo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: f.topic, audience: f.audience || undefined }) });
      if (r.ok) { const j = await r.json(); setF({ topic: "", audience: "" }); reload(); if (j.plan?.id) generate(j.plan.id); } else setMsg("Error creating plan.");
    } finally { setBusy(null); }
  }
  async function generate(id: string) { setBusy("gen_" + id); setMsg(null); try { const r = await fetch(`/api/seo/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate" }) }); if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg("Generate failed: " + String(j.error ?? r.status)); } reload(); } finally { setBusy(null); } }
  async function archive(id: string) { setBusy(id); try { await fetch(`/api/seo/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive" }) }); reload(); } finally { setBusy(null); } }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Plans" value={String(plans.length)} icon="SearchCheck" color={C.blue} />
        <Kpi label="Keywords" value={String(plans.reduce((s, p) => s + p.targetKeywords.length, 0))} icon="KeyRound" color={C.lime} />
        <Kpi label="Blog ideas" value={String(plans.reduce((s, p) => s + p.blogIdeas.length, 0))} icon="PenTool" color="#B87CFF" />
      </div>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>New SEO / blog plan</div>
        <div style={{ fontSize: 11.5, color: faint, marginBottom: 10 }}>Give a topic — WOBBLE generates a content pillar, target keywords (with intent + priority) and blog ideas with outlines.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={f.topic} onChange={(e) => setF((s) => ({ ...s, topic: e.target.value }))} placeholder="Topic (e.g. AI receptionists for dental clinics)" style={{ ...inputStyle, flex: 1, minWidth: 220 }} />
          <input value={f.audience} onChange={(e) => setF((s) => ({ ...s, audience: e.target.value }))} placeholder="Audience (optional)" style={{ ...inputStyle, width: 200 }} />
          <button onClick={create} disabled={busy === "create" || busy?.startsWith("gen_")} style={busy === "create" ? disabledBtn : primaryBtn}>{busy === "create" ? "…" : busy?.startsWith("gen_") ? "Generating…" : "Generate plan"}</button>
        </div>
        {msg ? <div style={{ fontSize: 12, color: C.orange, marginTop: 8 }}>{msg}</div> : null}
      </Panel>
      {plans.length === 0 ? <StateBlock kind="empty" message="No SEO plans yet. Enter a topic above and WOBBLE builds the keyword + blog plan." /> : plans.map((p) => (
        <Panel key={p.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", cursor: "pointer" }} onClick={() => setOpen(open === p.id ? null : p.id)}>
            <Tag text={p.status} color={SEO_STATUS_COLORS[p.status] ?? C.gray} />
            <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 160 }}>{p.topic}</span>
            <span style={{ fontSize: 11, color: faint }}>{p.targetKeywords.length} kw · {p.blogIdeas.length} ideas</span>
            <Icon name={open === p.id ? "ChevronDown" : "ChevronRight"} size={15} />
          </div>
          {p.pillar ? <div style={{ fontSize: 11.5, color: faint, marginTop: 6 }}>Pillar: <span style={{ color: C.white }}>{p.pillar}</span></div> : null}
          {open === p.id ? (
            <div style={{ marginTop: 12 }}>
              {p.targetKeywords.length ? (
                <>
                  <div style={{ fontSize: 11, letterSpacing: "0.05em", color: faint, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Target keywords</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                    {p.targetKeywords.map((k, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{ fontSize: 12.5, flex: 1 }}>{k.keyword}</span>
                        {k.intent ? <Tag text={k.intent} color={C.blue} /> : null}
                        {k.priority ? <Tag text={k.priority} color={k.priority === "high" ? C.lime : C.gray} /> : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              {p.blogIdeas.length ? (
                <>
                  <div style={{ fontSize: 11, letterSpacing: "0.05em", color: faint, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Blog ideas</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {p.blogIdeas.map((b, i) => (
                      <div key={i} style={{ ...card, padding: "9px 12px" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{b.title}</div>
                        {b.angle ? <div style={{ fontSize: 11.5, color: faint, marginTop: 2 }}>{b.angle}{b.targetKeyword ? ` · ${b.targetKeyword}` : ""}</div> : null}
                        {b.outline?.length ? <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 11.5, color: faint }}>{b.outline.map((o, j) => <li key={j} style={{ marginBottom: 2 }}>{o}</li>)}</ul> : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => generate(p.id)} disabled={busy === "gen_" + p.id} style={busy === "gen_" + p.id ? disabledBtn : { ...primaryBtn, padding: "6px 11px", fontSize: 12 }}>{busy === "gen_" + p.id ? "Generating…" : p.targetKeywords.length ? "⚡ Regenerate" : "⚡ Generate"}</button>
            {p.status !== "archived" ? <button onClick={() => archive(p.id)} disabled={busy === p.id} style={{ ...selectStyle, cursor: "pointer", padding: "6px 11px" }}>Archive</button> : null}
          </div>
        </Panel>
      ))}
    </div>
  );
}

interface RadarScanUI { id: string; focus: string; status: string; signals: Array<{ title: string; category?: string; summary?: string; implication?: string; score?: number }> }
const RADAR_STATUS_COLORS: Record<string, string> = { new: C.blue, reviewed: "#F5C542", actioned: C.lime, dismissed: C.gray };
const RADAR_CAT_COLORS: Record<string, string> = { market: C.blue, competitor: C.orange, technology: C.lime, culture: "#B87CFF", regulation: C.gray };
function RadarPage() {
  const state = useApi<{ scans: RadarScanUI[] }>("/api/radar?limit=100");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const guard = offlineIf(state);
  if (guard) return guard;
  const scans = state.data?.scans ?? [];
  function reload() { state.reload(); }
  async function create() {
    if (!focus.trim()) { setMsg("Enter a focus area."); return; }
    setBusy("create"); setMsg(null);
    try {
      const r = await fetch("/api/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ focus }) });
      if (r.ok) { const j = await r.json(); setFocus(""); reload(); if (j.scan?.id) generate(j.scan.id); } else setMsg("Error creating scan.");
    } finally { setBusy(null); }
  }
  async function generate(id: string) { setBusy("gen_" + id); setMsg(null); try { const r = await fetch(`/api/radar/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate" }) }); if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg("Scan failed: " + String(j.error ?? r.status)); } reload(); } finally { setBusy(null); } }
  async function setStatus(id: string, status: string) { setBusy(id); try { await fetch(`/api/radar/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", status }) }); reload(); } finally { setBusy(null); } }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Scans" value={String(scans.length)} icon="Radar" color={C.blue} />
        <Kpi label="Signals" value={String(scans.reduce((s, p) => s + p.signals.length, 0))} icon="Zap" color={C.lime} />
        <Kpi label="Actioned" value={String(scans.filter((s) => s.status === "actioned").length)} icon="CheckCircle2" color={C.lime} />
      </div>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>New radar scan</div>
        <div style={{ fontSize: 11.5, color: faint, marginBottom: 10 }}>Name a focus — WOBBLE surfaces scored signals (market, competitor, tech, culture) with the implication for WOBBLE.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Focus (e.g. AI voice agents in healthcare, Pakistan SMB automation)" style={{ ...inputStyle, flex: 1, minWidth: 260 }} />
          <button onClick={create} disabled={busy === "create" || busy?.startsWith("gen_")} style={busy === "create" ? disabledBtn : primaryBtn}>{busy === "create" ? "…" : busy?.startsWith("gen_") ? "Scanning…" : "Run scan"}</button>
        </div>
        {msg ? <div style={{ fontSize: 12, color: C.orange, marginTop: 8 }}>{msg}</div> : null}
      </Panel>
      {scans.length === 0 ? <StateBlock kind="empty" message="No scans yet. Name a focus area and WOBBLE surfaces scored signals to review." /> : scans.map((s) => (
        <Panel key={s.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <Tag text={s.status} color={RADAR_STATUS_COLORS[s.status] ?? C.gray} />
            <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 160 }}>{s.focus}</span>
            <span style={{ fontSize: 11, color: faint }}>{s.signals.length} signals</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[...s.signals].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((sig, i) => (
              <div key={i} style={{ ...card, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {typeof sig.score === "number" ? <span style={{ fontSize: 12, fontWeight: 700, color: sig.score >= 70 ? C.lime : sig.score >= 40 ? "#F5C542" : C.gray, width: 26 }}>{sig.score}</span> : null}
                  <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{sig.title}</span>
                  {sig.category ? <Tag text={sig.category} color={RADAR_CAT_COLORS[sig.category] ?? C.gray} /> : null}
                </div>
                {sig.summary ? <div style={{ fontSize: 11.5, color: faint, marginTop: 4 }}>{sig.summary}</div> : null}
                {sig.implication ? <div style={{ fontSize: 11.5, color: C.lime, marginTop: 4 }}>→ {sig.implication}</div> : null}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={() => generate(s.id)} disabled={busy === "gen_" + s.id} style={busy === "gen_" + s.id ? disabledBtn : { ...primaryBtn, padding: "6px 11px", fontSize: 12 }}>{busy === "gen_" + s.id ? "Scanning…" : s.signals.length ? "⚡ Rescan" : "⚡ Scan"}</button>
            {s.status !== "actioned" ? <button onClick={() => setStatus(s.id, "actioned")} style={{ ...selectStyle, cursor: "pointer", padding: "6px 11px" }}>Mark actioned</button> : null}
            {s.status !== "dismissed" ? <button onClick={() => setStatus(s.id, "dismissed")} style={{ ...selectStyle, cursor: "pointer", padding: "6px 11px" }}>Dismiss</button> : null}
          </div>
        </Panel>
      ))}
    </div>
  );
}

interface SocialRowUI { id: string; platform: string; niche: string; status: string; strategy: { positioning?: string; cadence?: string; pillars?: string[]; hooks?: string[]; competitorAngles?: string[]; contentIdeas?: Array<{ format?: string; idea: string; hook?: string }> } }
const SOCIAL_PLATFORMS_UI = ["multi", "instagram", "linkedin", "tiktok", "x"];
function SocialPage() {
  const state = useApi<{ strategies: SocialRowUI[] }>("/api/social?limit=100");
  const [f, setF] = useState({ platform: "instagram", niche: "" });
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const guard = offlineIf(state);
  if (guard) return guard;
  const rows = state.data?.strategies ?? [];
  function reload() { state.reload(); }
  async function create() {
    if (!f.niche.trim()) { setMsg("Enter a niche or account."); return; }
    setBusy("create"); setMsg(null);
    try {
      const r = await fetch("/api/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: f.platform, niche: f.niche }) });
      if (r.ok) { const j = await r.json(); setF({ platform: f.platform, niche: "" }); reload(); if (j.strategy?.id) generate(j.strategy.id); } else setMsg("Error creating.");
    } finally { setBusy(null); }
  }
  async function generate(id: string) { setBusy("gen_" + id); setMsg(null); try { const r = await fetch(`/api/social/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate" }) }); if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg("Generate failed: " + String(j.error ?? r.status)); } reload(); } finally { setBusy(null); } }
  async function archive(id: string) { setBusy(id); try { await fetch(`/api/social/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive" }) }); reload(); } finally { setBusy(null); } }
  const chips = (title: string, items?: string[]) => items?.length ? (
    <div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, letterSpacing: "0.05em", color: faint, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>{title}</div><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{items.map((x, i) => <Tag key={i} text={x} color={C.gray} />)}</div></div>
  ) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Strategies" value={String(rows.length)} icon="Share2" color={C.blue} />
        <Kpi label="Post ideas" value={String(rows.reduce((s, r) => s + (r.strategy.contentIdeas?.length ?? 0), 0))} icon="Lightbulb" color={C.lime} />
        <Kpi label="Active" value={String(rows.filter((r) => r.status === "active").length)} icon="Zap" color="#B87CFF" />
      </div>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>New social strategy</div>
        <div style={{ fontSize: 11.5, color: faint, marginBottom: 10 }}>Pick a platform + niche — WOBBLE builds positioning, pillars, hooks, competitor angles and post ideas.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={f.platform} onChange={(e) => setF((s) => ({ ...s, platform: e.target.value }))} style={selectStyle}>{SOCIAL_PLATFORMS_UI.map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <input value={f.niche} onChange={(e) => setF((s) => ({ ...s, niche: e.target.value }))} placeholder="Niche / account (e.g. AI for dental clinics, @wobble)" style={{ ...inputStyle, flex: 1, minWidth: 240 }} />
          <button onClick={create} disabled={busy === "create" || busy?.startsWith("gen_")} style={busy === "create" ? disabledBtn : primaryBtn}>{busy === "create" ? "…" : busy?.startsWith("gen_") ? "Building…" : "Build strategy"}</button>
        </div>
        {msg ? <div style={{ fontSize: 12, color: C.orange, marginTop: 8 }}>{msg}</div> : null}
      </Panel>
      {rows.length === 0 ? <StateBlock kind="empty" message="No strategies yet. Pick a platform + niche and WOBBLE builds the content plan." /> : rows.map((r) => (
        <Panel key={r.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", cursor: "pointer" }} onClick={() => setOpen(open === r.id ? null : r.id)}>
            <Tag text={r.platform} color={C.blue} />
            <Tag text={r.status} color={r.status === "active" ? C.lime : C.gray} />
            <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 160 }}>{r.niche}</span>
            <span style={{ fontSize: 11, color: faint }}>{r.strategy.contentIdeas?.length ?? 0} ideas</span>
            <Icon name={open === r.id ? "ChevronDown" : "ChevronRight"} size={15} />
          </div>
          {r.strategy.positioning ? <div style={{ fontSize: 12, marginTop: 7 }}>{r.strategy.positioning}{r.strategy.cadence ? <span style={{ color: faint }}> · {r.strategy.cadence}</span> : null}</div> : null}
          {open === r.id ? (
            <div style={{ marginTop: 12 }}>
              {chips("Content pillars", r.strategy.pillars)}
              {chips("Hooks", r.strategy.hooks)}
              {chips("Competitor / differentiation angles", r.strategy.competitorAngles)}
              {r.strategy.contentIdeas?.length ? (
                <>
                  <div style={{ fontSize: 11, letterSpacing: "0.05em", color: faint, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Post ideas</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {r.strategy.contentIdeas.map((c, i) => (
                      <div key={i} style={{ ...card, padding: "8px 11px" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{c.format ? <Tag text={c.format} color={C.blue} /> : null}<span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.idea}</span></div>
                        {c.hook ? <div style={{ fontSize: 11.5, color: C.lime, marginTop: 3 }}>Hook: {c.hook}</div> : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => generate(r.id)} disabled={busy === "gen_" + r.id} style={busy === "gen_" + r.id ? disabledBtn : { ...primaryBtn, padding: "6px 11px", fontSize: 12 }}>{busy === "gen_" + r.id ? "Building…" : r.strategy.pillars?.length ? "⚡ Rebuild" : "⚡ Build"}</button>
            {r.status !== "archived" ? <button onClick={() => archive(r.id)} style={{ ...selectStyle, cursor: "pointer", padding: "6px 11px" }}>Archive</button> : null}
          </div>
        </Panel>
      ))}
    </div>
  );
}

interface WebstatsData { configured: boolean; needs?: string[]; siteId?: string; period?: string; aggregate?: { visitors?: number; pageviews?: number; bounceRate?: number; visitDuration?: number }; topPages?: Array<{ page: string; visitors?: number; pageviews?: number }>; topSources?: Array<{ source: string; visitors?: number }>; error?: string }
function WebstatsPage() {
  const state = useApi<WebstatsData>("/api/webstats?period=30d");
  const guard = offlineIf(state);
  if (guard) return guard;
  const d = state.data;
  if (d && !d.configured) {
    return (
      <div style={{ maxWidth: 640 }}>
        <Panel>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: C.orange, background: "rgba(255,104,0,0.1)" }}><Icon name="PlugZap" size={16} /></span>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Connect a web-analytics source</div>
          </div>
          <div style={{ fontSize: 12.5, color: faint, lineHeight: 1.55, marginBottom: 12 }}>Website Analytics reads <b>live</b> traffic for wobblepk.com from Plausible. No data is shown until it&apos;s connected — WOBBLE never fabricates traffic numbers. Set these in <code>.env</code> and reload:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(d.needs ?? ["PLAUSIBLE_API_KEY", "PLAUSIBLE_SITE_ID"]).map((n) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.orange }} />
                <span style={{ fontSize: 12.5, fontFamily: "monospace" }}>{n}</span>
                <span style={{ fontSize: 11, color: faint, marginLeft: "auto" }}>required</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: faint, marginTop: 12 }}>Optional: <code>PLAUSIBLE_HOST</code> for a self-hosted instance. Compatible with any Plausible-hosted or self-hosted site.</div>
        </Panel>
      </div>
    );
  }
  const fmtDur = (s?: number) => s == null ? "—" : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
      {d?.error ? <div style={{ fontSize: 12, color: C.orange }}>Plausible error: {d.error}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Visitors (30d)" value={String(d?.aggregate?.visitors ?? 0)} icon="Users" color={C.lime} />
        <Kpi label="Pageviews" value={String(d?.aggregate?.pageviews ?? 0)} icon="Eye" color={C.blue} />
        <Kpi label="Bounce rate" value={`${d?.aggregate?.bounceRate ?? 0}%`} icon="TrendingDown" color={C.orange} />
        <Kpi label="Avg visit" value={fmtDur(d?.aggregate?.visitDuration)} icon="Clock" color="#B87CFF" />
      </div>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Top pages</div>
        {(d?.topPages ?? []).length === 0 ? <StateBlock kind="empty" message="No page data for this period." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {(d?.topPages ?? []).map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 11px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                <span style={{ fontSize: 12.5, flex: 1, fontFamily: "monospace" }}>{p.page}</span>
                <span style={{ fontSize: 11.5, color: C.lime }}>{p.visitors} visitors</span>
                <span style={{ fontSize: 11, color: faint }}>{p.pageviews} views</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {(d?.topSources ?? []).length ? (
        <Panel>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Top sources</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(d?.topSources ?? []).map((s, i) => <Tag key={i} text={`${s.source}: ${s.visitors}`} color={C.blue} />)}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function BackupPage() {
  const state = useApi<{ tables: { key: string; rows: number }[]; totalRows: number }>("/api/backup");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const guard = offlineIf(state);
  if (guard) return guard;
  const d = state.data;
  async function exportSnapshot() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/backup/export");
      if (!r.ok) { setMsg("Export failed: " + r.status); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `wobble-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setMsg("Snapshot downloaded.");
    } finally { setBusy(false); }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Tables" value={String(d?.tables.filter((t) => t.rows >= 0).length ?? 0)} icon="Database" color={C.blue} />
        <Kpi label="Total records" value={String(d?.totalRows ?? 0)} icon="HardDrive" color={C.lime} />
      </div>
      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Point-in-time snapshot</div>
          <button onClick={exportSnapshot} disabled={busy} style={busy ? disabledBtn : primaryBtn}>{busy ? "Exporting…" : "⬇ Export snapshot"}</button>
        </div>
        <div style={{ fontSize: 11.5, color: faint, marginBottom: 12 }}>Downloads a JSON backup of every business table (CRM, invoices, proposals, audits, tasks, projects, decisions, offers, SEO, radar, automations). Company assets are never auto-deleted.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {(d?.tables ?? []).map((t) => (
            <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 11px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
              <span style={{ fontSize: 12.5, flex: 1, fontFamily: "monospace" }}>{t.key}</span>
              <span style={{ fontSize: 12, color: t.rows < 0 ? C.orange : t.rows > 0 ? C.lime : faint }}>{t.rows < 0 ? "missing" : `${t.rows} rows`}</span>
            </div>
          ))}
        </div>
        {msg ? <div style={{ fontSize: 12, color: msg.includes("failed") ? C.orange : C.lime, marginTop: 10 }}>{msg}</div> : null}
      </Panel>
      <RestorePanel onDone={() => state.reload()} />
    </div>
  );
}

function RestorePanel({ onDone }: { onDone: () => void }) {
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ tables: { key: string; newRows: number; existingRows: number; inserted: number }[]; totalNew: number; totalInserted: number; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setMsg(null); setPreview(null);
    try { const parsed = JSON.parse(await f.text()); setSnapshot(parsed); setFileName(f.name); }
    catch { setMsg("That file is not valid JSON."); setSnapshot(null); setFileName(null); }
  }
  async function restore(mode: "dry_run" | "apply") {
    if (!snapshot) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/backup/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot, mode }) });
      const j = await r.json();
      if (!r.ok || !j.ok) { setMsg("Restore failed: " + String(j.error ?? (j.errors ? j.errors.join("; ") : r.status))); return; }
      setPreview({ tables: j.tables, totalNew: j.totalNew, totalInserted: j.totalInserted, warnings: j.warnings ?? [] });
      setMsg(mode === "dry_run" ? `Dry run: ${j.totalNew} missing row(s) would be restored (nothing was written).` : `Applied: ${j.totalInserted} row(s) restored. Existing rows were never overwritten.`);
      if (mode === "apply") onDone();
    } finally { setBusy(false); }
  }
  return (
    <Panel>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Restore from a snapshot</div>
      <div style={{ fontSize: 11.5, color: faint, marginBottom: 12 }}>Additive + non-destructive: restore only INSERTS rows that are missing (by id). It NEVER overwrites or deletes an existing row. Always dry-run first to preview exactly what would be added.</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ ...primaryBtn, background: "rgba(255,255,255,0.06)", color: C.white, cursor: "pointer" }}>
          Choose backup JSON<input type="file" accept="application/json,.json" onChange={onFile} style={{ display: "none" }} />
        </label>
        {fileName ? <span style={{ fontSize: 11.5, color: muted }}>{fileName}</span> : null}
        <button disabled={busy || !snapshot} onClick={() => restore("dry_run")} style={busy || !snapshot ? disabledBtn : primaryBtn}>Dry run</button>
        <button disabled={busy || !snapshot || !preview} onClick={() => restore("apply")} title={preview ? "" : "Dry-run first"} style={busy || !snapshot || !preview ? disabledBtn : { ...primaryBtn, background: C.lime }}>Apply restore</button>
      </div>
      {preview ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 5 }}>
          {preview.tables.filter((t) => t.newRows > 0 || t.inserted > 0).map((t) => (
            <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 11px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
              <span style={{ fontSize: 12.5, flex: 1, fontFamily: "monospace" }}>{t.key}</span>
              <span style={{ fontSize: 12, color: C.lime }}>{t.inserted > 0 ? `${t.inserted} restored` : `${t.newRows} would restore`}</span>
              <span style={{ fontSize: 11, color: faint }}>{t.existingRows} already present</span>
            </div>
          ))}
          {preview.warnings.map((w, i) => <div key={i} style={{ fontSize: 11, color: C.orange }}>⚠ {w}</div>)}
        </div>
      ) : null}
      {msg ? <div style={{ fontSize: 12, color: msg.includes("failed") ? C.orange : C.lime, marginTop: 10 }}>{msg}</div> : null}
    </Panel>
  );
}

const MEDIA_STATUS_COLORS: Record<string, string> = { queued: "#F5C542", generating: C.blue, succeeded: C.lime, failed: C.orange, canceled: C.gray, blocked: C.orange };

function MediaStudioPage() {
  const state = useApi<{ pipelineBuilt: boolean; providerConfigured: boolean; provider: string; kinds: string[]; note: string; jobs: Record<string, unknown>[] }>("/api/media?limit=50");
  const [kind, setKind] = useState("image");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const guard = offlineIf(state);

  async function submit() {
    if (!prompt.trim()) { setMsg("A prompt is required."); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, prompt: prompt.trim(), estimatedCostCents: 0, budgetCapCents: 500 }) });
      const j = await r.json();
      if (!r.ok || !j.ok) { setMsg("Submit failed: " + String(j.error ?? (j.errors ? j.errors.join("; ") : r.status))); return; }
      setMsg("Job queued. The worker will run it — or hold it as 'blocked' until a provider key is set (never faked).");
      setPrompt("");
      state.reload();
    } finally { setBusy(false); }
  }
  async function act(id: string, action: "cancel" | "retry") {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/media/" + encodeURIComponent(id) + "/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json();
      if (!r.ok || !j.ok) { setMsg(action + " failed: " + String(j.error ?? r.status)); return; }
      state.reload();
    } finally { setBusy(false); }
  }
  if (guard) return guard;
  const d = state.data;
  const jobs = d?.jobs ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: C.lime, background: "rgba(126,217,87,0.12)" }}><Icon name="Clapperboard" size={16} /></span>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Media Studio</div>
          <div style={{ flex: 1 }} />
          <Tag text={d?.providerConfigured ? "provider: configured" : "provider: blocked (set FAL_KEY)"} color={d?.providerConfigured ? C.lime : "#F5C542"} />
        </div>
        <div style={{ fontSize: 12, color: faint, lineHeight: 1.55, marginBottom: 12 }}>{d?.note}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ ...primaryBtn, background: "rgba(255,255,255,0.06)", color: C.white }}>
            {(d?.kinds ?? ["image", "video", "audio", "model_3d"]).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Prompt (e.g. 'product hero shot, studio light')" style={{ ...inputStyle, flex: 1, minWidth: 220 }} />
          <button disabled={busy} onClick={submit} style={busy ? disabledBtn : primaryBtn}>{busy ? "Working…" : "Queue generation"}</button>
        </div>
        {msg ? <div style={{ fontSize: 11.5, color: msg.includes("failed") ? C.orange : C.lime, lineHeight: 1.5 }}>{msg}</div> : null}
      </Panel>
      {jobs.length === 0 ? <StateBlock kind="empty" message="No media jobs yet. Queue one above — a job is durable and worker-driven, and stays honest ('blocked') when no provider is configured." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {jobs.map((j, i) => {
            const st = String(j.status ?? "queued");
            return (
              <div key={String(j.id ?? i)} style={{ ...card, padding: "11px 13px" }}>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", marginBottom: 5 }}>
                  <Tag text={String(j.kind ?? "")} color={C.gray} />
                  <Tag text={st} color={MEDIA_STATUS_COLORS[st] ?? C.gray} />
                  <Tag text={String(j.provider ?? "")} color={C.blue} />
                  {Number(j.attempts ?? 0) > 0 ? <Tag text={`attempt ${String(j.attempts)}/${String(j.maxAttempts ?? 3)}`} color={C.gray} /> : null}
                  <div style={{ flex: 1 }} />
                  {(st === "queued" || st === "generating" || st === "blocked") ? <button disabled={busy} onClick={() => act(String(j.id), "cancel")} style={{ ...primaryBtn, padding: "5px 10px", fontSize: 11, background: C.gray }}>Cancel</button> : null}
                  {(st === "failed" || st === "blocked") ? <button disabled={busy} onClick={() => act(String(j.id), "retry")} style={{ ...primaryBtn, padding: "5px 10px", fontSize: 11 }}>Retry</button> : null}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{String(j.prompt ?? "")}</div>
                {j.error ? <div style={{ fontSize: 11, color: C.orange, marginTop: 4 }}>{String(j.error)}</div> : null}
                {Array.isArray(j.outputRefs) && j.outputRefs.length ? <div style={{ fontSize: 11, color: C.lime, marginTop: 4, fontFamily: "monospace" }}>{(j.outputRefs as string[]).join(", ").slice(0, 120)}</div> : null}
                <div style={{ fontSize: 10.5, color: faint, marginTop: 5 }}>{fmtTime(j.createdAt)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface HandoffEventUI { id: string; direction: string; eventType: string; status: string; signatureVerified: boolean; replayProtected: boolean; createdAt: string }
function HandoffPage() {
  const state = useApi<{ configured: boolean; endpoints: { id: string; url: string; secretRefName: string; enabled: boolean }[]; events: HandoffEventUI[]; counts: { endpoints: number; events: number; verified: number; failed: number } }>("/api/n8n");
  const guard = offlineIf(state);
  if (guard) return guard;
  const d = state.data;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 860 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Endpoints" value={String(d?.counts.endpoints ?? 0)} icon="Cable" color={C.blue} />
        <Kpi label="Events" value={String(d?.counts.events ?? 0)} icon="Webhook" color={C.lime} />
        <Kpi label="Verified" value={String(d?.counts.verified ?? 0)} icon="ShieldCheck" color={C.lime} />
        <Kpi label="Failed" value={String(d?.counts.failed ?? 0)} icon="AlertTriangle" color={C.orange} />
      </div>
      {!d?.configured ? <Panel><div style={{ fontSize: 12.5, color: faint }}>Set <code>N8N_WEBHOOK_SECRET</code> to enable signed handoff to/from n8n. Inbound + outbound events are HMAC-verified and replay-protected.</div></Panel> : null}
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Registered endpoints</div>
        {(d?.endpoints ?? []).length === 0 ? <StateBlock kind="empty" message="No endpoints registered yet." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(d?.endpoints ?? []).map((e) => (
              <div key={e.id} style={{ ...card, padding: "9px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Tag text={e.enabled ? "enabled" : "off"} color={e.enabled ? C.lime : C.gray} />
                <span style={{ fontSize: 12, flex: 1, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>{e.url}</span>
                <span style={{ fontSize: 11, color: faint }}>{e.secretRefName}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Recent events</div>
        {(d?.events ?? []).length === 0 ? <StateBlock kind="empty" message="No webhook events yet. Signed inbound/outbound handoffs appear here." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {(d?.events ?? []).map((ev) => (
              <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 11px", borderRadius: 8, background: "rgba(255,255,255,0.03)", flexWrap: "wrap" }}>
                <Tag text={ev.direction} color={ev.direction === "inbound" ? C.blue : "#B87CFF"} />
                <span style={{ fontSize: 12, flex: 1, fontFamily: "monospace" }}>{ev.eventType}</span>
                {ev.signatureVerified ? <Tag text="signed" color={C.lime} /> : <Tag text="unsigned" color={C.orange} />}
                <Tag text={ev.status} color={ev.status === "ok" || ev.status === "received" || ev.status === "delivered" ? C.lime : C.gray} />
                <span style={{ fontSize: 10.5, color: faint }}>{fmtTime(ev.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ---- Departments & Handoffs Command Centre (Phase 3) ----
type DeptRollup = { department: string; name: string | null; status: string | null; healthStatus: string | null; handoffs: { total: number; inFlight: number; completed: number; stuck: number }; cost: { totalEstimate: number }; quality: { avg: number | null }; members: { total: number; active: number }; lastActivityAt: string | null };
type HandoffView = { id: string; department: string; deliveryState: string; sourceAgent: string; destinationAgent: string | null; workflowId: string; clientWorkspaceId: string | null; retryCount: number; failureReason: string | null; correlationId: string; causationId: string | null; costEstimate: string | null; latencyMs: number | null; qualityScore: string | null };
type EscView = { id: string; departmentSlug: string; reason: string; severity: string; status: string; requiredDecision: string; assignee: string | null; workflowId: string | null; resolutionAction: string | null };
type BudgetStateView = { departmentSlug: string; caps: { dailyCents: number | null; monthlyCents: number | null; dailyTokens: number | null; concurrencyLimit: number }; usage: { dailyCents: number; monthlyCents: number; dailyTokens: number; activeReservations: number }; remaining: { dailyCents: number | null; monthlyCents: number | null; dailyTokens: number | null }; providerUsage: { actualCostCents: number; actualRows: number; estimatedRows: number; unverifiedRows: number } };
type KpiView = { key: string; definition: string; value: number | null; unit: string; target: number | null; trend: string | null; confidence: string };

const SEV_COLOR: Record<string, string> = { critical: C.orange, high: C.orange, medium: "#F5C542", low: C.gray };

const HEALTH_COLOR: Record<string, string> = { healthy: C.lime, degraded: "#F5C542", blocked: C.orange, over_budget: C.orange, failed: C.orange, unavailable: C.gray, misconfigured: C.orange, stale: C.blue, unknown: C.gray };
const STATE_COLOR: Record<string, string> = { completed: C.lime, delivered: C.blue, processing: C.blue, acknowledged: C.blue, dead_lettered: C.orange, failed: C.orange, cancelled: C.gray, created: C.gray };

function DepartmentsPage() {
  const depts = useApi<{ departments: DeptRollup[] }>("/api/departments");
  const [stateFilter, setStateFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const q = [stateFilter ? `deliveryState=${stateFilter}` : "", deptFilter ? `department=${deptFilter}` : "", "limit=100"].filter(Boolean).join("&");
  const handoffs = useApi<{ handoffs: HandoffView[]; counts: Record<string, number> }>(`/api/handoffs?${q}`);
  const escs = useApi<{ escalations: EscView[]; counts: Record<string, number> }>("/api/escalations?status=open&limit=100");
  const budget = useApi<{ budget: BudgetStateView }>(deptFilter ? `/api/departments/${deptFilter}/budget` : "/api/departments/__none__/budget");
  const kpis = useApi<{ kpis: KpiView[] }>(deptFilter ? `/api/departments/${deptFilter}/kpis` : "/api/departments/__none__/kpis");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function act(id: string, action: "redrive" | "cancel") {
    setBusy(id);
    setMsg(null);
    try {
      const r = await fetch(`/api/handoffs/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json().catch(() => ({}));
      setMsg(r.ok && j.ok ? `${action} ok` : `${action} failed: ${j.error ?? r.status}`);
      handoffs.reload();
      depts.reload();
    } catch (e) { setMsg(String(e)); } finally { setBusy(null); }
  }

  async function actEsc(id: string, body: Record<string, unknown>) {
    setBusy(id);
    setMsg(null);
    try {
      const r = await fetch(`/api/escalations/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      setMsg(r.ok && j.ok ? `escalation ${body.action} ok` : `failed: ${j.error ?? r.status}`);
      escs.reload();
      depts.reload();
    } catch (e) { setMsg(String(e)); } finally { setBusy(null); }
  }

  const guard = offlineIf(depts);
  if (guard) return guard;
  const list = depts.data?.departments ?? [];
  const hs = handoffs.data?.handoffs ?? [];
  const counts = handoffs.data?.counts ?? {};
  const escList = escs.data?.escalations ?? [];
  const bud = deptFilter ? budget.data?.budget : undefined;
  const kpiList = deptFilter ? kpis.data?.kpis ?? [] : [];
  const fmtKpi = (v: KpiView) => (v.value === null ? "—" : v.unit === "ratio" ? `${Math.round(v.value * 100)}%` : v.unit === "ms" ? `${Math.round(v.value / 100) / 10}s` : v.unit === "cents" ? `$${(v.value / 100).toFixed(2)}` : String(v.value));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Kpi label="Departments" value={String(list.length)} icon="Network" color={C.lime} />
        <Kpi label="Active" value={String(list.filter((d) => d.status === "active").length)} icon="CircleDot" color={C.blue} />
        <Kpi label="Handoffs in-flight" value={String((counts.delivered ?? 0) + (counts.processing ?? 0) + (counts.acknowledged ?? 0))} icon="ArrowLeftRight" color="#F5C542" />
        <Kpi label="Open escalations" value={String(escs.data?.counts?.open ?? 0)} icon="AlertTriangle" color={escList.length ? C.orange : C.gray} />
      </div>

      {escList.length > 0 ? (
        <Panel>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.orange }}>Escalations — blocked work needs a decision</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {escList.map((e) => (
              <div key={e.id} style={{ ...card, padding: "9px 12px", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV_COLOR[e.severity] ?? C.gray }} />
                <Tag text={e.departmentSlug} color={C.gray} />
                <Tag text={e.reason} color={C.orange} />
                <Tag text={e.severity} color={SEV_COLOR[e.severity] ?? C.gray} />
                <span style={{ fontSize: 12, flex: 1, minWidth: 240 }}>{e.requiredDecision}</span>
                <button disabled={busy === e.id} onClick={() => actEsc(e.id, { action: "resolve", resolutionAction: "resume", resolution: "resolved from Command Centre — resume" })} style={{ ...card, padding: "4px 9px", fontSize: 11.5, color: C.lime, cursor: "pointer", background: "transparent" }}>resume</button>
                <button disabled={busy === e.id} onClick={() => actEsc(e.id, { action: "resolve", resolutionAction: "terminate", resolution: "terminated from Command Centre" })} style={{ ...card, padding: "4px 9px", fontSize: 11.5, color: C.orange, cursor: "pointer", background: "transparent" }}>terminate</button>
                <button disabled={busy === e.id} onClick={() => actEsc(e.id, { action: "dismiss", reason: "dismissed from Command Centre" })} style={{ ...card, padding: "4px 9px", fontSize: 11.5, color: faint, cursor: "pointer", background: "transparent" }}>dismiss</button>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {deptFilter && (bud || kpiList.length) ? (
        <Panel>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{deptFilter} — budget & KPIs</div>
          {bud ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <Tag text={`daily $${(bud.usage.dailyCents / 100).toFixed(2)}${bud.caps.dailyCents != null ? ` / $${(bud.caps.dailyCents / 100).toFixed(2)}` : ""}`} color={C.blue} />
              <Tag text={`monthly $${(bud.usage.monthlyCents / 100).toFixed(2)}${bud.caps.monthlyCents != null ? ` / $${(bud.caps.monthlyCents / 100).toFixed(2)}` : ""}`} color={C.blue} />
              <Tag text={`active ${bud.usage.activeReservations} / ${bud.caps.concurrencyLimit}`} color={C.gray} />
              <Tag text={`actual $${(bud.providerUsage.actualCostCents / 100).toFixed(2)} · ${bud.providerUsage.actualRows} verified${bud.providerUsage.estimatedRows ? ` · ${bud.providerUsage.estimatedRows} est` : ""}`} color={bud.providerUsage.unverifiedRows ? "#F5C542" : C.lime} />
            </div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
            {kpiList.map((v) => (
              <div key={v.key} style={{ ...card, padding: "8px 11px" }} title={`${v.definition} · confidence ${v.confidence}`}>
                <div style={{ fontSize: 11, color: faint }}>{v.key}{v.trend ? ` · ${v.trend}` : ""}</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtKpi(v)}{v.target != null ? <span style={{ fontSize: 11, color: faint }}> / {v.unit === "ratio" ? `${Math.round(v.target * 100)}%` : v.target}</span> : null}</div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Departments — truthful health</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10 }}>
          {list.map((d) => (
            <div key={d.department} style={{ ...card, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 7, cursor: "pointer", borderColor: d.department === deptFilter ? C.lime : undefined }} onClick={() => setDeptFilter(d.department === deptFilter ? "" : d.department)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: HEALTH_COLOR[d.healthStatus ?? "unknown"] ?? C.gray }} />
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{d.name ?? d.department}</span>
                <Tag text={d.status ?? "—"} color={d.status === "active" ? C.lime : C.gray} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <Tag text={d.healthStatus ?? "unknown"} color={HEALTH_COLOR[d.healthStatus ?? "unknown"] ?? C.gray} />
                <Tag text={`team ${d.members.active}/${d.members.total}`} color={C.gray} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11, color: faint }}>
                <span>in-flight {d.handoffs.inFlight}</span>
                <span>done {d.handoffs.completed}</span>
                {d.handoffs.stuck > 0 ? <span style={{ color: C.orange }}>stuck {d.handoffs.stuck}</span> : null}
                {d.quality.avg != null ? <span>q {d.quality.avg}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>Inter-agent handoffs{deptFilter ? ` · ${deptFilter}` : ""}</div>
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} style={{ ...card, padding: "5px 9px", fontSize: 12, color: C.white, background: "rgba(255,255,255,0.04)" }}>
            <option value="">all states</option>
            {["delivered", "processing", "acknowledged", "completed", "dead_lettered", "failed", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {deptFilter ? <button onClick={() => setDeptFilter("")} style={{ ...card, padding: "5px 9px", fontSize: 12, color: C.white, cursor: "pointer", background: "transparent" }}>clear dept</button> : null}
        </div>
        {msg ? <div style={{ fontSize: 12, color: msg.includes("ok") ? C.lime : C.orange, marginBottom: 8 }}>{msg}</div> : null}
        {hs.length === 0 ? <StateBlock kind="empty" message="No handoffs match. Run a department (e.g. a paid audit) to see the agent team's inter-agent handoffs here." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {hs.map((h) => {
              const terminal = ["completed", "cancelled"].includes(h.deliveryState);
              const canRedrive = ["dead_lettered", "failed", "processing"].includes(h.deliveryState);
              const canCancel = !terminal && h.deliveryState !== "dead_lettered";
              return (
                <div key={h.id} style={{ ...card, padding: "8px 11px", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATE_COLOR[h.deliveryState] ?? C.gray }} />
                  <Tag text={h.department} color={C.gray} />
                  <span style={{ fontSize: 12, minWidth: 220 }}>{h.sourceAgent} → {h.destinationAgent ?? "—"}</span>
                  <Tag text={h.deliveryState} color={STATE_COLOR[h.deliveryState] ?? C.gray} />
                  {h.retryCount > 0 ? <span style={{ fontSize: 11, color: faint }}>retries {h.retryCount}</span> : null}
                  {h.failureReason ? <span style={{ fontSize: 11, color: C.orange, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={h.failureReason}>{h.failureReason}</span> : null}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 10.5, color: faint }} title={`workflow ${h.workflowId} · correlation ${h.correlationId}`}>{h.workflowId.slice(0, 14)}</span>
                  {canRedrive ? <button disabled={busy === h.id} onClick={() => act(h.id, "redrive")} style={{ ...card, padding: "4px 9px", fontSize: 11.5, color: C.lime, cursor: "pointer", background: "transparent" }}>retry</button> : null}
                  {canCancel ? <button disabled={busy === h.id} onClick={() => act(h.id, "cancel")} style={{ ...card, padding: "4px 9px", fontSize: 11.5, color: C.orange, cursor: "pointer", background: "transparent" }}>cancel</button> : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

const COMM_STATUS_COLORS: Record<string, string> = { prepared: "#F5C542", ready: C.blue, sent: C.lime, cancelled: C.gray };

function CommsPage() {
  const [channel, setChannel] = useState("internal_notification");
  const [kind, setKind] = useState("alert");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const c = useApi<{ communications: Record<string, unknown>[] }>("/api/comms?limit=100");
  const guard = offlineIf(c);

  async function prepare() {
    if (!subject.trim() || !body.trim()) { setMsg("Subject and body are required."); return; }
    setBusy(true); setMsg(null);
    try {
      const payload: Record<string, unknown> = { channel, kind: kind.trim() || "alert", subject: subject.trim(), body: body.trim(), scopeType: clientId.trim() ? "client" : "company" };
      if (clientId.trim()) payload.clientId = clientId.trim();
      const r = await fetch("/api/comms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok || !j.ok) { setMsg("Prepare failed: " + String(j.error ?? r.status)); return; }
      setMsg(j.released ? (channel === "internal_notification" ? "Released — delivered autonomously (an earned grant)." : "Released — staged ready (an earned grant).") : "Prepared — held for your send/confirm (no grant).");
      setSubject(""); setBody("");
      c.reload();
    } finally { setBusy(false); }
  }
  async function act(id: string, action: "send" | "cancel") {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/comms/" + encodeURIComponent(id) + "/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json();
      if (!r.ok || !j.ok) { setMsg((action === "send" ? "Send" : "Cancel") + " failed: " + String(j.error ?? r.status)); return; }
      if (action === "send" && j.sendDecision?.capped) setMsg("Sent — this send was confirm-capped (founder in the loop).");
      c.reload();
    } finally { setBusy(false); }
  }
  if (guard) return guard;
  const items = c.data?.communications ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card, padding: "16px 17px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={labelStyle}>PREPARE A COMMUNICATION</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} style={{ ...primaryBtn, background: "rgba(255,255,255,0.06)", color: C.white }}>
            <option value="internal_notification">Internal notification</option>
            <option value="external_email">External email</option>
            <option value="external_dm">External DM</option>
            <option value="proposal_send">Proposal send</option>
          </select>
          <input value={kind} onChange={(e) => setKind(e.target.value)} placeholder="kind (alert…)" style={inputStyle} />
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="client id (optional scope)" style={inputStyle} />
        </div>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" style={inputStyle} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button disabled={busy} onClick={prepare} style={primaryBtn}>{busy ? "Working…" : "Prepare"}</button>
          <span style={{ fontSize: 11.5, color: muted }}>Internal notifications can auto-deliver under a grant; external/proposal sends stay a founder confirm.</span>
        </div>
        {msg ? <div style={{ fontSize: 11.5, color: C.lime, lineHeight: 1.5 }}>{msg}</div> : null}
      </div>
      {items.length === 0 ? <StateBlock kind="empty" message="No communications prepared yet." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((r, i) => {
            const st = String(r.status ?? "prepared");
            const sendable = st === "prepared" || st === "ready";
            return (
              <div key={String(r.id ?? i)} style={{ ...card, padding: "13px 15px" }}>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 7, alignItems: "center" }}>
                  <Tag text={String(r.channel ?? "")} color={C.gray} />
                  <Tag text={st} color={COMM_STATUS_COLORS[st] ?? C.gray} />
                  {r.autonomyLevel ? <Tag text={"autonomy: " + String(r.autonomyLevel)} color={r.actedAutonomously ? C.lime : C.blue} /> : null}
                  {r.actedAutonomously ? <Tag text="auto" color={C.lime} /> : null}
                  <div style={{ flex: 1 }} />
                  {sendable ? <button disabled={busy} onClick={() => act(String(r.id), "send")} style={{ ...primaryBtn, padding: "6px 11px", fontSize: 11 }}>Send</button> : null}
                  {sendable ? <button disabled={busy} onClick={() => act(String(r.id), "cancel")} style={{ ...primaryBtn, padding: "6px 11px", fontSize: 11, background: C.orange }}>Cancel</button> : null}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{String(r.subject ?? "")}</div>
                <div style={{ fontSize: 11.5, color: muted, lineHeight: 1.5, marginTop: 5 }}>{String(r.body ?? "").slice(0, 160)}</div>
                <div style={{ fontSize: 10.5, color: faint, marginTop: 6 }}>{String(r.scopeType ?? "company")}{r.clientId ? " / " + String(r.clientId) : ""} · {fmtTime(r.createdAt)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const OPT_STATUS_COLORS: Record<string, string> = { proposed: "#F5C542", approved: C.blue, active: C.lime, rejected: C.gray, rolled_back: C.orange, superseded: C.gray };

function OptimizerPage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const o = useApi<{ cycles: Record<string, unknown>[]; proposals: Record<string, unknown>[] }>("/api/optimizer?limit=30");
  const guard = offlineIf(o);

  async function runCycle() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/optimizer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok || !j.ok) { setMsg("Cycle failed: " + String(j.error ?? r.status)); return; }
      setMsg(`Cycle complete — ${j.observations} observations, ${j.opportunities} opportunit${j.opportunities === 1 ? "y" : "ies"} proposed.`);
      o.reload();
    } finally { setBusy(false); }
  }
  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/optimizer/proposals/" + encodeURIComponent(id) + "/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const j = await r.json();
      if (!r.ok || !j.ok) { setMsg(action + " failed: " + String(j.error ?? r.status)); return; }
      o.reload();
    } finally { setBusy(false); }
  }
  if (guard) return guard;
  const cycles = o.data?.cycles ?? [];
  const proposals = o.data?.proposals ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card, padding: "16px 17px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={runCycle} style={primaryBtn}>{busy ? "Working…" : "Run an optimizer cycle"}</button>
        <span style={{ fontSize: 11.5, color: muted, flex: 1 }}>A cycle only OBSERVES real signals + PROPOSES opportunities. Nothing is approved, activated, or changed without you.</span>
        {cycles[0] ? <span style={{ fontSize: 11, color: faint }}>last cycle {fmtTime(cycles[0].startedAt)} · {String(cycles[0].observationCount ?? 0)} obs · {String(cycles[0].opportunityCount ?? 0)} opp</span> : null}
      </div>
      {msg ? <div style={{ fontSize: 11.5, color: C.lime, lineHeight: 1.5 }}>{msg}</div> : null}
      <div style={labelStyle}>IMPROVEMENT PROPOSALS</div>
      {proposals.length === 0 ? <StateBlock kind="empty" message="No proposals yet. Run a cycle — if the OS is healthy across the tracked signals, it honestly proposes nothing." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {proposals.map((p, i) => {
            const st = String(p.status ?? "proposed");
            const base = Number(p.historicalBaselineMetric ?? 0), target = Number(p.historicalCandidateMetric ?? 0);
            const evalPassed = ((p.metadata as { evaluation?: { passed?: boolean } })?.evaluation?.passed) === true;
            const evalReason = String((p.metadata as { evaluation?: { reason?: string } })?.evaluation?.reason ?? "");
            return (
              <div key={String(p.id ?? i)} style={{ ...card, padding: "13px 15px" }}>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 7, alignItems: "center" }}>
                  <Tag text={String(p.targetType ?? "")} color={C.gray} />
                  <Tag text={st} color={OPT_STATUS_COLORS[st] ?? C.gray} />
                  <Tag text={"risk " + String(p.riskLevel ?? "low")} color={C.blue} />
                  <Tag text={"score " + String(p.score ?? "0")} color={C.blue} />
                  {st === "proposed" ? <Tag text={evalPassed ? "evidence ✓" : "evidence ✗"} color={evalPassed ? C.lime : C.orange} /> : null}
                  <div style={{ flex: 1 }} />
                  {st === "proposed" ? <button disabled={busy || !evalPassed} title={evalPassed ? "" : evalReason} onClick={() => act(String(p.id), "approve")} style={{ ...primaryBtn, padding: "6px 11px", fontSize: 11, opacity: evalPassed ? 1 : 0.5 }}>Approve</button> : null}
                  {st === "proposed" ? <button disabled={busy} onClick={() => act(String(p.id), "reject", { reason: "not now" })} style={{ ...primaryBtn, padding: "6px 11px", fontSize: 11, background: C.gray }}>Reject</button> : null}
                  {st === "approved" ? <button disabled={busy} onClick={() => act(String(p.id), "activate")} style={{ ...primaryBtn, padding: "6px 11px", fontSize: 11 }}>Activate</button> : null}
                  {st === "active" ? <button disabled={busy} onClick={() => act(String(p.id), "rollback", { reason: "founder rollback" })} style={{ ...primaryBtn, padding: "6px 11px", fontSize: 11, background: C.orange }}>Roll back</button> : null}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{String(p.pattern ?? "")}</div>
                <div style={{ fontSize: 11.5, color: muted, lineHeight: 1.5, marginTop: 5 }}>{String(p.hypothesis ?? "")}</div>
                <div style={{ fontSize: 10.5, color: faint, marginTop: 6 }}>
                  evidence: health {base.toFixed(2)} → projected target {target.toFixed(2)} (estimate) · {evalReason || "—"} · est. value {String(p.estimatedValue ?? 0)} · {fmtTime(p.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CockpitPage() {
  const c = useApi<{ cockpit: { generatedAt: string; revenue: { revenueCents: number | null; evidenceTier: string | null; periodMonths: number }; optimizer: { proposed: number; active: number; total: number }; autonomy: { activeGrants: number }; attention: { openEscalations: number; pendingApprovals: number; total: number }; media: { total: number; byStatus: Record<string, number> } } }>("/api/cockpit");
  const guard = offlineIf(c);
  if (guard) return guard;
  const d = c.data?.cockpit;
  const rev = d?.revenue.revenueCents;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <Kpi label={`Revenue · ${d?.revenue.periodMonths ?? 1}mo`} value={rev !== null && rev !== undefined ? `$${(rev / 100).toLocaleString()}` : "—"} icon="DollarSign" color={C.lime} sub={d?.revenue.evidenceTier ?? "no financial actual yet"} />
        <Kpi label="Needs attention" value={String(d?.attention.total ?? 0)} icon="AlertTriangle" color={(d?.attention.total ?? 0) > 0 ? C.orange : C.lime} sub={`${d?.attention.openEscalations ?? 0} escalations · ${d?.attention.pendingApprovals ?? 0} approvals`} />
        <Kpi label="Optimizer proposals" value={String(d?.optimizer.proposed ?? 0)} icon="Gauge" color={C.blue} sub={`${d?.optimizer.active ?? 0} active · ${d?.optimizer.total ?? 0} total`} />
        <Kpi label="Autonomy grants" value={String(d?.autonomy.activeGrants ?? 0)} icon="ShieldCheck" color={C.blue} sub="in force" />
        <Kpi label="Media jobs" value={String(d?.media.total ?? 0)} icon="Clapperboard" color={C.gray} sub={Object.entries(d?.media.byStatus ?? {}).map(([k, v]) => `${v} ${k}`).join(" · ") || "none queued"} />
      </div>
      <Panel>
        <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.6 }}>
          The Intelligence Cockpit is a READ-ONLY aggregation of the OS&apos;s real systems — revenue is a measured actual from paid invoices, and every count comes from a live store. Empty stores show honest zeros/nulls; nothing here is fabricated.
        </div>
        <div style={{ fontSize: 10.5, color: faint, marginTop: 8 }}>Generated {fmtTime(d?.generatedAt)}</div>
      </Panel>
    </div>
  );
}

const WIRED: Record<string, React.ComponentType> = {
  cockpit: CockpitPage,
  comms: CommsPage,
  optimizer: OptimizerPage,
  departments: DepartmentsPage,
  command: CommandPage,
  learning: LearningPage,
  library: LibraryPage,
  crm: CrmPage,
  invoices: InvoicesPage,
  tasks: TasksPage,
  meetings: MeetingsPage,
  projects: ProjectsPage,
  audit_workspace: AuditWorkspacePage,
  free_audit: FreeAuditPage,
  paid_audit: PaidAuditPage,
  docs: ProposalsPage,
  agents: AgentsPage,
  connections: ConnectionsPage,
  intelligence: IntelligencePage,
  taste: TastePage,
  approvals: ApprovalsPage,
  costs: CostsPage,
  audit: AuditPage,
  content: ContentPage,
  ask: AskPage,
  decision: DecisionRoomPage,
  offers: OfferLabPage,
  workers: WorkersPage,
  settings: SettingsPage,
  automations: AutomationsPage,
  seo: SeoPage,
  radar: RadarPage,
  social: SocialPage,
  webstats: WebstatsPage,
  backup: BackupPage,
  media: MediaStudioPage,
  handoff: HandoffPage,
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
