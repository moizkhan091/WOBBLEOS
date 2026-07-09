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

function AskPage() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<{ role: "you" | "wob"; text: string; meta?: string; citations?: Record<string, unknown>[]; needsFounderJudgment?: string[]; modelRunId?: string | null }[]>([]);
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
        if (res.type === "answer") {
          const answer = (res.answer ?? {}) as Record<string, unknown>;
          const citations = Array.isArray(answer.citations) ? answer.citations as Record<string, unknown>[] : [];
          const needsFounderJudgment = Array.isArray(answer.needsFounderJudgment) ? answer.needsFounderJudgment.map((item) => String(item)) : [];
          const metaParts = [
            answer.confidence != null ? "confidence " + String(answer.confidence) : null,
            citations.length ? citations.length + " citation" + (citations.length === 1 ? "" : "s") : null,
            answer.modelRunId ? "run " + String(answer.modelRunId) : null,
          ].filter(Boolean);
          setTurns((t) => [...t, { role: "wob", text: String(answer.answer ?? ""), meta: metaParts.join(" - "), citations, needsFounderJudgment, modelRunId: answer.modelRunId ? String(answer.modelRunId) : null }]);
        } else {
          const text = String(res.message ?? (res.type === "route" ? "Intent recognized and routed." : JSON.stringify(res)));
          const meta = [res.intent ? "intent " + String(res.intent) : null, res.module ? "module " + String(res.module) : null, res.status ? "status " + String(res.status) : null].filter(Boolean).join(" - ");
          setTurns((t) => [...t, { role: "wob", text, meta }]);
        }
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
                {m.needsFounderJudgment?.length ? (
                  <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 5 }}>
                    {m.needsFounderJudgment.map((item) => <div key={item} style={{ fontSize: 11.5, color: C.orange }}>{item}</div>)}
                  </div>
                ) : null}
                {m.citations?.length ? (
                  <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {m.citations.slice(0, 8).map((c, idx) => <Tag key={String(c.id ?? idx)} text={String(c.kind ?? "source") + " - " + String(c.label ?? c.id ?? idx).slice(0, 48)} color={String(c.kind) === "source" ? C.blue : C.lime} />)}
                    {m.citations.length > 8 ? <Tag text={"+" + String(m.citations.length - 8) + " more"} color={C.gray} /> : null}
                  </div>
                ) : null}
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

function SourceDetailDrawer({ source, onClose }: { source: Record<string, unknown>; onClose: () => void }) {
  const id = String(source.id ?? "");
  const chunks = useApi<{ chunks: Record<string, unknown>[] }>(id ? "/api/sources/" + encodeURIComponent(id) + "/chunks?limit=20" : "/api/sources/no-source/chunks");
  const intake = useApi<{ runs: Record<string, unknown>[] }>(id ? "/api/sources/" + encodeURIComponent(id) + "/intake?limit=20" : "/api/sources/no-source/intake");
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
      {selected ? <SourceDetailDrawer source={selected} onClose={() => setSelected(null)} /> : null}
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

interface LibAsset {
  id: string;
  title: string;
  kind: string;
  caption: string | null;
  platforms: string[];
  tags: string[];
  status: string;
  sourceType: string;
  sourcePacketId: string | null;
  createdAt: string;
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
  const assetsState = useApi<{ assets: LibAsset[] }>("/api/library/assets?limit=200");
  const postsState = useApi<{ posts: SchedPost[] }>("/api/library/scheduled?limit=200");
  const [assetId, setAssetId] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [when, setWhen] = useState("");
  const [publisher, setPublisher] = useState("manual");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const guard = offlineIf(assetsState) ?? offlineIf(postsState);
  if (guard) return guard;

  const assets = assetsState.data?.assets ?? [];
  const posts = postsState.data?.posts ?? [];
  const scheduled = posts.filter((p) => p.status === "scheduled").length;
  const published = posts.filter((p) => p.status === "published").length;
  const fromCommand = assets.filter((a) => a.sourceType === "content_pack").length;

  async function reload() { assetsState.reload(); postsState.reload(); }
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
  async function postAction(id: string, action: "cancel" | "publish") {
    await fetch(`/api/library/scheduled/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    reload();
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

      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Post queue ({posts.length})</div>
        {posts.length === 0 ? (
          <StateBlock kind="empty" message="No scheduled posts yet. Schedule an asset above." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {posts.map((p) => {
              const asset = assets.find((a) => a.id === p.assetId);
              return (
                <div key={p.id} style={{ ...card, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Tag text={p.platform} color={C.blue} />
                  <Tag text={p.status} color={POST_STATUS_COLOR[p.status] ?? C.gray} />
                  <span style={{ fontSize: 12.5, color: C.white, flex: 1, minWidth: 140 }}>{asset?.title ?? p.assetId}</span>
                  <span style={{ fontSize: 11, color: faint }}>{fmtTime(p.scheduledAt)} · {p.publisher}</span>
                  {p.status === "scheduled" ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      {p.publisher === "manual" ? <button onClick={() => postAction(p.id, "publish")} style={{ ...primaryBtn, padding: "6px 11px", fontSize: 11.5 }}>Mark posted</button> : null}
                      <button onClick={() => postAction(p.id, "cancel")} style={{ ...disabledBtn, opacity: 1, cursor: "pointer", padding: "6px 11px", fontSize: 11.5 }}>Cancel</button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Library ({assets.length})</div>
        {assets.length === 0 ? (
          <StateBlock kind="empty" message="No assets yet. Approve a pack in Content Command (it lands here automatically) or import your existing content." />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
            {assets.map((a) => (
              <div key={a.id} style={{ ...card, padding: "13px 15px" }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 7, flexWrap: "wrap", alignItems: "center" }}>
                  <Tag text={a.kind} color="#B87CFF" />
                  <Tag text={a.status} color={a.status === "published" ? C.lime : a.status === "scheduled" ? C.blue : C.gray} />
                  {a.sourceType === "content_pack" ? <Tag text="from command" color="#2DD4BF" /> : null}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{a.title}</div>
                {a.caption ? <div style={{ fontSize: 11.8, color: muted, marginTop: 5, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.caption}</div> : null}
                {a.platforms.length ? <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>{a.platforms.map((pl) => <Tag key={pl} text={pl} color={C.blue} />)}</div> : null}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

const WIRED: Record<string, React.ComponentType> = {
  command: CommandPage,
  learning: LearningPage,
  library: LibraryPage,
  agents: AgentsPage,
  connections: ConnectionsPage,
  intelligence: IntelligencePage,
  taste: TastePage,
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
