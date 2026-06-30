# WOBBLE Content And Creative Excellence System

Date: 2026-06-30

Purpose: make WOBBLE OS produce elite writing and elite visual output, not merely "valid AI content." This document locks the product direction after live Chunk 15 testing proved the backend pipe works but cheap/default content generation can still be mid.

## Core Decision

Do not cram world-class content strategy into Chunk 15.

Chunk 15 is the pipe:

- load context
- call provider
- parse output
- create packets
- run quality gate
- create approvals
- log cost/audit

World-class output requires layers above and around the pipe:

- Content Excellence Gate
- Content Knowledge Base
- Creative Reference Library
- Content Research AI
- Design Research AI
- Social Performance Feedback
- Competitor Pattern Tracking
- Rewrite/regenerate loops
- Founder approval for permanent rule/reference updates

## Writing Excellence Architecture

The content worker should not be a single prompt that tries to do everything.

Target flow:

1. Strategist selects angle, objective, audience, platform, proof, and aggression level.
2. Writer drafts the packet.
3. Editor rewrites for WOBBLE sharpness, specificity, hook strength, and CTA.
4. Proof checker verifies claims against sources/memory.
5. Quality gate scores and explains pass/fail.
6. If below threshold, save failed draft with reasons or send targeted revision instructions back into a regeneration job.
7. Passing packets enter Approvals.

The changing writing intelligence should live in approved Brain/Skill/Source records, not hardcoded code:

- hook rules
- caption rules
- CTA patterns
- carousel structures
- LinkedIn post frameworks
- X/thread frameworks
- reel script structures
- examples of good and bad WOBBLE content
- founder-approved content lessons from videos
- competitor/content pattern findings
- social performance learnings

## Design Reference Architecture

Moiz wants the OS to create static images, carousel designs, and generated media that feel like a million-dollar designer made them.

That requires a Creative Reference Library, not a folder of random inspiration images.

Each reference needs metadata:

- reference id
- file id/path
- platform: Instagram, LinkedIn, X, YouTube, multi
- format: static, carousel, reel cover, story, ad, deck, motion frame
- visual style tags
- use case
- brand fit score
- creator/source
- approval status
- approved by / approved at
- blocked reason if rejected
- notes on what to borrow
- notes on what not to copy

## Reference Selection Rule

Never feed every reference into one generation by default.

For static image generation:

- select one dominant design reference
- optionally select one supporting brand reference
- record why the reference was selected

For carousel generation:

- select one approved carousel reference set
- use it for slide rhythm, hierarchy, pacing, typography logic, and composition pattern
- do not mix five unrelated carousel references into one generic hybrid

For brand identity:

- WOBBLE brand rules always outrank external design references
- external references guide layout/composition/motion language, not brand replacement

## Design Research AI

The OS should eventually have a design hunter/researcher:

1. Finds design references from approved/discovered sources.
2. Classifies them by platform/format/style/use case.
3. Explains why they may be useful.
4. Sends them to founder approval.
5. Only approved references enter production selection.

It must not silently add random design references.

## Image Generation Providers

Use a provider-adapter system, not one permanent provider.

Initial likely providers:

- OpenAI Image API for high-quality image generation/editing where configured.
- fal/Replicate/etc. for other image/video models where needed.
- Seedance/fal for video and reference-to-video workflows.
- HyperFrames/FFmpeg for deterministic assembly, captions, overlays, and final exports.

As of 2026-06-30, OpenAI's Image API docs list `gpt-image-2` as an image generation model, including high-resolution output options. Treat provider/model choice as editable configuration with budget controls, not hardcoded worker logic.

## Feedback Loop

The system gets smarter from:

- approved WOBBLE Brain
- founder-approved content lessons
- content videos/transcripts
- approved expert sources
- competitor content tracking
- WOBBLE social performance stats
- website/blog analytics
- quality review failure patterns
- founder approval/rejection notes

The ingestion rule stays:

```text
new module data -> structured DB row -> chunk/vector/metadata if needed -> approved/trusted status -> Ask WOBBLE retrieval
```

## What Chunk Owns What

Chunk 15:

- content generation pipe
- provider call
- packet creation
- quality gate invocation
- approval creation

Chunk 17:

- Content Excellence Gate
- weak hook detection
- anti-fluff scoring
- CTA strength
- proof strength
- WOBBLE voice fit
- revision instructions

Chunk 21:

- Media Studio data model
- Creative Reference Library
- asset/reference approval flow

Chunk 22:

- media/image/video workers
- provider adapters
- reference-conditioned generation
- one-reference/static and one-reference-set/carousel selection
- multimodal creative QA

Chunk 34:

- editable prompt/skill registry for content/design workers

Chunk 36:

- Dreaming Engine finds repeated quality failures and proposes improvements

Chunk 38:

- Social Intelligence pulls platform stats and feeds content strategy

Chunk 12/13:

- Research Radar and Learning Engine discover external content/design lessons and propose approved updates

## Hard Rules

- Do not approve mid content just because the worker generated it.
- Do not loosen quality thresholds to make demos look successful.
- Do not hardcode hooks/captions/carousel formulas in code.
- Do not blend every design reference into one output.
- Do not add discovered references to production without approval.
- Do not let external design references override WOBBLE brand identity.
- Do not let image/video jobs bypass budget approval.
- Every paid provider run must be cost-logged.
- Every serious output must keep evidence/source references.
