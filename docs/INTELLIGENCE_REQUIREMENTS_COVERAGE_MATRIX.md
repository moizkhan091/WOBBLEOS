# Intelligence Requirements Coverage Matrix

Date: 2026-07-01
Owner: shared builders

Purpose: this is the fast audit file for the long Self-Improving Intelligence Layer founder brief. Claude, Codex, Gemini, and Antigravity should use this to confirm that none of the intelligence-system requirements were dropped. Do not reduce this scope. Add to it when founder adds new intelligence needs.

Canonical architecture:

- `docs/SELF_IMPROVING_INTELLIGENCE_LAYER.md`
- `docs/INTELLIGENCE_LAYER_MAP.md`
- `docs/CONTENT_INTELLIGENCE_SYSTEM.md`
- `docs/BUILD_SEQUENCE_TRACKER.md`
- `docs/V2_BUILD_ACCEPTANCE_PLAN.md`

## Coverage Summary

Everything in the pasted Self-Improving Intelligence Layer brief is in V2 scope. Some foundations are built; many specific agents/connectors/UI screens are future chunks. Technical build order is not scope reduction.

## A-R Requirement Coverage

| Founder requirement | Status | Primary owner chunks | Canonical storage / behavior |
| --- | --- | --- | --- |
| Full Self-Improving Intelligence Layer architecture | Built as architecture + foundation | 50, 36, 12, 13, 37-49 | `SELF_IMPROVING_INTELLIGENCE_LAYER.md`, `research_targets`, `intelligence_items`, `intelligence_insights`, `intelligence_suggestions`, `experiments`, `output_intelligence_usage` |
| All required data categories | Documented, substrate built | 50, 37, 38, 39, 43, 44, 47, 48 | Competitors, social stats, SEO/blog, website analytics, client notes, sales objections, hooks, formats, examples, experiments all map to intelligence tables plus module-specific tables where needed |
| Where each data type lives | Documented, core tables built | 50, 09, 10, 14, 37-49 | Raw evidence in `sources/files/source_chunks/webhook_events`; normalized observations in `intelligence_items`; analysis in `intelligence_insights`; approved durable knowledge in Memory/Brain/Knowledge Base |
| AI research agent roster and responsibilities | Documented | 50, 12, 13, 36, 37-49 | 16-agent registry in `src/lib/domain/intelligence.ts`; future workers must use this substrate |
| Agent cadence: constant/daily/weekly/on-trigger | Documented, scheduler later | 50, 19, 36, 44, 47 | Cadence defined in docs; scheduling/kill-switch execution owned by Automations Registry and worker chunks |
| Manual data entry | API substrate built, UI pending | 50, UI-I1, UI-G1 | Manual additions go through `/api/intelligence/*`, Source Library, Memory, content tracks, future module UIs |
| n8n data ingestion | Designed, handoff chunk next | 18, 12, 38, 39, 46, 48 | Signed inbound/outbound webhooks, `webhook_events`, normalization into `intelligence_items` |
| AI-researched data | Foundation built, agents pending | 12, 13, 36, 37, 44, 47 | Agents write items/insights/suggestions; important changes require approval |
| Human approval for important knowledge | Built in core, used by intelligence foundation | 04, 10, 50, 13, 36, 44, 47 | AI suggests; founder approves/rejects; no silent Brain/source/trust/strategy changes |
| Automatic use of new approved data | Contract documented, partial wiring built | 11, 15, 16, 37, 38, 43, 47 | Retrieval rule: `new module data -> structured DB row -> chunk/vector/metadata if needed -> approved/trusted status -> Ask WOBBLE/workers retrieval` |
| Old-vs-new comparison | Foundation built, specific loops pending | 50, 38, 39, 47 | Freshness scoring exists; performance attribution and analytics comparisons are future chunks |
| Stale knowledge detection | Foundation built | 50, 13, 36, 47 | Freshness status and stale rules are documented and domain-tested; later workers generate alerts/proposals |
| Dreamer / Suggestion Engine | Foundation built, worker pending | 50, 36 | `intelligence_suggestions` exists; nightly/manual Dreamer worker is Chunk 36 |
| UI/admin panels | Documented, frontend checkpoints pending | UI-C1, UI-I1, UI-G1, UI-FINAL | Intelligence Command Center, Research Targets, Competitor Intelligence, Social Intelligence, SEO/Blog, Website Analytics, Dreamer Suggestions, Experiments, Source Quality |
| Code/DB/API/worker changes | Foundation built, workers pending | 50, 12, 13, 18, 36, 37-49 | DB/API foundation is real; specific ingestors, connectors, and analysis workers still need their chunks |
| Update docs for Claude | Done and ongoing | 00, every chunk | This matrix plus handoff log are required reading |
| Update chunks so all AI builders know | Done and ongoing | tracker + acceptance plan | `BUILD_SEQUENCE_TRACKER.md` and `V2_BUILD_ACCEPTANCE_PLAN.md` carry the scope |

## Non-Negotiable Implementation Rule

Workers and n8n automations must not hardcode changing business intelligence. They must use this path:

`data arrives -> structured DB row -> approval/trust state -> retrieval/context builder -> worker/model output -> usage logged -> performance measured -> learning proposal`

This applies to content, blogs, SEO, social, media, offers, decisions, clients, invoices, presentations, and future modules.

## What Claude Should Pick Up When Limit Resets

1. UI-C1 is the next frontend checkpoint: wire Content Command UI to real content tracks, packets, generation, approvals, and handoff status.
2. Do not create a separate founder-content backend. Chunk 16 made founder content a track/profile inside the same content engine.
3. Use the real APIs:
   - `GET/POST /api/content/tracks`
   - `GET/PATCH /api/content/tracks/[id]`
   - `GET/POST /api/content/packets`
   - `POST /api/content/generate`
   - `POST /api/content/quality`
4. Keep all empty states honest. No fake competitor names, fake stats, fake rankings, fake traffic, or fake performance data.
5. If Claude works on intelligence UI, it must show pending/approved/rejected and source/evidence links clearly.

## Current Build State

Built:

- Core DB/audit/approvals/cost/job/worker/provider spine
- Source Library
- Memory/WOBBLE Brain
- Ask WOBBLE V1
- Content Command
- Content Worker
- Content Excellence Gate
- Self-Improving Intelligence Foundation
- Founder Content Tracks

Next frontend:

- UI-C1 Content Command real wiring

Next backend:

- Chunk 18 n8n Signed Handoff

## n8n Webhook Implementation Rule

Use webhooks as the default n8n integration rail:

1. WOBBLE OS sends approved, signed outbound payloads to n8n Webhook Trigger URLs.
2. n8n runs the automation.
3. For fast jobs, n8n can respond immediately to the outbound call.
4. For long jobs, n8n sends a signed callback back to WOBBLE OS.
5. WOBBLE verifies timestamp, signature, and idempotency before trusting the callback.

Do not treat n8n as a hidden side system. Every outbound handoff and inbound callback must create `webhook_events`; failures must create `dead_letters`; important status changes must be auditable.

Official n8n docs checked while implementing Chunk 18:

- `https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/`
- `https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/`
