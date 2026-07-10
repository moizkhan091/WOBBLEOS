# Self-Improving Intelligence Layer — Implementation Plan (2026-07-10, Claude Opus 4.8)

This is the **build plan** that turns the already-designed intelligence layer into a live, self-improving loop. The architecture already exists in `SELF_IMPROVING_INTELLIGENCE_LAYER.md` + `INTELLIGENCE_LAYER_MAP.md`; the substrate tables are built. This doc records what exists, what's missing, the key decisions, and the phased build.

## 1. What ALREADY exists (audited 2026-07-10 — do not rebuild)

| Layer | Table(s) | Service | Status |
|---|---|---|---|
| Watchlist config | `research_targets` (targetType, platform, handleOrUrl, cadence, approval, freshness) | `createResearchTarget`, `listResearchTargets` | ✅ substrate |
| Normalized raw facts | `intelligence_items` (itemType, rawText, metrics{}, extracted{}, summaryEmbedding, freshnessStatus, observedAt/lastCheckedAt, trustLevel, approvalStatus, createdByAgent) | `recordIntelligenceItem`, `listIntelligenceItems` | ✅ substrate |
| AI analysis | `intelligence_insights` (impactScore, appliesToModules, supersedesInsightId, evidenceItemIds) | `createIntelligenceInsight` | ✅ substrate |
| Proactive proposals | `intelligence_suggestions` (proposedAction, priority, approvalId, createdByAgent=dreamer) | `createIntelligenceSuggestion` | ✅ substrate |
| Experiments | `experiments` (hypothesis, primaryMetric, expectedResult, decision, reviewAt) | `createExperiment` | ✅ substrate |
| Output→evidence join | `output_intelligence_usage` | (writer needed) | ✅ table |
| **Retrieval contract** | — | **`buildApprovedIntelligenceContext({task, scope, clientId, limit})`** → `{items, insights, excluded, gaps}` | ✅ exists, **UNWIRED** |
| Review gate | inbox | `listIntelligenceInbox`, `reviewIntelligenceRecord`, `routeIntelligenceRecordToMemory`, `mergeIntelligenceRecords` | ✅ built |
| Knowledge compiler | `knowledge_notes` + links | `compileSource`, `retrieveKnowledge` | ✅ built |
| Memory / Brain | `memory_records/chunks/banks`, pgvector 1536 | `retrieveMemoryContext`, `proposeMemoryUpdate`, `approveMemoryUpdate` | ✅ built |
| Taste | `taste_profiles`, `feedback_events` | `recordFeedbackEvent`, `getTasteProfile` | ✅ built |
| Agents (identities) | `agents`, `agent_runs` | `DEFAULT_AGENTS` (competitor_scout, transcript_analyst, dreamer, performance_learning_agent, trend_radar, memory_curator… ~30) | ✅ registered, **no workers** |
| Job queue | `jobs`, `worker_heartbeats`, `dead_letters` | `enqueueJob`, worker `registry.ts` | ✅ built (custom PG queue, not pg-boss) |
| Signed handoff | `webhook_events` | n8n HMAC in/out | ✅ built (only zernio inbound wired) |

`INTELLIGENCE_ITEM_TYPES` already includes `competitor_reel`, `competitor_post`, `winning_hook`, `failed_hook`, `winning_format`, `social_performance`, `sales_objection`, `audience_comment`, `dreamer_idea`, etc. — the founder's entire data-category list is a real enum. `INTELLIGENCE_TASKS` = ask | social_content | blog_seo | strategy | decision | offer | media | client_work.

## 2. What is MISSING (the actual work)

1. **Retrieval is not wired.** No generator calls `buildApprovedIntelligenceContext`. Content-graph/ask use `retrieveBrain`+`retrieveKnowledge` only; seo/social/radar use nothing. → **Every generator must pull live approved intelligence before generating.** (THE core "nothing hardcoded" requirement.)
2. **No ingestion for competitor reels/posts.** Only the zernio webhook exists. Need: (a) a signed inbound webhook that normalizes reel/post payloads into `intelligence_items`; (b) an Apify-backed Competitor Scout that pulls posts for a `research_target`.
3. **No intelligence workers.** The registry has 6 handlers; none for scout / transcript-analyst / dreamer / performance-learning / freshness. Agents are identities only.
4. **radar/social/seo are islands.** They generate one-shot drafts and don't read/write the intelligence substrate. They should read `buildApprovedIntelligenceContext` and write approved outputs back as `intelligence_insights`.
5. **No output→evidence logging.** `output_intelligence_usage` is never written.
6. **No Dreamer/freshness scheduled runs.**

## 3. Key decisions (founder said "you decide")

- **Ingestion = built-in agent teams + Apify (gated), NOT n8n-required.** Rationale: runs on the VPS for every deployment with no external orchestrator, is prompt-controllable, and keeps the loop self-contained. Apify pulls raw (posts, captions, metrics, transcripts via actors); a built-in Competitor Scout graph normalizes + analyzes. **n8n stays as an OPTIONAL signed inbound pipe** (`/api/webhooks/intelligence`) for anyone who prefers it — same normalization endpoint, so both paths converge on `recordIntelligenceItem`.
- **The reel problem** (AI can't watch video): ingest *text proxies* — URL + caption + audio transcript (Apify/n8n) + engagement metrics + OCR of thumbnail/frames → store as `intelligence_items` (itemType `competitor_reel`, `rawText`=transcript, `metrics`=engagement, `extracted`={hook, format, cta, offerAngle}). Competitor Scout/Social Analyst extract the pattern → propose insight → founder approves → becomes retrievable.
- **Everything flows through the existing substrate.** No parallel tables. radar/social/seo get refactored to read+write intelligence.
- **Approval-gated.** AI writes `approvalStatus=pending`; only founder-approved items/insights are returned by `buildApprovedIntelligenceContext`. Rejected stays in audit.

## 4. Build order (phases)

- **P1 — Retrieval wiring (the multiplier).** Reusable `getIntelligenceContextBlock(task, scope, clientId)` that formats approved items+insights into a prompt block + logs `output_intelligence_usage`. Wire into seo/social/radar generators, content-graph, ask. *Effect: every output is backed by live approved intelligence; gaps are surfaced.*
- **P2 — Ingestion.** `/api/webhooks/intelligence` (signed, normalizes → `recordIntelligenceItem` pending) + Apify Competitor Scout (`scrapeInstagram` → items) as a worker over `research_targets`.
- **P3 — Analysis workers.** Competitor/Social Analyst graph (items → insight proposals), Transcript Analyst (rawText → hook/format/cta extraction).
- **P4 — Dreamer + Performance Learning + Freshness** scheduled workers → `intelligence_suggestions` + stale flags.
- **P5 — Intelligence Command Center UI** (targets, competitor feed, suggestions inbox, experiments) + Suggestion chips.

## 5. Non-negotiables (from founder brief + ENGINEERING_STANDARDS)

- No hardcoded business intelligence in any generator — always retrieve.
- No fake competitor names / stats / traffic. Honest empty states.
- Important knowledge requires founder approval before it's trusted/retrievable.
- Every insight carries source, confidence, freshness, approval, which agent made it, and which outputs used it.
