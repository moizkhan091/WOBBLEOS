# WOBBLE OS Self-Improving Intelligence Layer

Date: 2026-06-30
Owner: shared builders, founder-approved architecture

This is the production architecture for the intelligence core of WOBBLE OS. It expands `docs/INTELLIGENCE_LAYER_MAP.md` from a short map into the exact data, agent, approval, retrieval, freshness, n8n, UI, and implementation contract.

The principle is simple: changing intelligence lives in approved data, not code. Workers hard-code only the rails: validation, retrieval, approvals, audit, cost logging, and persistence. They do not hard-code what competitors matter, what hooks work, what trends are rising, what the market believes, what clients care about, or what WOBBLE should say next.

## A. Full Architecture

WOBBLE OS has five intelligence layers:

1. Raw evidence layer: raw sources, files, webhook payloads, transcripts, screenshots, stats, URLs, and imported notes. This is preserved even when unapproved.
2. Normalized intelligence layer: structured records such as competitor posts, reel transcripts, market trends, SEO keywords, social performance snapshots, client notes, sales objections, offers, experiments, and campaign results.
3. Analysis layer: AI-created insights, pattern summaries, comparisons, trend changes, opportunity findings, risks, and recommendations. This layer requires confidence, evidence links, freshness, and approval state.
4. Trusted memory layer: approved WOBBLE Brain, memory chunks, content knowledge, prompt skills, brand rules, do-not-say rules, proven playbooks, and approved examples.
5. Output layer: content packets, blog briefs, media assets, decisions, offers, presentations, client docs, invoices, and recommendations. Every serious output stores what intelligence it used.

The loop:

Data arrives -> raw source saved -> normalized intelligence item saved -> AI analyzes -> insight/suggestion created -> human approves/rejects -> approved knowledge becomes retrievable -> workers use it automatically -> output performance is measured -> Performance Learning compares old vs new -> new recommendations/proposals are created -> cycle repeats.

## B. Data Types

WOBBLE OS must support these intelligence data categories:

- Competitors: accounts, posts, reels, captions, transcripts, thumbnails, frame summaries, comments, sentiment, blogs, landing pages, ads, ad library links, offers, pricing, funnels, CTAs, guarantees, guarantees avoided, launch changes, positioning changes, and market moves.
- Market and platform: market trends, industry news, platform algorithm/content trends, audience behavior shifts, emerging content formats, creator patterns, topical spikes, and category risks.
- Social performance: our posts, client posts, platform, format, hook, angle, CTA, creative reference, post date, reach, impressions, saves, shares, clicks, replies, comments, leads, sentiment, and decay over time.
- Website and SEO: website traffic, blog traffic, page performance, conversion behavior, Search Console data, rankings, keywords, SERP gaps, backlinks, internal-link opportunities, AEO/AI-search opportunities, and weak pages.
- Sales and offers: lead quality, sales objections, calls/DM notes, conversion notes, offer performance, pricing response, bundle response, guarantee response, funnel drop-offs, and sales-cycle friction.
- Content knowledge: winning hooks, failed hooks, winning formats, failed formats, post-type playbooks, carousel structures, reel structures, caption rules, voice rules, do-not-say rules, approved examples, rejected examples, swipe references, and writing frameworks.
- Creative knowledge: design references, negative references, brand-kit rules, carousel reference sets, visual hooks, typography rules, platform specs, visual QA failures, and reference win rates.
- Client intelligence: client notes, industry context, client content performance, client website performance, client audience language, client campaign results, client approvals/rejections, and client-specific Brain.
- Internal company intelligence: internal decisions, past strategy recommendations, accepted/rejected suggestions, cost signals, worker failures, recurring bottlenecks, process improvements, automation ideas, and model-routing learnings.
- Experiments: proposed experiments, hypotheses, expected outcomes, target metrics, owner, review date, actual results, decision, follow-up action, and whether the learning became approved knowledge.
- Dreamer opportunities: proactive ideas for content, campaigns, services, offers, automation, client plays, product features, SEO moves, and strategic changes.

## C. Where Data Lives

Use Postgres as the system of record and pgvector only when semantic retrieval is useful.

- `sources`, `files`, `source_chunks`: raw or uploaded source material, transcripts, PDFs, docs, screenshots metadata, YouTube/reel transcript bodies, articles, and imported source files.
- `webhook_events`: raw n8n inbound/outbound payload history, idempotency, signatures, replay protection, retries, failures.
- `research_targets`: founder-approved watchlist/config for what researchers should monitor: competitors, creators, keyword sets, platform accounts, URLs, review sources, trend topics, client accounts, and analytics connectors.
- `intelligence_items`: normalized raw facts and observations from any source: competitor post, reel transcript, SEO keyword, website traffic snapshot, social stat, client note, sales objection, blog result, ad observation, or offer/pricing change.
- `intelligence_insights`: AI/human analysis created from one or more items: pattern, opportunity, risk, trend, positioning insight, content insight, SEO insight, client insight, or offer insight.
- `intelligence_suggestions`: Dreamer/agent proposals: content ideas, campaign ideas, offer changes, blog ideas, automation ideas, strategy changes, skill updates, and experiments to run.
- `experiments`: planned/running/completed experiments and measured results.
- `output_intelligence_usage`: joins outputs to evidence so every content packet, blog, decision, offer, presentation, or client doc can show which intelligence influenced it.
- `memory_records` and `memory_chunks`: approved durable Brain/Memory, not temporary raw data.
- `content_tracks`: brand/founder/client content rules such as goals, banned phrases, platform priorities, voice profile, and approval requirements.
- `prompt_skills`: approved reusable agent skills/SOPs and prompts.
- `quality_reviews`: content/media/strategy review output and failure reasons.
- `audit_logs`: every important action, approval, rejection, ingestion, model run, suggestion, experiment, and knowledge change.
- `model_runs` and `provider_runs`: every AI/search/media call with provider, model, cost, latency, status, and linked output.

Each important record stores:

- source URL or source ID
- date collected
- date observed/published
- date updated
- collector or agent name
- confidence
- trust level
- approval status
- scope: global, WOBBLE, founder, client, market, or system
- client ID if client-specific
- evidence links
- freshness status
- last checked date
- metadata and metrics
- which outputs used it later

## D. AI Agents

Stable agent identities are scaffolding. Their current targets, sources, prompt skills, provider models, schedules, and permissions are data.

1. Intelligence Orchestrator
   Purpose: decides which research should run, fans out jobs, de-duplicates targets, and routes results.
   Inputs: research targets, schedules, stale-data alerts, Dreamer asks, user requests.
   Writes: jobs, audit logs, run summaries, dead letters.
   Cadence: hourly scheduler plus on-demand.
   Approval: cannot approve knowledge itself.

2. Competitor Scout
   Purpose: monitors competitor accounts, posts, reels, blogs, offers, pricing, landing pages, funnels, ads, and launches.
   Inputs: research targets, n8n post/reel/blog payloads, screenshots, transcripts, ad library links.
   Writes: competitor intelligence items and competitor insights.
   Cadence: daily, plus target-triggered.
   Approval: new competitor targets, recurring patterns, offer/pricing insights, and strategy implications require approval.

3. Social Content Analyst
   Purpose: studies hooks, formats, captions, CTAs, visual angles, comments, sentiment, and engagement.
   Inputs: competitor posts/reels, our posts, client posts, social stats.
   Writes: content insights, hook/format pattern candidates, performance learning items.
   Cadence: daily after stats import, weekly rollup.
   Approval: winning/failed patterns become approved knowledge only after review.

4. Transcript Analyst
   Purpose: reads transcripts from reels, podcasts, YouTube, webinars, interviews, and ads.
   Inputs: transcript sources and source chunks.
   Writes: structured summaries, concepts, hooks, objections, offers, content patterns, source-linked insights.
   Cadence: on source ingestion and weekly consolidation.
   Approval: extracted reusable knowledge requires approval.

5. Trend Radar
   Purpose: tracks platform trends, industry trends, topical spikes, buyer behavior shifts, and new formats.
   Inputs: RSS/news, platform trend sources, approved creators, search/news APIs, manual links.
   Writes: trend intelligence items and opportunity insights.
   Cadence: daily for fast trends, weekly for market rollups.
   Approval: trend-to-strategy changes require approval.

6. Market Researcher
   Purpose: studies industries, competitors, buyer pain points, objections, category language, and opportunities.
   Inputs: sources, client context, web research, sales notes, competitor intelligence.
   Writes: market insights, ICP updates, positioning opportunities.
   Cadence: on-demand and weekly.
   Approval: positioning, ICP, offer, or client strategy updates require approval.

7. SEO/Blog Intelligence Agent
   Purpose: tracks keywords, SERP gaps, ranking movement, internal links, backlinks, blog opportunities, and AEO.
   Inputs: Search Console, analytics, DataForSEO or equivalent, competitor articles, site crawl.
   Writes: SEO items, blog opportunities, keyword insights, internal-link suggestions.
   Cadence: weekly and after blog publish.
   Approval: publishing, major blog strategy, backlink outreach, and memory updates require approval.

8. Website Analytics Agent
   Purpose: studies traffic, conversion behavior, top pages, weak pages, bounce signals, and content impact.
   Inputs: website analytics, Search Console, form/CRM data, blog stats.
   Writes: performance items, page insights, conversion risks.
   Cadence: daily snapshots, weekly comparison.
   Approval: website strategy recommendations require approval.

9. Offer Intelligence Agent
   Purpose: studies offers, pricing, bundles, guarantees, objections, and conversion angles.
   Inputs: sales notes, competitor offers, landing pages, campaign results, client data.
   Writes: offer insights and offer experiments.
   Cadence: weekly plus on campaign result.
   Approval: offer changes and pricing changes always require approval.

10. Brand Voice Guardian
    Purpose: ensures outputs obey brand rules, tone, positioning, banned phrases, and approved examples.
    Inputs: Brain, content tracks, approved/rejected examples, quality gate failures.
    Writes: voice-rule proposals, do-not-say proposals, quality notes.
    Cadence: on output review and weekly rollup.
    Approval: new brand rules and do-not-say rules require approval.

11. Memory Curator
    Purpose: decides what should become long-term memory, what stays episodic, and what is stale.
    Inputs: insights, source rollups, approvals, old memory, contradictions.
    Writes: memory update proposals.
    Cadence: weekly and on important approved insights.
    Approval: memory changes require approval.

12. Performance Learning Agent
    Purpose: compares old vs new results and detects rising, declining, stale, or proven patterns.
    Inputs: content stats, blog stats, website stats, campaign stats, experiments, historical benchmarks.
    Writes: performance insights, stale alerts, pattern confidence changes.
    Cadence: daily for new stats, weekly rollups.
    Approval: marking something proven, deprecated, or strategy-changing requires approval.

13. Dreamer / Opportunity Agent
    Purpose: proactively suggests useful moves before being asked.
    Inputs: all approved intelligence, trends, failures, gaps, opportunities, cost data, stale data.
    Writes: suggestions and experiment proposals.
    Cadence: nightly, weekly strategic rollup, and on major signals.
    Approval: all suggestions are pending until approved or rejected.

14. Experiment Planner
    Purpose: turns approved ideas into testable experiments.
    Inputs: approved suggestions, goals, metrics, current campaigns.
    Writes: experiments with hypothesis, metric, owner, expected result, review date.
    Cadence: on approved suggestion and weekly planning.
    Approval: running public/client-facing experiments requires approval.

15. Source Quality / Fact Checker
    Purpose: flags duplicate, weak, unreliable, stale, conflicting, or blocked sources.
    Inputs: sources, source trust, citations, contradictions, old insights.
    Writes: source quality notes, needs-review flags, conflict insights.
    Cadence: on source ingestion and weekly.
    Approval: blocking a source or changing trust level requires approval.

16. Approval Manager
    Purpose: packages important AI updates into human-reviewable approval items with evidence.
    Inputs: proposed targets, insights, memory updates, suggestions, experiments, risky actions.
    Writes: approvals and audit logs.
    Cadence: event-triggered.
    Approval: it creates approval requests; it does not approve them.

## E. Agent Cadence

- Constant/on trigger: Approval Manager, Brand Voice Guardian for generated outputs, Source Quality on ingestion.
- Hourly: Intelligence Orchestrator checks due jobs and stale high-priority targets.
- Daily: Competitor Scout, Social Content Analyst, Trend Radar, Website Analytics Agent, Social Performance Ingestor.
- Weekly: Market Researcher, SEO/Blog Intelligence Agent, Offer Intelligence Agent, Performance Learning Agent, Memory Curator, Content-Knowledge Hunter, Design Hunter.
- Nightly: Dreamer / Opportunity Agent and AI OS Auditor.
- On approval/rejection: Learning Engine, Memory Curator, Brand Voice Guardian, Performance Learning Agent.

## F. Manual Data

Founders manually add or edit:

- competitors, creators, keywords, review sources, platform accounts, client accounts, and analytics targets
- approved sources, transcripts, PDFs, docs, screenshots, and client notes
- brand rules, voice rules, banned phrases, approved examples, rejected examples
- campaign goals, content tracks, offer details, pricing notes, sales objections
- experiments to run, experiment results, and human judgments
- client-specific context and permissions

Manual additions still go through validation, audit, and approval status. Local UI defaults can make entry quick, but the server stores explicit actor/approver fields.

## G. n8n Data

n8n feeds external data into signed WOBBLE webhooks:

- competitor Instagram/TikTok/LinkedIn/X post metadata
- competitor reel/post transcripts
- YouTube transcripts
- article/blog URLs and extracted text
- RSS/news updates
- social media stats
- comments and sentiment
- ad library screenshots/links
- website analytics
- Search Console data
- client campaign data
- form/CRM lead quality data
- newsletter/industry updates
- approved source links

Each payload must include:

- idempotency key
- source system
- collectedAt
- observedAt/publishedAt when known
- targetId when linked to a research target
- raw URL
- platform/account
- raw text/transcript/caption when available
- metrics
- attachments/file IDs when available
- confidence if n8n extracted it

n8n stores raw payloads in `webhook_events`. WOBBLE normalizes them into `intelligence_items`, then agents analyze them into `intelligence_insights`.

## H. AI-Researched Data

AI agents research:

- extracted patterns from transcripts and posts
- why a competitor post may have worked
- whether to copy, avoid, remix, or respond to a pattern
- market/positioning shifts
- SEO/blog opportunities and internal links
- weak pages and conversion risks
- winning/failed hook and format patterns
- offer/pricing opportunities
- stale assumptions and contradictory evidence
- proactive ideas and experiments

AI can write raw analysis, insights, and suggestions. It cannot silently update Core Brain, trust levels, source approval, brand rules, offer rules, pricing, or proven pattern status.

## I. Human Approval

Require approval for:

- new research targets that drive future monitoring
- new competitor added as an official target
- source trust-level changes
- memory updates
- brand voice rules
- do-not-say rules
- approved/rejected examples that affect future generation
- winning/failed pattern promotion
- offer/pricing/funnel recommendations
- client strategy recommendations
- public content handoff
- expensive media/video/search jobs
- deleting, archiving, superseding, or marking knowledge as proven

Approved knowledge becomes retrievable. Rejected knowledge stays in audit/history but is excluded from production retrieval.

## J. Automatic Use Of New Approved Data

Every serious worker follows the same preflight:

1. Parse the task and scope.
2. Build an intelligence context plan.
3. Retrieve approved Brain, memory, sources, intelligence items, insights, performance data, experiments, and suggestions relevant to the task.
4. Filter by scope, client, trust, approval, freshness, and category.
5. Ask the model to use only that context and state gaps honestly.
6. Save which intelligence IDs influenced the output.
7. Gate output through quality, risk, and approvals.

Examples:

- Social content pulls brand rules, content track, approved examples, recent competitor patterns, winning/failed hooks, platform trends, social stats, comments, campaign goals, and market insights.
- Blog/SEO pulls topic strategy, keyword data, Search Console, website traffic, competitor articles, internal links, service positioning, and recent market changes.
- Decision Room pulls KPIs, past decisions, market changes, competitor movement, objections, client results, cost data, open experiments, and risks.
- Offer Lab pulls objections, competitor offers, conversion data, client results, pricing notes, and approved offer rules.
- Client AIOS Lab pulls global WOBBLE knowledge plus client-specific notes, industry data, approvals, client performance, and client source material.

## K. Old vs New Comparison

The system compares by time windows:

- last 7 days
- last 14 days
- last 30 days
- current month
- prior month
- quarter
- historical benchmark

Comparisons run across:

- competitor posting frequency and themes
- social formats and hooks
- engagement and conversion metrics
- blog traffic and keyword rankings
- landing page traffic and conversion
- offer performance and sales objections
- client content performance
- campaign results
- quality-gate failure reasons
- model cost/performance

Each comparison becomes either a performance insight, stale-data alert, suggestion, or experiment proposal.

## L. Stale Knowledge Detection

Every intelligence item and insight has freshness fields:

- observedAt
- collectedAt
- lastCheckedAt
- expiresAt or staleAfterDays
- freshnessStatus: fresh, current, aging, stale, expired

Rules:

- Fast-moving platform trends stale quickly.
- Competitor posts are useful longer as examples but stale faster as trend signals.
- Core brand rules do not decay unless superseded.
- Performance data stays historical but recent data scores higher.
- Old insights can be superseded by newer approved insights.
- A worker may still use old data when the user asks historical questions.

## M. Dreamer / Suggestion Engine

The Dreamer watches:

- fresh competitor patterns
- gaps in our content/blog coverage
- rising keywords
- declining performance
- repeated quality gate failures
- recurring founder edits/rejections
- client results
- offer/pricing changes
- stale assumptions
- open experiments
- cost anomalies
- repeated manual workflows

Triggers:

- nightly run
- weekly strategy rollup
- major competitor move
- performance threshold crossed
- stale insight detected
- repeated failure pattern
- user asks Ask WOBBLE for ideas

Prioritization:

- urgency
- upside
- confidence
- evidence strength
- freshness
- cost/risk
- strategic fit
- client impact
- whether action is time-sensitive

Suggestions appear in Command Center, Decision Room, Content Command, Offer Lab, SEO/Blog, Client AIOS Lab, and an Intelligence inbox. Approved suggestions become jobs, experiments, content briefs, memory proposals, prompt-skill proposals, or strategy tasks.

## N. UI Screens / Admin Panels

Required screens:

- Intelligence Command Center: feed of new items, insights, stale alerts, suggestions, and pending approvals.
- Research Targets: add/edit competitors, creators, keywords, URLs, client accounts, analytics connectors, cadence, trust, and scope.
- Competitor Intelligence: competitor accounts, posts/reels/blogs/ads/offers/pricing/funnels, transcripts, screenshots, metrics, patterns, and approvals.
- Social Intelligence: our/client/competitor performance, hooks, formats, comments, sentiment, and pattern library.
- SEO & Blog Intelligence: keywords, rankings, SERP gaps, blog performance, internal links, backlinks, AEO opportunities.
- Website Analytics: traffic, top pages, weak pages, conversion signals, old/new comparisons.
- Content Knowledge Base: frameworks, hooks, angles, post types, swipe, voice, do-not-say, approved/rejected examples.
- Dreamer Suggestions: proactive ideas, priority, evidence, approve/reject/turn into experiment.
- Experiments: planned/running/completed tests, hypothesis, metric, review date, results.
- Source Quality: duplicates, conflicts, trust-level issues, stale sources.
- Intelligence Usage Detail: what data influenced any output.
- Empty State Panels: no fake data; show exactly what is missing and how to add it.

## O. Code / DB / API / Worker Changes

Database:

- `research_targets`
- `intelligence_items`
- `intelligence_insights`
- `intelligence_suggestions`
- `experiments`
- `output_intelligence_usage`

Domain:

- stable data categories
- agent registry
- target validation
- item validation
- insight validation
- freshness scoring
- retrieval-plan builder
- suggestion priority scoring
- empty-state gap reporting

Service:

- create/list research targets
- record/list intelligence items
- create/list insights
- create/list suggestions
- create/list experiments
- build approved intelligence context
- record output intelligence usage

API:

- `GET/POST /api/intelligence/targets`
- `GET/POST /api/intelligence/items`
- `GET/POST /api/intelligence/insights`
- `GET/POST /api/intelligence/suggestions`
- `GET/POST /api/intelligence/experiments`
- `POST /api/intelligence/context`

Workers:

- orchestrator job
- competitor scout job
- transcript analyst job
- social analyst job
- trend radar job
- SEO/blog intelligence job
- website analytics job
- performance learning job
- memory curator job
- dreamer job
- source quality job

n8n:

- inbound signed webhook for competitor content
- inbound signed webhook for transcripts
- inbound signed webhook for social stats
- inbound signed webhook for website/search analytics
- inbound signed webhook for CRM/lead quality
- inbound signed webhook for ad/library captures

Retrieval:

- Content Worker, Blog Worker, Decision Room, Offer Lab, Media Worker, Ask WOBBLE, and Client AIOS Lab must call the intelligence context builder before model generation.
- Production retrieval includes only approved/trusted intelligence unless the task is an explicit review of pending or rejected material.

Audit and approval:

- Target creation creates approval.
- Insight promotion creates approval.
- Suggestion approval changes status and may spawn jobs/experiments.
- Memory update proposals remain separate and approval-gated.
- Every ingestion, analysis, approval, rejection, supersession, and output usage writes audit.

pgvector:

- Use vectors for source chunks, memory chunks, insight summaries, transcript summaries, and long free-text intelligence.
- Do not vectorize every tiny metric row. Metrics stay relational/jsonb and are compared with time windows.

## P. What Is Implemented Now

This pass implements the foundation:

- canonical architecture doc
- expanded chunk map
- Drizzle schema and SQL migration for the intelligence tables
- pure domain models for targets/items/insights/suggestions/experiments/freshness/context plans
- service layer with injectable store and audit/approval integration
- API routes for targets, items, suggestions, and context
- tests covering empty states, approval defaults, freshness, retrieval context, suggestions, audit, and schema presence

The next build slices then implement the specific agents on top of this substrate without inventing their own data shapes.
