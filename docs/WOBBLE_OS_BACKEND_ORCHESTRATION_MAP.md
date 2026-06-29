# WOBBLE OS Backend Orchestration Map

Date: 2026-06-29

This document explains how WOBBLE OS modules, workers, n8n automations, AI models, memory, approvals, and backend jobs should work together.

## Core Mental Model

WOBBLE OS has four layers:

1. Next.js OS app
   - Dashboard
   - Module pages
   - APIs
   - Approvals
   - Settings
   - Audit

2. Postgres + pgvector
   - Source of truth
   - Jobs
   - Memory
   - Content packets
   - Model runs
   - Approvals
   - Audit log
   - Costs

3. Workers
   - Persistent backend processes
   - Pick up jobs from Postgres queue
   - Call LLM/media/search APIs
   - Use WOBBLE Brain and approved sources
   - Save outputs and create approval items

4. n8n
   - External automation rail
   - Fetches from outside systems
   - Sends approved outputs to outside systems
   - Runs scheduled glue workflows

Short rule:

```text
OS = control room
Workers = intelligent execution
n8n = external automation rail
Postgres = memory and truth
```

Transcript-derived rule from the four AI OS source videos:

```text
Context -> Data -> Function
Context -> Connections -> Capabilities -> Cadence
```

This means WOBBLE OS should first establish strong Brain context and approved data, then connect tools/providers, then build capabilities, then schedule or automate them. Do not turn a weak workflow into a scheduled workflow just because n8n can run it.

## Worker Does Not Mean Hardcoded Intelligence

A worker is code, but the code should not contain changing strategy.

The worker code only contains stable workflow:

- load the job
- load current WOBBLE Brain
- load approved sources
- load relevant memory
- call the right model/tool
- validate output
- save result
- create approval
- log cost and audit

The changing intelligence comes from:

- WOBBLE Brain
- approved source library
- research radar insights
- competitor tracking
- content performance memory
- founder feedback
- model reasoning
- editable prompts
- prompt/skill registry
- provider reference docs
- settings and strategy controls

Do not hardcode:

- exact hooks
- exact captions
- exact content angles
- exact posting decisions
- exact competitor reactions
- exact number of posts forever
- permanent model choices
- fixed "best" content formulas

Hardcode only stable safety and workflow rules:

- cite sources for serious claims
- use approved sources only
- run quality gate
- respect do-not-say rules
- check budget before expensive jobs
- create approval before handoff
- log model run and audit event

Add a first-class Prompt/Skill Registry so repeatable AI workflows behave like living SOPs. A worker should load the latest approved skill/prompt for the job instead of keeping content strategy, hooks, captions, or decision logic buried in code.

## Recommended V2 Worker Processes Vs Full AI Workforce

Important clarification:

Four worker processes does not mean only four AI employees, only four modules, or a reduced V2.

It means four technical runtime containers/processes that can host many named AI workers, job queues, and module-specific capabilities.

Example:

```text
content-worker process
  - Scribe-01
  - Editor-01
  - Hooksmith-01
  - Captioner-01
  - Carousel-01
  - FounderVoice-01
```

The process is the engine room. The named workers are the AI employee roles inside the OS.

V2 should still go all in on the full WOBBLE workforce. The technical split is only to keep deployment reliable, not to shrink product scope.

## Recommended V2 Runtime Processes

V2 should start with four runtime processes, while exposing a much larger AI workforce inside the OS.

### 1. General AI Worker

Handles:

- Ask WOBBLE background jobs
- summarization
- strategy briefs
- source analysis
- decision drafts
- offer analysis
- client AIOS drafts
- lightweight content ideation
- memory update proposals

Technical command:

```text
npm run worker
```

Example worker identities powered by this process:

- Strategist-01
- Analyst-01
- Learner-01
- Advisor-01

### 2. Content Worker

Handles WOBBLE-first content generation.

Handles:

- weekly content strategy
- Instagram static post copy
- Instagram carousel copy
- LinkedIn static/text/carousel posts
- X posts and threads
- reel scripts
- YouTube scripts
- captions
- CTAs
- content packet creation
- quality gate
- do-not-say validation
- aggression/education mix
- source citation mapping

Technical command:

```text
npm run content-worker
```

Example worker identities:

- Scribe-01
- Editor-01
- Content Strategist-01

Important V2 scope:

- Primary content target is WOBBLE company content.
- Founder content can be added as a separate track/profile using the same engine.
- Do not build a totally separate founder-content system at first.

Recommended content tracks:

- WOBBLE brand/company content
- Founder POV content for Moiz
- Founder POV content for other founders later

Each track should have:

- voice profile
- goals
- allowed topics
- banned phrases
- aggression range
- platform priorities
- approval requirements

### 3. Media / Video Worker

Handles expensive and heavy media jobs.

Handles:

- image prompts
- static asset generation
- carousel visual generation
- keyframe generation
- fal/Seedance/Kling/Runway style provider calls
- reference-to-video jobs
- image-to-video jobs
- clip self-review
- HyperFrames/FFmpeg rendering
- final MP4 assembly
- video budget approvals

Technical command:

```text
npm run video-worker
```

Must be isolated from the web app.

Rules:

- never run FFmpeg inside a Next.js route
- limit CPU / use low priority
- require budget approval before expensive video generation
- store every clip with prompt, provider, cost, status, and approval state

Example worker identities:

- Director-01
- Renderer-01
- Motion-01

### 4. Ops / Retry Worker

Handles operational jobs.

Handles:

- n8n webhook retries
- dead-letter replay
- scheduled internal maintenance
- worker heartbeat
- backup checks
- cost guardrails
- health checks
- memory rollup schedules

Technical command:

```text
npm run ops-worker
```

Example worker identities:

- Ops-01
- Guardrail-01
- Retry-01

## Optional Later Workers

Not mandatory for V2, but useful later:

- Research Worker: split out if radar volume grows
- Client Worker: client-specific AIOS work
- Outreach Worker: offer/outbound sequences
- Evaluation Worker: automated tests and quality checks for generated outputs

Do not split too early unless the system becomes hard to operate.

## Full V2 AI Workforce Roster

These are the named WOBBLE workers/AI employees the OS can expose in the UI. They can run on top of the four runtime processes above.

### Research And Source Workforce

Radar-01:

- scans approved sources
- watches AI landscape
- detects trends and market movement

Radar-02:

- watches policy, platform changes, AI rules, disclosure risk
- flags regulatory or reputation risk

Radar-03:

- competitor tracker
- pricing/page/offer/content monitoring
- creates competitor intelligence briefs

Source-01:

- receives new source candidates
- extracts metadata
- prepares source approval items

Transcript-01:

- processes YouTube transcripts, podcast transcripts, reel references, long-form video text
- turns raw transcript into source chunks and summaries

### Learning And Memory Workforce

Learner-01:

- turns raw sources into structured insights
- creates weekly/monthly rollups

Memory-01:

- proposes memory updates
- checks memory tier, source, confidence, and affected area

Guardrail-01:

- checks do-not-say rules
- flags weak phrasing, generic AI agency language, unsupported claims, and brand drift

Indexer-01:

- chunks and embeds approved sources and memory
- maintains pgvector retrieval health

### Strategy Workforce

Strategist-01:

- creates strategic briefs
- connects research to decisions, offers, content, and client opportunities

Decision-01:

- prepares Decision Room options
- summarizes evidence, opposing view, risk, and recommendation

Offer-01:

- works on offers, pricing, objections, packages, and experiment ideas

Closer-01:

- outbound angles and sequences
- only after claim and proof checks

### Content Workforce

Scribe-01:

- WOBBLE company content planner and writer
- creates content packets from research and Brain

Hooksmith-01:

- generates and scores hooks
- balances educational and aggressive/rage-bait angles

Editor-01:

- revises drafts for clarity, sharpness, proof, voice, and usefulness

Captioner-01:

- captions for Instagram, LinkedIn, X, reels, shorts

Carousel-01:

- carousel structure and slide copy
- static post/campaign copy

Scriptwriter-01:

- reel scripts, YouTube scripts, short-form video scripts

FounderVoice-01:

- founder-content track writer
- starts with Moiz POV later, then other founders
- reuses the same Content Command engine, not a separate backend

### Media Workforce

Director-01:

- storyboard and creative direction
- decides shot list, references, and prompt strategy

Prompt-01:

- image/video prompt engineering
- prepares provider-specific prompt packs

Clip-01:

- fal/Seedance/Kling-style clip generation
- image-to-video and reference-to-video jobs

Renderer-01:

- HyperFrames/FFmpeg stitching, captions, overlays, final exports

MediaQA-01:

- reviews generated clips, carousels, and final MP4s before approval

### Client AIOS Workforce

ClientStrategist-01:

- client AIOS plans and workflow maps

Playbook-01:

- client playbooks, SOPs, and operating docs

Proposal-01:

- client decks, proposals, audits, and presentations

### Operations Workforce

Ops-01:

- job health, worker heartbeat, retries

Webhook-01:

- signed n8n handoffs, retry, dead-letter recovery

Cost-01:

- cost estimates, caps, budget approval warnings

Backup-01:

- backup runs, restore-test checks, storage manifest

Health-01:

- health endpoints and service availability status

## Runtime Mapping For The Full Workforce

The full workforce maps to the runtime processes like this:

```text
general-ai-worker
  Radar-01, Radar-02, Radar-03, Source-01, Transcript-01,
  Learner-01, Memory-01, Guardrail-01, Indexer-01,
  Strategist-01, Decision-01, Offer-01, Closer-01,
  ClientStrategist-01, Playbook-01, Proposal-01

content-worker
  Scribe-01, Hooksmith-01, Editor-01, Captioner-01,
  Carousel-01, Scriptwriter-01, FounderVoice-01

video-worker
  Director-01, Prompt-01, Clip-01, Renderer-01, MediaQA-01

ops-worker
  Ops-01, Webhook-01, Cost-01, Backup-01, Health-01
```

If load grows, any named worker can later be split into its own process without changing the product design.

## n8n Automation Categories

n8n should be used where it is strongest: scheduled external workflows and app glue.

### Source Collection Automations

n8n should:

- fetch YouTube transcripts
- monitor selected YouTube channels
- monitor newsletters/RSS
- pull approved website pages
- capture permitted Instagram/reel references
- collect competitor updates
- send new raw sources to WOBBLE OS API

Then WOBBLE workers:

- parse
- summarize
- score
- embed
- propose insights
- propose memory updates
- create approval items

### Notification Automations

n8n should:

- send WhatsApp alerts
- send email alerts
- notify founders when approvals are waiting
- notify on failed jobs or budget alerts

WOBBLE OS decides when to notify. n8n delivers it.

### Handoff Automations

n8n should:

- send approved posts to scheduler
- upload approved media to storage/platforms
- sync CRM records
- create Google Drive/Notion/Canva records if needed
- send approved client deliverables
- push approved outbound sequences

WOBBLE OS must create the approved payload first.

### External Sync Automations

n8n should:

- pull analytics
- pull content performance
- pull campaign results
- sync client data
- sync lead/CRM statuses

Workers then interpret the synced data.

## What n8n Should Not Own

n8n should not be the main place for:

- brand strategy
- content thinking
- caption logic
- source trust decisions
- memory rules
- do-not-say rules
- quality scoring
- approval logic
- cost tracking truth
- content packet schema
- final strategic recommendations

Reason:

If the thinking is scattered in n8n nodes, it becomes hard to version, test, audit, improve, and connect to WOBBLE Brain.

## Module-By-Module Backend Map

### Command Center

Purpose:

- daily OS overview
- what needs attention
- worker status
- approval count
- spend
- golden workflow

OS app owns:

- UI
- metrics aggregation
- links to modules
- status cards

Workers own:

- metrics updates
- worker heartbeats
- queue counts
- spend summaries

n8n owns:

- none directly, except reporting external automation status back to OS

Backend data:

- approvals
- jobs
- worker_heartbeats
- model_runs
- webhook_events
- cost_summaries

### Ask WOBBLE

Purpose:

- natural language command center
- ask across Brain, sources, content, clients, offers, decisions, audit

OS app owns:

- chat UI
- command routing
- confirmation prompts
- citations display

Workers own:

- retrieval
- reasoning
- tool planning
- model calls
- result creation

n8n owns:

- no thinking
- only runs external actions after approval

Backend data:

- chat_sessions
- chat_messages
- memory_chunks
- sources
- model_runs
- audit_log

### WOBBLE Brain

Purpose:

- company memory and rules
- brand voice
- ICP
- offers
- do-not-say rules
- SOPs
- strategy

OS app owns:

- brain UI
- memory approval queue
- manual edits
- source trust interface

Workers own:

- memory suggestions
- consolidation
- conflict detection
- embeddings

n8n owns:

- source ingestion triggers only

Backend data:

- memory_records
- memory_chunks
- memory_update_proposals
- source_references
- do_not_say_rules

### Research Radar

Purpose:

- track AI landscape
- track competitors
- track market shifts
- track Pakistan and international trends

OS app owns:

- radar UI
- research run controls
- insight review

Workers own:

- search planning
- source analysis
- insight extraction
- scoring
- citations

n8n owns:

- scheduled fetching
- transcript capture
- RSS/newsletter pulls
- approved source monitoring

Backend data:

- research_runs
- research_insights
- sources
- source_candidates
- citations

### Source Library

Purpose:

- permanent repository for files, transcripts, URLs, data, references

OS app owns:

- uploads
- source detail
- trust approval
- source approval queue

Workers own:

- parsing
- transcription
- summarization
- chunking
- embedding
- metadata extraction

n8n owns:

- source capture from outside systems

Backend data:

- sources
- files
- source_chunks
- source_trust_levels
- source_approval_events

### Learning Engine

Purpose:

- convert raw inputs into reusable knowledge
- create rollups
- identify patterns

OS app owns:

- learning progress UI
- rollup review
- approval of new memory

Workers own:

- weekly theses
- monthly theses
- cluster analysis
- memory proposals
- entity linking

n8n owns:

- scheduled trigger only, if useful

Backend data:

- learning_jobs
- insight_clusters
- memory_update_proposals
- rollups

### Content Command

Purpose:

- WOBBLE content engine
- company posts first
- founder content as optional track

OS app owns:

- content calendar
- content packet view
- review UI
- approval UI

Workers own:

- content strategy
- content generation
- self-review
- caption/script creation
- quality scores
- source mapping

n8n owns:

- schedule/post only after approval

Backend data:

- content_packets
- content_versions
- content_reviews
- content_calendar
- content_tracks
- approval_items

V2 content formats:

- Instagram static
- Instagram carousel
- LinkedIn text
- LinkedIn carousel
- X posts/threads
- reel scripts for Instagram/LinkedIn/YouTube Shorts
- YouTube scripts
- captions

### Media Studio

Purpose:

- visual and video generation
- clips
- renders
- final media approval

OS app owns:

- media library
- clip review
- provider selection
- budget confirmation

Workers own:

- media prompts
- image/video API calls
- clip review
- render/stitching
- final exports

n8n owns:

- distribution after approval

Backend data:

- media_jobs
- media_assets
- media_clips
- render_jobs
- provider_runs
- approvals

### Presentation Maker

Purpose:

- decks, proposals, reports, client presentations

OS app owns:

- deck workspace
- template library
- review/approval

Workers own:

- outline generation
- slide copy
- citations
- export preparation

n8n owns:

- optional delivery/upload after approval

Backend data:

- presentations
- presentation_versions
- exports
- templates

### Decision Room

Purpose:

- founder-level strategic decisions

OS app owns:

- decision UI
- approval/commit
- history

Workers own:

- options
- evidence summaries
- risk/opposing view
- recommendation

n8n owns:

- notifications only

Backend data:

- decisions
- decision_options
- decision_evidence
- decision_commits

### Offer Lab

Purpose:

- offers, pricing, experiments, objections, outbound angles

OS app owns:

- offer boards
- experiment tracking
- approval

Workers own:

- offer analysis
- objection maps
- copy drafts
- experiment suggestions

n8n owns:

- approved outbound/CRM handoff

Backend data:

- offers
- offer_experiments
- objection_maps
- outbound_sequences

### Client AIOS Lab

Purpose:

- client operating systems and deliverables

OS app owns:

- client workspaces
- deliverable review
- client-specific memory boundaries

Workers own:

- workflow maps
- playbooks
- proposals
- client briefs

n8n owns:

- client intake
- client alerts
- approved delivery handoffs

Backend data:

- clients
- client_sources
- client_memory
- client_deliverables
- client_approvals

### Automations

Purpose:

- internal and external recurring jobs

OS app owns:

- automation registry
- kill switch state
- schedule visibility

Workers own:

- internal scheduled jobs
- health checks
- retries

n8n owns:

- external scheduled workflows

Backend data:

- automations
- automation_runs
- kill_switches
- schedules

### Approvals

Purpose:

- human gate before serious output ships

OS app owns:

- approval queue
- approval detail
- approver attribution
- confirmation

Workers own:

- create approval items
- update downstream jobs after approval

n8n owns:

- acts only after approved handoff

Backend data:

- approval_items
- approval_actions
- approval_notes
- audit_log

Required approval actions:

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

### Workers

Purpose:

- operational visibility of backend worker processes

OS app owns:

- status UI
- logs UI
- queue visibility

Workers own:

- heartbeat records
- job processing
- job status updates

n8n owns:

- no worker logic

Backend data:

- worker_heartbeats
- jobs
- job_attempts
- job_logs

### n8n Handoff

Purpose:

- safe bridge to external automations

OS app owns:

- endpoint registry
- webhook events
- dead-letter UI
- retry controls

Workers own:

- signed payload creation
- retry handling
- dead-letter processing

n8n owns:

- receives signed payloads
- executes external automation
- reports success/failure

Backend data:

- webhook_endpoints
- webhook_events
- dead_letters
- idempotency_keys

### Memory

Purpose:

- browser for long-term operational memory

OS app owns:

- memory UI
- filters
- manual memory approval

Workers own:

- embeddings
- retrieval scoring
- consolidation
- stale/conflict detection

n8n owns:

- no direct memory writes

Backend data:

- memory_records
- memory_chunks
- memory_links
- memory_rollups

### Costs

Purpose:

- all model/search/media/spend tracking

OS app owns:

- cost dashboard
- caps settings
- budget approvals

Workers own:

- write model_runs
- estimate costs
- enforce caps before jobs

n8n owns:

- report external automation costs where possible

Backend data:

- model_runs
- provider_runs
- cost_summaries
- budget_caps

### Audit Log

Purpose:

- immutable record of important events

OS app owns:

- audit UI
- filters
- event details

Workers own:

- write events for jobs, models, errors, handoffs

n8n owns:

- writes back execution result events via signed webhook

Backend data:

- audit_log

### Backup & Restore

Purpose:

- recover OS state and assets

OS app owns:

- backup UI
- restore confirmation
- backup status

Workers own:

- backup jobs
- restore test checks
- retention checks

n8n owns:

- optional external backup notification only

Backend data:

- backup_runs
- restore_tests
- file_manifest

### Settings

Purpose:

- system controls
- providers
- budgets
- source trust
- founder identities
- model routing

OS app owns:

- settings UI
- config references

Workers own:

- read settings at runtime
- do not require code change for strategy updates

n8n owns:

- reads endpoint config only where needed

Backend data:

- settings
- provider_configs
- model_roles
- budget_caps
- founder_profiles
- content_tracks
- source_trust_defaults

## WOBBLE Content First, Founder Content Later

Recommendation:

V2 should make WOBBLE company content first because the company brand is the immediate priority.

Founder content should be added as a track inside Content Command, not a whole separate system.

Content tracks:

- WOBBLE Company
- Moiz Founder POV
- Haad Founder POV
- Founder 3 POV
- Founder 4 POV

Each track can share:

- source library
- research radar
- content packet schema
- quality gate
- approval queue
- n8n handoff

But each track has its own:

- voice
- banned phrases
- goals
- aggression level
- preferred platforms
- content mix

This keeps the system powerful without doubling the backend.

## Final Rule

Do not make n8n the brain.

Do not make workers rigid.

Do not make the frontend pretend to be the backend.

Build WOBBLE OS so the stable process is coded, but the changing strategy lives in memory, settings, sources, prompts, AI reasoning, and founder feedback.
