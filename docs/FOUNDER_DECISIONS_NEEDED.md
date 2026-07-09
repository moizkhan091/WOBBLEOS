# Founder Decisions Needed — for Moiz (and co-founders)

This is where I (Claude) log anything that needs a founder decision or sign-off while you're away, so I can keep building without stopping. Newest at the top. Nothing here blocks the build — I pick the safest sensible default and note it so you can correct me later.

Status key: 🟡 OPEN (needs your call) · 🟢 RESOLVED · ⚪ FYI (no action needed, just so you know)

---

## 🟡 OPEN — Set the real team password + session secret before deploy
- **What:** Local dev login currently uses a temp team password `wobbletest123` so I could test. This is fine for local only.
- **Your action before the app goes on the VPS:** run `npm run auth:hash -- "the real team password"` and paste the printed `SHARED_LOGIN_PASSWORD_HASH_B64=...` line into `.env`. Also set a strong `SESSION_SECRET` (32+ random chars) in the VPS `.env`.
- **Default if you do nothing:** the temp password keeps working locally; deploy would use whatever is in the server `.env`.
- Logged: 2026-07-09.

## 🟡 OPEN — Greenlight a live content-graph run (costs a few LLM calls)
- **What:** The multi-agent content graph is built + fully tested, but I have **not** run it live yet because one pack = **5 model calls** (strategist, researcher, copywriter draft, copywriter revise, scorer). Your OpenRouter credits were low (<~$0.80), so I didn't want to spend them without your OK.
- **Your call:** (a) top up credits and tell me to do a live run, and/or (b) tell me to set the content roles (`content_research`, `content_copywriting`, `content_scoring`) to a **cheap** model so a full pack costs ~1-2 cents instead of more. Right now `content_strategy` is mapped to Claude Sonnet 4.5; the others fall back to the default model.
- **Default if you do nothing:** the graph stays built + tested; no spend happens. You can trigger a run anytime via the app once we wire the button, or I can run one when you say go.
- Logged: 2026-07-09.

## ⚪ FYI — What I'm building next (autonomous), and why
Order I chose while you're away, all backend-first + tested + committed:
1. ✅ **DONE — Knowledge Compiler (Chunk 13)** — turns every APPROVED source into small, self-contained knowledge notes (a claim/insight/hook/framework/data-point), each linked to where it came from (provenance), deduped and interlinked so knowledge *compounds* instead of piling up. This is the anti-hallucination foundation: it's what the content team reads so nothing is invented. Karpathy "compile, don't just retrieve" pattern. Built + 331 tests pass + live-verified against the real database (a second identical source *reinforced* existing knowledge instead of duplicating it — exactly the compounding behavior). Committed + pushed.
2. ✅ **DONE (built + tested, live-run pending your OK) — Multi-agent Content graph (Chunk 15 upgrade)** — replaced the single-LLM content call with a real agent TEAM: Strategist → Researcher (grounded in the knowledge above) → Copywriter (draft → self-critique → revise) → Scorer → assembled into a content pack with full provenance and a quality gate. 5 visible agents run per pack. 340 tests pass. Not run live yet (cost — see the open item above). Visuals come later, only AFTER a pack is approved (saves credits).
3. **NEXT** — either (a) the founder-facing UI to see + trigger the content team and browse the knowledge base, or (b) the taste/novelty learning loop, or (c) whatever you tell me. I'll pick the highest-value one and keep going.

If you'd rather I flip the order (content team first, compiler after) or focus somewhere else entirely, tell me when you're back and I'll adjust. Nothing is wasted — the compiler is needed by content either way.

## ⚪ FYI — Minor UI follow-up noted (not urgent)
The memory management screen still shows a "created by / acting as" dropdown that the server now ignores (it uses your actual login instead — a security fix). It works fine; it's just slightly redundant. I'll tidy it to show "acting as <you>" when I next touch that screen.
