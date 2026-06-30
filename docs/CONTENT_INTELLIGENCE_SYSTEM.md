# WOBBLE Content Intelligence & Knowledge System

Date: 2026-06-30
Owner: shared (founder direction + Claude)

Goal: WOBBLE content must be impactful and drive results (awareness, followers, leads, authority, engagement, or sales) - never generic. The system reasons from REAL approved data and improves itself. This doc is the canonical spec for the content knowledge + intelligence layer; chunks below implement it.

## Four NON-NEGOTIABLE rules (every content/LLM path must follow)

1. DATA-DRIVEN: generation reasons from approved data - the Content Knowledge Base, our own performance stats, and competitor signals - not from generic priors. Enforced in code by `src/lib/domain/content-brief.ts` (`buildContentBrief`) which injects only provided data.
2. NO HALLUCINATION: if a needed input is missing/empty, the model must SAY SO and must NOT fabricate stats, results, or competitor claims. The brief tells it exactly this and marks empty blocks "(none provided - do not invent any)". Mirrors Ask WOBBLE's grounding.
3. DYNAMIC AUTO-PICKUP: workers QUERY the data layer at runtime. New approved knowledge, competitor videos, or stats added later flow in automatically on the next run - NO code change, no telling Claude/Codex to update anything. (Knowledge lives in data, not in code.)
4. APPROVAL-GATED KNOWLEDGE: founder can add knowledge directly; hunter AIs PROPOSE new knowledge to an approval queue; nothing enters the production knowledge base or Core Brain without approval.

## Content Knowledge Base

A body of HOW-TO-WRITE knowledge the content engine reads from. Stored as approved memory/source records tagged by kind (so it is queryable + auto-picked-up). Kinds (see `KnowledgeKind` in content-brief.ts):

- framework (e.g. teach-first, problem-agitate-solve, hook-retain-reward)
- hook (proven opening patterns)
- angle (contrarian, data, story, transformation, myth-bust)
- post_type (carousel teardown, listicle, case study, hot take, build-in-public)
- voice (WOBBLE tone rules)
- swipe (great examples to learn structure from - never copy verbatim)
- do_not_say (banned phrases / generic-agency language) - also enforced by Chunk 17
- offer (current offers + positioning for lead/sales goals)

Seed source: the 9 AI-OS transcripts in `ai os youtubevideos/` (already distilled) plus founder additions. The knowledge base grows via founder uploads + approved hunter proposals.

## Goal-aware content

Every content request carries a GOAL (awareness / followers / leads / authority / engagement / sales). The brief maps the goal to a CTA intent (built: `suggestCtaForGoal`) and the founder can override the CTA, OR the system suggests one. Lead/sales goals stay conservative when performance data is thin.

## Inputs that make output strong (and how they connect)

- Our performance stats (Chunk 38/39): what is actually working for us (saves, reach, reply rate). The engine prefers patterns that perform. Auto-fed into briefs.
- Competitor signals (Chunk 12/38): what competitors post and what lands. Learn, never copy or claim as ours.
- Knowledge base (Chunk 34 registry + Source/Memory 09/10): the how-to-write backbone.
- Performance + competitor + knowledge -> `buildContentBrief` -> content worker (Chunk 15) -> excellence gate (Chunk 17) -> approval.

## Hunter AIs (propose -> founder approves -> auto-used)

- Content-Knowledge Hunter: finds new frameworks/hooks/angles/post-types (from creators, the transcripts, the web), proposes to the knowledge approval queue with why-it-fits.
- Competitor Hunter (Chunk 12/38): tracks competitor posts/videos and extracts patterns.
- Design Hunter (Chunk 38/21): finds design references (see CONTENT_CREATIVE_EXCELLENCE_SYSTEM.md).
- Performance Ingestion (Chunk 38/39): pulls social/website stats into Performance Memory.
All hunters are approval-gated and feed the learning loop (Chunk 13/36).

## MORE knowledge/intelligence modules proposed (added to plan)

- Hook Bank, Angle Library, Swipe File, Post-Type Playbooks (typed slices of the knowledge base).
- Performance Memory (what worked, by goal/platform/format) - feeds future briefs.
- Competitor Pattern Library (recurring patterns, not one-off posts).
- Voice-of-Customer mining (pull real audience language from comments/DMs/reviews for hooks that resonate).
- Trend Radar (rising topics/formats to ride early) - approval-gated into content ideas.
- Per-goal "playbooks" that bias structure/CTA by goal.

## Chunk mapping

- Built now: `src/lib/domain/content-brief.ts` (data-driven, goal-aware, no-hallucination brief) + `src/lib/domain/content-excellence.ts` (Chunk 17 writing gate) + `src/lib/domain/reference-selection.ts` (creative refs).
- Chunk 15 Content Worker: MUST call `buildContentBrief` with data loaded live from the data layer; never hardcode strategy.
- Chunk 34 Prompt/Skill Registry + 09/10: store + serve the knowledge base by kind.
- Chunk 12 Research Radar + 38 Social Intelligence: competitor + performance signals + hunters.
- Chunk 13 Learning Engine + 36 Dreaming Engine: turn signals + approvals into proposed knowledge/Brain updates (approval-gated).
- Chunk 43 (NEW) Content Knowledge Base module; Chunk 44 (NEW) Knowledge & Competitor Hunters - see tracker.
