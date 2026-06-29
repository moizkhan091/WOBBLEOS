# Plain English WOBBLE OS Map

Date: 2026-06-29

This file explains WOBBLE OS for Moiz and for any AI builder working in this folder.

## The One Big Idea

WOBBLE OS is not just a dashboard.

It is a company operating system where:

- WOBBLE Brain stores what the company knows and believes.
- Research Radar watches what is changing outside.
- Workers use AI models and tools to do work.
- Approvals keep founders in control.
- n8n connects WOBBLE OS to the outside world.
- Audit, Costs, Memory, and Settings keep the system controlled and traceable.

The OS should not hardcode changing strategy. It should read the latest approved knowledge, latest research, source trust rules, founder feedback, and content settings every time it works.

## What A Worker Is

A worker is a backend process that runs jobs.

In plain English:

```text
Worker = the body
LLM = the brain
WOBBLE Brain = memory
Tools/APIs = hands
Approvals = founder control
n8n = delivery runner
```

The worker code does stable steps:

1. Pick up a job.
2. Load current WOBBLE Brain.
3. Load approved sources and relevant memory.
4. Call OpenRouter or another API.
5. Check the output.
6. Save the result.
7. Create approval if needed.
8. Log cost and audit history.

The worker does not hardcode:

- exact captions
- exact hooks
- exact content angles
- exact number of posts forever
- permanent posting decisions
- competitor reactions
- WOBBLE strategy

Those come from memory, sources, settings, prompts, model reasoning, and founder feedback.

## What n8n Is

n8n is the external automation rail.

It is good at:

- scheduled fetching
- moving data between apps
- sending WhatsApp alerts
- posting/scheduling approved content
- syncing CRM/tools
- collecting transcripts
- triggering external workflows

n8n should not be the main brain for WOBBLE.

It should not own:

- brand strategy
- caption logic
- source trust
- approvals
- memory rules
- quality scoring
- final recommendations

## The Backend Layers

### 1. Next.js App

This is the visible WOBBLE OS dashboard.

It owns:

- pages
- buttons
- modals
- approvals UI
- Ask WOBBLE chat UI
- settings UI
- module views
- API endpoints

### 2. Postgres + pgvector

This is the truth layer.

It stores:

- sources
- files
- memory
- embeddings
- jobs
- approvals
- content packets
- media assets
- model runs
- costs
- audit logs
- settings

### 3. Workers

These run intelligent background jobs.

They handle:

- research analysis
- content generation
- quality review
- memory updates
- media generation
- video rendering
- webhook retries
- backups

### 4. n8n

This connects the OS to outside tools.

It handles:

- YouTube transcript pulls
- source monitoring
- WhatsApp alerts
- scheduler handoff
- CRM sync
- external delivery

## Runtime Workers Vs AI Workforce

WOBBLE can show many AI employees in the UI, but technically they can run on fewer backend processes.

V2 runtime processes:

```text
general-ai-worker
content-worker
video-worker
ops-worker
```

Inside those, WOBBLE can expose many named AI employees:

- Radar-01
- Source-01
- Transcript-01
- Learner-01
- Memory-01
- Guardrail-01
- Strategist-01
- Decision-01
- Offer-01
- Scribe-01
- Hooksmith-01
- Editor-01
- Captioner-01
- Carousel-01
- Scriptwriter-01
- Director-01
- Clip-01
- Renderer-01
- MediaQA-01
- ClientStrategist-01
- Webhook-01
- Cost-01
- Backup-01
- Health-01

This is all-in product scope with practical backend runtime.

## How Each Sidebar Module Works

### Command Center

This is the home screen.

It shows:

- what needs founder attention
- approvals waiting
- workers online
- spend
- workflow progress
- important alerts

It reads data from jobs, approvals, workers, model runs, costs, and n8n status.

### Ask WOBBLE

This is the command line for the OS.

User asks:

```text
What content should WOBBLE post this week?
What changed in AI today?
What needs my approval?
What did competitors do?
```

The OS:

1. understands the request
2. searches WOBBLE Brain and approved sources
3. may create a worker job
4. returns answer with citations
5. asks confirmation before costly/dangerous actions

### WOBBLE Brain

This is company memory and rules.

It stores:

- brand voice
- ICP
- offers
- positioning
- what not to say
- SOPs
- content rules
- client learnings
- source trust

Workers read this every time. If Brain changes, workers use the new version without code changes.

### Research Radar

This watches the outside world.

It tracks:

- AI trends
- competitors
- pricing changes
- market shifts
- international AI landscape
- Pakistan market reality
- YouTubers/newsletters/sources

n8n can fetch raw sources. Workers analyze them.

### Source Library

This stores raw material.

Examples:

- PDFs
- YouTube transcripts
- web articles
- Instagram references
- competitor pages
- audio/video transcripts
- brand docs
- client files

New sources should go to approval before they become trusted.

### Learning Engine

This turns raw sources into useful knowledge.

It does:

- summaries
- insight extraction
- weekly market thesis
- memory update proposals
- conflict detection
- rollups

It should not silently update WOBBLE Brain. It proposes updates for approval.

### Content Command

This is the WOBBLE content factory.

V2 starts with WOBBLE company content first.

It creates:

- Instagram static copy
- Instagram carousel copy
- LinkedIn text posts
- LinkedIn carousel copy
- X posts/threads
- reel scripts
- YouTube scripts
- captions

The Content Worker:

1. reads WOBBLE Brain
2. reads latest research
3. checks competitor/trend data
4. creates content packets
5. scores quality
6. checks do-not-say rules
7. sends only good packets to approval

Founder content can be added as content tracks later:

- WOBBLE Company
- Moiz Founder POV
- Haad Founder POV
- Founder 3 POV
- Founder 4 POV

Same engine, different voice profiles.

### Media Studio

This handles visuals and video.

It creates:

- static visuals
- carousels
- keyframes
- AI video clips
- final stitched reels/videos

The Media Worker calls:

- image APIs
- fal/Seedance or similar video APIs
- HyperFrames/FFmpeg for final render

n8n only distributes approved media.

### Presentation Maker

This creates:

- client decks
- proposals
- investor updates
- reports
- AIOS presentations

Workers draft. Founders approve. n8n can deliver/export after approval.

### Decision Room

This is where important decisions happen.

Each decision should show:

- question
- options
- evidence
- recommendation
- opposing view
- risk
- confidence
- final founder decision

### Offer Lab

This handles:

- offers
- pricing
- packages
- objections
- outbound angles
- experiments

Workers suggest. Founders approve. n8n can run approved outbound/CRM handoff.

### Client AIOS Lab

This is for client operating systems.

It handles:

- client workflow maps
- AI employee plans
- client playbooks
- automation plans
- proposals
- dashboards
- deliverables

Client knowledge must stay separated from WOBBLE internal Brain unless explicitly approved.

### Automations

This shows recurring jobs.

Some automations are internal worker schedules.

Some automations are n8n workflows.

Examples:

- overnight research scan
- YouTube transcript pull
- weekly content batch
- cost guardrail check
- source monitoring

### Approvals

This is the control gate.

Nothing serious should ship without approval.

Approvals cover:

- content
- sources
- memory updates
- media
- final MP4
- client deliverables
- expensive jobs
- n8n handoffs

Every approval records:

- approved_by
- approved_at
- risk level
- action
- notes
- linked output

### Workers

This shows worker health.

It should show:

- worker name
- status
- queue
- current job
- load
- last heartbeat
- errors

The named workers are product roles. The runtime processes are backend engines.

### n8n Handoff

This shows external execution.

Each handoff must have:

- signed webhook
- timestamp replay protection
- idempotency key
- retry count
- dead-letter state
- manual retry button

n8n should only receive approved payloads.

### Memory

This is the memory browser.

It should support:

- Core Brain
- Working Memory
- Episodic Memory
- filters
- entity links
- source references
- confidence
- stale/conflict state

### Costs

This tracks all spend.

It should show:

- OpenRouter
- search/Tavily
- media/fal
- video generation
- embeddings
- n8n
- storage
- model runs
- daily/weekly caps

Expensive jobs need approval.

### Audit Log

This is the permanent event history.

It records:

- source added
- source approved
- memory updated
- content generated
- approval action
- model run
- cost
- webhook success/failure
- kill switch toggle
- backup event

### Backup & Restore

This protects the company assets.

It covers:

- Postgres
- files
- media
- sources
- content
- client docs
- exports
- model runs
- audit logs
- approvals

Company assets should not auto-delete.

### Settings

This controls the OS.

It includes:

- model routing
- OpenRouter roles
- provider config references
- budget caps
- source trust levels
- founder names
- content tracks
- do-not-say rules
- kill switches
- health config

Secrets must stay in environment variables, not UI/docs/database.

## Example: WOBBLE Content Job

User clicks:

```text
Content Command -> Generate weekly WOBBLE content
```

Flow:

1. OS creates `generate_content_plan` job.
2. Content Worker picks it up.
3. Worker reads WOBBLE Brain.
4. Worker reads latest Research Radar insights.
5. Worker checks approved sources.
6. Worker calls OpenRouter.
7. Worker creates content angles.
8. Worker scores usefulness, originality, brand fit, aggression, proof, clarity.
9. Worker creates content packets.
10. Worker sends passing packets to Approvals.
11. Founder approves.
12. n8n schedules or hands off approved content.
13. Audit and cost logs are saved.

No hardcoded captions. No hardcoded hooks. The worker uses current knowledge.

## Example: YouTube Transcript Job

Flow:

1. n8n finds new approved YouTube video.
2. n8n gets transcript.
3. n8n sends transcript to WOBBLE OS.
4. Source Worker stores raw transcript as pending source.
5. Transcript Worker summarizes and chunks it.
6. Learner Worker extracts insights.
7. Memory Worker proposes memory updates.
8. Founder approves/rejects source or memory update.
9. Approved knowledge enters WOBBLE Brain/Memory.

n8n fetches. WOBBLE understands.

## Backend Build Order

Build one backend layer at a time:

1. Database tables for jobs, approvals, model runs, audit, sources, memory, content packets.
2. Queue system with pg-boss.
3. General worker process.
4. Content worker process.
5. Approval flow.
6. OpenRouter model run logging.
7. Source ingestion.
8. Memory retrieval.
9. Content packet generation.
10. n8n signed webhook handoff.
11. Ops/retry worker.
12. Media/video worker.

This is technical order, not scope reduction.

## Final Rule

WOBBLE OS should feel like a full AI workforce, but stay controllable.

The system should be smart because it reads living memory and current research, not because someone hardcoded every future decision.
