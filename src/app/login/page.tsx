"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const LIME = "#B8FF2C";

const glass: React.CSSProperties = {
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "linear-gradient(152deg,rgba(255,255,255,0.075),rgba(255,255,255,0.02))",
  backdropFilter: "blur(24px) saturate(135%)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 30px 60px -32px rgba(0,0,0,0.85)",
};
const inputStyle: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.28)", color: "#F2F4F1", fontSize: 14, outline: "none" };
const labelStyle: React.CSSProperties = { fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,244,241,0.5)", fontWeight: 600, marginBottom: 7 };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) {
        // Keep the wrong-credential copy identical for a bad email and a bad password — the server
        // deliberately doesn't distinguish them, and the UI must not leak the difference either.
        setErr(
          j.error === "invalid email or password"
            ? "Wrong email or password."
            : String(j.error ?? "Login failed."),
        );
        setBusy(false);
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next && next.startsWith("/") ? next : "/command");
    } catch (error) {
      setErr(String(error));
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <form onSubmit={submit} style={{ ...glass, width: 400, maxWidth: "100%", padding: "34px 34px 30px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 26 }}>
          <div style={{ fontWeight: 600, fontSize: 30, letterSpacing: "-0.04em" }}>wobble<span style={{ color: LIME }}>.</span></div>
          <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "rgba(242,244,241,0.4)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, padding: "3px 6px", fontWeight: 500 }}>OS</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 5 }}>Sign in to WOBBLE OS</div>
        <div style={{ fontSize: 12.5, color: "rgba(242,244,241,0.5)", marginBottom: 22, lineHeight: 1.5 }}>Sign in with your own founder account. Your actions are attributed to you.</div>

        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>EMAIL</div>
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@wobble.example"
            autoFocus
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 18 }}>
          <div style={labelStyle}>PASSWORD</div>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            style={inputStyle}
          />
        </div>

        {err ? <div role="alert" data-testid="login-error" style={{ fontSize: 12.5, color: "#FF6B00", marginBottom: 14, lineHeight: 1.4 }}>{err}</div> : null}

        <button type="submit" disabled={busy || !password || !email} style={{ width: "100%", padding: "13px 14px", borderRadius: 12, border: "none", background: LIME, color: "#0A0A0A", fontSize: 14, fontWeight: 700, cursor: busy || !password || !email ? "default" : "pointer", opacity: busy || !password || !email ? 0.6 : 1 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
