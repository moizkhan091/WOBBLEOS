# WOBBLE OS V2 Final Master Build Plan

Date: 2026-06-29
Owner: Codex

This is the clean master plan for WOBBLE OS V2 after reviewing the Claude Design prototype, the WOBBLE planning docs, and the four AI OS transcript files.

Use this as the plain final build direction for Codex, Claude, Gemini, Antigravity, and any future AI builder.

## Core Rule

WOBBLE OS is not just a dashboard.

The dashboard is the control room. The real OS is:

- WOBBLE Brain
- approved source/data memory
- prompt/skill registry
- workers
- provider connections
- n8n handoff rail
- approvals
- audit log
- decision history
- cost controls
- cadence/schedules

## Build Order Principle

The four AI OS transcripts changed the plan in one important way: build the foundation before the fancy automation.

Use both rules:

```text
Context -> Data -> Function
Context -> Connections -> Capabilities -> Cadence
```

Meaning:

- First make WOBBLE Brain strong.
- Then store approved data and sources.
- Then connect APIs/tools.
- Then build content/research/media/decision capabilities.
- Then schedule or automate them.

Do not automate a weak workflow.

## Six-Layer Architecture

### 1. WOBBLE Brain

Permanent company context.

Includes:

- brand voice
- ICP
- offers
- founder thinking
- content strategy
- do-not-say rules
- tone and positioning
- decision style
- current priorities

### 2. Source/Data Layer

Where approved knowledge enters and stays.

Includes:

- YouTube transcripts
- competitor research
- AI market radar
- client notes
- old content
- approvals/rejections
- founder feedback
- performance data later
- decision history

### 3. Prompt/Skill Registry

Editable SOPs for AI work.

Workers must not hardcode content strategy. They load approved skills/prompts from the registry.

Examples:

- LinkedIn post skill
- Instagram carousel skill
- X thread skill
- reel script skill
- YouTube script skill
- research radar skill
- source summarizer skill
- offer teardown skill
- decision brief skill
- client audit skill
- media prompt skill

### 4. Workers

Backend processes that execute jobs.

Workers:

- load the current Brain
- load approved sources
- load the right prompt/skill
- call OpenRouter/search/media APIs
- validate output
- save results
- create approvals
- log model runs, costs, and audit events

Workers are not hardcoded intelligence. They are execution bodies. The LLM plus Brain plus sources plus skills are the intelligence.

### 5. n8n

External automation rail.

n8n:

- fetches transcripts/sources
- calls external systems
- sends WhatsApp/Slack alerts
- posts or schedules approved content
- receives webhooks
- retries failed handoffs

n8n is not the WOBBLE Brain.

### 6. Dashboard

The Liquid Glass WOBBLE OS cockpit.

It shows:

- approvals
- workers
- research
- content
- media
- memory
- decisions
- costs
- n8n handoffs
- health
- backups
- settings

## Final 30 Build Areas

These are V2 scope. Implementation can happen in technical order, but these are not deferred out of V2.

### 1. Project Hygiene

Purpose:

- Keep all AI builders aligned.
- Maintain handoff docs.
- Prevent context loss between Codex, Claude, Gemini, and Antigravity.

Success:

- Every builder reads `PROJECT_START_HERE.md`.
- Every meaningful change updates `AI_HANDOFF_LOG.md`.
- No AI builder has to guess the architecture.

### 2. Database Foundation

Purpose:

- Create the real source of truth.

Success:

- Postgres runs.
- Drizzle migrations run.
- `CREATE EXTENSION IF NOT EXISTS vector;` exists.
- Core tables exist for Brain, sources, memory, approvals, audit, jobs, model runs, content packets, files, settings.

### 3. Seed WOBBLE Brain

Purpose:

- Start with real essential context, not an empty Brain.

Success:

- Seed docs exist for brand, ICP, offers, do-not-say, content strategy, founder preferences, current priorities, source trust levels, model roles, budget caps.

### 4. Shared Auth And Founder Attribution

Purpose:

- Protect the private OS while keeping the shared founder login simple.

Success:

- Shared password is hashed.
- Secure HTTP-only session cookie exists.
- CSRF protection exists for action routes.
- Approval actions require `approved_by`.
- High-risk actions require confirmation.

### 5. Audit Log

Purpose:

- Make the OS trustworthy and traceable.

Success:

- Source, memory, content, media, model, cost, webhook, approval, setting, and worker actions create audit events.

### 6. Approvals System

Purpose:

- Founder control before risky or public actions.

Success:

- Supports approve, reject, request revision, regenerate, edit manually, archive, send to n8n, retry handoff, mark final.
- Stores approved_by, approved_at, action, notes, risk level, confirmation state.

### 7. Model Runs And Cost Tracking

Purpose:

- Track AI/API usage and prevent surprise spending.

Success:

- Every OpenRouter/search/media/video run logs provider, model, role, tokens, cost estimate, latency, status, linked output.
- Dashboard can show today/week/month cost.

### 8. Job Queue Foundation

Purpose:

- Run long AI jobs outside request/response.

Success:

- Postgres-backed queue exists using pg-boss or graphile-worker.
- Jobs have status, retries, failure reason, idempotency key, linked module.

### 9. Worker Runtime Foundation

Purpose:

- Run backend jobs safely.

Success:

- Worker is a separate Node process, not inside Next.js API routes.
- Graceful SIGINT/SIGTERM shutdown exists.
- Worker heartbeat exists.
- Failed jobs are visible.

### 10. Provider And Connections Registry

Purpose:

- Track APIs/tools WOBBLE OS can use.

Success:

- Registry includes OpenRouter, search provider, fal/Seedance, n8n, HyperFrames, storage, future posting/scheduler APIs.
- Each connection has enabled state, module permissions, provider key name, cost category, health state, reference doc path.
- Secrets are never shown in UI.

### 11. Prompt/Skill Registry

Purpose:

- Make AI workflows editable and improvable.

Success:

- Skills/prompts can be versioned, approved, archived, and linked to modules.
- Workers load approved skill versions.
- Founder feedback can propose skill updates.

### 12. Source Library Backend

Purpose:

- Store and approve source material.

Success:

- Upload/import sources.
- Assign trust tiers.
- Approve/reject discovered sources.
- Extract text where possible.
- Link source chunks to parent source.

### 13. Memory And WOBBLE Brain Backend

Purpose:

- Store long-term company memory intelligently.

Success:

- Memory tiers exist: Core Brain, Working Memory, Episodic Memory.
- pgvector search works.
- Time-weighted ranking exists.
- Memory chunks have source/entity links.
- Brain updates require approval.

### 14. Ask WOBBLE

Purpose:

- Let founders ask the OS questions.

Success:

- Answers from Brain + approved sources.
- Shows citations, confidence, assumptions, opposing view/risk, what needs founder judgment.
- Pushes back when the request conflicts with WOBBLE rules.

### 15. Research Radar

Purpose:

- Track AI market, competitors, sources, and opportunities.

Success:

- Manual run works first.
- Research outputs cite sources.
- New source discoveries go to approval queue.
- Weekly rollups can be created later.

### 16. Learning Engine

Purpose:

- Convert activity into proposed knowledge updates.

Success:

- Turns transcripts, research, decisions, and feedback into proposed Brain/memory updates.
- Does not silently change Core Brain.
- Each proposal includes reason, source, confidence, affected area, created date.

### 17. Content Command Backend

Purpose:

- Manage WOBBLE content strategy and packets.

Success:

- Content packet format exists:
  - platform
  - format
  - objective
  - audience
  - angle
  - hook
  - main copy
  - carousel copy
  - caption
  - CTA
  - design direction
  - source inspiration
  - quality scores
  - approval state
  - n8n handoff state

### 18. Content Worker

Purpose:

- Generate content using Brain, sources, research, and skills.

Success:

- Generates WOBBLE company content first.
- Supports LinkedIn, Instagram, X, YouTube scripts, reel scripts, captions, carousels.
- Uses Prompt/Skill Registry.
- Does not hardcode hooks, captions, or posting strategy.

### 19. Founder Content Tracks

Purpose:

- Add founder POV content without creating a separate OS.

Success:

- WOBBLE company content is default.
- Founder tracks exist for Moiz, Haad, Founder 3, Founder 4 when needed.
- Each track can have voice, goals, boundaries, and content mix.

### 20. Quality Gate And Do-Not-Say Rules

Purpose:

- Stop weak AI content before approval.

Success:

- Scores usefulness, originality, brand fit, clarity, aggression control, proof strength, post-worthiness.
- Checks banned phrases, weak words, risky claims, generic AI agency language.
- Bad drafts do not clutter approvals.

### 21. n8n Signed Handoff

Purpose:

- Safely send approved outputs to external automations.

Success:

- HMAC signature verification.
- Timestamp replay protection.
- Idempotency keys.
- Retry limits.
- Failure logs.
- Dead-letter state.
- Manual retry.

### 22. Automations Registry

Purpose:

- Track scheduled and event-triggered work.

Success:

- Shows what runs, when, why, linked worker/n8n flow, last success, next run, failure count, kill switch state.
- Cadence is only added after manual workflow works.

### 23. Workers Health Page

Purpose:

- Make background execution visible.

Success:

- Shows worker heartbeat, current jobs, queue depth, failures, dead letters, last success.
- Health endpoints exist for web, worker, video-worker, storage, n8n.

### 24. Media Studio Backend

Purpose:

- Manage images, clips, prompts, keyframes, and final exports.

Success:

- Provider adapters exist for image/video.
- Seedance/fal path is supported for image-to-video/reference-to-video.
- Media outputs store metadata, prompt, provider, cost, approval status.

### 25. Media / Video Worker

Purpose:

- Generate and assemble video safely.

Success:

- Expensive video jobs require budget approval.
- Short clips are generated per shot.
- HyperFrames/FFmpeg assembles final MP4.
- Rendering is isolated from web/Postgres where possible.
- Final MP4 requires approval.

### 26. Presentation Maker

Purpose:

- Create WOBBLE/client decks and strategic presentations.

Success:

- Uses Brain, sources, client context, and approved templates.
- Produces presentation packets and export files.
- Requires approval for client-facing outputs.

### 27. Decision Room

Purpose:

- Make important decisions with evidence and memory.

Success:

- Logs decision question, context used, options, recommendation, founder choice, reason, outcome later.
- Maturity path: inform -> recommend -> confirm -> autonomy later.
- V2 targets inform, recommend, and confirm.

### 28. Offer Lab

Purpose:

- Build and test WOBBLE offers.

Success:

- Generates offer tests, objections, positioning, competitor comparisons, pricing thoughts where allowed.
- Requires evidence and founder approval before becoming active strategy.

### 29. Client AIOS Lab

Purpose:

- Create client AIOS audits, maps, proposals, and implementation plans.

Success:

- Uses client sources and WOBBLE methodology.
- Outputs cite sources and assumptions.
- Client-facing work requires approval.

### 30. Operations: Costs, Backup, Settings, Command Center

Purpose:

- Make the system production-safe.

Success:

- Daily/weekly budget caps exist.
- Kill switches exist.
- Backups cover database and permanent storage.
- File storage metadata exists.
- Command Center shows real state, not fake metrics.
- AI OS Auditor / Brain Optimizer scores Context, Connections, Capabilities, Cadence, Brain health, cost risk, and backlog.

## Worker vs n8n Ownership

### Workers Own

- reasoning
- content generation
- research synthesis
- source summarization
- memory update proposals
- quality review
- decision briefs
- media prompting
- cost logging
- approval creation

### n8n Owns

- external fetching
- external posting/scheduling handoff
- WhatsApp/Slack alerts
- third-party syncs
- webhook glue
- simple scheduled ingestion
- retries/notifications around outside systems

Short rule:

```text
Workers think and produce.
n8n moves things between systems.
Postgres remembers.
Approvals control risk.
```

## First Backend Chunk

Start with:

```text
Database Foundation + Seed Brain + Audit/Approvals base
```

First successful backend must prove:

- database runs
- pgvector extension exists
- essential Brain docs can be seeded
- source trust levels exist
- audit events can be written
- approval records can be created
- model run/cost tables exist
- provider/connection registry base exists
- prompt/skill registry base exists
- other AI builders can understand the schema

Do not start with a random feature page. Build the spine first.

## Final Reminder

We are going all in for V2.

But all in does not mean chaotic.

The correct path is:

```text
Brain -> Data -> Registry -> Workers -> Approvals -> n8n -> Cadence -> Command Center
```

