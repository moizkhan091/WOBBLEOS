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
