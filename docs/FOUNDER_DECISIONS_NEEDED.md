# Founder Decisions Needed — for Moiz (and co-founders)

This is where I (Claude) log anything that needs a founder decision or sign-off while you're away, so I can keep building without stopping. Newest at the top. Nothing here blocks the build — I pick the safest sensible default and note it so you can correct me later.

Status key: 🟡 OPEN (needs your call) · 🟢 RESOLVED · ⚪ FYI (no action needed, just so you know)

---

## 🟡 OPEN — Set the real team password + session secret before deploy
- **What:** Local dev login currently uses a temp team password `wobbletest123` so I could test. This is fine for local only.
- **Your action before the app goes on the VPS:** run `npm run auth:hash -- "the real team password"` and paste the printed `SHARED_LOGIN_PASSWORD_HASH_B64=...` line into `.env`. Also set a strong `SESSION_SECRET` (32+ random chars) in the VPS `.env`.
- **Default if you do nothing:** the temp password keeps working locally; deploy would use whatever is in the server `.env`.
- Logged: 2026-07-09.

## ⚪ FYI — What I'm building next (autonomous), and why
Order I chose while you're away, all backend-first + tested + committed:
1. ✅ **DONE — Knowledge Compiler (Chunk 13)** — turns every APPROVED source into small, self-contained knowledge notes (a claim/insight/hook/framework/data-point), each linked to where it came from (provenance), deduped and interlinked so knowledge *compounds* instead of piling up. This is the anti-hallucination foundation: it's what the content team reads so nothing is invented. Karpathy "compile, don't just retrieve" pattern. Built + 331 tests pass + live-verified against the real database (a second identical source *reinforced* existing knowledge instead of duplicating it — exactly the compounding behavior). Committed + pushed.
2. **IN PROGRESS — Multi-agent Content graph (Chunk 15 upgrade)** — replace the single-LLM content call with a real agent TEAM (Strategy → Research/Competitor/Brand/Taste in parallel → Ideation → Copywriting w/ self-critique → Assemble pack → founder review → Learning). Reads the compiled knowledge above. Visuals only AFTER pack approval (saves credits).

If you'd rather I flip the order (content team first, compiler after) or focus somewhere else entirely, tell me when you're back and I'll adjust. Nothing is wasted — the compiler is needed by content either way.

## ⚪ FYI — Minor UI follow-up noted (not urgent)
The memory management screen still shows a "created by / acting as" dropdown that the server now ignores (it uses your actual login instead — a security fix). It works fine; it's just slightly redundant. I'll tidy it to show "acting as <you>" when I next touch that screen.
