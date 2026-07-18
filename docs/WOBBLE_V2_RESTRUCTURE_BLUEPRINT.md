# WOBBLE OS — V2 Restructure Blueprint

Status: PLAN (not built). Shared source of truth for every builder (Claude, Codex, Gemini, Antigravity).
Author pass: 2026-07-18. Supersedes nothing — extends the existing OS; nothing here is a destructive rewrite.

This is the founder-approved plan from the 2026-07-18 planning session. Decisions locked: (1) commercial
artifacts are **client-only** (created from a CRM client, never standalone); (2) the 42-module sidebar collapses
into **~7 primary modules + a System drawer**; (3) a real **Content Studio**, **Website & SEO**, **lead-magnet
engine**, and a **strict tool-research/verification layer** are added.

---

## 0. North-Star editorial position (the WHY behind everything)

WOBBLE is an agency that **actually teaches**. The ICP (Pakistan-first owner-led SMBs) must get *smarter and
more capable* from our content, not just impressed. This is the opposite of the typical agency post that only
advertises itself.

- **Bad content** (what we NEVER ship): "3 steps to automate — 1) list your tasks, 2) find what's repetitive,
  3) automate it." It names a shape but teaches nothing.
- **Good content** (the standard): the real mechanism — *which* tool (e.g. n8n), the actual workflow, the
  nodes/inputs/outputs, the decisions, the failure paths, a worked example, and a way to prove it works.
- Teaching does NOT cannibalise the service: a DIY explanation builds trust; production infrastructure,
  integrations, reliability, QA, security, and operating ownership remain the paid service. (Same doctrine as
  the personal-brand handoff, applied to WOBBLE with WOBBLE branding.)

This position drives the content-value contract, the research/verification layer, and the lead magnets below.

---

## 1. Module restructure (42 → ~7 + System drawer)

Locked shape. Each primary module ABSORBS several of today's modules (no capability lost — reorganised).

| # | Primary module | Absorbs (today's modules) | Role |
|---|---|---|---|
| 1 | **Ask WOBBLE** (first/center) | ask | Universal command surface over every module + memory. |
| 2 | **Command Center** (second) | command, cockpit, approvals | One pane: what needs a founder, spend, live activity. |
| 3 | **Intelligence & Sources** (feeds everything) | sources, radar, intelligence, learning | Ingest → verify → compile knowledge → FEED content/CRM/offers. The cross-cutting brain. |
| 4 | **Content Studio** | content, library, media | Reference DNA + topic bank + multi-agent creation + one-click publish. |
| 5 | **Website & SEO** | seo, social, webstats | SEO/GEO/AEO + web analytics + keyword research + on-site content. |
| 6 | **CRM / Pipeline** (commercial hub) | crm, free_audit(Quick Pitch), paid_audit, docs(Proposals), invoices, meetings, projects, org | Add client → everything commercial spawns FROM the client. |
| 7 | **WOBBLE HQ** | offers, decision, tasks | Founder planning: offers, decision room, tasks, org strategy. |

**System drawer** (collapsed, admin): agents, workers, connections, skills, comms, security, memory, taste,
costs, audit, optimizer, backup, settings, handoff, automations, brain. These stay reachable but out of the way.

The collapsible-group sidebar (already shipped, #15) makes this clean: primaries expanded, System collapsed.

> NOTE: "Intelligence feeds everything" is now STRUCTURAL — module #3 is the declared upstream of #4/#5/#6.
> Nothing in Content/CRM/Website invents facts; it reads verified knowledge from #3.

---

## 2. CRM / Pipeline — the commercial hub (LOCKED: client-only)

**The problem this fixes:** the Paid Audit only asked for 3 fields (business name, industry, notes) because it
was a standalone form with no client behind it. Fix: **a client is the container; artifacts inherit its context.**

**Flow:**
1. **Add a client to the pipeline** — the ONLY entry point. No standalone "create audit/pitch/proposal" buttons
   anywhere else in the OS.
2. The client card captures its context **once**: industry, notes, the website/social scrape, discovery from
   calls (Meeting Intelligence facts), qualification grade (Qualification Council). Scrape/enrich runs **once**
   and is stored on the client — never re-run per artifact.
3. **Click the client → the client workspace opens** (this is the Org Workspace already built, evolved into the
   CRM client detail). Tabs: Overview/Journey · Discovery · Artifacts & Lineage. Actions on the client:
   **Run Quick Pitch · Run Paid Audit · Create Proposal.**
4. Each action **inherits the stored client context**. The **Paid Audit specifically gets richer inputs now**:
   the stored discovery notes + qualification + social/website scrape + any prior Quick Pitch — not just 3
   fields. That's the fix.
5. Manual control preserved: a founder can add leads on any pipeline stage by hand, edit client info, and move
   stages (all audited). The high-level pipeline UI stays here.

**Delta vs today:** the org-workspace data layer + `/api/org/[companyId]` already exist; the audit already links
to `companyId` and advances the journey stage (proven live 2026-07-18). New work = fold the creation actions
INTO the client detail, feed the audit graph the stored context, and remove the standalone modules.

---

## 3. Content Studio — the big new build

The multi-agent spine EXISTS (`content_strategist → content_researcher → content_copywriter → content_scorer`
+ `content_quality_reviewer` + `content_brand_reviewer` + `content_excellence_gate`, run by
`content_orchestrator`). What's new is the layers around it. Adapt the personal-brand
`CLAUDE_CONTENT_PRODUCTION_HANDOFF.md` — WOBBLE branding (logo present; the personal one prints only MOIZ KHAN).

### 3.1 Reference / Creative-DNA library
- Ingest the two folders as the FINAL design standard (as `design_reference` / `brand_reference` sources):
  - **Static library** — `Wobble-Social-Library-UPLOAD` (196 statics, 35 campaigns).
  - **Reel library** — `PHASE-9-VIDEO-REELS` (140 rendered reels + HyperFrames compositions).
- LLMs study them for the **mechanism only** — hierarchy, bold characters, "nothing on screen without a reason,"
  attention patterns, motion grammar — never a close copy.
- Each reference carries a **bounded role** (identity / product / composition / lighting / palette / typography /
  material / mood / motion / information-architecture). A composition reference must NOT hijack branding/wording.
- Founder can **add / pin / exclude / replace / remove** references; future jobs auto-pick up the change.
- Similarity is measured vs references AND recent WOBBLE content (learn the mechanism, avoid near-duplicates).

### 3.2 Knowledge + source feed (the "feeds everything" upstream, module #3)
- YouTube learning folders (storytelling, hooks, algorithms, scripting, viral hooks) → transcript → knowledge
  compiler → what the strategist reads. (Transcribe audio; captions alone insufficient.)
- Live sources per the source taxonomy (23 types already scaffolded): AI provider docs, competitors, Reddit,
  keyword demand, owned post performance.
- **Freshness + dedup loop (must-build):** every ingested record gets a stable platform ID, canonical URL,
  capture time, published time, raw payload, normalized fields, and a **content hash**. Upsert incrementally —
  **never rescrape the same stable item, never pay twice.** "Latest, not stale." Missing data stays missing.

### 3.3 Topic bank → founder approval (human loop is mandatory)
- The strategist + research layer produce a **bank of rated topic ideas** (scored by founder-job value,
  authority, freshness, setup friction, risk, outcome, test — not popularity).
- Every idea passes the **five-second test** (what problem / what outcome / why now) and the content-value
  contract (see 3.6). Vague topics are rejected.
- **Only founder-approved topics get produced.** Human loop at every gate.
- Content pillars (WOBBLE mix — buildable automations, tool/stack decisions, skills/prompts/repos, copy-paste
  assets, agency teardowns, AI-for-operators, build proof). No pillar > ~34% of the last 12 without a reason.

### 3.4 Format + render (LLM decides format intelligently)
The LLM picks static / carousel / reel / infographic per topic, then:
- **Statics & text-heavy infographics → GPT Image 2** (OpenAI images API; the `.image-api-credentials.local.txt`
  key in Phase-9). A **100-line, decision-dense prompt**: exact visible copy + hierarchy, physical setting,
  camera body/focal length/aperture/viewpoint, motivated light + shadow direction + contact shadows + falloff,
  paper fibres/folds/ink variation/imperfect baselines, realistic reflections/perspective/occlusion, and
  anti-synthetic constraints (no AI glow, no repeated glyphs, no fake bokeh). **Text is rendered BY the model**
  (GPT Image 2 renders text reliably) — no manual overlay. Send the relevant reference images with the prompt.
  Goal: looks like a human wrote it and shot it on a phone, not a sparse AI poster. Benchmarks: the 6 LinkedIn
  infographic folders (02/04/06/08/10/12).
- **Carousels** → cover = GPT Image 2 (catchy, static-grade); **inner slides = deterministic HTML/CSS** (exact
  text-heavy education, cheap to produce). Only the cover needs the expensive render.
- **Reels → HyperFrames** (Phase-9 grammar) + **ElevenLabs VO** using the Moiz voice lock. Word/character
  timestamps drive scene boundaries, captions, callouts, SFX, music beats.
  - ⚠️ **OPEN: voice similarity_boost.** The content handoff says `0.65`; Phase-9 `VOICE-SETTINGS.md` says
    `0.75`. Founder to confirm which is canonical before any reel render. Everything else locked:
    voiceId `512Jeow4Rpsq80q0SYn7`, model `eleven_multilingual_v2`, speed 1.0, stability 0.4, style 0,
    speaker_boost on, output `mp3_44100_128`.
- WOBBLE logo/branding present on WOBBLE assets (unlike the personal-brand rule).

### 3.5 Regen (surgical, consistent)
- To change a produced image: send THAT image back to GPT Image 2 as a reference + a **change-only prompt** →
  it edits exactly what's asked, preserving the rest. Each correction = a new immutable version; approval never
  transfers to a changed file (must re-approve the exact hash).

### 3.6 Quality gates (7, human-in-the-loop) + the content-value contract
- Gates: research truth → content value/comprehension → creative direction → technical render → visual/auditory
  inspection → exact-version owner approval → publishing lock. An expensive render never rescues weak teaching;
  a valid file is not creative approval; a high model score never overrules "Moiz doesn't like it."
- **Content-value contract** (blocking — no asset produced until met): one clear ICP + start/target knowledge
  level; one specific problem/outcome/promise/success test; current primary-source verification for every tool/
  command/repo/price/limit; ≥1 credible alternative + why this route; a worked example (start → steps → finish →
  test); ≥4 mechanism steps; failure checks + human overrides; ≥12 actionable info units; a distinct teaching
  job from nearby posts. (Full contract inherited from the content handoff.)

### 3.7 Content Library + one-click publish (zernio)
- **Upload the existing content** (196 statics + 140 reels) — shown at their **real aspect ratio** (NOT uniform
  boxes), reels **auto-play**, captions displayed.
- Per item: **Post now** (zernio one-click) · **Schedule** · **Mark posted** (for the human who currently posts
  manually — so already-live posts are tracked without re-posting).
- The `library` module already has `zernio.ts` + a `webhooks/zernio` route — the publisher rail is partly wired;
  finish the one-click/schedule/mark-posted actions + the real-aspect gallery.

---

## 4. Lead-magnet engine (NEW — founder addition)

Lead magnets are first-class, produced by an LLM team, and **recyclable**.

- **Cadence is the LLM's call** — one per post, or a few a month; it decides based on evidence + inventory. Not
  a fixed quota.
- **Inventory-first:** before making a new lead magnet, the LLM checks the existing lead-magnet inventory — if a
  fitting one exists, reuse/route it; only if nothing fits does it build a new one. Everything is stored so it's
  easy to see, send, and **reuse down the line** (a magnet made for one post can serve future posts).
- **Depth standard (hella detailed + educational):** a magnet is NOT a pretty PDF. It's a usable outcome — a real
  **n8n workflow**, a **prompt pack**, a checklist/field-map/template/scorecard/SOP/test-suite/calculator, or a
  resource library — teaching the real mechanism (same "actually teach" doctrine as §0). Learn from how the
  reference creators (in the handoff) teach: mechanism, inputs, decisions, proof — not advertising.
- Each magnet product carries: evidence ledger + claim verification, complete content + examples, mobile-readable
  artefact, landing page + form + consent + delivery + thank-you, nurture path + CTA, UTM/source attribution +
  CRM mapping, and tested links/submission/delivery/analytics.
- Portfolio discipline: one flagship for the core audience + a small number of niche-specific magnets only when
  evidence shows a distinct problem and enough qualified demand. Refresh/retire by pipeline + revenue, not
  download count.

---

## 5. Strict tool-research + verification layer (NEW — founder addition; credibility guard)

The single biggest credibility risk is teaching a tool/feature that is wrong, outdated, or doesn't exist. AI
tools ship updates and new tools launch **daily**. So:

- A **dedicated research/verification sub-team (1-2 strict AI roles)** runs BEFORE any tool is named in content
  or a lead magnet. It:
  1. Researches the tool's **current** capabilities, features, limits, and pricing from the **official primary
     source** (provider docs / maintainer repo / changelog) — with capture time + freshness.
  2. Pulls **recent updates** (a tool's behaviour may have changed last week).
  3. Enumerates **credible alternatives** for the same job.
  4. **Ranks** them by founder-job fit, authority, freshness, setup friction, risk, outcome, and a proof test —
     NOT popularity.
  5. Emits a **verdict**: only tools that pass verification (real + current + best-fit) are allowed into that
     type of post. Competitor/Reddit/search signals reveal *demand and language* but NEVER prove a technical
     capability — that must come from a current official source.
- **Hard rule:** no claim about a tool/command/repo/price/limit ships without a current primary-source citation.
  Missing/uncertain → the claim is dropped, never guessed. This protects "we actually teach and we're right."
- This is the same discipline as the Offer Validation Lab / Qualification Council already built (dimension agents
  + evidence + verdict) — reuse that pattern for tool verification, backed by Tavily/Apify + doc fetches.

---

## 6. Website & SEO module

- **SEO + GEO + AEO** (answer-engine optimisation) + on-site content + data-backed SEO.
- **Web analytics:** the site is on **Netlify**. Two clean paths — Netlify's Analytics API (their paid add-on),
  OR **Plausible** (the `webstats` module ALREADY supports Plausible; connect `PLAUSIBLE_API_KEY` + site to light
  it up). Recommend Plausible unless you already pay for Netlify Analytics.
- **Keyword research for real results:** wire a keyword-data provider (e.g. DataForSEO / an SEO API) into the SEO
  engine so keyword targeting is grounded in real search demand, then the engine drafts pillars/keywords/blog
  outlines (the `seo` module already produces these — it just needs the real keyword feed + analytics loop).
- The analytics → SEO loop: real traffic/keyword data feeds which content to make next (closes to module #3).

---

## 7. WOBBLE HQ

Founder command surface for the business itself: **Offers** (offer lab + the 34-sheet catalogue + the
11-agent Offer Validation Lab already built), **Decision Room** (scored decisions with reasoning trail),
**Tasks**, and org-level planning. Consolidates the strategy/founder modules into one place.

---

## 8. Ask WOBBLE + Command Center

- **Ask WOBBLE** is the first, central surface — the universal command router (already wired: intent → capability
  → one department, audited). It routes across all 7 modules and interrogates memory in natural language.
- **Command Center** is second — the read-only one-pane overview (approvals pending, spend vs budget, live
  activity, module health). Already built.

---

## 9. Docker / deploy recommendation

- The **local box's Docker build keeps failing `npm ci`** on a flaky network; CI (GitHub, stable network) builds
  every commit cleanly. So: **do not treat the local Docker stack as the deploy target.**
- **Development:** use `npm run dev` (works; how the new UI was verified) + CI as the build gate.
- **Deploy:** deploy the CI-built images to a **real host** (a VPS / managed host), not the flaky local box.
- Optional hardening: add `npm ci` retry/timeout + a registry mirror in the Dockerfile so local rebuilds stop
  failing — but don't block the plan on it.

---

## 10. What exists today vs. what's NEW (the delta for builders)

**Exists + proven (reuse, don't rebuild):**
- Content multi-agent graph (9 agents); source-intake taxonomy (23 types) + knowledge compiler; the commercial
  spine (Company Twin, Qualification Council, Meeting Intelligence, Offer Validation Lab, commercial journey +
  artifact lineage, `/api/org/[companyId]`, the Org Workspace UI); provider layer (OpenRouter text+vision+image,
  budget-guarded; ElevenLabs voice; Tavily/Apify evidence); the golden-mission CI release gate; the paid-audit
  graph (5 nodes, fixed 2026-07-18). Collapsible sidebar (#15).

**New to build (this blueprint):**
- Module consolidation (42 → 7 + System drawer) — mostly nav/routing + moving views.
- Client-only commercial creation (fold Quick Pitch / Paid Audit / Proposal into the CRM client; feed the audit
  the stored context; scrape-once).
- Content Studio: reference-DNA ingestion + roles, freshness/dedup source loop, topic bank + rating + approval,
  GPT-Image-2 static/infographic rendering, HTML carousel interiors, HyperFrames reel pipeline + VO timing,
  regen, real-aspect library + zernio one-click/schedule/mark-posted.
- Lead-magnet engine (inventory-first, recyclable, deep-educational).
- Strict tool-research/verification layer.
- Website & SEO (Netlify/Plausible analytics + keyword provider + AEO/GEO).

---

## 11. Open decisions (need the founder)

1. **Voice similarity_boost:** 0.65 (content handoff) vs 0.75 (Phase-9 VOICE-SETTINGS)?  →
2. **GPT Image 2 path:** direct OpenAI (the Phase-9 key) vs via OpenRouter — confirm the key is an OpenAI key +
   whether we may spend on image gen (and the per-run cap).
3. **Web analytics:** Netlify Analytics (paid) vs Plausible?
4. **Keyword provider:** which SEO data API (budget)?
5. **Build order:** recommended → (a) CRM client-hub consolidation first (unblocks the richer audit + declutters),
   then (b) Content Studio reference-DNA + topic bank + GPT-Image-2 statics, then (c) lead magnets + research
   layer, then (d) Website & SEO, then (e) HyperFrames reels (heaviest). Founder to confirm/re-order.

---

*This document is the shared plan. Update it as decisions land; do not keep restructure decisions only in chat.*
