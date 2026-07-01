# WOBBLE OS - Knowledge Engine (Karpathy-style) + Multi-Agent Creative Workflow

Date: 2026-07-01
Owner: shared. Companions: `docs/CONTENT_INTELLIGENCE_SYSTEM.md`, `docs/CONTENT_CREATIVE_EXCELLENCE_SYSTEM.md`, `docs/SELF_HEALING_LOOPS_AUDIT.md`, `docs/INTELLIGENCE_LAYER_MAP.md`.

Purpose: lock the founder's vision so builders implement it correctly and nothing is hand-wired. Two systems, tightly coupled:
1. A **Knowledge Engine** that turns any approved raw source into synthesized, reusable knowledge (the Karpathy "LLM Wiki / compiler" pattern).
2. A **multi-agent Creative Workflow** (a real creative-agency process) that reads all our data and produces carousel/static + caption via specialized agents, then learns from what the founder approves.

Everything is data-driven and auto-pickup: when new knowledge or a new reference is added and approved, every downstream agent sees it automatically. The founder never edits code to point at data.

---

## PART A - The Knowledge Engine (Karpathy "compile, don't just retrieve")

### The principle

Karpathy's LLM Knowledge Base pattern: raw documents are SOURCE CODE; an LLM is the COMPILER; the output is a structured, interlinked knowledge base (a "wiki" of atomic notes) - the compiled executable. You do NOT query raw docs. You synthesize them into coherent knowledge first, then query that. Memory = SYNTHESIS, not just retrieval. (Sources listed at end.)

We do a HYBRID: keep raw chunks for fidelity/RAG AND compile synthesized knowledge notes for understanding. Best of both.

### The pipeline (runs when a source is APPROVED, in any module)

A new knowledge source can be a 100-page PDF, a YouTube transcript, a competitor transcript, a competitor post, a screenshot, a research clip, a client call - anything, from any of the ~100 researcher/ingestion agents. On founder approval:

1. **Ingest + chunk** (exists: Chunk 09 sources + source_chunks). Raw text is chunked and embedded (pgvector) - the RAG/fidelity layer. Nothing here is "knowledge" yet; it is raw material.
2. **Compile (the Knowledge Compiler agent)** - NEW capability. For each approved source, an LLM extracts atomic, self-contained knowledge notes: claim/insight/framework/hook-pattern/objection/data-point, each with provenance (sourceId + chunkIds), a type, a topic/area, confidence, and links to related notes. This is the "compile to wiki" step.
3. **Synthesize across sources** - the compiler merges the new notes into the existing knowledge base: dedupes, updates/strengthens existing notes, flags contradictions, links related notes (the interlinked wiki). Knowledge COMPOUNDS instead of piling up.
4. **Approval-gate the knowledge** - synthesized notes that change Core Brain are proposed as `memory_update` / knowledge proposals (existing approval flow). Nothing enters Core Brain silently. Lower-tier knowledge can auto-file at lower trust.
5. **Store in the right place, with structure** - notes land in the Brain / Content Knowledge Base (Chunk 43) with metadata (type, area, topic, trust, provenance, embeddings, links). This is "stored properly in relevant areas" so agents can find it by meaning, type, and topic - not just raw similarity.
6. **Retrieve (hybrid)** - downstream agents call ONE retrieval contract that returns: (a) synthesized knowledge notes for understanding, plus (b) raw source chunks for fidelity/citation. Task-aware: a caption writer asks for hooks/angles/proof on topic X; an art director asks for visual references for format Y.
7. **Auto-pickup** - because retrieval is by query/topic/type (not hardcoded ids), the moment new knowledge or a new reference is approved, the next run of any agent sees it. No code change, no manual pointing. THIS is the founder requirement.

### What is NEW vs already planned

- Chunk 10 (Brain) + 09 (sources) + 50 (intelligence substrate) exist = the storage + raw layer.
- Chunk 13 (Learning Engine) = "raw research -> structured knowledge" = the home for the **Knowledge Compiler agent** (steps 2-3). Build it as the compiler, not just a summarizer.
- Chunk 43 (Content Knowledge Base) = the structured note store (hooks/angles/frameworks/voice/swipe), queryable + auto-picked-up.
- NEW explicit capability: the **Knowledge Compiler** (the "LLM as compiler" agent) and the interlinked-note synthesis + dedup. Add it to Chunk 13's acceptance so it is a compiler, not a summarizer.

### Anti-hardcoding

The compiler prompts + retrieval strategy live in the Prompt/Skill Registry (Chunk 34) and Settings, never in worker code. Knowledge is data; the compiler is a skill.

---

## PART B - The Multi-Agent Creative Workflow (a real agency process)

Answering the founder's direct question: NO, the copywriter AI does not also make the images. Content is produced by a WORKFLOW of specialized agents working together (like a creative agency, or an n8n graph: nodes + LLMs + image-gen + vision), not one model doing everything. A carousel or a static + caption is the output of several agents.

### The agents / roles (one content run)

1. **Strategist / Planner AI** - the creative director. Reads EVERYTHING we track (the ~1000 signals: our social stats, competitor posts + transcripts, research radar, website/SEO data, performance history, current goals, offers, calendar/pillars) PLUS the knowledge base. Decides: what to post, the TOPIC, the ANGLE, the FORMAT (static/carousel/reel/thread), the PLATFORM, and why. Enforces NOVELTY (see Part C): prefer a fresh angle; only repeat a topic if we have rarely covered it; never re-run the same angle/hook we just used.
2. **Researcher / Evidence AI** - pulls the exact approved knowledge notes + source chunks + proof for the chosen topic/angle (hybrid retrieval from Part A). No claim without evidence.
3. **Copywriter AI** - writes the hook, caption, CTA, and carousel slide copy in the track's voice, respecting do-not-say. Inner loop: draft -> self-critique (excellence gate, Chunk 17) -> revise.
4. **Art Director AI** - converts the copy into a DESIGN BRIEF and selects references: exactly ONE reference per asset from the static or carousel bank (never blends), round-robin/performance-weighted across the bank, brand kit layered. Uses the vision style-descriptor of each reference (Chunk 21/22).
5. **Vision AI** - "sees" the chosen reference image(s) and the target, so generation is conditioned on real visuals + the descriptor (not text-only).
6. **Image / Carousel Generation AI(s)** - format-specific models: a static generator and a carousel generator are different; carousel = one matched carousel_set reference; multiple generations/candidates per asset. Reference-conditioned + brand kit (Chunk 22).
7. **Visual QA AI** - "sees" each generated asset, checks it against the brief + the reference + the Visual Excellence Gate; rejects/regenerates weak ones.
8. **Assembler** - packages the winning caption + slides/static into a content packet with all provenance (sources, knowledge notes, references used), ready for the founder approval queue.

This is a graph, not a single call. Each node can be its own AI/model, chosen per role from Settings model_roles (Chunk 08/34), so we use the best/cheapest model per job.

### It stays data-driven

Every agent reads live approved data via the retrieval contract (Part A). New reference, new competitor pattern, new knowledge note -> automatically visible to the Planner/Art Director next run. The founder never points agents at data in code.

---

## PART C - The Approval-Learning Loop (learn my taste + never get repetitive)

When the founder approves content they like, the system must LEARN from it and REMEMBER it:

1. **Log every approval with WHY** - approved content is logged with its topic, angle, hook type, format, platform, the references used, the evidence, and (optionally) a founder note on why they liked it. This is the taste signal.
2. **Taste / preference model** - over time, learn what the founder consistently approves vs rejects (hook styles, angles, tones, formats, visual references) and feed that back into the Strategist + Copywriter + Art Director as preference weights. NEW capability - a "founder taste profile" that is itself approval-gated and editable.
3. **Generation memory + NOVELTY control** - the system remembers everything it has generated (topics, angles, hooks, formats). The Planner enforces novelty across independent dimensions:
   - TOPIC: only repeat a topic if we have rarely done it; otherwise pick fresh.
   - ANGLE: prefer an angle we have NOT used on that topic (the founder prefers different angles).
   - HOOK / FORMAT: diversify; do not reuse the last hooks/formats.
   A novelty scorer blocks near-duplicates before they reach the founder.
4. **Performance feedback (Chunk 47)** - real post stats attribute wins to hook/angle/format/reference/topic and update a winRate per dimension, so the Planner favors what actually performs (not just what we assume). Weak references demoted; strong ones favored.
5. **Closes the self-improvement loop** - taste + novelty + performance feed the next Strategist decision. Ties to the Dreaming Engine (Chunk 36) which audits whether the loop is actually improving.

Independent dimensions matter: TOPIC, ANGLE, HOOK, FORMAT, REFERENCE, PLATFORM are tracked separately so we can say "same topic, brand-new angle" - exactly the founder's ask.

---

## PART D - Improvements + what is best for us (deeper thinking)

Beyond the founder's description, these make it best-in-class and are recommended additions:

1. **Compile-then-retrieve hybrid** (not pure RAG): keep raw chunks for citations AND synthesized notes for understanding. Pure RAG "is glorified search"; synthesis compounds. Do both.
2. **Provenance everywhere**: every knowledge note and every generated claim links to sourceIds/chunkIds - so nothing is unverifiable and the excellence gate can check it.
3. **Per-agent inner critique loop** (draft -> critique -> revise) inside copy and visual steps, not just a final gate - higher quality, fewer rejects.
4. **Novelty as a first-class scorer** with a similarity check against generation history, across topic/angle/hook/format independently.
5. **Founder taste profile** as an explicit, approval-gated, editable store - the system's model of "what Moiz loves" - referenced by every creative agent.
6. **Calendar / pillars layer** (Chunk 45): the Strategist plans against goal-aware pillars + cadence, so novelty is balanced with strategy (not random).
7. **Cost + model routing per node**: each agent picks its model from Settings; heavy vision/gen only where needed; budget guard on the whole workflow.
8. **Everything approval-gated + audited**: knowledge into Brain, new references into banks, new skills, and published content all pass the founder gate; the audit log is the paper trail.
9. **One retrieval contract** shared by all agents so adding a new data source (new competitor, new analytics) instantly benefits every agent - the auto-pickup guarantee.

### Chunk mapping (so this is buildable, not just a vision)

- Knowledge Compiler + synthesis + interlinked notes: Chunk 13 (Learning Engine) - upgrade acceptance to "compiler, not summarizer" + Chunk 43 (Content Knowledge Base).
- Hybrid retrieval contract: extend Chunk 10/50 retrieval + Chunk 43.
- Multi-agent creative workflow: Chunk 15 (content worker) evolves from single-call to a multi-agent graph; visuals = Chunk 21/22; references = Chunk 21 + Chunk 51 (Design Reference Hunter).
- Taste profile + novelty scorer: NEW - add to Chunk 45 (Strategy/Calendar) + Chunk 47 (Attribution) or a dedicated "Founder Taste + Novelty" chunk. FLAGGED so it is not missed.
- Performance/attribution winRate: Chunk 47.
- Auditing that the loop improves: Chunk 36 (Dreaming Engine).

All prompts/models are registry/settings data (Chunk 34/08), never hardcoded.

---

## Sources (Karpathy LLM Knowledge Base / "compile don't retrieve")

- VentureBeat: Karpathy's LLM Knowledge Base architecture that bypasses RAG with an evolving markdown library - https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an
- MindStudio: The Compiler Analogy for AI Memory - https://www.mindstudio.ai/blog/karpathy-llm-knowledge-base-compiler-analogy
- Gamgee: Karpathy's LLM Wiki: Why the Future of AI Memory Isn't RAG - https://gamgee.ai/blogs/karpathy-llm-wiki-memory-pattern/
- Karpathy llm-wiki gist - https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

---

## PART E - Full creative agent roster (the elite team)

Each is a distinct role (own prompt-skill + model tier from Settings). A run is a graph, not a chain; some run in parallel. Do NOT collapse into one mega-prompt.

| Agent | Job | Reads | Produces | Model tier |
|-------|-----|-------|----------|-----------|
| Strategy | decide topic/angle/format/platform against goals + novelty | all signals + knowledge + calendar + taste | a creative brief | strong |
| Research | pull the exact evidence for the brief | hybrid retrieval (knowledge notes + source chunks) | evidence pack w/ provenance | cheap-mid |
| Competitor | what competitors are doing + gaps to exploit | competitor posts/transcripts/stats | positioning angle + do-not-copy notes | mid |
| Brand voice | enforce WOBBLE voice + do-not-say | brand guidelines + track voice | voice constraints | cheap |
| Founder taste | apply the approving founder's + brand taste weights | taste profiles (Part H) | preference weights | cheap |
| Ideation | expand the brief into candidate concepts | brief + evidence + taste | N distinct concepts (diverse angles) | strong |
| Copywriting | hook, caption, CTA, carousel slide copy | chosen concept + evidence + voice | copy (with inner critique loop) | strong |
| Visual direction (Art Director) | design brief + select ONE reference per asset | reference banks + brand kit | design brief + reference id(s) | mid |
| Image prompt engineering | write the production-grade image prompt (Part F) | design brief + reference descriptor + model capability profile | full structured image prompt(s) | strong |
| Image/Carousel generation | render assets (format-specific models, multiple candidates) | prompts + reference image + brand kit | image candidates | image model |
| Quality control | text + visual excellence gates; regenerate weak ones | drafts + gate rules | pass/fail + fixes | mid |
| Final scoring | score the packet; only strong ones reach the founder | full packet | score + rationale | mid |
| Learning / audit | log approvals/rejections/edits; update taste + winRate + novelty memory | founder decisions + post performance | learning proposals (approval-gated) | cheap-mid |

Orchestration: a content job runs Strategy -> (Research + Competitor + Brand + Taste in parallel) -> Ideation -> Copywriting -> Visual direction -> Image prompt -> Generation -> QC -> Final scoring -> Assemble -> founder approval -> Learning. All roles/models are registry+settings data, never hardcoded.

## PART F - Image Prompt Engineering agent (elite; bad output = bad prompting)

- It is a first-class agent, not an afterthought. It owns a **model capability profile** (config, not code) for the active image model (primary target: "Image Gen 2"). BEFORE relying on any capability, CONFIRM the exact model + its real documented capabilities and fill the profile from the provider docs - no assumptions (production rule).
- The prompt it emits is LARGE, STRUCTURED, production-grade, and always includes: brand context; campaign goal + what the asset must achieve; target platform + exact format/aspect; visual hierarchy; composition + framing; lighting; color system + brand kit; typography requirements (if text-heavy); product accuracy (exact product details, no invention); realism level; reference style (from the ONE selected reference + its vision descriptor); design-theory notes; and explicit NEGATIVE constraints (what to avoid). 
- Format-aware: static vs carousel vs ad vs product-scene get different structured templates. Carousel = per-slide prompts sharing a system style, one matched carousel_set reference.
- Closed loop with Vision QA: the generated image is inspected against the prompt + reference; failures are regenerated with a sharpened prompt, not shipped.

## PART G - Cost controls (quality first, but not wasteful)

- Model tiering per agent (table in Part E): cheap models for classification/voice/retrieval, strong models for strategy/ideation/copy/image-prompt, image model only at generation.
- Cache + reuse: research/evidence and competitor analysis are cached and reused across packets in the same batch/topic; embeddings computed once per source.
- Budget guard (Chunk 05/28) wraps the whole workflow; if a run would exceed caps it requires approval instead of silently spending.
- Novelty check runs BEFORE expensive generation (do not render a near-duplicate).
- Batch generation candidates sensibly (e.g. 2-3 image candidates, not 20) with QC picking the winner.
- Never trade quality for cost on the founder-facing output; trade cost on intermediate/classification steps.

## PART H - Dual taste system (brand + per-founder, designed to NOT conflict)

Two layers, one hard constraint:

1. **WOBBLE brand taste** (the hard constraint): brand voice, do-not-say, visual identity, quality bar. This is NON-NEGOTIABLE - every output must satisfy it. Lives in Brand/guidelines + gates (Chunk 17/22).
2. **Per-founder taste profiles** (tuning within brand bounds): a separate profile per founder (Moiz, Ali, Ibrahim, Haad) learned from THEIR approvals/rejections/edits/scores/comments. Captures preferences (hook styles, angles, tone within range, visual references) - NOT brand rules.

Conflict resolution (the design that prevents fights):
- Brand taste is a FILTER (pass/fail); founder taste is a WEIGHT (ranking) applied only among brand-passing options. Founder taste can never override a brand rule or do-not-say.
- The active founder taste = the founder who will approve (or the assignee). If unknown, use a blended "WOBBLE house taste" (average of founder profiles, brand-first).
- Founder taste tunes CHOICES (which angle/hook/reference to prefer), never CONSTRAINTS (voice, claims, do-not-say, quality bar).
- Every taste update (brand or founder) is approval-gated and logged (Learning agent), so taste evolves transparently and can be corrected.

Data model (extend, do not duplicate): one `taste_profiles` concept with a `scope` = "brand" | "founder:<id>" and structured preference signals + provenance (which approvals taught it). Retrieval returns brand constraints + the relevant founder weights together. FLAG: build under Chunk 45 (Strategy) + Chunk 47 (Attribution); do not scatter taste across modules.

## What is IMPLEMENTED now vs SPEC (be honest)

- IMPLEMENTED + committed/verified: the data spine, content loop V1 (single-call worker), Prompt/Skill Registry, dashboard.
- IMPLEMENTED but parse-only/uncommitted: the approval-completion fix + founder add-flows (see `docs/CODEX_HANDOFF_2026-07-01.md`).
- SPEC ONLY (future chunks, this doc is the contract): Knowledge Compiler (13/43), multi-agent creative graph (15 evolution + 21/22/51), image-prompt agent (part of 15/22), dual taste + novelty (45/47), Design Reference Hunter (51). Build these to this spec; do not ship generic versions.
