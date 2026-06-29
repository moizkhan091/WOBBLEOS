# WOBBLE OS Claude Design Audit And Build Prompt

Date: 2026-06-29

Primary handoff inspected:
- `C:\Wobble OS\dashboard-interface-design-brief\README.md`
- `C:\Wobble OS\dashboard-interface-design-brief\project\WOBBLE OS.dc.html`
- `C:\Wobble OS\dashboard-interface-design-brief\project\WOBBLE OS-print-qbwnpk.dc.html`
- `C:\Users\moizk\Downloads\WOBBLE OS.pdf`

## Read Status

The handoff README says the primary implementation source is `project\WOBBLE OS.dc.html`.

The `.dc.html` file is a 1,044-line Claude Design prototype. It has one main component with reusable page archetypes:

- command center
- chat
- feed
- library
- board
- approvals
- operations table
- progress tracker
- costs
- settings
- modal capture
- founder switch / PIN modal

The PDF is a one-page export of the Command Center, not a separate full spec.

## High-Level Verdict

The design is strong and directionally correct for WOBBLE OS V2. It feels like a premium internal operating system, not a marketing site. The black, electric-lime, blue, and orange palette fits the WOBBLE brand board. The glass treatment, floating orb, compact metrics, status pills, and workflow cards all support the "AI workforce company" positioning.

The left nav looks intimidating at first because it has 21 items, but the underlying structure is not actually 21 separate product builds. Most pages share a few repeatable patterns. This should be treated as a complete OS surface with reusable module templates, not 21 bespoke dashboards.

Keep the full scope, but make the first production build technically sane by implementing shared primitives first:

- shell
- nav
- page header
- cards
- feed rows
- library cards
- kanban boards
- approval cards
- ops tables
- settings sections
- modals
- toasts

Then each module is mostly data, actions, and backend connections.

## Left Nav Audit

The current nav groups are good:

- Workspace
- Pipeline
- Strategy
- Operations
- System

Do not remove the modules. WOBBLE OS is supposed to feel like a full command center. Instead, control overwhelm with:

- collapsible groups
- keyboard command search
- module badges only when urgent
- dashboard home surfacing the most important work
- keeping System items quiet and lower priority

Recommended nav order:

Workspace:
- Command Center
- Ask WOBBLE
- WOBBLE Brain

Pipeline:
- Research Radar
- Source Library
- Learning Engine
- Content Command
- Media Studio
- Presentation Maker

Strategy:
- Decision Room
- Offer Lab
- Client AIOS Lab

Operations:
- Automations
- Approvals
- Workers
- n8n Handoff

System:
- Memory
- Costs
- Audit Log
- Backup & Restore
- Settings

This is not too many features if the Command Center is the real daily home and the left nav is treated as the full OS map.

## Page Audit

### Command Center

Purpose:
One pane of glass for WOBBLE. Shows Ask WOBBLE, high-level KPIs, golden workflow, approvals, live workers, and spend.

Backend owner:
- Next.js app for dashboard
- Postgres for metrics
- workers for live job states
- model_runs and audit_log for cost/activity

n8n role:
- only final handoffs and scheduled automations, not dashboard logic

Needed production additions:
- real query-backed metrics
- click-through from every workflow step
- failed job visibility
- budget warnings
- health status cards

### Ask WOBBLE

Purpose:
Natural language command line across the OS.

Backend owner:
- Next.js API route for chat
- OpenRouter model router
- pgvector retrieval
- source citation layer
- audit logging

n8n role:
- trigger approved workflows only after Ask WOBBLE creates a structured job

Needed production additions:
- citations in every serious answer
- memory tier filter
- confidence level
- assumptions
- "needs founder judgment" flag
- command confirmation before costly jobs

### WOBBLE Brain

Purpose:
The company knowledge core: brand, ICP, voice, offer, client, and SOP memory.

Backend owner:
- Postgres tables
- pgvector memory_chunks
- memory update approval queue
- Learning Engine rollups

n8n role:
- ingestion triggers and source collection

Needed production additions:
- Core Brain / Working Memory / Episodic Memory tabs
- source trust levels
- memory update proposals
- stale memory review
- do-not-say rules as first-class objects

### Research Radar

Purpose:
Continuous market, competitor, culture, and AI landscape scanning.

Backend owner:
- Research job planner
- Tavily/Search API calls
- source scoring
- insight extraction
- citations

n8n role:
- scheduled source pulls
- YouTube transcript capture
- RSS/newsletter monitoring
- Instagram/reel reference collection where allowed

Needed production additions:
- source approval before new sources become trusted
- international AI landscape + Pakistan market reality
- insight-to-decision routing
- manual "run research" controls

### Source Library

Purpose:
Permanent repository of PDFs, web clips, transcripts, audio, datasets, images, and brand docs.

Backend owner:
- upload validation
- file metadata
- checksums
- storage linking
- source trust status

n8n role:
- can deposit captured files into pending source queue

Needed production additions:
- supported file types
- upload limits
- trust level
- approval state
- source owner
- citation preview
- "never auto-delete" enforcement

### Learning Engine

Purpose:
Converts raw sources into structured knowledge, summaries, rollups, insights, and reusable playbooks.

Backend owner:
- background worker
- pg-boss jobs
- embeddings
- weekly/monthly consolidation

n8n role:
- scheduled start triggers only

Needed production additions:
- memory rollup viewer
- source-to-memory trace
- conflict detection against Core Brain
- proposed memory updates requiring founder approval

### Content Command

Purpose:
Turns research into content packets and moves them through idea, draft, self-review, approval, handoff.

Backend owner:
- content packet schema
- quality gate
- caption/script generation
- source citation enforcement
- approval queue

n8n role:
- scheduling/publishing handoff after founder approval

Needed production additions:
- platform filters: Instagram, LinkedIn, X, YouTube, reels
- formats: static, carousel, text post, tweet/thread, reel script, YouTube script
- aggressive vs educational mix control
- source_ids_used, memory_chunks_used, evidence summary
- self-review scores

### Media Studio

Purpose:
Static, carousel, audio, short video, AI clips, and final MP4 rendering.

Backend owner:
- media job queue
- provider adapters
- fal/Seedance calls
- HyperFrames/FFmpeg render worker
- approval states

n8n role:
- distribute approved media to scheduler/storage/posting tools

Needed production additions:
- render isolation warning
- budget approval before expensive generations
- provider selector
- image-to-video and reference-to-video flows
- clip review before stitching
- final MP4 approval

### Presentation Maker

Purpose:
Generate investor updates, client pitches, proposals, case-study decks, and internal reports.

Backend owner:
- deck outline generation
- content sourcing
- export records
- approval workflow

n8n role:
- optional handoff to Canva/Google Drive/client delivery after approval

Needed production additions:
- templates
- export formats
- source citations
- brand/design QA
- client-safe review gate

### Decision Room

Purpose:
Founder-level strategic decisions with evidence, options, tradeoffs, risks, and final commit log.

Backend owner:
- decision objects
- evidence links
- scoring
- audit log
- approvals

n8n role:
- notifications only

Needed production additions:
- options table
- recommendation
- opposing view
- confidence
- what changes if approved
- linked execution jobs

### Offer Lab

Purpose:
Design and test offers, pricing, outbound angles, objections, and conversion experiments.

Backend owner:
- offer experiments
- hypothesis tracking
- performance data
- content/outbound generation

n8n role:
- outbound sequences and CRM handoff after approval

Needed production additions:
- experiment metrics
- archived offer behavior
- claim risk checks
- legal/proof requirement
- links to Content Command and Decision Room

### Client AIOS Lab

Purpose:
Build client operating systems using WOBBLE's internal engine pointed outward.

Backend owner:
- client data
- client knowledge base
- workflow maps
- proposal/playbook generator
- client deliverable approvals

n8n role:
- client intake, alerts, delivery handoffs, optional client automations

Needed production additions:
- client isolation boundaries
- client-specific memory
- evidence/source separation from WOBBLE internal brain
- client-facing export approval

### Automations

Purpose:
Recurring jobs and triggers.

Backend owner:
- automation records
- kill switches
- job schedules
- worker triggers

n8n role:
- many actual external automations run here

Needed production additions:
- status
- last run
- next run
- retries
- owner
- linked module
- kill switch state

### Approvals

Purpose:
The single gate before important outputs move forward.

Backend owner:
- approval records
- approver identity
- risk level
- action type
- confirmation
- audit log

n8n role:
- receives only approved handoffs

Needed production additions:
- Approve
- Reject
- Request Revision
- Regenerate
- Edit Manually
- Archive
- Send to n8n
- Retry Handoff
- Mark as Final
- approved_by
- approved_at
- notes

### Workers

Purpose:
Operational visibility into persistent background workers.

Backend owner:
- worker heartbeat table
- pg-boss/graphile-worker job states
- video worker isolation

n8n role:
- not a worker replacement; n8n is external automation rail

Needed production additions:
- web worker
- general AI worker
- video worker
- queue depth
- last heartbeat
- failure state
- pause/resume controls

### n8n Handoff

Purpose:
Bridge to execution using secure webhooks.

Backend owner:
- webhook endpoint registry
- HMAC verification
- timestamp replay window
- idempotency keys
- retries
- dead letters

n8n role:
- receives approved tasks and executes external workflows

Needed production additions:
- endpoint health
- last payload
- retry button
- dead-letter viewer
- signature status
- linked approval

### Memory

Purpose:
Operational memory browser and memory health view.

Backend owner:
- memory tables
- pgvector chunks
- memory update approvals
- consolidation jobs

n8n role:
- source ingestion trigger only

Needed production additions:
- memory tier filters
- trust level filters
- decay/time scoring preview
- entity links
- archived/active toggle

### Costs

Purpose:
Spend visibility across text models, embeddings, search, n8n, media, storage, and video.

Backend owner:
- model_runs table
- cost estimator
- budget caps
- job preflight

n8n role:
- may report n8n execution costs if available

Needed production additions:
- daily/weekly caps
- expensive pending jobs
- cost by module
- provider/model drilldown
- budget approval workflow

### Audit Log

Purpose:
Immutable record of important activity.

Backend owner:
- append-only audit log table
- event metadata
- actor/approver
- linked entity

n8n role:
- external handoff events should be written back to the OS

Needed production additions:
- filters
- event detail drawer
- model used
- cost
- source IDs
- before/after where relevant

### Backup & Restore

Purpose:
Operational recovery and asset protection.

Backend owner:
- backup scripts
- restore verification
- storage snapshots
- DB dump metadata

n8n role:
- optional scheduled backup trigger, but restore remains OS/admin controlled

Needed production additions:
- fresh VPS restore test status
- last backup status
- backup scope
- excluded temp files
- manual restore confirmation

### Settings

Purpose:
Models, providers, security, secrets references, budgets, rate limits, source trust defaults, health, and operational controls.

Backend owner:
- settings tables
- env reference names only
- auth/session/CSRF
- budget caps

n8n role:
- webhook endpoint config references only

Needed production additions:
- OpenRouter model roles
- provider adapters
- budget caps
- kill switches
- source trust levels
- founder names
- no API key display

## Missing / Under-Specified Items To Add

These should be added before calling the frontend production-ready:

- Source approval queue
- Memory update approval queue
- Do-not-say rules page or Brain tab
- Quality gate detail page
- Model runs drilldown
- Failed jobs / dead-letter detail
- Health endpoints status view
- Backup restore test status
- Prompt/agent registry
- Provider adapter registry
- Budget cap editor
- Citation drawer for serious outputs
- Content packet detail view
- Media clip review + final MP4 approval flow
- Client data isolation indicators
- Worker pause/resume confirmation
- High-cost confirmation modal

## n8n vs OS vs Worker Ownership

Use this rule:

The OS thinks, stores, reviews, approves, and audits.

Workers perform long-running AI, ingestion, embedding, research, rendering, rollup, and retry jobs.

n8n moves approved outputs into outside systems and collects scheduled external inputs.

### n8n Should Own

- scheduled YouTube transcript pulls
- RSS/newsletter monitoring
- approved source capture workflows
- approved content handoff to scheduler
- approved media distribution
- WhatsApp alerts
- CRM sync
- client intake forms
- external app glue
- recurring "wake up and fetch" jobs

### WOBBLE OS Should Own

- UI
- auth/session
- approvals
- WOBBLE Brain
- memory rules
- source trust
- decision logic
- content packet schema
- source citations
- model routing
- cost tracking
- audit log
- settings
- kill switch state

### Workers Should Own

- OpenRouter calls
- search API research runs
- embeddings
- source parsing
- weekly/monthly rollups
- content generation jobs
- quality review jobs
- fal/Seedance media jobs
- HyperFrames/FFmpeg renders
- webhook retries
- backups
- health heartbeats

## Implementation Advice For Claude

Claude should not copy the prototype's custom `x-dc`, `sc-if`, and inline style structure directly.

Claude should recreate the output in the Next.js app using:

- React components
- TypeScript types
- module config objects
- shared UI primitives
- Tailwind or project CSS tokens
- lucide-react icons
- real routes or internal tab state

Recommended component breakdown:

- `OsShell`
- `Sidebar`
- `Topbar`
- `PageHeader`
- `GlassPanel`
- `MetricCard`
- `FeedList`
- `LibraryGrid`
- `BoardView`
- `OpsTable`
- `ApprovalCard`
- `SettingsSection`
- `CostChart`
- `CaptureModal`
- `FounderSwitchModal`
- `Toast`

Recommended data breakdown:

- `src/lib/os/modules.ts`
- `src/lib/os/mock-data.ts`
- `src/components/os/*`
- `src/app/page.tsx`

The first production pass can use mocked data, but every mock field should match the eventual database shape.

## Claude Build Prompt

Use this prompt with Claude when continuing the frontend:

```text
You are implementing the WOBBLE OS frontend inside C:\Wobble OS.

Claude Design export instruction:
Import the attached dashboard-interface-design-brief.zip, read the README inside, and implement: WOBBLE OS.dc.html.

If the zip is already extracted, use:
- C:\Wobble OS\dashboard-interface-design-brief\README.md
- C:\Wobble OS\dashboard-interface-design-brief\project\WOBBLE OS.dc.html
- C:\Wobble OS\dashboard-interface-design-brief\project\WOBBLE OS-print-qbwnpk.dc.html

Read these files first:
- C:\Wobble OS\docs\WOBBLE_OS_V2_PRD.md
- C:\Wobble OS\docs\IMPLEMENTATION_PLAN.md
- C:\Wobble OS\docs\CLAUDE_DESIGN_AUDIT_AND_BUILD_PROMPT.md
- C:\Wobble OS\dashboard-interface-design-brief\README.md
- C:\Wobble OS\dashboard-interface-design-brief\project\WOBBLE OS.dc.html

Recreate the Claude Design prototype in the existing Next.js app. Do not copy the prototype's custom x-dc/sc-if structure. Build production React/TypeScript components and reusable UI primitives.

Target visual direction:
- premium internal OS, not landing page
- WOBBLE black/electric-lime/blue/orange brand
- Apple liquid-glass style: translucent, blurred, layered, sharp, clean
- compact professional dashboard density
- no decorative card nesting
- no generic AI agency look

Required nav groups:
- Workspace: Command Center, Ask WOBBLE, WOBBLE Brain
- Pipeline: Research Radar, Source Library, Learning Engine, Content Command, Media Studio, Presentation Maker
- Strategy: Decision Room, Offer Lab, Client AIOS Lab
- Operations: Automations, Approvals, Workers, n8n Handoff
- System: Memory, Costs, Audit Log, Backup & Restore, Settings

Implement all pages visually with realistic mock data. Use shared page archetypes:
- feed
- library grid
- kanban board
- progress tracks
- operations table
- approvals list
- settings sections
- costs dashboard

Add the missing production UI surfaces:
- source approval queue
- memory update approval queue
- quality gate detail
- model runs drilldown
- dead-letter detail
- health status
- budget caps
- kill switches
- content packet detail
- media clip approval/final MP4 approval

Keep all current backend/infra docs intact. Do not remove Drizzle, worker, health, test, docs, or storage files. After implementation run:
- npm run typecheck
- npm run test
- npm run build

Report exactly what changed and what remains mocked.
```

## Final Product Guidance

Do not shrink the product because the nav looks big. The nav is the OS map.

The real way to make it usable is:

- make Command Center the daily command surface
- make Approvals the main human action surface
- make Ask WOBBLE the natural language surface
- hide complex settings behind System
- use badges only for work that needs attention
- make every module explain itself through records and actions, not paragraphs

This design is a strong V2 frontend direction. The next build should turn it from a polished mock into a production shell wired to the schema, workers, n8n handoffs, and approval rules already planned for WOBBLE OS.
