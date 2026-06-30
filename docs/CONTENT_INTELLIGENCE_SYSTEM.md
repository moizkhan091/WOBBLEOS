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

---

# Replace-the-agency: self-improving content engine (2026-06-30, Claude council)

Vision: WOBBLE OS fully replaces a social-media + design agency, AI-powered end to end, nothing hardcoded - every decision is the LLM reading APPROVED data (knowledge base, our stats, competitor signals, founder feedback) and producing/deciding from it. New data auto-flows in. Founder approves; the system learns.

## Agency roles -> WOBBLE AI (and the chunk that owns it)

- Strategist (goals, pillars, calendar) -> Content Strategy & Calendar Planner (Chunk 45) + Content Command (14) + Decision Room (24)
- Researcher (trends, competitors, VoC, knowledge) -> Research Radar (12) + Social Intelligence (38) + Knowledge & Competitor Hunters (44) + Voice-of-Customer Mining (48) + Knowledge Base (43)
- Copywriter -> Content Worker (15) + content-brief.ts (built) + Content Excellence Gate (17, built)
- Designer / Creative Director -> Media Worker (22) + reference-selection.ts (built) + Creative Reference Library (21) + Visual Excellence Gate (22) + Design Hunter (38)
- Editor / QA -> Excellence Gate (17) + Visual Gate (22) + brand review
- Community manager (replies, DMs, leads) -> Engagement & Community AI (Chunk 46)
- Analyst (performance, attribution, reports) -> Performance Feedback & Attribution Loop (Chunk 47) + Social/Website Analytics (38/39)
- Repurposing (1 idea -> many formats) -> Repurposing Engine (Chunk 49)
- Account manager / approvals -> Approvals (04) + Content Tracks (16)

## Self-improving content loops

CURRENT (built or specced):
1. Approval-gated learning: nothing updates Brain/knowledge/refs without founder approval (memory_update_proposals - built Ch 10).
2. Writing Excellence Gate (17, built): every draft objectively scored + rewrite instructions -> each generation can be improved before approval; failed drafts never reach the queue.
3. Data-driven content brief (built): reasons from approved knowledge + stats + competitor signals; flags missing data; no hallucination.
4. Reference selection + stored design rationale (built/specced): one ref per asset; rationale feeds learning.
5. Dreaming Engine (36, specced): nightly auditor proposes improvements (model right-sizing, "task done 3x -> propose skill", stale memory, recurring gate failures).
6. Hunters (12/38/44 + design hunter): propose new knowledge/competitor patterns/design refs -> approval -> auto-used next run.
7. Dynamic auto-pickup: workers query the data layer each run, so new approved data is used with no code change.

TO ADD (closes the loop to truly self-improving + world-class):
8. Performance Feedback & Attribution Loop (Chunk 47): after posting, ingest stats and ATTRIBUTE to the packet's hook/angle/format/reference/goal -> update "what works" + reference winRate -> bias future briefs and reference selection -> propose knowledge updates (approval-gated). This is the core self-improvement: the OS learns what actually drives results.
9. Founder-feedback learning: when the founder edits/rejects a draft, capture the edit as a signal -> propose voice/do-not-say/structure updates (Learning 13 + Approvals 04).
10. A/B variants + winner learning: generate variant hooks/creatives (one ref each), post/test, learn winners into Performance Memory (15/22/47).
11. Recurring-issue -> skill update: when the excellence gate flags the same weakness repeatedly, propose a prompt/skill update (34 + 36).
12. Trend Radar (12) + Voice-of-Customer Mining (48): ride rising topics early; pull real audience language for hooks that resonate.
13. Content Strategy & Calendar Planner (45): goal-balanced pillar mix + cadence + repurposing plan, data-driven.
14. Engagement & Community AI (46): read comments/DMs, draft on-brand replies, route leads - approval-gated; engagement signals feed Performance Memory.

## New chunks added (see tracker)

- Chunk 45 - Content Strategy & Calendar Planner
- Chunk 46 - Engagement & Community AI (social inbox, replies, lead routing)
- Chunk 47 - Performance Feedback & Attribution Loop (closes the self-improvement loop)
- Chunk 48 - Voice-of-Customer Mining
- Chunk 49 - Repurposing Engine (1 idea -> many formats)

All follow the 4 non-negotiable rules (data-driven, no-hallucination, dynamic auto-pickup, approval-gated). Nothing hardcoded; the LLM reads approved data and decides.
