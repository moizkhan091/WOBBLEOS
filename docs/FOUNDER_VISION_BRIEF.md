# WOBBLE OS - Founder Vision Brief (CANONICAL - every builder MUST read before content/source/memory/agent/creative work)

This is the source-of-truth for WHAT and WHY. If a chunk's build would contradict this, this wins. Companion docs: ARCHITECTURE_ALIGNMENT_REVIEW.md (audit + plan), KNOWLEDGE_AND_CREATIVE_ENGINE.md (creative/knowledge design), ENGINEERING_STANDARDS.md (definition of done), DECISION_LOG.md.

## 0. THE CORE PRINCIPLE - every module is a TEAM of agents, not one AI

WOBBLE OS is a HIVE MIND, not a SaaS dashboard. Every output module (content, blog, SEO, design, strategy, offers, research, competitor intel, client work) is produced by a TEAM of specialized AI agents that support each other - never one AI doing a mediocre job. Each team: pulls real data (sources + memory), reasons, produces, QAs itself with expert gates, grounds every claim in evidence, and puts the result in front of a founder to approve/reject-with-reason - and then LEARNS. There may be hundreds of agents over time; all are REGISTERED, VISIBLE, LOGGED (cost/quality/provenance). No hidden agents. No fake UI. No output without grounding + a quality gate.

The universal module pattern (applies to ALL output modules):
`real sources + memory -> agent TEAM (strategy/research/competitor/brand/taste/ideation/creator/QA/scoring/learning) -> grounded draft with provenance + confidence + scores -> expert quality gate -> founder review (approve / reject-with-reason / edit / regenerate) -> LEARNING (taste + what-works + agent quality) -> memory banks updated`

## 1. Source Registry (many types, per-type intake)
Sources are a serious REGISTRY, not a flat list. Every source stores: type, url/file/input, owner (global/company/client/project), intended use, connected agents, refresh frequency, last-scraped, processing status, confidence, data extracted, memory banks it feeds, approval status, logs, errors, cost used, related outputs. Types (min): website, blog, RSS, youtube video/channel, IG reel/post/carousel/profile, tiktok video/profile, reddit post/thread, competitor website/social, design ref, brand ref, market research, client source, internal doc, uploaded file, manual note, API, n8n. EACH TYPE HAS ITS OWN INTAKE WORKFLOW (never one generic process): e.g. YouTube -> transcript+metadata (Apify/scraper) -> LLM analyze -> extract insights -> route to banks -> approve -> store -> log. IG reel -> scrape caption/transcript/comments/engagement + frames -> VISION model analyzes hook/pacing/structure/design/product/audience -> LLM insights -> route -> approve. IG carousel -> vision per slide -> layout/hook/copy/hierarchy/offer/CTA/design-system -> route to design/competitor/content/brand/carousel-structure/campaign banks. Website -> scrape key pages -> positioning/offers/copy/structure/SEO/UI/pricing/messaging -> route to competitor/market/offer/SEO/design banks.

## 2. Memory Bank Routing (multi-bank, LLM router, user control)
On processing, an LLM ROUTER decides which memory bank(s) get the knowledge - ONE source can feed MANY banks. User options: let system decide / manually choose / suggest-multiple-then-approve / edit knowledge before storing / reject with reason (so the OS learns). Banks: global, company, client, project, competitor, brand, design, content, SEO, offer, research, founder_taste, founder:<id> (per person), rejected_ideas, approved_output, performance, agent_learning, plus a hook library / visual reference library / carousel-structure / ad-inspiration / audience-response as content/design sub-banks.

## 3. Agent Registry & Orchestration (built - Chunk 52)
Every agent registered + visible + logged: name, purpose, input/output types, tools, memory banks, model, cost profile, quality score, last run, run/failure/approval history, dependencies, cadence (manual/schedule/n8n). Dashboard shows the agent TEAM behind each module and what they produced/recommend/need-approval.

## 4. Research / Intelligence Review Inbox (Chunk 55)
Every research/intel agent output is VISIBLE and reviewable: source, extracted insights, agent reasoning summary, suggested memory placement, actions = approve / reject(REASON REQUIRED) / edit / merge into memory / send to another module / re-analyze / comment / save-as-reference / mark high-value / mark irrelevant. Approvals + rejections feed learning.

## 5. Content Command - unified workflow (Chunk 15 evolution + 21/22/54)
One module, four steps: (1) GENERATE CONTENT PACK (goal/brand/client/platform/campaign/source-material/type -> agent team -> pack: idea, strategy, hook, caption, CTA, static concept, carousel concept, image direction, visual refs, image prompt, format, predicted-impact + brand-fit + platform-fit scores, reasoning summary with source/agent provenance). (2) REVIEW PACK (approve/reject-with-reason/edit/regenerate/stronger/different-angle/choose-format). (3) VISUALS ONLY AFTER PACK APPROVAL (image-prompt agent -> prompt engineer improves -> visual QA -> generate -> show -> regenerate-with-feedback / approve / edit-direction / save-as-reference / mark-unusable-with-reason; NO plain reject on images). (4) LEARNING (what caption/hook/visual/founder approved, what rejected + why, which banks to update, which agent did well/poorly). Same pattern for SEO/blogs/strategy/design/offers/research.

## 6. Agency-level quality (expert knowledge + gates)
Not average AI output - compete with million-dollar agencies / senior strategists / SEO experts / 10-yr designers / creative directors / performance marketers. Content agents understand hooks, angles, audience psychology, brand voice, platform behavior, competitor positioning, trends, design direction, copy frameworks, offer structure, conversion intent, visual hierarchy, founder taste, past performance. Design agents understand design theory, composition, typography, layout, color psychology, product accuracy, lighting, realism, brand consistency, premium direction, negative constraints, platform formats, amateur-vs-premium, what makes an ad feel expensive, what makes a carousel readable. SEO/blog agents understand search intent, topical authority, semantic SEO, competitor gap, briefs, internal linking, E-E-A-T, conversion content, readability, ranking difficulty, original insight, avoiding generic AI writing. EVERY major output passes an expert quality gate before it is shown as final.

## 7. Cost controls (quality first, smart routing)
Model tiering per agent: cheap=classification, mid=summarize/extract, strong=strategy/creative/prompt/QA/decisions, vision=only when visual understanding needed. Cache research, reuse memory/analysis, dedup scraping, skip re-runs if source unchanged. Track cost per agent/module/output/client/workflow. Never trade founder-facing quality for tiny savings.

## 8. n8n integration (both native + n8n)
n8n plugs in for scraping/Apify/scheduled refresh/social monitoring/file gen/presentations/notifications/publishing/reporting/external triggers/client workflows/approval notifs. But if a workflow is better as a native OS agent team, do that - don't force n8n. Architecture supports BOTH native agent workflows and n8n-triggered ones.

## 9. Anti-hallucination + grounding (MANDATORY)
Every major claim/insight/recommendation/SEO decision/competitor analysis/strategy is grounded in sources + memory + approved knowledge + recent data + agent logs + a confidence score. The output SHOWS what data was used (which sources, competitors, memory banks, agents, confidence, assumptions, what needs approval). If the system does not know, it SAYS so and requests source data - it never invents.

## 10. Dashboard visibility (see the AI team work)
Visibility into: Source Registry + intake status, Agent Registry + runs + teams, Research outputs awaiting approval, Memory bank updates, Content packs, Visual generation queue, SEO/blog outputs, Approval/rejection history, Founder taste learning, Cost tracking, n8n status, Errors/failed runs, Logs, Self-improvement suggestions. The dashboard never hides the AI work.

## 11. Approval / rejection / learning (every module)
Reject -> ALWAYS ask why (off-brand/weak/bad-design/bad-copy/too-generic/wrong-audience/not-premium/factually-wrong/bad-visual/poor-strategy/bad-format/not-my-taste/custom). Approve -> store who/why/style/which-banks-learn/which-agent/which-source/output-type. Feeds learning.

## 12. Dual taste (brand + per-founder, no conflict)
Learn BOTH global WOBBLE brand taste AND per-founder profiles (Moiz, Ali, Ibrahim, Haad). BRAND taste = HARD filter (pass/fail, never overridden); founder taste = WEIGHT within brand bounds. Use the approving founder's taste when they approve; WOBBLE taste for company; client/project taste for client work. If founders disagree, store both separately; don't overwrite brand quickly. Improve with approval frequency + confidence.

## 13. Shared AI-builder logs
AI_HANDOFF_LOG.md (code) + DECISION_LOG.md (decisions/context/rejected-ideas/risks/what-not-to-change) - both mandatory, both read before working. Log thinking + product decisions, not just code.

---

## DETAILED per-chunk UPGRADE SPECS (build the UPGRADED version, not the basic one)

### Chunk 15 (BUILT V1) -> Multi-Agent Creative Graph
Today: one LLM call -> text packets. Target: replace the single call with an orchestrated agent TEAM (each an agent in the registry, each run logged): Strategy -> (Research + Competitor + Brand-voice + Founder-taste in parallel) -> Ideation -> Copywriting (draft->self-critique->revise) -> Visual-direction (design brief + selects ONE reference per asset) -> Image-prompt engineer -> [visuals gated behind pack approval] -> Design-QA + Copy-QA -> Final-scoring (impact/brand-fit/platform-fit) -> Assemble content PACK (section 5) -> founder review -> Learning. Inputs: goal/brand/client/platform/campaign/source-material. Reads: content + brand + competitor + founder_taste banks + approved sources. Provenance on every claim. Acceptance: a pack is produced by >=4 distinct agent_runs; every claim cites sources/memory; visuals are NOT generated until the pack is approved; approve/reject-with-reason writes learning; all agents visible in the dashboard.

### Chunk 13 (not built) -> Knowledge Compiler (Karpathy, NOT a summarizer)
Build the Learning Engine as a COMPILER: for each APPROVED source, an LLM extracts atomic, self-contained knowledge notes (claim/insight/framework/hook-pattern/objection/data-point), each with provenance (sourceId+chunkIds), type, topic, confidence, and links to related notes; then SYNTHESIZES into the existing knowledge base (dedupe, strengthen, flag contradictions, interlink) so knowledge COMPOUNDS. Routes notes to memory banks via the Memory Router (54). Hybrid retrieval (synthesized notes + raw chunks) via ONE contract with auto-pickup. NOT a plain summary. Acceptance: adding a source produces linked, deduped notes with provenance, routed to >=1 bank via approval; other agents retrieve synthesized notes; no code change needed for new sources to be picked up.

### Chunk 21 (not built) -> Media Studio + Creative Reference Library
Reference BANKS for static, carousel, video. When a reference is approved, a VISION model writes a structured STYLE DESCRIPTOR (layout, grid, type treatment, color system, spacing, motif, mood, use-case) stored on the reference. Metadata: platform, format, style, use-case, approval status, brand fit, source, winRate. Feeds the Design Reference Hunter (51) and Chunk 22. Acceptance: an approved reference has a vision descriptor + full metadata; banks are queryable by use-case/format; nothing enters a production bank without approval.

### Chunk 22 (not built) -> Media/Video Worker + Reference-Conditioned Generation
Exactly ONE reference per asset (NEVER blend all references into a hybrid); statics diversified across single references, carousel = one matched carousel_set; brand kit layered on top. The ELITE Image-Prompt-Engineering agent (its own registry agent) owns a model-capability profile (confirm the real model + docs first, no assumptions) and emits LARGE structured prompts (brand context, campaign goal, visual hierarchy, composition, lighting, color+brand-kit, typography, product accuracy, realism, platform format, reference style from the descriptor, negative constraints, intended outcome). Vision QA inspects each generated asset vs prompt+reference; failures regenerate with a sharpened prompt. Visuals ONLY after content-pack approval (save credits). Acceptance: one reference per asset provably; format-specific models; every generation has a structured prompt + a QA pass; regenerate stores feedback; approve stores learning + can save-as-reference.

### Chunk 43 (not built) -> Content Knowledge Base
The how-to-write knowledge (frameworks/hooks/angles/post-types/voice/swipe) implemented as CONTENT MEMORY BANKS (via 54) that the creative graph (15) reads and that the Knowledge Compiler (13) populates from approved sources. Queryable + auto-picked-up (new knowledge is used next run, no code change). Acceptance: creative agents retrieve hooks/angles/frameworks by topic/type; new approved knowledge is auto-available.

### Chunk 47 (not built) -> Performance Feedback & Attribution Loop
Post/output performance attributes wins to hook/angle/format/reference/topic/agent and updates a winRate per dimension + a reference winRate. Feeds the Strategy agent (favor what works) and the taste_profiles (56) + novelty control (avoid repeats; prefer fresh angles). Acceptance: performance data updates winRates; the Strategy agent's next decisions are measurably influenced; weak references demoted, strong favored.

Rule for ALL of the above: schema+backend first, then UI; each is effect-verified (the real records/rows change) before push; no hardcoded strategy/prompts/models; every output grounded + gated + approval-learning.
