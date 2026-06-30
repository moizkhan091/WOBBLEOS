# WOBBLE OS - Intelligence Layer Map (data stores + researcher AIs + self-improvement)

Date: 2026-06-30
Owner: shared (founder direction + Claude + Codex). Canonical map of WHERE data lives, WHICH AI researches WHAT, HOW it is "trained" (configured), and HOW the system improves itself. The full production architecture lives in `docs/SELF_IMPROVING_INTELLIGENCE_LAYER.md`. Pairs with `docs/CONTENT_INTELLIGENCE_SYSTEM.md` (the 4 non-negotiable rules) and `docs/BUILD_SEQUENCE_TRACKER.md` (order).

## 0. The contract (never broken)

Every researcher AI WRITES into a data store. Every worker (content, blog, media, decisions) READS from those stores at runtime. New APPROVED data flows in automatically - no code change. Nothing about "what to write / what works / what competitors did / what's trending / current traffic" is hardcoded. Researchers PROPOSE; founder APPROVES; production reads only approved data.

## 1. Data stores - what exists now vs. what each chunk creates

LIVE TODAY (built):
- `sources` + `source_chunks` - approved reference material (the 9 AI-OS transcripts, founder uploads). Trust-tiered. READ by content/ask.
- `memory_records` (Brain) + `memory_chunks` - voice, do-not-say, strategy, facts. Approval-gated via `memory_update_proposals`.
- `content_tracks` - per-brand config: voice, goals, allowed topics, **bannedPhrases** (now auto-enforced by the gate), platform priorities.
- `research_targets` - founder-approved watchlist/config for competitors, creators, keywords, websites, analytics connectors, client accounts, trend topics, and other sources researchers should monitor.
- `intelligence_items` - normalized raw facts/observations: competitor reels, transcripts, social stats, SEO keywords, website traffic, client notes, sales objections, trend records, campaign results, and other structured intelligence.
- `intelligence_insights` - AI/human analysis created from one or more intelligence items: patterns, opportunities, risks, stale knowledge, source quality notes, performance learning, SEO opportunities, strategy recommendations.
- `intelligence_suggestions` - Dreamer/opportunity proposals with evidence, priority, confidence, and approval state.
- `experiments` - planned/running/completed experiments with hypothesis, metric, expected result, result, decision, owner, and review date.
- `output_intelligence_usage` - joins outputs to the intelligence, source, memory, and insight records that influenced them.

EMPTY / NOT BUILT YET (each created by its chunk - this is the data you keep asking "where do we put it"):
- Content Knowledge Base (Chunk 43) - how-to-write knowledge by kind: framework, hook, angle, post_type, voice, swipe, do_not_say, offer. Stored as tagged source/memory records so it is queryable + auto-picked-up.
- Competitor Signals UI/worker flows (Chunk 12/38/44) - the table substrate exists now through `intelligence_items`; the specific scout workers and UI screens still need to populate it.
- Competitor Pattern Library (Chunk 13/44) - recurring patterns distilled from many signals (not one-off posts).
- Performance Memory workers/UI - our social stats (Chunk 38) and website/blog traffic (Chunk 39): the data can land in `intelligence_items`; dedicated connectors and dashboards still need to be built.
- Voice-of-Customer store (Chunk 48) - real audience language from comments/DMs/reviews.
- Trend Radar findings (Chunk 12) - rising topics/formats, approval-gated into content ideas.
- SEO/Keyword data (Chunk 37) - keywords, SERP gaps, backlink opportunities.

## 2. The researcher / ingestor AIs (how many, what each does, cadence, where it writes)

Eight researchers feed the brain; three decision-brains consume + improve. All approval-gated.

RESEARCHERS (propose data):
1. Content-Knowledge Hunter (Ch 44) - finds frameworks/hooks/angles/post-types from approved creators, the transcripts, the web. Writes -> Knowledge Base proposals. Cadence: weekly + on-demand.
2. Competitor Hunter (Ch 12/38/44) - watches your competitor list; for each new post pulls caption + transcript + stats (via n8n, section 3); extracts the pattern. Writes -> Competitor Signals. Cadence: daily.
3. Design Hunter (Ch 21/38) - finds design references (one-ref-per-asset rule, see CONTENT_CREATIVE_EXCELLENCE_SYSTEM.md). Writes -> Creative Reference Library proposals. Cadence: weekly.
4. Social Performance Ingestor (Ch 38) - pulls OUR post stats (saves, reach, reply rate). Writes -> Performance Memory. Cadence: daily/after each post.
5. Website/Traffic Ingestor (Ch 39) - pulls OUR site + blog traffic, top pages, search, conversions for wobblepk.com. Writes -> Performance Memory (web). Cadence: daily. (This is why the blog engine can "know traffic".)
6. Voice-of-Customer Miner (Ch 48) - pulls comments/DMs/reviews -> audience phrases/objections. Writes -> VoC store. Cadence: weekly.
7. Trend Radar (Ch 12) - rising topics/formats in the niche. Writes -> Trend findings. Cadence: daily/weekly.
8. SEO/Keyword Researcher (Ch 37) - keyword + SERP + backlink opportunities. Writes -> SEO data. Cadence: weekly.

DECISION-BRAINS (consume + improve):
9. Performance Attribution Loop (Ch 47, analyst) - after posting, joins stats to the packet's hook/angle/format/reference/goal -> updates "what works" + reference winRate -> proposes Knowledge updates. THE core self-improvement.
10. Learning Engine (Ch 13) - turns signals + founder feedback (edits/rejections) into proposed Brain/knowledge/voice updates.
11. Dreaming Engine / AI OS Auditor (Ch 36) - nightly self-audit: model right-sizing, "task done 3x -> propose a skill", stale memory, recurring gate failures, suggestions. Proposes; founder approves.

## 3. The reel problem (competitor content the AI cannot "watch")

The LLM cannot watch a video/reel. So the Competitor Hunter does NOT try to "see" it. Pipeline:
1. n8n automation pulls the competitor post: caption, hashtags, stats (views/likes/saves/comments), and the **audio transcript** (n8n transcription step). For images/carousels: caption + on-image text (OCR) if available.
2. n8n posts that as a signed handoff (Chunk 18 handoff pattern) into Competitor Signals as TEXT the LLM can read.
3. Competitor Hunter reads the text + stats, extracts the pattern (hook type, angle, format, why it worked), and PROPOSES it to the approval queue - never copies it, never claims it as ours.
4. After approval it joins the Competitor Pattern Library and auto-flows into briefs (rule #3).

Same shape for OUR stats and traffic: n8n / analytics connectors push numbers in; ingestors normalize into Performance Memory; workers read them. No hardcoding.

## 4. "Training" the researchers = Research Targets config (NOT model training)

You do not train a model. You CONFIGURE each researcher with approved data so it knows what to chase. This is a founder-editable, approval-gated config in `research_targets`. Per target:
- type: competitor | creator | keyword_set | platform_account | review_source | trend_topic
- handle/URL/keyword(s), platform(s)
- our niche + goals context (so it judges relevance)
- trust tier (how much weight its findings get)
- cadence (how often to check)
- which store its output lands in

Add a competitor to Research Targets -> the Competitor Hunter picks it up next run, no code change. This is exactly the auto-pickup contract applied to the researchers themselves. The seed list (your real competitors, keywords, review pages, niche topics) is data you enter once and approve; everything downstream reads it.

## 5. The full self-improvement loop (one picture)

Research Targets (you set) -> Researchers pull (competitor transcripts, our stats, traffic, VoC, trends, knowledge) -> proposals -> YOU approve -> data stores -> `buildContentBrief` / blog / media read live -> Excellence + Visual gates -> you approve packets -> n8n publishes -> stats/traffic come back -> Performance Attribution (Ch 47) joins results to hook/angle/format/reference/goal -> updates "what works" + reference winRate -> Learning Engine + Dreaming Engine propose knowledge/Brain/skill updates -> you approve -> next run is smarter. Old-vs-new comparison lives in Performance Memory's time series (social stats and web traffic both), so the system can say "this angle is decaying, that one is rising."

## 6. What is empty today + the order to populate

Right now the substrate exists, but most real-world data is still empty. Populate as each chunk lands:
1. Immediately after this foundation: add real Research Targets manually through the API/UI once the UI exists (competitors, creators, keywords, review sources, analytics connectors, client accounts). They start pending and require approval.
2. Chunk 16/43 land -> seed Content Knowledge Base (frameworks/hooks/angles from the 9 transcripts + your additions) and finish founder content tracks.
3. Chunk 12/38 land -> wire n8n competitor transcript + our-stats pulls into `intelligence_items`.
4. Chunk 39 lands -> connect wobblepk.com analytics (blog traffic) into `intelligence_items`.
5. Chunk 47 lands -> attribution reads `output_intelligence_usage`, compares results, and turns the above into "what works"; the loop closes.
Do not fake records. Empty stores must show "No data added yet" and offer an add/import path.

## 7. Codex build notes

- Every researcher = a worker job type + an approval-gated proposal write. Reuse Chunk 04 approvals, Chunk 10 `memory_update_proposals` pattern, Chunk 18 signed handoff for n8n inbound.
- Every store is read via a query function the workers call at runtime (like content-brief reads Brain/memory/sources now). Never inline knowledge in a worker.
- Research Targets, normalized intelligence items, insights, suggestions, experiments, and output-usage tables are built in the Intelligence Foundation. Future chunks should use these tables instead of inventing parallel stores.
- Nothing reaches Core Brain or production references/knowledge without founder approval.
