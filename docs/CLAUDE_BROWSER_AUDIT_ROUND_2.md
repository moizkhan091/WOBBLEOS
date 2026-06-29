# WOBBLE OS Browser Audit Round 2

Date: 2026-06-29

Audited live browser URL:
`https://3ee90146-94c1-4084-abb1-2d74c720eb25.claudeusercontent.com/.../WOBBLE%20OS-print-qbwnpk.dc.html`

This audit is based on live browser interaction, not only source reading.

## What Was Tested

- Reloaded the prototype to reset state.
- Clicked every left sidebar page.
- Captured each page's visible text, buttons, scroll behavior, and content structure.
- Tested Command Center navigation buttons.
- Tested Ask WOBBLE sending a message.
- Tested topbar Capture modal.
- Tested Add Memory flow.
- Tested Source Library Add Source modal.
- Tested founder identity switch modal with bad PIN and correct PIN.
- Tested approvals actions.
- Tested Automations kill switches.
- Tested n8n Handoff dead letters action.
- Tested primary page action buttons for visible behavior.

## Overall Verdict

The prototype is visually strong and product-directionally right.

It feels like a premium internal operating system for WOBBLE, not a normal SaaS dashboard. The left nav is large, but the product shape makes sense because the actual page patterns repeat.

However, many controls are currently visual-only. That is fine for a Claude Design prototype, but not fine for production. Claude's next pass should convert important buttons into real flows, drawers, modals, or route changes.

## Strongest Parts

### 1. Command Center Is The Right Home

The Command Center correctly shows:

- Ask WOBBLE entry
- quick prompts
- AI employees metric
- tasks completed
- approvals pending
- efficiency
- workers online
- golden workflow
- approval preview
- live workers
- spend chart

This should stay as the daily operating surface.

### 2. Ask WOBBLE Works As A Command Surface

Tested:

- Command Center Run button opens Ask WOBBLE.
- Quick prompt opens Ask WOBBLE.
- Topbar Ask/jump opens Ask WOBBLE.
- Sending a message appends a user message and WOBBLE response.

Production improvement:

Ask WOBBLE needs citations, memory filters, cost estimate, and a confirmation step before expensive jobs.

### 3. Approval Page Is The Most Important Production Surface

The approvals page has strong structure:

- output title
- confidence
- summary
- module
- agent
- age
- approve/reject/edit actions
- visible acting founder initials

Tested:

- Approve as founder removes the item.
- Toast says approved by the current founder.
- Approval count decreases.
- Founder switching changes approval attribution initials.

Production improvement:

Approvals need detail drawers, source citations, risk level, full action set, confirmation for high-risk/high-cost actions, and explicit approved_at/rejected_at records.

### 4. Founder Switch Is A Good Direction

Tested:

- Switch founder modal opens.
- Shows four founders.
- Bad PIN is rejected.
- Correct PIN switches session founder.

Production improvement:

Do not store real PINs in frontend. Use hashed server-side PIN/password verification or keep this as UI-only attribution behind shared auth.

### 5. Capture/Add Modal Is Useful

Tested:

- Topbar Capture opens Add to Memory.
- Add Memory submits and appears in Memory.
- Add Source opens Add to Source Library.
- Add Knowledge opens module-specific capture.
- New Presentation opens module-specific capture.

Production improvement:

Capture should include source type, trust level, module, approval state, and citation/source metadata.

## Major Issues Found

### 1. Too Many Important Buttons Do Nothing

These buttons showed no visible effect in the browser:

- WOBBLE Brain: Re-index
- Research Radar: Filter
- Research Radar: New
- Source Library: Filter
- Learning Engine: Sources
- Content Command: New
- Media Studio: Render queue
- Media Studio: New
- Presentation Maker: Templates
- Decision Room: New
- Offer Lab: New
- Client AIOS Lab: New
- Costs: Export
- Audit Log: Export
- Backup & Restore: Snapshot now
- Settings: Docs
- n8n Handoff: Dead letters
- Approvals: Review oldest
- Approvals: Edit

This is acceptable in a design prototype, but production cannot keep them inert.

### 2. Kill Switches Are Not Clear Enough

Tested:

- Automations kill switches toggle visually.
- n8n Handoff kill switches toggle visually.

Issue:

They are unlabeled buttons in the DOM and the page does not show explicit ON/OFF text. The only state is knob position/color.

Production fix:

Each kill switch needs:

- accessible label
- visible state text
- confirmation for dangerous toggles
- audit log event
- linked affected module
- explanation of what will stop

### 3. n8n Dead Letters Button Does Nothing

The n8n page has a good row showing `crm.sync` with `1 in dead-letter`, but clicking `Dead letters` does not open any detail view.

Production fix:

Dead letters must open a page/drawer with:

- failed job
- endpoint
- error
- payload metadata
- idempotency key
- retry count
- last attempted_at
- manual retry button
- linked approval/content/source/client record

### 4. Approvals Need More Than Approve/Reject/Edit

The current page is visually good but too shallow for V2.

Add:

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

Each approval should show:

- source_ids_used
- memory_chunks_used
- model used
- estimated cost
- risk level
- claim risk
- proof required
- approved_by
- approved_at

### 5. Content Command Is Missing The Actual Content Packet Detail

Current view:

- board columns only
- Ideas, Drafting, Self-review, Approval, Handed off

Missing:

- platform
- format
- hook
- main copy
- caption
- CTA
- design direction
- citations
- self-review score
- quality breakdown
- revision notes
- n8n handoff status

### 6. Source Library Has No Source Approval Flow

Current view:

- source cards
- Add Source modal

Missing:

- discovered sources pending approval
- trust level
- allowed/blocked status
- source owner
- source freshness
- source conflict with WOBBLE Brain

This matters because the OS must not trust random new sources automatically.

### 7. WOBBLE Brain Needs More Structure

Current view:

- stats
- a few feed entries
- Add Knowledge

Missing:

- Core Brain
- Working Memory
- Episodic Memory
- Do-not-say rules
- source trust hierarchy
- memory update proposals
- stale/conflict queue
- time-weighted scoring preview

### 8. Media Studio Is Too Shallow For The Planned System

Current view:

- video/card/audio cards
- render queue button does nothing

Missing:

- provider selector
- fal/Seedance job creation
- image-to-video
- reference-to-video
- clip storyboard
- per-clip approval
- stitching queue
- final MP4 approval
- budget approval before expensive runs

### 9. Costs Needs Model Runs Drilldown

Current view:

- monthly spend total
- service breakdown

Missing:

- provider
- model
- module
- tokens
- latency
- status
- error
- linked output
- daily/weekly caps
- pending expensive jobs

### 10. Backup & Restore Needs Real Restore Confidence

Current view:

- snapshots
- restore labels
- retention policy

Missing:

- last successful backup
- last restore test
- restore to fresh VPS status
- backup scope
- excluded temp files
- manual restore confirmation

## Page-By-Page Browser Findings

### Command Center

Works well as the OS overview. It is the best page in the design.

Tested:

- Run opens Ask WOBBLE.
- Quick prompts open Ask WOBBLE.
- Open queue opens Approvals.
- Page scrolls and contains full workflow plus spend.

Fix:

Make every KPI clickable.

### Ask WOBBLE

Works as a prototype chat.

Tested:

- message send appends a generic WOBBLE reply.

Fix:

Add citations, assumptions, cost preview, and action confirmation.

### WOBBLE Brain

Good direction, too shallow.

Tested:

- Add knowledge opens modal.
- Re-index does nothing.

Fix:

Add memory tier tabs and memory approval queue.

### Research Radar

Good signal feed.

Tested:

- Filter does nothing.
- New does nothing.

Fix:

Add source trust, research run detail, and "send to Learning/Decision/Content" actions.

### Source Library

Good asset library.

Tested:

- Add source opens modal.
- Filter does nothing.

Fix:

Add source approval, trust levels, upload validation, and source detail drawer.

### Learning Engine

Good progress tracker.

Tested:

- Sources button does nothing.

Fix:

Add rollup detail, source-to-memory trace, and conflict queue.

### Content Command

Good kanban overview.

Tested:

- New does nothing.

Fix:

Add content packet detail and quality gate.

### Media Studio

Good media overview.

Tested:

- Render queue does nothing.
- New does nothing.

Fix:

Add media generation and clip review flows.

### Presentation Maker

Good module to keep.

Tested:

- New presentation opens modal.
- Templates does nothing.

Fix:

Add template browser and deck detail.

### Decision Room

Good strategic concept.

Tested:

- New does nothing.

Fix:

Add decision detail with options, evidence, recommendation, opposing view, and final commit.

### Offer Lab

Good as experiment board.

Tested:

- New does nothing.

Fix:

Add offer detail with hypothesis, experiment metrics, outbound/content links, and archived-state behavior.

### Client AIOS Lab

Good module, but too light.

Tested:

- New does nothing.

Fix:

Add client detail pages, client memory isolation, workflow map, and deliverable approval.

### Automations

Good operations table.

Tested:

- Kill switches toggle visually.
- New does nothing.

Fix:

Add explicit ON/OFF state, logs, next run, manual run, pause, retry, and audit events.

### Approvals

Strong surface, but needs production detail.

Tested:

- Approve removes item and logs toast.
- Review oldest does nothing.
- Edit does nothing.

Fix:

Add approval detail drawer and full action set.

### Workers

Good operational view.

Tested:

- Scale does nothing.

Fix:

Add worker detail, logs, heartbeat, queue depth, and pause/resume.

### n8n Handoff

Good concept.

Tested:

- Dead letters does nothing.
- Kill switches toggle visually.

Fix:

Add dead-letter detail and retry flow.

### Memory

Good memory browser start.

Tested:

- Add memory works.
- Search does nothing.

Fix:

Add filters, tiering, trust, entity links, and memory update approvals.

### Costs

Good summary.

Tested:

- Export does nothing.

Fix:

Add model_runs drilldown and caps.

### Audit Log

Good feed.

Tested:

- Export does nothing.

Fix:

Add filters and event detail.

### Backup & Restore

Good direction.

Tested:

- Snapshot now does nothing.

Fix:

Add backup status, restore test, and confirmation.

### Settings

Good structure.

Tested:

- Docs does nothing.

Fix:

Add settings forms, budget caps, provider config references, source trust defaults, and health checks.

## Priority Fixes For Claude's Next Design Pass

1. Add detail drawers for records.
2. Make inert buttons open meaningful modals/drawers.
3. Add Source Approval Queue.
4. Add Memory Update Approval Queue.
5. Add Content Packet Detail.
6. Add Quality Gate view.
7. Add Media Clip Review.
8. Add n8n Dead Letter Detail.
9. Add Model Runs / Cost Drilldown.
10. Add Health / Worker / Storage / n8n status cards.
11. Add explicit ON/OFF labels and confirmations to kill switches.
12. Add high-cost confirmation modal.

## Final Opinion

The visual direction is right.

The structure is right.

The product is not too big if built with reusable page patterns.

But the prototype currently acts like a beautiful shell. It needs deeper second-level views before it feels like a usable internal OS. The next Claude pass should focus less on adding more top-level modules and more on making each existing module clickable, inspectable, and decision-ready.
