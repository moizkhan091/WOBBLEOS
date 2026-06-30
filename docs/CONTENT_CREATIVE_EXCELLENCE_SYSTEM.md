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

---

# Founder Creative Vision - Expanded (2026-06-30, Claude)

Goal restated: WOBBLE content is the BEST the world has seen - writing AND visuals. Generated images, carousels, and statics must look like a million-dollar designer made them. The OS is one stop to run the whole agency (content, blog, presentations, invoices, etc.), and it improves itself over time.

## The reference rule (NON-NEGOTIABLE): one reference per asset, never a hybrid

When many design references exist, the system must NOT merge them into one ugly hybrid. For EACH asset it picks exactly ONE reference:

- Static image -> exactly one approved `static` reference, chosen PER asset and diversified across a batch (static #1 may pick ref 4, static #2 ref 2).
- Carousel -> exactly one approved `carousel_set` reference (a multi-slide set), matched to the needed slide count. Never a blend of carousel refs.
- Video -> exactly one approved `video` reference.

This is already enforced in code: `src/lib/domain/reference-selection.ts` (`selectReferenceForAsset`, `selectReferencesForBatch`) - pure, deterministic, tested. Chunk 22 MUST call this to choose the single reference per asset before each image job; it must never pass all references into one generation call.

## Creative Reference Library (Chunk 21) - data model

A `creative_references` store. Each reference has:

- id, kind (`static` | `carousel_set` | `video`)
- styleTags[] (e.g. bold, dark, editorial, minimal), useCases[] (e.g. hook-card, quote, data-viz)
- platform (optional), format
- brandFit (0-10), slideCount (for carousel sets)
- approvalStatus (`pending`/`approved`/`rejected`) - only approved refs are usable
- negative (boolean) - a style to AVOID; its tags become "avoid" guidance, never copied
- pinned (boolean) - founder can force a reference for a use case
- source, addedBy, imageRef/storage path, createdAt
- learning fields later: timesUsed, winRate (from performance feedback)

References are added two ways: (1) manual upload/approve by the founder; (2) the Design Hunter proposes them and the founder approves.

## Design Hunter (Chunk 38 + 21)

An AI that hunts for great design references (by platform/style/use-case), proposes them to an approval queue with metadata + why-it-fits. On founder approval, the reference enters the library. Never auto-adds to production references without approval (same approval discipline as the rest of the OS). It also learns what WOBBLE approves to hunt better over time.

## Image/Video provider (Chunks 08/21/22)

- Image generation uses a provider adapter (swappable), defaulting to a strong current model (OpenAI `gpt-image-2`-class). NOT hardcoded; chosen via Settings model roles like text is. Every image/video call logs `model_runs`/cost and expensive jobs require budget approval (reuse Chunk 05 guardBudget).
- Brand kit layering: the chosen ONE reference sets the visual style; WOBBLE brand kit (colors, fonts, logo, safe-zones) is layered as hard constraints on top, so output is on-brand AND in the reference's style.

## Visual Excellence Gate (Chunk 22) - the image equivalent of Chunk 17

After an asset is generated it passes a visual gate before approval:

- reference adherence (does it follow the chosen ONE reference's style?), brand-kit compliance (colors/fonts/logo/safe-zones), legibility (text contrast, not cut off), composition/balance, platform spec (aspect ratio, slide count for carousels), and "no AI tells" (garbled text, extra fingers, watermark).
- On fail -> targeted design rewrite instructions + regenerate (bounded retries), never silently ships a weak asset. Mirrors Chunk 17's gate-then-rewrite loop.
- Stores a design rationale per asset (which reference, why, what was avoided) for the learning loop (Chunk 36/38/13).

## Improvements added beyond the brief

- Per-asset fit scoring (style/use-case/brand/platform) so the RIGHT reference is chosen for THIS post, not a random one.
- Batch diversity so a set of statics spreads across references instead of repeating.
- Negative references (styles to avoid) feed "avoid" guidance into the prompt.
- A/B visual variants: optionally generate 2 variants from the same single reference for founder choice (still one reference each, never blended).
- Carousel slide-count matching: pick the smallest approved set that covers the needed slides.
- Design rationale stored per asset -> the learning loop can later prefer references that perform.

## Chunk mapping (what to build where)

- Chunk 17 (DONE): writing excellence gate. (objective)
- Chunk 21: Creative Reference Library backend (table, CRUD, approval queue, trust/approval, brand kit storage).
- Chunk 22: Reference-conditioned media worker. MUST use `reference-selection.ts` (one ref per asset) + brand-kit layering + Visual Excellence Gate + cost/budget + approval before final asset.
- Chunk 38: Design Hunter + social/performance feedback into reference winRate.
- Chunk 36/13: learning loop proposes reference/library updates (approval-gated).
