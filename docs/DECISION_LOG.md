# WOBBLE OS - Decision & Context Log

Shared context memory for ALL AI builders (Claude, Codex, Gemini, OpenAI, Antigravity) and the founders.

This is DIFFERENT from `docs/AI_HANDOFF_LOG.md` (which logs code changes / what-was-built). This log captures the WHY: product decisions, architecture decisions, feature ideas, REJECTED ideas, known risks, and important context from founder conversations - so no builder works blind. Do not duplicate; code-work goes in the handoff log, decisions/context go here.

## How to use (MANDATORY for every builder)

After any meaningful conversation or decision, append an entry with this shape:

```
### [DATE] - [who] - [short title]
- Decision: what was decided
- Context / why: the reasoning + founder intent
- Alternatives rejected: what we chose NOT to do and why
- Affects: chunks / modules / files
- Do NOT change: anything that must stay stable
- Risks / open questions:
```

Log founder conversations too (not just code). If a founder states intent in chat, capture it here so other AIs see it.

---

## Seeded decisions (from founder conversations through 2026-07-01)

### 2026-07-01 - Founder(Moiz)+Claude - Production-grade from day one, no generic stubs
- Decision: WOBBLE OS is built as a final production-grade internal OS from the start - not MVP-then-improve. No generic placeholders, no weak temporary flows. See `docs/ENGINEERING_STANDARDS.md` (binding Definition of Done).
- Context: a dashboard Approve button was wired to a GENERIC endpoint that flipped the approval row but did not complete the real entity action (source not actually approved, memory not inserted, etc.). Looked done, wasn't. Founder called this a failure and wants it impossible to repeat.
- Do NOT change: the rule that every action must complete the real effect and be verified by the effect (not a 200 / disappeared row). Prefer entity-complete endpoints over generic transitions.
- Risks: builders marking chunks done on parse/compile alone.

### 2026-07-01 - Founder+Claude - Knowledge = Karpathy "compile, don't just retrieve"
- Decision: approved sources are COMPILED by an LLM into synthesized, interlinked, deduped knowledge notes (memory = synthesis, not just retrieval), stored with provenance + embeddings, hybrid-retrieved (synthesis + raw RAG) via ONE shared contract with auto-pickup. Upgrades Chunk 13 (Learning Engine) to a Knowledge Compiler. Full spec: `docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md`.
- Alternatives rejected: pure RAG ("glorified search"); manual code-pointing at data.
- Affects: Chunks 13, 43, 10, 50.

### 2026-07-01 - Founder+Claude - Content = multi-agent creative team (agency-level)
- Decision: content is produced by a multi-agent workflow (Strategy, Research, Competitor, Brand-voice, Founder-taste, Ideation, Copywriting, Visual-direction, Image-prompt-engineering, QC, Final-scoring, Learning/audit agents), NOT one model. Copywriter does NOT make images. Output target: million-dollar-agency quality, replacing a design agency + strategist + blog writer. Spec: `docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md`.
- Affects: Chunk 15 evolves to an agent graph; visuals 21/22; references 21/51.

### 2026-07-01 - Founder+Claude - Image prompt agent must be elite + model-aware
- Decision: the image-prompt-engineering agent is a first-class agent that understands the target model's full capabilities (primary target: "Image Gen 2") and sends large, structured, production-grade prompts (brand context, campaign goal, visual hierarchy, lighting, composition, product accuracy, design theory, typography, realism, platform format, reference style, negative constraints, intended outcome). Bad output usually = bad prompting.
- Open question: confirm the EXACT image model + its real documented capabilities before hardcoding a capability profile (no assumptions - production rule). Store the model capability profile as config, not code.

### 2026-07-01 - Founder+Claude - Dual taste learning (brand + per-founder), no conflict
- Decision: the OS learns TWO taste layers - the overall WOBBLE brand taste AND individual founder taste profiles (Moiz, Ali, Ibrahim, Haad tracked separately). Brand consistency is the HARD constraint; founder taste tunes preferences WITHIN brand bounds. Design so they never conflict. Spec: `docs/KNOWLEDGE_AND_CREATIVE_ENGINE.md` (Taste section).
- Do NOT change: real founders are Moiz, Ali, Ibrahim, Haad (dashboard founder list corrected 2026-07-01 - was placeholder names).

### 2026-07-01 - Founder+Claude - Design Reference Hunter (Chunk 51) + one-ref-per-asset
- Decision: a Design Reference Hunter scouts new designs (Pinterest/Dribbble/creators/competitors), vision-describes them, and files them into the static/carousel/video reference banks on approval. Generation uses exactly ONE reference per asset (never blended); winRate demotes weak refs. Tracked as Chunk 51.

### 2026-07-01 - Founder+Claude - Two-log system for AI builders
- Decision: `AI_HANDOFF_LOG.md` = code-work log; `DECISION_LOG.md` (this file) = decisions/context/rejected-ideas/risks. Both mandatory. All builders read both before working and append after.
- Context: founder does not want Claude/Codex/Gemini/OpenAI working blind or duplicating systems.

### 2026-07-01 - Founder+Claude - No duplication rule
- Decision: never duplicate fields, schemas, tables, API routes, agent logic, or workflows. Extend/update what exists. Parallel versions only with a strong architectural reason logged here.

### 2026-07-01 - Founder(Moiz)+Claude - Real company data + agent prompting is a dedicated ONBOARDING phase (do not forget)
- Decision: no real WOBBLE data has been loaded yet (competitors, our own accounts/analytics, brand assets, offers, clients) and the built + future AI agents have not been prompted/configured for OUR company. This is a DEDICATED onboarding/data-seeding + agent-configuration phase, done once the system + connectors exist - NOT skipped, NOT hardcoded.
- What it covers: seed approved sources/knowledge (Karpathy compiler runs on them), connect real data connectors (social/competitor/website/SEO/CRM), configure the ~1000 content-creation agents and the ~100 self-improvement agents to run on OUR real approved data, and set each agent's skill/prompt in the registry (never hardcoded).
- Sequencing: happens AFTER the engines are built (knowledge compiler 13/43, creative graph 15/21/22, connectors 35/37-39, taste 45/47) and BEFORE go-live. The self-healing/1000-agent behavior only becomes real once real data + prompts are in.
- Do NOT: hardcode competitor/company data or agent prompts in code. All of it is data (registries/settings/Brain), approval-gated.
- FLAG: add an explicit "Onboarding & Data Seeding" checklist chunk near VPS launch so this is a tracked step, not an afterthought.

### 2026-07-01 - Founder(Moiz)+Claude - ARCHITECTURE ALIGNMENT: current build is a real foundation, NOT the hive-mind yet
- Decision: full honest audit done in `docs/ARCHITECTURE_ALIGNMENT_REVIEW.md`. Verdict: what exists is real+tested (~25-30% of vision), NOT fake UI, but the SCHEMA for the hive-mind does not exist yet: sources is a flat stub (not a Source Registry), memory is one space (no routed banks), there is NO agent registry/agent_runs, no research review inbox, content is a single LLM call (not a multi-agent creative team), no taste/learning store, no per-type source intake, no visuals.
- Correction (binding): build SCHEMA + BACKEND FIRST, then UI - never a dashboard module before its schema exists (that is the "fake UI" trap). Order: Phase A (Agent Registry -> Source Registry -> Memory Banks+Router), Phase B (Intelligence Inbox + taste/feedback learning), Phase C (multi-agent creative graph + visuals + Design Reference Hunter), Phase D (cost routing, connections 35, cadence 19, Dreaming 36, onboarding/data-seeding, VPS/auth).
- Start next: Phase A1 Agent Registry (`agents` + `agent_runs`) - without agent visibility the whole hive-mind stays invisible; it is the backbone.
- Do NOT: build more dashboard modules on the current thin schema; treat sources/content as done; create hidden agents with no run logs.

### 2026-07-01 - Founder(Moiz)+Claude - Canonical vision brief saved; existing chunks carry detailed upgrade specs
- Decision: `docs/FOUNDER_VISION_BRIEF.md` is now the CANONICAL vision (the full founder brief: hive-mind, every module = a TEAM of agents, source registry + per-type intake, memory-bank routing, agent registry, research inbox, unified Content Command, agency-level quality, cost tiering, n8n, anti-hallucination grounding, dashboard visibility, approval/rejection learning, dual taste, shared logs). Mandatory reading for all builders (added to CLAUDE.md).
- The 6 NEW chunks are 51-56. The rest of the vision = UPGRADES to existing chunks 13/15/21/22/43/47, now with DETAILED specs (inputs/agent-team/data-flow/banks/acceptance) in FOUNDER_VISION_BRIEF.md so Codex builds the upgraded version, not the basic one. Only Chunk 15 is built (V1) - it must evolve into the multi-agent creative graph AFTER the Agent Registry (52) + Source Registry (53) + Memory Banks (54) land.
- Do NOT: build the basic version of 13/21/22/43/47; treat Chunk 15 V1 as final.

### 2026-07-02 - Codex - Source Registry is typed intake infrastructure, not a flat library
- Decision: Chunk 53 upgrades Source Library into a typed Source Registry foundation. Sources must carry source type, owner, intended use, connected agents, refresh cadence, processing status, extracted data, memory-bank targets, costs, errors, approval state, and intake run history. Every source processing attempt is logged as a `source_intake_runs` row.
- Context / why: founder explicitly warned that WOBBLE OS cannot be a normal SaaS dashboard with a flat source list. YouTube videos, Instagram reels, carousels, websites, Reddit feeds, design references, brand references, internal docs, API sources, and n8n sources each need different intake workflows and must feed different agent teams/memory banks.
- Alternatives rejected: one generic source process for all sources; hidden scrapers with no run log; dashboard-only source cards without schema/API support.
- Affects: Chunk 53, Chunk 54 Memory Banks + Router, Chunk 55 Intelligence Inbox, Chunk 13/43 Knowledge Compiler, Chunk 15/21/22 creative graph, Connections/n8n chunks.
- Do NOT change: new sources still start pending and untrusted; unknown/random sources must not auto-update WOBBLE Brain. Real scrapers/connectors plug into the typed intake contract instead of bypassing it.
- Risks / open questions: real Apify/social/vision/SEO connectors are not implemented in Chunk 53; they must write into this registry and intake-run contract when built.
