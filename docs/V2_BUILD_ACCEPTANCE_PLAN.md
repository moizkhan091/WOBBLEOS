# WOBBLE OS V2 Build Acceptance Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full WOBBLE OS V2 as a usable internal operating system with clear acceptance criteria for every module, worker, automation, and backend capability.

**Architecture:** WOBBLE OS is a Next.js internal app backed by Postgres/pgvector, Drizzle migrations, Postgres-backed jobs, runtime workers, OpenRouter/model provider adapters, secure n8n handoffs, approvals, costs, audit logs, and long-term file storage. The frontend may start with mock data, but backend chunks must move toward real stored state, traceability, and approval-controlled execution.

**Tech Stack:** Next.js, TypeScript, Postgres, pgvector, Drizzle, pg-boss or graphile-worker, OpenRouter, provider adapters for search/media/video, n8n signed webhooks, local VPS storage, Vitest, Playwright where UI verification matters.

---

## How To Use This Plan

This is the shared build/evaluation map for Codex, Claude, Gemini, Antigravity, and any future AI builder.

Every builder should read first:

- `AGENTS.md`
- `CLAUDE.md`
- `docs/PROJECT_START_HERE.md`
- `docs/AI_HANDOFF_LOG.md`
- `docs/FINAL_V2_MASTER_BUILD_PLAN.md`
- `docs/AI_OS_TRANSCRIPT_LESSONS_FOR_WOBBLE.md`
- `docs/PLAIN_ENGLISH_WOBBLE_OS_MAP.md`
- `docs/WOBBLE_OS_BACKEND_ORCHESTRATION_MAP.md`
- `docs/CLAUDE_BROWSER_AUDIT_ROUND_2.md`
- this file

After meaningful work, append to:

- `docs/AI_HANDOFF_LOG.md`

## Competition Rules

The goal is the best WOBBLE OS, not one AI "winning" by confusing the others.

Rules:

- Do not sabotage another agent's work.
- Do not delete working code or docs without a clear replacement and audit note.
- Do not reduce V2 scope without explicit founder approval.
- Do not hide important implementation assumptions.
- Do not hardcode changing content strategy, captions, hooks, model choices, sources, or founder preferences.
- Do update the handoff log with what changed, what is still mocked, and what needs review.
- Do run verification before claiming done.

## Definition Of Done For Any Chunk

A chunk is not done because the UI looks nice. It is done when:

- The expected user workflow works end to end for that chunk.
- Data is stored in the correct place.
- Important actions write audit events.
- Expensive or risky actions require approval or confirmation.
- The chunk has tests for domain logic or API behavior.
- The UI clearly distinguishes real state from placeholder/mock state.
- Errors have visible failure states.
- The builder updates `docs/AI_HANDOFF_LOG.md`.

Minimum verification before claiming done:

```text
npm run test
npm run typecheck
npm run build
```

If a command cannot run, document why in `docs/AI_HANDOFF_LOG.md`.

## Build Principles

Transcript-derived operating order:

- Context before Data.
- Data before Function.
- Context before Connections.
- Connections before Capabilities.
- Capabilities before Cadence.
- Manual workflow before scheduled/autonomous workflow.

Stable workflow belongs in code:

- create job
- load memory
- call model/tool
- validate
- save
- create approval
- log cost
- log audit

Changing intelligence belongs in data:

- WOBBLE Brain
- approved sources
- research insights
- content track settings
- founder feedback
- model prompts
- prompt/skill registry
- provider reference docs
- do-not-say rules
- source trust levels
- budget settings

The four transcript lesson docs added on 2026-06-29 make these rules explicit:

- use a small number of strong essential Brain docs before dumping raw archives
- treat skills/prompts as living SOPs that improve from feedback
- prefer direct APIs/provider adapters where they are more reliable and token-efficient than generic connectors
- use n8n as the external automation rail, not as the WOBBLE Brain
- add cadence only after the workflow works manually
- keep decision history because it teaches WOBBLE founder judgment

## Full Feature Coverage Check

V2 includes:

- Command Center
- Ask WOBBLE
- WOBBLE Brain
- Research Radar
- Source Library
- Learning Engine
- Content Command
- Media Studio
- Presentation Maker
- Decision Room
- Offer Lab
- Client AIOS Lab
- Automations
- Approvals
- Workers
- n8n Handoff
- Memory
- Costs
- Audit Log
- Backup & Restore
- Settings
- Source Approval Queue
- Memory Update Approval Queue
- Prompt/Skill Registry
- Connections Registry
- AI OS Auditor / Brain Optimizer
- Content Packet Detail
- Quality Gate
- Model Runs Detail
- n8n Dead Letters
- Health Status
- Budget Caps
- Media Clip Review
- Final MP4 Approval
- Do-not-say Rules
- Provider Adapter Registry
- Prompt/Agent Registry
- WOBBLE company content track
- Founder content tracks

No major main module is currently missing. The main risk is missing second-level depth inside each module.

---

# Build Chunks

## Chunk 00: Project Hygiene And Shared Memory

**Purpose:** Ensure every AI builder starts from the same project truth.

**Owns:**

- shared docs
- handoff log
- agent instructions
- source-of-truth links

**First successful build looks like:**

- `AGENTS.md` and `CLAUDE.md` tell all builders what to read.
- `docs/AI_HANDOFF_LOG.md` exists and contains recent decisions.
- New builders can understand current scope without reading the chat.

**Must not hardcode:**

- personal assumptions from one agent as permanent product rules unless written as a decision.

**Manual test:**

- Open `AGENTS.md`, follow the listed files, and confirm the project purpose, frontend audit, backend map, and current next steps are understandable.

**Automated test:**

- No automated test required for docs-only changes.

**Done when:**

- Shared docs are current.
- Handoff log has an entry for the work.

## Chunk 01: Database Foundation

**Purpose:** Create the database shape for the OS.

**Owns:**

- schema
- migrations
- pgvector extension
- core IDs and timestamps

**First successful build looks like:**

- Drizzle migration creates all foundational tables needed for V2.
- `CREATE EXTENSION IF NOT EXISTS vector;` runs before vector columns.
- Every table has stable IDs, created_at, updated_at where relevant.

**Core tables:**

- users/founders or founder_profiles
- sessions/auth records if using DB sessions
- settings
- jobs
- job_attempts
- worker_heartbeats
- sources
- files
- source_chunks
- memory_records
- memory_chunks
- memory_update_proposals
- approvals
- approval_actions
- content_packets
- content_versions
- quality_reviews
- model_runs
- provider_runs
- audit_log
- webhook_endpoints
- webhook_events
- dead_letters
- budget_caps
- automations
- automation_runs
- backup_runs

**Must not hardcode:**

- fixed source names
- fixed founder identities except seed data
- fixed model names as permanent logic

**Manual test:**

- Run migration on a clean local Postgres.
- Confirm pgvector exists.
- Confirm tables exist.

**Automated test:**

- Schema tests verify required tables/columns exist through Drizzle metadata or migration snapshot.

**Done when:**

- `npm run typecheck`, `npm run test`, and migration checks pass.

## Chunk 02: Shared Auth And Founder Attribution

**Purpose:** Secure the internal OS while keeping one shared login plus explicit approval attribution.

**Owns:**

- shared login
- session cookie
- founder selector
- approval attribution

**First successful build looks like:**

- Internal OS requires login.
- Shared password is hashed, never plaintext.
- Secure HTTP-only session cookie is used.
- Approval actions require `approved_by`.
- Founder name can be stored as UI default, but server receives explicit `approved_by`.

**Must not hardcode:**

- real passwords
- PINs in frontend
- secrets in database/docs/logs

**Manual test:**

- Visit OS route logged out and get redirected to login.
- Login with configured password.
- Approve an item and confirm approver is captured.

**Automated test:**

- Auth helper rejects wrong password.
- Approval API rejects missing approver.

**Done when:**

- Auth works locally and protected API routes reject unauthenticated requests.

## Chunk 03: Audit Log

**Purpose:** Make every important action traceable.

**Owns:**

- append-only audit events
- actor
- module
- linked entity
- metadata

**First successful build looks like:**

- Approval, rejection, source add, memory proposal, model run, webhook event, kill switch toggle, and backup event can write audit rows.
- Audit page reads real rows.

**Must not hardcode:**

- fake audit rows in production views once backend exists.

**Manual test:**

- Perform approval.
- Open Audit Log.
- See event with actor, module, action, linked item, timestamp.

**Automated test:**

- `writeAuditEvent` stores required fields.
- Missing action/module fails validation.

**Done when:**

- Audit rows are generated by at least approvals and source creation.

## Chunk 04: Approvals System

**Purpose:** Build the founder gate that controls content, sources, memory, media, client deliverables, expensive jobs, and n8n handoffs.

**Owns:**

- approval queue
- approval detail
- approval actions
- approver attribution
- high-risk confirmation

**First successful build looks like:**

- Worker/API can create approval item.
- UI lists approval items.
- Founder can Approve, Reject, Request Revision, Archive.
- Each action creates audit entry.
- Approval count updates.

**Required actions:**

- Approve
- Reject
- Request Revision
- Regenerate
- Edit Manually
- Archive
- Send to n8n
- Retry Handoff
- Mark as Final
- Approve Clip
- Reject Clip
- Approve Final MP4

**Must not hardcode:**

- only one approver
- only content approvals
- hidden auto-approval

**Manual test:**

- Create approval item from seed/dev action.
- Approve as a founder.
- Confirm status, audit event, and queue count update.

**Automated test:**

- Approval state machine rejects invalid transitions.
- High-risk/high-cost action requires confirmation flag.

**Done when:**

- Approvals work for at least content, source, memory update, and n8n handoff item types.

## Chunk 05: Model Runs And Cost Tracking

**Purpose:** Track every AI/search/media run and prevent hidden spend.

**Owns:**

- model_runs
- provider_runs
- cost estimates
- latency
- errors
- budget cap checks

**First successful build looks like:**

- A model call wrapper records provider, model, role, tokens if available, estimated cost, latency, status, linked module, linked output.
- Costs page reads real records.
- Budget cap check can block expensive jobs.

**Must not hardcode:**

- permanent prices without a config mechanism
- all model choices in code only

**Manual test:**

- Run a dev model call or mocked provider call.
- See model run row.
- See Costs dashboard update.

**Automated test:**

- Cost estimator returns expected value for sample usage.
- Budget guard blocks job above cap.

**Done when:**

- Model run logging works even when provider call fails.

## Chunk 06: Job Queue Foundation

**Purpose:** Let the OS create reliable background jobs.

**Owns:**

- pg-boss or graphile-worker setup
- job creation API
- retries
- failure states
- idempotency

**First successful build looks like:**

- API can enqueue job.
- Worker can pick up job.
- Job transitions: queued -> active -> completed/failed.
- Failed job stores error and can retry.

**Must not hardcode:**

- one-off timers inside Next.js routes
- long-running AI calls inside request lifecycle

**Manual test:**

- Click/dev-trigger "create test job."
- Worker processes it.
- Workers page shows recent job status.

**Automated test:**

- Job payload validation rejects malformed payload.
- Idempotency key prevents duplicate job creation.

**Done when:**

- At least one worker consumes one real queued job.

## Chunk 07: Worker Runtime Foundation

**Purpose:** Run persistent worker processes outside Next.js.

**Owns:**

- `src/workers/*`
- graceful shutdown
- heartbeat
- logs
- job handlers

**First successful build looks like:**

- `npm run worker` starts general worker.
- Worker writes heartbeat.
- SIGINT/SIGTERM calls queue stop gracefully.
- Worker page can show status.

**Must not hardcode:**

- workers inside API routes
- fake heartbeat in production state

**Manual test:**

- Start worker.
- See heartbeat in DB/UI.
- Stop worker and confirm status becomes stale/offline.

**Automated test:**

- Handler registry maps known job names.
- Unknown job fails with clear error.

**Done when:**

- General worker can run, process a test job, and shut down safely.

## Chunk 08: Provider Adapter Registry

**Purpose:** Keep OpenRouter/search/media/video providers swappable and auditable.

**Owns:**

- provider interfaces
- model role routing
- config references
- error normalization

**First successful build looks like:**

- OpenRouter adapter exists for text.
- Search adapter interface exists.
- Media/video adapter interface exists.
- Settings can define model roles by provider/model key.

**Must not hardcode:**

- API keys
- one permanent model
- provider credentials in UI

**Manual test:**

- Change model role setting and confirm next job uses selected role key.

**Automated test:**

- Mock adapter returns normalized response.
- Failed provider call records model_run with error.

**Done when:**

- Text provider adapter is usable by Ask WOBBLE or Content Worker.

## Chunk 09: Source Library Backend

**Purpose:** Store, approve, parse, and retrieve source material.

**Owns:**

- source records
- file metadata
- source approval
- trust levels
- upload validation

**First successful build looks like:**

- Founder can add/upload source.
- Source starts pending unless manually marked trusted.
- File metadata includes path, type, checksum, size, module, status, approval state.
- Source detail shows chunks/summary when processed.

**Must not hardcode:**

- automatically trusting unknown sources
- deleting company assets automatically

**Manual test:**

- Add transcript/PDF/text source.
- Approve it.
- Confirm it becomes available to workers.

**Automated test:**

- Unsupported MIME/type rejected.
- Trust hierarchy resolves correctly.

**Done when:**

- Source approval queue works and approved sources can be retrieved by job handlers.

## Chunk 10: Memory And WOBBLE Brain Backend

**Purpose:** Make the OS remember company knowledge safely.

**Owns:**

- Core Brain
- Working Memory
- Episodic Memory
- memory chunks
- update proposals
- retrieval

**First successful build looks like:**

- Memory records have tier, trust, source reference, confidence, affected area.
- Worker/API can propose memory update.
- Founder approves/rejects update.
- Ask/Content jobs retrieve approved memory.

**Must not hardcode:**

- silently updating Core Brain
- one giant vector table without metadata filters

**Manual test:**

- Add do-not-say rule.
- Run content generation.
- Confirm output respects the rule without code change.

**Automated test:**

- Retrieval filters by tier/trust/active state.
- Time decay scoring can prefer newer records unless query disables it.

**Done when:**

- Memory proposal approval works and retrieval returns metadata-rich records.

## Chunk 11: Ask WOBBLE V1

**Purpose:** Build the natural language command surface.

**Owns:**

- chat sessions
- retrieval
- citations
- job routing
- confirmations

**First successful build looks like:**

- User asks a question.
- Ask WOBBLE retrieves Brain + approved sources.
- Answer shows citations/evidence summary.
- If action is needed, it creates a job or asks confirmation.

**Must not hardcode:**

- canned answers
- hidden model calls with no cost log

**Manual test:**

- Ask: "What should WOBBLE post this week based on latest approved research?"
- Response cites sources or says not enough approved research.

**Automated test:**

- Retrieval context builder includes Core Brain and approved sources.
- Unapproved sources are excluded.

**Done when:**

- Ask WOBBLE can answer from stored memory/sources with citations and logs a model_run.

## Chunk 12: Research Radar

**Purpose:** Turn external changes into scored insights.

**Owns:**

- research runs
- insight records
- source candidates
- scoring
- routing to learning/content/decision

**First successful build looks like:**

- Founder can start research run.
- Worker searches or processes seeded source data.
- Insights are created with source references, score, confidence, category, and recommended route.

**Must not hardcode:**

- trend list
- competitor insights
- permanent source additions without approval

**Manual test:**

- Run a competitor research job.
- See insight in Research Radar.
- Send it to Decision Room or Learning Engine.

**Automated test:**

- Insight validation requires source reference.
- Low-trust sources cannot override Core Brain.

**Done when:**

- Research run creates usable insight with citations and audit/model logs.

## Chunk 13: Learning Engine

**Purpose:** Convert sources and radar insights into reusable knowledge.

**Owns:**

- rollups
- summaries
- insight clusters
- memory update proposals
- conflict detection

**First successful build looks like:**

- Worker can summarize multiple source chunks into a weekly thesis.
- Proposed memory update appears in approval queue.
- Approved update becomes memory.

**Must not hardcode:**

- automatic Brain mutation
- one summary format forever without settings

**Manual test:**

- Select several approved sources.
- Run consolidation.
- Approve a proposed memory update.

**Automated test:**

- Memory proposal includes reason, source, affected area, confidence.

**Done when:**

- At least one rollup-to-memory approval path works.

## Chunk 14: Content Command Backend

**Purpose:** Store and review content packets.

**Owns:**

- content tracks
- content packets
- versions
- packet detail
- approval status

**First successful build looks like:**

- Content Packet detail exists.
- Packets include platform, format, objective, audience, angle, hook, copy, caption, CTA, design direction, source IDs, memory IDs, evidence summary, quality score, approval state.

**Must not hardcode:**

- WOBBLE content as static sample cards only
- one platform only

**Manual test:**

- Create packet manually or by seed.
- Open packet detail and inspect evidence/quality/approval state.

**Automated test:**

- Content packet validation requires platform, format, objective, hook/copy, source references for researched claims.

**Done when:**

- Content Command board reads real packets and opens packet detail.

## Chunk 15: Content Worker V1

**Purpose:** Generate WOBBLE company content from current Brain and approved research.

**Owns:**

- content strategy job
- OpenRouter call
- content packet creation
- quality gate
- approval creation

**First successful build looks like:**

- User clicks Generate WOBBLE Content.
- Worker loads WOBBLE Brain, do-not-say rules, approved sources, latest insights.
- Worker creates multiple content packets.
- Worker runs quality review.
- Passing packets enter Approvals.
- Failed drafts are saved outside approval queue with reasons.

**Must not hardcode:**

- captions
- hooks
- fixed content count
- fixed aggressive/educational mix in code

**Manual test:**

- Change a do-not-say rule.
- Run content job.
- Confirm generated output avoids the new banned phrase without code change.

**Automated test:**

- Quality gate blocks draft below threshold.
- Worker creates approval only for passing packet.

**Done when:**

- WOBBLE company content can be generated, reviewed, stored, and approved.

## Chunk 16: Founder Content Tracks

**Purpose:** Add founder content without building a separate backend.

**Owns:**

- content_tracks
- founder voice profiles
- platform priorities
- approval filters

**First successful build looks like:**

- Content Command can filter WOBBLE Company vs Moiz Founder POV.
- Founder track uses same content packet schema.
- Voice profile changes output context without code change.

**Must not hardcode:**

- founder voice in worker code
- separate duplicate content engine

**Manual test:**

- Generate WOBBLE post and Moiz POV post from same insight.
- Confirm different voice/profile and both use packet schema.

**Automated test:**

- Track settings are loaded into content job context.

**Done when:**

- Founder content exists as track/profile, not new system.

## Chunk 17: Content Excellence Gate And Do-Not-Say Rules

**Purpose:** Keep WOBBLE content sharp, useful, original, brand-safe, and actually approval-worthy. This is the serious content-quality layer above Chunk 15's generation pipe.

**Owns:**

- quality_reviews
- banned phrases
- weak words
- weak hooks
- generic AI/business fluff detection
- caption and CTA strength checks
- WOBBLE voice fit
- proof checks
- aggression control
- rewrite/regenerate recommendations

**First successful build looks like:**

- Every content packet has quality scores.
- Failing drafts do not enter approval queue.
- Do-not-say rules are editable in Brain/Settings.
- The gate explains why a draft is weak: generic hook, weak CTA, unsupported claim, bad WOBBLE fit, too salesy, too vague, poor proof, or bad aggression control.
- The gate can recommend targeted revision instructions for the content worker instead of only saying "fail".
- Hook/caption/CTA rules are loaded from approved content skills/Brain/settings when available, not buried permanently in code.

**Quality dimensions:**

- usefulness
- originality
- brand fit
- clarity
- aggression control
- proof strength
- post-worthiness
- hook strength
- CTA strength
- specificity
- anti-fluff score

**Must not hardcode:**

- permanent phrase list only in code
- blind pass/fail without reasons
- one fixed hook formula
- one permanent definition of "good content"
- fake high scores to force approvals

**Manual test:**

- Add banned phrase.
- Generate or edit content with that phrase.
- Confirm gate flags it.
- Add a new approved hook/caption rule to Brain/Skill Registry.
- Run content generation.
- Confirm quality feedback changes without code edits.

**Automated test:**

- Rule matcher flags banned phrase.
- Score threshold blocks approval creation.
- Generic hook detector flags tired openings such as "Tired of..." when not explicitly allowed.
- Gate returns revision instructions with evidence, not just a boolean.
- Passing draft creates/keeps approval eligibility; failing draft remains outside approval queue.

**Done when:**

- Quality gate visibly explains why a draft passed or failed and can feed concrete revision instructions back into the content worker.

## Chunk 18: n8n Signed Handoff

**Purpose:** Safely hand approved work to outside automations.

**Owns:**

- signed webhooks
- timestamp replay protection
- idempotency
- retries
- dead letters

**First successful build looks like:**

- Approved content can create signed handoff payload.
- n8n webhook receives or mocked receiver verifies signature.
- Duplicate idempotency key does not duplicate handoff.
- Failed handoff appears in dead letters.

**Must not hardcode:**

- webhook secrets in code/docs
- unsigned handoffs
- auto-send before approval

**Manual test:**

- Approve content.
- Send to n8n.
- Confirm webhook event is logged as success/failure.

**Automated test:**

- HMAC verification rejects bad signature.
- Timestamp older than 5 minutes rejected.
- Duplicate idempotency key rejected.

**Done when:**

- Handoff layer is secure and visible in n8n Handoff page.

## Chunk 19: Automations Registry

**Purpose:** Show and control recurring internal and n8n jobs.

**Owns:**

- automation records
- automation runs
- schedules
- kill switches

**First successful build looks like:**

- Automations page reads real automation records.
- Kill switches have visible ON/OFF text.
- Toggle writes audit event and affects job creation/handoff.

**Must not hardcode:**

- visual-only switches
- hidden behavior with no audit

**Manual test:**

- Turn off Source Scraping.
- Try to trigger source capture.
- Confirm blocked and audit logged.

**Automated test:**

- Kill switch prevents relevant job enqueue.

**Done when:**

- At least source scraping and media generation kill switches affect real backend behavior.

## Chunk 20: Workers Health Page

**Purpose:** Show AI workforce and backend runtime health.

**Owns:**

- worker_heartbeats
- queue depth
- current jobs
- stale/offline state
- worker roster

**First successful build looks like:**

- UI shows full named WOBBLE workforce.
- Runtime process health is separate from named worker roles.
- Offline/stale workers are visibly flagged.

**Must not hardcode:**

- fake online status once worker heartbeat exists

**Manual test:**

- Stop content worker.
- UI shows content runtime stale/offline.

**Automated test:**

- Heartbeat older than threshold maps to offline.

**Done when:**

- Workers page gives real operational visibility.

## Chunk 21: Media Studio Backend

**Purpose:** Store and review visual/media assets.

**Owns:**

- media assets
- media jobs
- clip status
- prompts
- provider metadata
- approvals
- creative reference library
- reference metadata and approval status
- design directions linked to content packets

**First successful build looks like:**

- Media job can be created.
- Asset metadata saved.
- Clip approval item can be created.
- Media Studio shows real jobs/assets.
- A founder can add/upload a design reference.
- The reference is classified by platform, format, style, use case, brand fit, and approval status.
- Media jobs can link to one selected design reference or one selected carousel reference set.

**Must not hardcode:**

- provider-only assumptions
- final media status without generated asset metadata
- blending every available reference into one generic hybrid
- treating unapproved references as production-ready

**Manual test:**

- Create mock media job.
- Upload or generate placeholder asset.
- Approve/reject clip.
- Add 5 static-post design references.
- Create one static media brief and confirm the system selects one dominant reference, not all five.

**Automated test:**

- Media job requires provider, prompt, status, linked module.
- Reference selector returns one dominant reference for static output.
- Carousel output can select one approved carousel-reference set.
- Blocked/unapproved references are excluded from production selection.

**Done when:**

- Media Studio has real data model, approval flow, and approved creative-reference selection.

## Chunk 22: Media / Video Worker

**Purpose:** Generate and render media without choking the web app.

**Owns:**

- provider calls
- fal/Seedance-style adapter
- GPT Image/OpenAI image adapter where configured
- HyperFrames/FFmpeg render jobs
- clip review
- final MP4 approval
- reference-conditioned prompt building
- multimodal creative QA

**First successful build looks like:**

- Video worker runs separately.
- Expensive media job requires budget approval.
- Worker can call mock provider or real provider when keys exist.
- Clips are stored and reviewed before final stitch.
- Static/carousel image jobs can use one selected design reference or carousel reference set.
- The worker records which reference was used and why.
- Generated image/media output is quality-scored before approval.

**Must not hardcode:**

- API keys
- one provider as permanent only route
- FFmpeg in Next.js API route
- one image provider as permanent route
- using all references at once by default

**Manual test:**

- Trigger media job with mock provider.
- Confirm worker produces asset record and approval item.
- Trigger a static image job with 3 approved references.
- Confirm exactly one reference was selected and linked to the generated asset.

**Automated test:**

- Budget guard blocks expensive job without approval.
- Video worker handler rejects missing prompt/reference.
- Reference-conditioned media job stores selected_reference_id or selected_reference_set_id.
- Expensive image/video jobs require budget approval.

**Done when:**

- Media/video pipeline works with mock provider and is ready for real provider keys.

## Chunk 23: Presentation Maker

**Purpose:** Generate and manage decks, proposals, reports.

**Owns:**

- presentations
- templates
- versions
- exports
- approvals

**First successful build looks like:**

- User can create presentation draft from brief.
- Worker can generate outline/copy using sources.
- Deck approval item is created.
- Export record is stored.

**Must not hardcode:**

- only investor deck
- design text as static cards only

**Manual test:**

- Create "WOBBLE AIOS client pitch" from approved sources.
- See deck outline and approval status.

**Automated test:**

- Presentation draft requires title, audience, objective, sections.

**Done when:**

- Presentation Maker has real draft/detail/approval flow.

## Chunk 24: Decision Room

**Purpose:** Make founder decisions evidence-backed and traceable.

**Owns:**

- decision questions
- options
- evidence
- opposing view
- recommendation
- final decision

**First successful build looks like:**

- Research/Ask can create decision item.
- Decision detail shows options and evidence.
- Founder can commit decision.
- Decision writes audit event and can create downstream job.

**Must not hardcode:**

- one recommendation without opposing view
- decision text as static board only

**Manual test:**

- Create decision: "Should WOBBLE respond to competitor pricing?"
- Commit one option and see audit event.

**Automated test:**

- Decision cannot be committed without approver and selected option.

**Done when:**

- Decision Room supports open -> committed workflow.

## Chunk 25: Offer Lab

**Purpose:** Manage offers, pricing, experiments, objections, and outbound angles.

**Owns:**

- offers
- offer experiments
- objection maps
- outbound sequence drafts
- performance status

**First successful build looks like:**

- Offer item has hypothesis, audience, pricing, status, evidence, metrics.
- Offer Worker can propose test.
- Approved offer can feed Content Command or n8n outbound.

**Must not hardcode:**

- one offer forever
- outbound claims without proof/risk check

**Manual test:**

- Create offer experiment.
- Approve winner.
- Confirm linked content/outbound job can be created.

**Automated test:**

- Archived offer excluded from default retrieval unless requested.

**Done when:**

- Offer Lab stores experiments and links to approvals/content.

## Chunk 26: Client AIOS Lab

**Purpose:** Build client operating systems using WOBBLE engine while keeping client data isolated.

**Owns:**

- clients
- client sources
- client memory
- workflow maps
- deliverables
- client approvals

**First successful build looks like:**

- Client workspace exists.
- Client sources/memory are separated from WOBBLE internal Brain.
- Worker can create client playbook/proposal draft.
- Client deliverable requires approval before export/handoff.

**Must not hardcode:**

- mixing client data into WOBBLE Brain automatically
- one sample client as product logic

**Manual test:**

- Add client source.
- Ask WOBBLE internal question and confirm client-private data is not used unless client context selected.

**Automated test:**

- Retrieval excludes client memory without client scope.

**Done when:**

- Client AIOS Lab has client-scoped data boundaries.

## Chunk 27: Backup & Restore

**Purpose:** Protect Postgres and company assets.

**Owns:**

- backup runs
- file manifest
- restore tests
- retention status

**First successful build looks like:**

- Backup job records DB/files snapshot metadata.
- Temporary files excluded.
- Company assets preserved.
- Restore test status exists.

**Must not hardcode:**

- auto-delete permanent assets
- fake restore success

**Manual test:**

- Trigger backup job in dev.
- Confirm backup run row and manifest.

**Automated test:**

- Storage path classifier excludes `/storage/temp` and includes permanent folders.

**Done when:**

- Backup page shows real backup status and scope.

## Chunk 28: Settings, Budgets, And Kill Switches

**Purpose:** Let founders change behavior without code changes.

**Owns:**

- model roles
- budget caps
- content tracks
- source trust defaults
- kill switches
- provider config references

**First successful build looks like:**

- Settings page edits budget caps and model role keys.
- Workers read settings at runtime.
- Kill switches block related jobs.

**Must not hardcode:**

- API keys
- strategy rules only in code
- hidden settings not visible to founders

**Manual test:**

- Lower daily OpenRouter cap.
- Run content job.
- Confirm budget guard blocks or requests approval.

**Automated test:**

- Worker context loader returns current settings.
- Kill switch blocks job enqueue.

**Done when:**

- Settings changes affect backend behavior without redeploy.

## Chunk 29: Command Center Final Wiring

**Purpose:** Make the home screen real.

**Owns:**

- KPI aggregation
- workflow counts
- approvals preview
- worker health
- spend chart
- alerts

**First successful build looks like:**

- Command Center reads real backend data.
- Every card links to the right detail.
- Alerts show failed jobs, pending approvals, budget risk, stale workers.

**Must not hardcode:**

- static metrics once backend exists

**Manual test:**

- Create source, content packet, approval, failed webhook.
- Confirm Command Center updates.

**Automated test:**

- Dashboard summary query returns counts for jobs/approvals/workers/costs.

**Done when:**

- Command Center is useful as daily operating view.

## Chunk 30: End-To-End WOBBLE Content Flow

**Purpose:** Prove WOBBLE OS works as a content operating system.

**Flow:**

1. Add/approve source.
2. Learning Engine extracts insight.
3. Memory update is proposed and approved.
4. Generate WOBBLE content.
5. Content Worker creates packet.
6. Quality Gate scores it.
7. Founder approves.
8. n8n handoff sends approved payload or mock receiver logs it.
9. Audit and cost logs show complete trail.

**Must not hardcode:**

- content output
- approval bypass
- fake handoff success

**Manual test:**

- Run the complete flow with one source and one content packet.

**Automated test:**

- Integration test covers source -> packet -> approval -> handoff with mocked model/provider.

**Done when:**

- A founder can verify the whole content path inside WOBBLE OS.

## Chunk 31: End-To-End Research-To-Decision Flow

**Purpose:** Prove WOBBLE OS can make important decisions from research.

**Flow:**

1. Research Radar creates insight.
2. Insight is routed to Decision Room.
3. Decision Worker creates options and evidence.
4. Founder commits decision.
5. Downstream content/offer job can be created.
6. Audit log records full trail.

**Manual test:**

- Use competitor/pricing insight to create decision.
- Commit option.
- Confirm linked job/audit.

**Automated test:**

- Decision commit requires evidence and approver.

**Done when:**

- Decision Room is more than a board; it creates traceable company decisions.

## Chunk 32: End-To-End Media Flow

**Purpose:** Prove WOBBLE OS can produce media safely.

**Flow:**

1. Content packet requests media.
2. Media job is created.
3. Budget approval happens if needed.
4. Media worker creates clip/image using mock or real provider.
5. Clip enters approval.
6. Approved clips are stitched/rendered.
7. Final MP4 enters approval.
8. n8n distributes after approval.

**Manual test:**

- Run with mock provider if no real API keys.
- Confirm clip and final approval states.

**Automated test:**

- Expensive media job blocked without approval.
- Final handoff blocked until final MP4 approved.

**Done when:**

- Media Studio has a safe approved path from idea to export.

## Chunk 33: Health, Recovery, And Failure States

**Purpose:** Make the OS operationally serious.

**Owns:**

- health endpoints
- worker heartbeat
- storage access
- n8n config check
- dead-letter retry
- failed job visibility

**First successful build looks like:**

- Health status page/card shows web, worker, video worker, storage, n8n.
- Failed job can be retried or archived.
- Dead-letter has detail and retry.

**Manual test:**

- Stop worker or break n8n config in dev.
- Confirm visible degraded status.

**Automated test:**

- Health endpoint returns unhealthy when dependency check fails.

**Done when:**

- Failures are visible and recoverable.

---

# Transcript-Derived Chunks (Added 2026-06-29, Claude)

These three were listed in the Full Feature Coverage Check and the master plan but had no numbered chunk with acceptance criteria. The 9 AI OS transcripts make them first-class, so they are added here without renumbering 00-33. Full design lives in `docs/WOBBLE_OS_INTELLIGENCE_BUILD_MAP.md`.

## Chunk 34: Prompt/Skill Registry

**Purpose:** Make AI workflows editable, versioned, and improvable so workers never hardcode strategy. (Transcripts: skills are living SOPs; commands like /prime, /explore, /brainstorm.)

**Owns:**

- skill/prompt records and versions
- approval + archive state
- module links
- command-style skills

**First successful build looks like:**

- `prompt_skills` records can be created, versioned, approved, and archived.
- Workers load the latest APPROVED skill version at runtime (never a hardcoded string).
- Seed includes command-skills `prime`, `explore`, `brainstorm` plus the existing content/research/decision skills.
- Founder feedback can propose a skill update that enters Approvals.

**Must not hardcode:**

- hooks, captions, content strategy, or model choices inside worker code
- a single permanent prompt version

**Manual test:**

- Edit a skill's prompt body, approve the new version, run a job, and confirm the new behavior with no code change.

**Automated test:**

- Worker context loader returns the approved skill version; unapproved/archived versions are excluded.

**Done when:**

- At least one worker (content or ask) loads an approved skill from the registry and a skill update flows through approval.

## Chunk 35: Connections Registry

**Purpose:** Track every API/tool the OS can reach, with permissions, cost category, and health. (Transcripts: Four C's "Connections"; prefer direct APIs, n8n for glue; separate service keys; save provider reference docs.)

**Owns:**

- `provider_connections` records
- enabled state + allowed modules + permission mode
- cost category + health status
- reference doc path

**First successful build looks like:**

- Registry lists OpenRouter, search, fal/Seedance, n8n, storage, and future posting/scheduler providers (already seeded).
- Each connection shows enabled/disabled, allowed modules, cost category, health, and reference doc path.
- Secrets are referenced by env key name only and never displayed.
- Disabling a connection blocks jobs that depend on it.

**Must not hardcode:**

- API keys in code/UI/docs
- one permanent provider as the only route

**Manual test:**

- Disable a connection, attempt a dependent job, confirm it is blocked with a clear reason and audit event.

**Automated test:**

- Job guard rejects use of a disabled connection or a module not in `allowed_modules`.

**Done when:**

- Connections registry is the single source of truth for what the OS may call, with no secrets exposed.

## Chunk 36: AI OS Auditor / WOBBLE Dreaming Engine

**Purpose:** The self-improving intelligence layer. A worker reviews recent OS activity and proposes a small number of evidence-linked, approval-gated improvements. (Transcripts: nightly "dreaming" engine; context-rot optimizer; Four-C + 3-KPI scorecard.)

**Owns:**

- scheduled + on-demand optimizer runs
- the 8 analysis dimensions
- recommendation -> approval items
- Four-C + 3-KPI health scorecard

**First successful build looks like:**

- A manual "Run Optimizer" action analyzes: activity (repeated manual task -> propose skill), cost (`model_runs` -> model right-sizing vs `budget_caps`), skill performance (`prompt_skills` + `quality_reviews`), memory health (stale/duplicate/conflicting), source health (approval backlog/coverage), quality patterns, automation patterns (`automation_runs`/`dead_letters`), and external opportunities.
- It produces 4-6 ranked recommendations, each written as an approval item (`memory_update_proposals`, proposed `prompt_skills` version, or settings-change proposal).
- Each run logs `model_runs` (cost), `audit_logs`, and an `automation_runs` row, and respects its own budget cap + kill switch.
- It NEVER mutates Core Brain or settings directly.

**Must not hardcode:**

- silent Brain/settings mutation
- recommendations without the source rows that triggered them
- auto-apply of any change

**Manual test:**

- Run the optimizer after some activity; confirm 4-6 evidence-linked recommendations appear in Approvals; approve one and confirm it applies + audits; reject one and confirm the reason is stored.

**Automated test:**

- Optimizer emits recommendations only as approval items (no direct writes to memory/settings).
- A recommendation includes linked evidence (entity ids) and a confidence/impact score.

**Done when:**

- The manual optimizer works end to end; only then is the nightly cadence enabled via Chunk 19. Maturity stays Inform + Recommend + Confirm (no autonomy in V2).

## Transcript-Derived Additions To Existing Chunks

These sharpen existing chunks without changing their numbers. Detail in `docs/WOBBLE_OS_INTELLIGENCE_BUILD_MAP.md`.

- Chunk 05 (Model Runs/Cost) + Chunk 28 (Settings): add a "founder time value" setting so time/money saved per skill (ROI) can be computed and shown internally and to clients.
- Chunk 09 (Source Library) + Chunk 10 (Memory): consider a lightweight graph/index over sources and the repo for cheaper grounded retrieval; label cited-fact vs inferred on chunks; show "blast radius" (downstream impact) on Brain-update approvals.
- Chunk 11 (Ask WOBBLE): route command-style skills (/prime, /explore, /brainstorm) from Chunk 34.
- Chunk 19 (Automations): host the nightly Daily Brief and the nightly Dreaming Engine run (only after their manual versions work).
- Chunk 25 (Offer Lab): seed the train / done-with-you / productized + retainer offer ladder; instant-ROI "solve one big problem first" playbook.
- Chunk 26 (Client AIOS Lab): context-first client onboarding, read+write integrations, ROI tracking as a client deliverable, simple client chat surface.
- Chunk 29 (Command Center): add a Daily Brief output and a Four-C + 3-KPI strip (away-from-desk autonomy, task automation %, revenue per employee).

---

# AI Builder Evaluation Rubric

Use this to compare Codex, Claude, Gemini, Antigravity, or any builder.

Score each chunk from 0 to 5.

## 1. Requirement Fit

0 = ignored scope  
3 = partial workflow works  
5 = exactly matches chunk acceptance criteria

## 2. Anti-Hardcoding

0 = hardcoded strategy/content/model/source logic  
3 = some settings/data-driven behavior  
5 = stable workflow in code, changing intelligence in data/settings/memory

## 3. Traceability

0 = no audit/cost/logging  
3 = partial logs  
5 = audit, model runs, costs, and linked entities are clear

## 4. Approval Safety

0 = bypasses approval  
3 = approval exists but incomplete  
5 = approval is explicit, attributed, timestamped, and risk-aware

## 5. Code Quality

0 = messy/unmaintainable  
3 = works but rough  
5 = typed, focused files, follows existing patterns

## 6. Tests

0 = no tests  
3 = basic tests  
5 = meaningful tests for success and failure paths

## 7. Handoff Hygiene

0 = no documentation update  
3 = brief note  
5 = clear `AI_HANDOFF_LOG.md` update with files touched, behavior, and open questions

## 8. Product Judgment

0 = technically works but product feels wrong  
3 = usable  
5 = feels like WOBBLE: premium, sharp, useful, controlled, not generic

Winner is not the agent with most code. Winner is the agent whose work makes WOBBLE OS more real, safer, smarter, and easier for the next builder to continue.

---

# First Recommended Backend Build Sequence

Start here:

1. Chunk 01: Database Foundation
2. Chunk 03: Audit Log
3. Chunk 04: Approvals System
4. Chunk 05: Model Runs And Cost Tracking
5. Chunk 06: Job Queue Foundation
6. Chunk 07: Worker Runtime Foundation
7. Chunk 09: Source Library Backend
8. Chunk 10: Memory And WOBBLE Brain Backend
9. Chunk 11: Ask WOBBLE V1
10. Chunk 14: Content Command Backend
11. Chunk 15: Content Worker V1
12. Chunk 18: n8n Signed Handoff

This gives WOBBLE OS its first real nervous system:

```text
source -> memory -> content -> approval -> handoff -> audit/cost
```

After that, build media, client AIOS, decision, offer, presentations, backups, and full health/failure recovery.

## Final Acceptance For V2

V2 is accepted when:

- A founder can log in.
- A source can be added, approved, processed, and cited.
- WOBBLE Brain can be updated only through approval.
- Ask WOBBLE answers from approved Brain/sources with citations.
- WOBBLE company content can be generated as content packets.
- Quality gate blocks weak/unsafe drafts.
- Founder can approve content with attribution.
- Approved content can be handed to n8n securely.
- Costs/model runs are visible.
- Audit trail records the full path.
- Workers run outside Next.js.
- Failures/dead letters are visible and retryable.
- Backups have real status.
- Command Center reflects real state.
- The UI keeps the WOBBLE premium OS feeling.

That is the finish line for V2.
