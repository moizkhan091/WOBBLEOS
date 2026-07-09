# Founder Decisions Needed — for Moiz (and co-founders)

This is where I (Claude) log anything that needs a founder decision or sign-off while you're away, so I can keep building without stopping. Newest at the top. Nothing here blocks the build — I pick the safest sensible default and note it so you can correct me later.

Status key: 🟡 OPEN (needs your call) · 🟢 RESOLVED · ⚪ FYI (no action needed, just so you know)

---

## 🟢 RESOLVED — Shared team password set
- The shared team login password is now **`WobbleOS2026`** (all founders use it; pick who you are on the login screen). Set at your request 2026-07-09.
- **Still to do before the VPS deploy:** (1) change it — `npm run auth:hash -- "the real password"` → paste the `SHARED_LOGIN_PASSWORD_HASH_B64=` line into the server `.env`; (2) set a strong `SESSION_SECRET` (32+ random chars) in the server `.env`.

## 🟢 RESOLVED — Live content-graph run done (cheap models)
- Ran the full team live on **`openai/gpt-4o-mini`** for all content roles (per your 77-cent budget). Cost ~1-2 cents total.
- End-to-end proof: compiled a real approved source → 1 knowledge note, then the 5 agents produced a **grounded** LinkedIn carousel pack (hook + caption + CTA + 5 slides + design direction), citing 1 insight / 1 source. Scores impact 7 / brand 7 / platform 8; the quality gate **correctly held it back** (weak gpt-4o-mini draft never reached your approval queue — exactly the safeguard working). The note shows in Learning Engine, the pack + 5 agent-runs in Content Command + Agent Registry.
- As you predicted, gpt-4o-mini output quality is only okay. When credits load, set `content_strategy` + `content_copywriting` to a stronger model (e.g. Claude Sonnet 4.5) via the Model Registry for real quality; keep research/scoring cheap.
- Fixed a real bug found during the run: an unmapped model role used to crash a run — now there's a `default` fallback role.

## ⚪ FYI — What I'm building next (autonomous), and why
Order I chose while you're away, all backend-first + tested + committed:
1. ✅ **DONE — Knowledge Compiler (Chunk 13)** — turns every APPROVED source into small, self-contained knowledge notes (a claim/insight/hook/framework/data-point), each linked to where it came from (provenance), deduped and interlinked so knowledge *compounds* instead of piling up. This is the anti-hallucination foundation: it's what the content team reads so nothing is invented. Karpathy "compile, don't just retrieve" pattern. Built + 331 tests pass + live-verified against the real database (a second identical source *reinforced* existing knowledge instead of duplicating it — exactly the compounding behavior). Committed + pushed.
2. ✅ **DONE (built + tested, live-run pending your OK) — Multi-agent Content graph (Chunk 15 upgrade)** — replaced the single-LLM content call with a real agent TEAM: Strategist → Researcher (grounded in the knowledge above) → Copywriter (draft → self-critique → revise) → Scorer → assembled into a content pack with full provenance and a quality gate. 5 visible agents run per pack. 340 tests pass. Not run live yet (cost — see the open item above). Visuals come later, only AFTER a pack is approved (saves credits).
3. **NEXT** — either (a) the founder-facing UI to see + trigger the content team and browse the knowledge base, or (b) the taste/novelty learning loop, or (c) whatever you tell me. I'll pick the highest-value one and keep going.

If you'd rather I flip the order (content team first, compiler after) or focus somewhere else entirely, tell me when you're back and I'll adjust. Nothing is wasted — the compiler is needed by content either way.

## ⚪ FYI — Minor UI follow-up noted (not urgent)
The memory management screen still shows a "created by / acting as" dropdown that the server now ignores (it uses your actual login instead — a security fix). It works fine; it's just slightly redundant. I'll tidy it to show "acting as <you>" when I next touch that screen.
