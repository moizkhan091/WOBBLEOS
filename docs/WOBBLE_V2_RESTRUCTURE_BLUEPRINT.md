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

1. **Voice similarity_boost:** RESOLVED → **0.75** (founder confirmed 2026-07-18).
2. **GPT Image 2 path:** RESOLVED — route `openai/gpt-5.4-image-2` (GPT Image 2) through the EXISTING OpenRouter key
   (it accepts reference images). Only confirm the per-image cost + spend cap. No separate OpenAI key needed.
3. **Web analytics:** Netlify Analytics (paid) vs Plausible?
4. **Keyword provider:** which SEO data API (budget)?
5. **Build order:** recommended → (a) CRM client-hub consolidation first (unblocks the richer audit + declutters),
   then (b) Content Studio reference-DNA + topic bank + GPT-Image-2 statics, then (c) lead magnets + research
   layer, then (d) Website & SEO, then (e) HyperFrames reels (heaviest). Founder to confirm/re-order.

---

*This document is the shared plan. Update it as decisions land; do not keep restructure decisions only in chat.*

---

# PART II — Deep detail (content engine, pillars, growth, reels, VPS)

## 12. Content lifecycle — how ONE piece of content is born, shipped, and learned from

The engine is a LOOP, not a one-shot generator. A single asset moves through these stages; the intelligence
layer runs continuously underneath.

1. **Intelligence & Sources (always on).** YouTube learning folders, competitor content, Reddit/communities,
   keyword demand, AI provider docs/changelogs, and WOBBLE's own past-post performance are ingested — with a
   **freshness + dedup guard** (content hash + upsert, so it never rescrapes the same stable item and never pays
   twice; latest, not stale).
2. **Knowledge notes feed the Strategist**, which proposes a **BANK of topic ideas**, each scored by founder-job
   value, authority, freshness, setup friction, risk, outcome, and a proof-test — NOT popularity.
3. **Founder approves topics (human gate #1).** Only approved topics proceed.
4. **Research/Verification layer** verifies every tool/fact against its CURRENT official source, ranks
   alternatives, and drops anything unverified (the credibility guard, section 5).
5. **Copywriter** writes the teaching in WOBBLE voice, mechanism-first, with a self-critique -> revise loop.
6. **Content-value contract check (blocking) + Scorer + Quality + Brand reviewers (human gate #2).**
7. **Format decision** — static / carousel / infographic / reel, chosen per topic + the pillar mix.
8. **Render** — GPT Image 2 (statics/infographics), HTML/CSS (carousel interiors), HyperFrames + VO (reels);
   reference images auto-selected by role; regen = image->image surgical edit.
9. **QA gates** — technical render -> visual/auditory inspection -> EXACT-VERSION founder approval (human gate #3).
10. **Lead-magnet check** — inventory-first: attach an existing magnet if one fits, else the magnet team builds one.
11. **Publish (zernio)** — Post now / Schedule / Mark posted (for the manual poster).
12. **Performance ingest** — impressions, saves, shares, profile actions, leads, downstream outcomes -> feeds
    back into the Strategist. The loop learns what works and does more of it.

Three human gates (topic, content, exact-asset). Nothing publishes without a founder, and every correction mints
a new immutable version (approval never transfers to a changed file).

## 13. Content pillars (concrete for WOBBLE)

A planning prior, not a rigid quota (never force a weak topic to hit a %). Evaluate the last 12 posts; no pillar
above ~34% without a written reason; once 8 posts exist, cover 4+ pillars; don't repeat the same business
problem within 3 posts unless it teaches a genuinely different capability.

| Pillar | ~Mix | The teaching job (WOBBLE, Pakistan-first SMBs) |
|---|---:|---|
| Buildable business automations (flagship) | 25% | A COMPLETE workflow a founder can build/test: missed-call -> text-back recovery, speed-to-lead, review-request on autopilot, WhatsApp follow-up, no-show reduction. Show the tool (n8n/Make), nodes, inputs/outputs, decisions, failure routes, proof test. |
| Tool & stack decisions | 15% | Honest comparison for ONE real job — n8n vs Make vs Zapier for WhatsApp automation; which CRM; which voice-AI. Show switching conditions. |
| Skills / prompts / repos | 15% | A verified resource ranked by founder job, authority, freshness, setup friction, risk, outcome — with a safe example + output check. |
| Copy-paste operating assets | 15% | Prompt packs, checklists, field maps, templates, scorecards, test suites a founder can use today. |
| Agency teardowns | 10% | Reveal the real layers behind what agencies charge for — inputs, decisions, handoffs, QA, costs, human boundaries. (Ties to the anti-agency-dependency positioning.) |
| AI-for-operators | 10% | A current AI release translated into ONE operator decision — who acts, who ignores it, what changed. |
| Build proof & lessons | 10% | A real WOBBLE artifact/test/failure/repair with a measured result + limitations. Earns trust honestly. |

Every topic passes the five-second test (what problem / what outcome / why now). Reject "simplify your process,"
"use AI to be productive." The WOBBLE voice spine (WOBBLE_COMPANY_OS): lead with rebellion (anti-agency-
dependency), close with trust; AI employees + automations INSIDE the business.

## 14. Growth / virality / leads — the actual engine (not vanity)

**Success is defined narrowly:** qualified profile visits, relevant audience growth, **saves + shares from the
intended ICP**, qualified inbound conversations, booked calls, sales opportunities, and **content-influenced
revenue** — NOT followers, NOT generic likes. Until a 28-day owned baseline exists we REPORT baseline collection,
never invent uplift.

**The levers the system actually pulls:**
1. **The hook.** From the studied YouTube hook science (6-word hooks, curiosity gaps, pattern interrupts). Every
   asset opens with a hook impossible to skip, and the hook maps to a promise the body delivers (a hook->
   fulfilment map is required).
2. **Educational depth = saves + shares.** People save/share what makes them smarter — this is why "actually
   teach" is the North Star: depth IS the growth mechanism. Never beg ("save this / follow for more").
3. **Format + angle variety.** The reel format library (16 archetypes) x angles x hook-triggers = hundreds of
   distinct assets before anything rhymes; the static angle system (Pain -> Outcome -> System spine). Variety
   keeps the feed fresh and tests what resonates.
4. **Consistency + cadence.** A dependable output rhythm (the scheduler drives it), not sporadic bursts.
5. **Distribution.** LinkedIn (Moiz personal + WOBBLE company), Instagram reels/carousels; re-skin winners across
   services.
6. **Lead capture, two rails.** (a) A soft CTA — "Book a free AI audit." (b) **Lead magnets** — a genuinely
   useful n8n workflow / prompt pack / checklist behind a landing page + form -> the lead lands in the CRM
   pipeline (section 2), where the whole commercial flow picks it up.
7. **The learning loop.** Performance (saves/shares/leads by ICP) feeds the strategist; it doubles down on
   winners, retires losers. Weekly learning updates tactical beliefs ONLY with variable + sample + evidence +
   confidence + rollback recorded. Positioning/offer/brand changes stay proposals until the founder approves.
8. **Attribution.** UTM/source on every magnet + link -> CRM mapping -> content-influenced pipeline is
   measurable, so "which content made money" is answerable, not guessed.

Virality is a BY-PRODUCT of depth + hook + variety + consistency, verified by real ICP saves/shares — not a
trick we chase.

## 15. Reel production — the detailed pipeline (HyperFrames + voice)

HyperFrames is the ONLY motion-composition engine (not Remotion). Study the Phase-9 renders + the HeyGen launch
repo; match/exceed their timing, music, SFX, transitions, density, and polish while staying original.

**Production sequence (locked):**
1. Approve the content-value packet (topic + teaching job cleared through the gates).
2. Write plain-language narration a smart 14-year-old follows (mechanism, not jargon).
3. Generate Moiz's voice via ElevenLabs FIRST (before timing scenes) — voice lock: id 512Jeow4Rpsq80q0SYn7,
   eleven_multilingual_v2, speed 1.0, stability 0.4, style 0, speaker_boost on, mp3_44100_128.
   OPEN: similarity_boost **0.75** (founder-confirmed).
4. Word/character timestamps are the SOURCE OF TRUTH (ElevenLabs timestamps API). Never eyeball timing.
5. Derive EVERYTHING from the alignment: scene boundaries, captions, on-screen terms, callouts, transitions,
   SFX, and music beats all come from the same word timings -> perfect caption/narration sync.
6. Build varied scenes in HyperFrames using the reel format library grammar (16 archetypes): universal spine =
   Hook (1.5s) -> Value/Proof -> mechanism reveal -> soft CTA; DR reels 9-30s, teaching 45-60s. Clean white/grid
   where it helps, occasional louder color moments, vary the FIRST FRAME + backgrounds so no two reels rhyme.
   Guardrails: no format twice in a row, cap any format at 15-20% of the slate.
7. Readability: exact captions, safe regions, clear causality, enough dwell time for a nontechnical viewer to
   understand each step. ONE soft CTA — "Book a free AI audit" — never comment-bait.
8. Verify: render -> probe the file -> inspect sampled frames -> listen to the FULL audio -> confirm
   caption == narration. A tag-stripping parser keeps any [expression tags] out of on-screen captions.

**Infra note:** HyperFrames compositions are HTML/JS (34 HTML + 31 JS in Phase-9). Rendering them to MP4 needs a
**headless-browser render worker** (Puppeteer/Playwright capturing frames) + **ffmpeg** to encode and mux the VO,
music, and SFX. That render worker runs on the VPS (section 16), not in the web process — it's heavy and
long-running, so it's a durable media job (the worker-video lane already exists for exactly this).

## 16. VPS / production architecture — how the whole thing runs

The OS is a Next.js app + Postgres(+pgvector) + worker processes + a media/storage volume. Today it runs as a
docker-compose stack (docker-compose.prod.yml: app / worker / worker-video / migrator / db). Production = that
same stack on a **VPS**, with real domains, TLS, and object storage.

**Target topology (a 4-8 vCPU / 16-32 GB VPS):**
- DNS/Cloudflare -> Caddy/nginx (TLS, reverse proxy) -> app (Next.js :3000).
- Postgres 16 + pgvector on a persistent volume.
- worker = general jobs + the scheduler LEADER (one Postgres advisory-lock holder, so cadences never double-fire).
- worker-video = heavy media: HyperFrames render (headless browser + ffmpeg) + image gen, so it can't starve the
  general worker.
- Durable jobs: content generation, scrape/intake, knowledge compile, scheduled posts (zernio), performance sync.
- Storage volume (or S3-compatible object storage): images, reels, voiceovers, backups.
- Netlify hosts the marketing SITE separately; the Website&SEO module reads its analytics over an API.

**Production concerns + how they're handled (mostly already built):**
- **Build/deploy:** CI builds the images (stable network -> npm ci works there, unlike the local box). Deploy the
  CI-built images to the VPS via scripts/stack-build.sh (or pull pre-built). ONE build id stamps every service ->
  the version-parity gate refuses a split-brain stack.
- **Secrets:** all provider keys in the VPS env only (OpenRouter, OpenAI/GPT-Image-2, ElevenLabs, Tavily, Apify,
  zernio, Plausible/Netlify, keyword API). Never baked into the image. The provider-budget ledger + kill switches
  already cap and can freeze spend.
- **Workers + scheduler:** exactly one worker holds scheduler leadership (no double-firing). worker-video runs the
  heavy render/gen. Both heartbeat to /api/health/worker.
- **Durability:** jobs + media_jobs with leases + bounded retries + dead-letter recovery already exist — a crash
  mid-render is reclaimable and never double-spends.
- **Scheduled publishing:** the scheduler dispatches due posts to zernio at their time; earned-autonomy decides
  whether a post auto-fires or waits for a founder confirm.
- **Storage:** media on a persistent volume for a single VPS; move to S3-compatible object storage when scaling to
  multiple app replicas. Backups via the backup module (on-demand full JSON export; never auto-delete).
- **Scaling path:** scale worker/worker-video horizontally for more throughput (scheduler leadership stays single);
  managed Postgres when the DB grows; a CDN in front of served media.

**Recommendation:** one VPS runs everything to start (the compose stack). Split the DB to managed Postgres and
media to object storage only when volume demands it. The local Windows box stays a dev/UAT convenience — the VPS
is the real home, and CI (not the flaky local build) is the gate that guarantees what deploys there compiles.

---

# PART III — Making the content engine best-in-class

Content is the growth engine, so it must be the strongest module. Two things here: (17) the CONFIRMED image
capability (use the OpenRouter key — no OpenAI key needed), and (18) the upgrades that take the content system
from "good generator" to "best-in-class."

## 17. Image generation — CONFIRMED via OpenRouter (use the existing OpenRouter key)

Verified live against the OpenRouter model list 2026-07-18:
- **`openai/gpt-5.4-image-2`** = GPT Image 2. `input = [image, text, file]` → **accepts reference images + prompt.**
- `openai/gpt-5-image`, `openai/gpt-5-image-mini` — same (take reference images).
- Cheaper for volume / carousel covers: `google/gemini-2.5-flash-image` (~$0.04/img, tested), `gemini-3-pro-image`.
- EVERY image-output model on OpenRouter accepts image INPUT, so both jobs work through the OpenRouter key:
  1. **Generate** a static/infographic from a 100-line prompt + reference images.
  2. **Regen** = send the image back as a reference + a change-only prompt → surgical edit.
- **DECISION: no separate OpenAI key needed** — route GPT Image 2 through OpenRouter. Keep `gemini-2.5-flash-image`
  as the cheap default for high-volume/covers, GPT-Image-2 for the hero statics/infographics that need perfect
  text rendering.
- OPEN: GPT-Image-2's per-image price isn't in the model list — confirm cost + set a per-run cap before spend.
  The provider-budget ledger already enforces caps + a kill switch.

## 18. Upgrades to be best-in-class (fold into the design)

### 18.1 Sourcing (the input sets the ceiling)
1. **Vision-analyze the winners, not just transcripts.** The LLM *looks* at top statics/reels and extracts WHY
   they worked (hook, hierarchy, the bold-character attention pattern, motion beats) — not just reads captions.
   (We already proved live vision on the static library; make it a standing analysis over winners.)
2. **Trend velocity.** Score topic MOMENTUM — catch rising topics + breaking AI releases early, before
   saturation, instead of teaching what's already everywhere.
3. **Competitor white-space.** Map what competitors teach → target the GAPS nobody explains well (differentiated,
   not a rehash).
4. **Audience-language mining.** Pull the EXACT words the ICP uses (Reddit, comments, DMs, forums) so hooks sound
   like the reader's own thoughts.
5. **Own performance as a first-class source.** WOBBLE's winners/losers feed back: which hook type / format /
   angle / topic drove saves + leads → double down. (Closes the loop from section 14.)
6. **Source scoring + pruning.** Rate every source by relevance / freshness / reliability; auto-retire weak ones;
   founder can add/remove. (A `source_quality_checker` agent already exists in the registry — activate it.)

### 18.2 Pillars (strategy, not a frozen quota)
1. **Evidence-driven mix.** The pillar % SHIFTS toward what converts (saves/leads), not a fixed table — big
   shifts need founder approval.
2. **Funnel-mapped pillars.** Each pillar carries an intent: awareness/viral (TOFU), trust (MOFU), lead-gen
   (BOFU). Balance the FUNNEL, not just topic spread.
3. **Series, not just one-offs.** Multi-part campaigns (e.g. a 5-part "build your AI receptionist") build
   anticipation and bring people back — a narrative, not scattered posts.
4. **Depth ladder per pillar.** Beginner → advanced within each pillar so the audience LEVELS UP over time — that
   is what creates dependence and authority (and pulls them toward the paid service).

### 18.3 System (what separates world-class from a generator)
1. **Adversarial quality.** A skeptic agent tries to REFUTE each topic's value + a differentiation agent kills
   rehashes; only survivors ship. (Same multi-agent adversarial pattern as the golden-mission gate + the
   Offer Validation Lab already built.)
2. **Taste learning.** The founder's approvals / rejections / edits TRAIN the system's taste (the `taste` module
   + `founder_taste` memory bank exist) → the topic bank + drafts get more "Moiz/WOBBLE" every week without
   overwriting brand truth.
3. **Cross-format repurposing.** One deeply-researched, verified topic → a reel + a carousel + a static + a lead
   magnet, so the expensive research is amortized and WOBBLE OWNS a topic across formats.
4. **Novelty enforcement.** Measure similarity vs past content AND references; never rehash a topic/angle within
   N posts; require a distinct teaching job from nearby assets.
5. **Hook + format A/B learning.** Test hook styles + formats, learn which drive ICP saves/leads, feed back into
   the strategist's scoring.
6. **The verification moat.** Always-current, primary-source-verified tool intel (section 5) is the single thing
   that separates a TRUSTED teacher from every other AI creator posting stale or wrong claims. This is the
   defensible edge — guard it hardest.
7. **Reference-DNA that learns.** WOBBLE's own top performers get added BACK as references → the visual/narrative
   standard compounds instead of drifting.

### 18.4 The one-line north star for the module
> Best sources in (verified, fresh, winner-analyzed) → strongest ideas out (adversarially filtered, funnel-mapped,
> founder-approved) → deepest teaching (mechanism, not filler) → rendered to the static/reel standard → published,
> measured, and fed back so it compounds. Content is not a generator; it is a learning growth machine.

---

## 19. Resolved infra decisions (2026-07-18, founder-confirmed / researched)

- **Voice similarity_boost = 0.75** (founder-confirmed).
- **Image gen = `openai/gpt-5.4-image-2` via OpenRouter** (that IS the latest OpenAI image model on OpenRouter;
  no literal `openai/gpt-image-2` id exists there). Accepts reference images + prompt; regen = image→image.
  Cheap default `google/gemini-2.5-flash-image` for volume/covers. No OpenAI key needed.
- **Web analytics = Plausible** (recommended), NOT Netlify Analytics. Netlify Analytics has NO official public
  API (only an undocumented, unsupported endpoint Netlify says not to use in prod). Plausible = one script tag on
  the Netlify site + a real Stats API the OS can auto-pull on a cadence; privacy-first; ~$9/mo. GA4 Data API is
  the free alternative if the founder prefers Google's numbers.
- **Website auto-change = suggestions-first.** The OS reads analytics → emits ranked CRO/lead suggestions
  (headline, CTA, form placement, speed) the founder applies in Claude design. Auto-PR only once the site's git
  repo is connected to the OS (safe, reviewable). The OS never blind-edits a site it didn't build.
- **Keyword data = DataForSEO** (pay-as-you-go, ~$1.10 / 10k keywords, NO Google Ads account needed) for exact
  volumes + keyword ideas, plus **Google Trends** ($0.001/request via DataForSEO) for the trend-velocity signal.
  Google Keyword Planner (free) is the fallback but needs a Google Ads account + dev-token approval and only
  returns ranges without an active campaign. All keyword/analytics spend runs under the provider-budget ledger.
