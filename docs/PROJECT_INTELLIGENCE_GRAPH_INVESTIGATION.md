# Project Intelligence Graph — Build-vs-Adopt Investigation (Doctrine 15)

**Workstream D · read-only investigation · authored 2026-07-12**
Repo baseline: `main` (post-`7ed0ba6`), 632 tracked files, ~102 test files, 156 API `route.ts`, 39 migrations (`0038`), `schema.ts` ~1,856 lines, ~70 `src/lib/*` subsystems, 7 vertical departments + a QA operating unit.

This document answers Doctrine 15 from `docs/AIOS_TRANSCRIPT_DELTA_2026_07_12.md` (row 15, status **missing**): should WOBBLE **adopt Graphify**, **integrate selected concepts**, or **build a native** Project Intelligence Graph? It is grounded in (Part 1) verified web research on the actual Graphify project and (Part 2) a read of the actual WOBBLE repo. No code, schema, or existing doc was modified.

**Evidentiary discipline:** every external fact carries a source URL and a retrieval date. Each claim is tagged **[FACT]** (stated in official docs / GitHub API / primary source) or **[INFERENCE]** (my reasoning). Marketing claims are quarantined and never asserted as truth. Where web access failed, the blocker is recorded rather than invented.

---

## Part 1 — Graphify: verified current state

### 1.0 Identity — which "Graphify" is real

The transcript (`docs/source/ai-os-youtubevideos/transcript_1782429250.txt`, presenter "Jack") never names an org, only "this GitHub repo." Web search surfaced **four different projects** using the "graphify"/code-graph name, so identity had to be resolved before any fact could be trusted:

| Candidate | Resolution | Retrieved |
|---|---|---|
| `github.com/safishamsi/graphify` | **[FACT]** GitHub API redirects this path to `full_name: Graphify-Labs/graphify` — the owner was renamed `safishamsi` → `Graphify-Labs`. Same repo. | 2026-07-12 |
| `Graphify-Labs/graphify` | **[FACT]** The authoritative repo (see 1.1). | 2026-07-12 |
| `rhanka/graphify` | **[INFERENCE]** A fork / alternate ("Trae, Factory Droid…" variant description); not authoritative. | 2026-07-12 |
| `colbymchenry/codegraph` | **[FACT]** A **separate competing tool** (different author, different repo), not a Graphify fork (see 1.6). | 2026-07-12 |
| `graphify.net` | **[BLOCKER]** Returned **HTTP 403** to WebFetch; could not verify. The GitHub API lists the official homepage as **`graphify.com`**, *not* `.net`. Treat `graphify.net` as **unverified / possibly third-party** until confirmed. | 2026-07-12 |

**Verdict on identity:** the official project is **`Graphify-Labs/graphify`** (canonical homepage `graphify.com`), MIT-licensed. Source: GitHub REST API `https://api.github.com/repos/safishamsi/graphify` and `.../Graphify-Labs/graphify` (retrieved 2026-07-12). The identical field values returned across two independent API calls (5-digit star/fork counts, ISO timestamps) indicate real API data, not summarizer hallucination.

### 1.1 Repository facts (GitHub REST API, retrieved 2026-07-12)

All **[FACT]**, source `https://api.github.com/repos/Graphify-Labs/graphify`:

| Field | Value |
|---|---|
| `full_name` | `Graphify-Labs/graphify` |
| `license.spdx_id` | **MIT** |
| `stargazers_count` | **82,818** |
| `forks_count` | 8,170 |
| `subscribers_count` (watchers) | 290 |
| `open_issues_count` | 478 |
| `created_at` | **2026-04-03** |
| `pushed_at` | **2026-07-12** (same day as retrieval) |
| `default_branch` | `v8` |
| `archived` / `disabled` / `fork` | false / false / false |
| `homepage` | `https://www.graphify.com` |

**[INFERENCE] Two caveats a founder should hold:** (a) ~82.8k stars accrued in **~3 months** (created 2026-04-03) is extraordinary velocity; stars measure hype, not correctness or production-readiness — do not read them as a quality signal. (b) The default branch being `v8` on a 3-month-old project signals rapid, possibly breaking, iteration — an integration would be chasing a moving target.

### 1.2 What it is and how it works (README, `raw.githubusercontent.com/Graphify-Labs/graphify/v8/README.md`, retrieved 2026-07-12)

- **[FACT] Category:** an AI-coding-assistant **skill** (Claude Code, Codex, Cursor, Gemini CLI, Copilot, "15+ assistants") that turns a folder of code / SQL / docs / PDFs / images / video into a queryable **knowledge graph**. Invoked as `/graphify` inside the assistant, or `graphify` on the CLI.
- **[FACT] Code indexing is local & deterministic:** README states code is parsed with **tree-sitter AST** — "deterministic, no LLM, nothing leaves your machine." **36 tree-sitter grammars** (Python, TS/JS, Go, Rust, Java, C/C++, C#, Ruby, Kotlin, PHP, Swift, SQL, Terraform/HCL, shell, etc.).
- **[FACT] Docs/media indexing is NOT local:** "Docs, PDFs, images and video use your assistant's model, or a configured API key, for a semantic pass." So a **code-only** corpus is offline; a corpus that includes docs/PDFs/images **sends that content to an LLM provider**.
- **[FACT] Graph, not vectors:** a real traversable graph (nodes + edges), community detection via the **Leiden algorithm** with LLM-free labeling. Not an embedding/vector index.
- **[FACT] Edge confidence model:** every edge is tagged **`EXTRACTED`** (explicit in source), **`INFERRED`** (derived by resolution), or **`AMBIGUOUS`**; INFERRED edges carry a confidence score (0–1), EXTRACTED = 1.0. This is the transcript's "facts vs guesses" and "god nodes" (highest-degree load-bearing nodes).

### 1.3 Storage, query, incremental update

- **[FACT] Output:** a `graphify-out/` directory containing `graph.json` (full queryable graph), `graph.html` (interactive force-directed viz), and `GRAPH_REPORT.md` (god nodes + community structure). README says `graphify-out/` is "meant to be committed to git."
- **[FACT] Query surfaces:** CLI (`graphify query|path|explain`), an **MCP server** (tools `query_graph`, `get_node`, `get_neighbors`, `shortest_path`; stdio or HTTP), the HTML viz, and optional export to **Neo4j / FalkorDB**.
- **[FACT] Incremental:** `--update` re-extracts only changed files; `graphify hook install` adds **post-commit + post-checkout** git hooks; parallel graphs are **union-merged** on conflict (a git merge driver for `graph.json`).
- **[FACT] Storage note:** `graph.json` has a configurable size cap (README/summary cite a 512 MiB default). No external DB required for the base file.

### 1.4 Platform, resources, CI, security posture

- **[FACT] Runtime:** Python **3.10+**, installed via `uv tool install`, `pipx install`, or `pip install`.
- **[FACT] Windows:** explicitly supported — `winget install astral-sh.uv`; README warns PowerShell treats a leading `/` as a path separator, so use `graphify .` (no slash). This matters: WOBBLE is developed on **Windows 10** (`C:\Wobble OS`).
- **[FACT] CI:** headless `graphify extract --backend <gemini|claude|openai|ollama|bedrock|azure>`; a **code-only** extract "runs fully offline" with **no API key**; `GRAPHIFY_MAX_WORKERS` / `--max-workers` tune parallelism.
- **[FACT] Telemetry:** README states "**No telemetry, no usage tracking, no analytics.**" Local query logging to `~/.cache/graphify-queries.log` is **on by default** but disabled with `GRAPHIFY_QUERY_LOG_DISABLE=1`.
- **[FACT / SECURITY] Package name is `graphifyy` (double-y) on PyPI**, while the CLI/skill is `graphify`. This mismatch is itself a **supply-chain hazard**: `graphify` (single-y) is an obvious typosquat slot, and the `.net` vs official `.com` homepage split compounds the confusion. Any adoption must pin the exact package + a verified hash.

### 1.5 Benchmarks — what is actually claimed (and the caveat)

- **[FACT] Numbers as stated** (README, pointing to `BENCHMARKS.md`): **LOCOMO** (n=300) recall@10 = **0.497**, QA accuracy = **45.3%**; **LongMemEval-S** (n=50) QA accuracy = **76%**; graph build for code = **0 LLM tokens**.
- **[INFERENCE] Caveat:** LOCOMO and LongMemEval are **long-term-conversational-memory** benchmarks, not repository-navigation or code-comprehension benchmarks. They are relevant to a memory system, only indirectly to "help Claude navigate a repo." The headline benchmarks therefore **do not measure the WOBBLE use case** (dependency blast-radius, orientation, token reduction on a TS monorepo). I could **not** independently reproduce them this session.
- **[FACT — independent review]** Kevin Kinnett, "Graphify Review: I Tried It on My Codebase" (`kevinkinnett.com`, retrieved 2026-07-12): on a **medium-sized TypeScript project** the central `GRAPH_REPORT.md` "**came out blank**"; "brute-force navigation still wins most of the time" (Claude follows imports / greps fast enough that "the graph overhead does not yet pay for itself"); hook overhead "**added latency without corresponding benefits**"; "small-to-medium codebases don't justify the extra layer." Verdict: "**Real idea with an early-tool problem, not a bad idea with a marketing problem.**" This is the single most decision-relevant external data point, because **WOBBLE is exactly that profile: a medium-sized TypeScript project.**

### 1.6 The nearest alternative

- **[FACT]** `colbymchenry/codegraph` (GitHub API, retrieved 2026-07-12): MIT, **59,372 stars**, created 2026-01-18, `pushed_at` 2026-07-10, self-described "Pre-indexed code knowledge graph, auto syncs on code changes … **100% local**." A distinct project, same problem space, marketed as fully local (no docs/media LLM pass). If WOBBLE ever wanted an off-the-shelf tool, CodeGraph's "100% local" posture is a better privacy fit than Graphify's LLM semantic pass — but it inherits the same "external dependency + moving target + generic, not WOBBLE-aware" objections (Part 3).

### 1.7 Part 1 blockers / unknowns (recorded, not invented)

- `graphify.net` → **HTTP 403**; could not verify whether it is official. Official homepage per API is `graphify.com`.
- `BENCHMARKS.md` full tables and the "code-intelligence result" were **not** fetched/reproduced this session — the benchmark numbers above are as-claimed, unverified by me.
- Exact resource footprint on a 632-file repo (build time, `graph.json` size, RAM) is **not measured** — would require the POC in Part 3.
- I did not audit Graphify's dependency tree or run a license/CVE scan (out of scope for a read-only web pass; explicitly required before any install — Part 3).

---

## Part 2 — WOBBLE fit analysis (from the actual repo)

### 2.1 What WOBBLE actually is (relevant shape)

A Next.js 16 / React 19 / TypeScript monorepo with Drizzle + Postgres (pgvector). The intelligence-bearing surfaces are: a **department runtime** (`src/lib/departments/*`: orchestrator, registry, budget, escalation, kpi, consumer, 7 verticals), an **inter-agent handoff** backbone (`src/lib/handoff`, envelope-validated, classification-gated at dispatch), **intelligence** agents (`scout`/`analyst`/`dreamer`/`ingest`), a **memory** system (banks/records/chunks/conflicts, embedded, confidence + provenance + staleness), an **agents registry** (`src/lib/agents`, `agents` table), **prompt-skills** (`prime`/`brainstorm`/`explore` + briefs), a **QA** unit (`src/lib/qa`), and **Ask WOBBLE** with a **tool registry** (`src/lib/ask-tools`).

### 2.2 WOBBLE already has three "graph"-shaped things — and none is a code graph

This is the crux for non-duplication (CLAUDE.md: "Never duplicate schemas/routes/tables/agents — extend what exists"):

1. **`src/lib/system-map`** — a **live runtime snapshot** (`getSystemSnapshot`): every agent, module, pending approval, model-role map, and live handoff-state counts, formatted into the Ask WOBBLE prompt so it "knows everything." **This maps the running domain, not the source tree.**
2. **`src/lib/graph-checkpoint`** — durable per-node outputs so a **multi-agent execution DAG** (content graph, audit graph) resumes after failure; carries a `schemaVersion` staleness-invalidation pattern.
3. **`src/lib/content-graph`, `src/lib/paid-audit-graph`** — **agent-execution DAGs** (pipelines of agent nodes), not code knowledge graphs.

**[FACT]** `grep -riE "graphify|projectGraph|project_graph|knowledge_graph" src --include=*.ts` returns **nothing** — there is no code/repo knowledge graph today. Doctrine 15's "missing" is confirmed.

**[INFERENCE]** A Project Intelligence Graph is therefore a **new, complementary layer** — facts about the *source tree and its history* (files, symbols, routes, migrations, tests, commits) — that sits beside `system-map` (facts about the *running org*). Together they'd let Ask WOBBLE answer "what does this code do / what breaks if I change it" (graph) and "what is the org doing right now" (system-map) from the same prompt.

### 2.3 Where a project graph would actually help WOBBLE (ranked by real payoff)

**[INFERENCE], grounded in the repo's size and the failure modes visible in the war-room docs:**

1. **Blast-radius / dependency impact before an edit — highest value.** With 156 route handlers, 39 migrations, and a 1,856-line `schema.ts`, "what reads/writes this table, what routes call this service, what tests cover it" is exactly the question that today costs a multi-file sweep. A `writes`/`reads`/`tested-by`/`depends-on` graph answers it in one query.
2. **Schema-impact tracing.** "If I change column X on table Y, which domain modules, routes, and migrations touch it?" — directly relevant given repeated migration/schema work.
3. **Orphan / dead-capability detection.** Unused tools in the Ask WOBBLE registry, agents in the `agents` table with no membership/handoff edges, skills never routed to, migrations superseded but referenced — all are **orphan-node queries** on the graph.
4. **Stale-doc detection.** The repo runs on ~40 status docs. A `documented-by` edge from a code/domain node to a doc, plus the doc's last-touched commit vs the code's, flags docs describing since-changed code — a recurring pain (the delta doc exists precisely to reconcile docs vs runtime truth).
5. **Targeted test selection.** `tested-by` edges → "given this diff, which of the ~102 test files are in blast radius" → run those first.
6. **Context-token reduction / orientation.** The transcript's core claim ("answer from summaries, stop re-skimming the repo"). Real, but per the independent review (1.5) this is the **weakest-evidenced** benefit on a medium TS repo where import-following + grep are already fast.

**[INFERENCE] Honest counter-weight:** items 1–5 are structural queries a **native, deterministic** extractor nails without any LLM. Item 6 — the headline marketing benefit — is the one an independent reviewer found "does not yet pay for itself" on a repo of WOBBLE's size. So the value case favors **building the deterministic structural graph** and being skeptical of the "cheaper chat" promise.

### 2.4 Native WOBBLE Project Intelligence Graph — architecture sketch

Design principles pulled from patterns already in the repo: injectable-deps (testable without a DB, like `system-map`/`graph-checkpoint`), `confidence` + `provenance*`/`evidence*` columns (already pervasive in `schema.ts`), `schemaVersion` staleness invalidation (from `graph-checkpoint`), and registration as a **read-only** Ask WOBBLE tool (`ask-tools`, `mutates:false`).

**Node types** (each carries `kind`, stable `key`, `commitHash`, `indexedAt`, `stale`):
`repo · commit · file · symbol (fn/class/const) · route · service · domain-model · table · migration · agent · department · handoff-schema · tool · skill · memory-bank · source · provider · ui-module · test · status-doc`.

**Edge types** (directed, each carries `origin: EXTRACTED|INFERRED`, `confidence`, `evidence`):
`imports · calls · writes · reads · routes-to · consumes · produces · validates · authorizes · depends-on · tested-by · supersedes · documented-by`.

**Fact model** (mirrors Graphify's good idea, but native and reusing WOBBLE conventions):
```
Fact {
  subject: NodeRef, predicate: EdgeType, object: NodeRef,
  origin: "extracted" | "inferred",     // EXTRACTED from AST/import graph vs INFERRED by resolution
  confidence: number,                    // 1.0 for extracted; <1 for inferred (reuse numeric("confidence"))
  evidence: { path, lineStart, lineEnd },// drill-to-source (reuse evidence/provenance columns)
  commitHash: string,                    // the commit this fact was observed at
  indexedAt: timestamp,
  stale: boolean                         // set when the evidence file changed after indexedAt
}
```
- **EXTRACTED** = derived deterministically (TS AST / `import` graph / Drizzle schema parse / Next route-file convention / `*.test.ts` co-location / handoff-envelope schema / `ask-tools` registry / `agents` table). **No LLM** → free, reproducible, trustworthy.
- **INFERRED** = cross-layer links a parser can't prove (e.g., "this route *authorizes* via this middleware," "this doc *documents* this module"), scored <1, always drill-to-evidence, **never** presented as fact.

**Incremental refresh (must show the commit it represents):**
- A post-commit path (git hook or a `scheduler` sweep — WOBBLE already runs scheduler sweeps) diffs changed files, re-extracts only those, marks dependent inferred edges `stale`, and stamps the new `commitHash`. Reuses the exact "changed-files-only + schemaVersion invalidation" shape from `graph-checkpoint`.
- The snapshot always reports **`representsCommit`** so a reader knows the graph's freshness — and a `stale` flag when HEAD has moved past it.

**Surfacing:**
- A read-only `query_project_graph` tool in `src/lib/ask-tools` (neighbors / path / blast-radius / orphans), `mutates:false`, no confirmation — same registry that already gates every Ask WOBBLE capability.
- A `getProjectGraphSnapshot()` sibling to `getSystemSnapshot()`, optionally folded into the Ask WOBBLE prompt for orientation.
- Optional read UI later (an OS module), not required for value.

**Non-negotiable guardrail:** the graph is an **index, never an authority**. Every answer drills to `evidence {path, lines, commit}`; inferred edges are labeled and confidence-scored; a `stale`/`representsCommit` banner is always shown. It **augments** direct verification (read the file, run the test) and **never replaces** it. This is the same "facts vs guesses + cite the source" discipline the memory system and `AI_OS_TRANSCRIPT_LESSONS_FOR_WOBBLE.md` already mandate.

---

## Part 3 — Recommendation

### 3.1 The three options

| Option | What it means | Verdict |
|---|---|---|
| **1. Adopt Graphify** | Install `graphifyy`, commit `graphify-out/`, wire its MCP server. | **Reject for now.** |
| **2. Integrate selected concepts** | Borrow the *ideas* — EXTRACTED/INFERRED confidence tagging, god-nodes, drill-to-evidence, commit-stamped incremental refresh — into a native build. | **Adopt (this is the recommendation).** |
| **3. Build native, from scratch, ignoring Graphify** | Design a graph with no reference to prior art. | Wasteful; Option 2 gets the good ideas for free. |

### 3.2 Recommendation: **Option 2 — integrate concepts into a native, deterministic Project Intelligence Graph. Do NOT adopt Graphify as a dependency now.**

**Reasoning, grounded in Part 1 + Part 2:**
1. **The proven-valuable benefits are the deterministic ones** (blast-radius, schema-impact, orphan/stale detection, test selection — 2.3 items 1–5). These need an AST/import/schema extractor, **not** Graphify. WOBBLE already owns every input (TS source, Drizzle schema, Next routes, the `agents`/`ask-tools`/handoff registries).
2. **The headline "cheaper chat" benefit is the least-evidenced** on a repo of exactly WOBBLE's profile — an independent reviewer found `GRAPH_REPORT.md` blank and "brute-force navigation still wins" on a medium TS project (1.5). Buying a dependency for the weak benefit while the strong benefits are trivially native is a bad trade.
3. **A native graph reuses eight existing patterns** (2.4) and plugs into `system-map` + `ask-tools`, so it is *WOBBLE-aware* (knows agents, departments, handoff schemas, tools, skills, memory banks — node types Graphify has no concept of). Graphify is generic; WOBBLE's highest-value nodes are its own domain objects.
4. **CLAUDE.md forbids scope reduction and duplication, and forbids installing external deps without a code/license/security review.** Native extends `system-map`; adoption would bolt on a parallel, generic, Python-based, rapidly-versioning (`v8` in 3 months) system.

### 3.3 Security / license verdict

- **License [FACT]:** MIT — permissive; *concept reuse* (EXTRACTED/INFERRED, god-nodes, drill-to-evidence) carries **no legal risk**. MIT is also fine for adoption if it ever happened.
- **Privacy [FACT + INFERENCE]:** code-only extraction is local; **but** the moment docs/PDFs/images are included, content is sent to an LLM provider. WOBBLE holds confidential founder + client data under an enforced data-classification gate — routing internal docs through Graphify's semantic pass would be a **classification/egress event** that must not happen silently. A native extractor sends **nothing** anywhere.
- **Supply chain [FACT — flag]:** the `graphifyy` (double-y) package name, the `graphify` single-y typosquat slot, and the `.net`-vs-official-`.com` homepage split are real hazards. **Do not `pip install` anything in this space without pinning the exact verified package + hash and running a dependency/CVE scan** — and that review is a prerequisite the native path avoids entirely.
- **Bottom line:** native build = **no new third-party runtime dependency, no data egress, no version-churn exposure.**

### 3.4 Is a POC justified *this session*? **No.**

This session's mandate was the read-only investigation; that is complete. A POC touches code and must follow the lead's contracts. **[INFERENCE]** it is not justified yet because the recommendation is already decidable from evidence: build native, deterministic-first. A POC *is* justified as **Phase 1 of the plan below**, in a later session, scoped and measured.

### 3.5 Phased plan (native, deterministic-first)

- **Phase 0 — spec (docs only, lead-approved).** Node/edge/fact schema (2.4) as a migration spec; confirm it extends `system-map` and reuses `confidence`/`evidence`/`schemaVersion` conventions; no duplication of `content-graph`/`graph-checkpoint`.
- **Phase 1 — deterministic extractor POC (measured).** EXTRACTED-only: `imports`/`calls` from TS AST, `writes`/`reads` from Drizzle schema usage, `routes-to` from Next route files, `tested-by` from `*.test.ts` co-location. Output an in-repo `graph.json`-equivalent + `representsCommit`. **Success gate below or stop.**
- **Phase 2 — WOBBLE-domain nodes + INFERRED edges.** Add `agent`/`department`/`handoff-schema`/`tool`/`skill`/`memory-bank`/`status-doc` nodes and confidence-scored `authorizes`/`documented-by`/`consumes`/`produces` edges; every inferred edge drills to evidence.
- **Phase 3 — incremental refresh.** Post-commit / scheduler sweep: changed-files-only re-extract, `stale` marking, commit stamping (reuse `graph-checkpoint` shape).
- **Phase 4 — surface.** Read-only `query_project_graph` in `ask-tools`; `getProjectGraphSnapshot()` beside `getSystemSnapshot()`; optional read UI.
- **Every phase ships with:** real trigger, durable state, telemetry, tests, real-DB proof, and (Phase 4) browser proof — per the delta doc's Definition of Done.

### 3.6 Measurable success criteria (go/no-go — a native graph must beat "grep + read")

Baseline each on the current repo *before* Phase 1, then require the graph to win:

1. **Context-token reduction:** ≥ **30%** fewer tokens to answer a fixed set of 10 orientation/impact questions (graph-summary answer vs raw file reads), measured via `model_runs`/`provider-usage` cost.
2. **Repo re-reads:** ≥ **40%** fewer files opened to answer the same 10 questions vs a grep-and-read baseline.
3. **Orientation time:** median time-to-first-correct-answer on the 10 questions **halved**.
4. **Missed dependencies (blast-radius recall):** on a labeled set of "change X" cases, graph blast-radius surfaces ≥ **90%** of truly-affected files (no silent misses on the ones that matter).
5. **Regression rate:** over the next N schema/route changes, **fewer** post-merge regressions traceable to an unnoticed dependency vs the trailing baseline.
6. **Freshness integrity:** the graph's `representsCommit` is **never** stale-without-flag — 100% of served answers either match HEAD or carry a `stale` banner.

**Kill criterion:** if Phase 1 cannot beat criteria 1–2 on WOBBLE's own repo, **stop** — the independent review's "does not pay for itself on a medium TS repo" would have been confirmed, and the deterministic extractor still stands alone as a useful blast-radius/orphan tool without the "cheaper chat" promise.

---

## Appendix — Sources (all retrieved 2026-07-12)

- GitHub REST API — `https://api.github.com/repos/safishamsi/graphify` (redirects to `Graphify-Labs/graphify`) and `https://api.github.com/repos/Graphify-Labs/graphify` — repo metadata (license, stars, dates, branch, homepage). **[FACT]**
- Graphify README — `https://raw.githubusercontent.com/Graphify-Labs/graphify/v8/README.md` — install, local-vs-cloud, telemetry, incremental, storage, Windows, CI, benchmarks. **[FACT]**
- GitHub REST API — `https://api.github.com/repos/colbymchenry/codegraph` — competing tool metadata. **[FACT]**
- Kevin Kinnett — `https://www.kevinkinnett.com/posts/graphify-review-claude-code-knowledge-graph/` — independent review (blank report, "brute-force wins," hook latency). **[FACT — third-party]**
- Web search result set (identity resolution): `github.com/safishamsi/graphify`, `github.com/rhanka/graphify`, `graphify.net` (403 — unverified), `colbymchenry/codegraph`. **[FACT — search index]**
- Internal: `docs/AIOS_TRANSCRIPT_DELTA_2026_07_12.md` (Doctrine 15), `docs/AI_OS_TRANSCRIPT_LESSONS_FOR_WOBBLE.md` (transcript_1782429250), `docs/source/ai-os-youtubevideos/transcript_1782429250.txt`, `src/lib/system-map`, `src/lib/graph-checkpoint`, `src/lib/ask-tools`, `src/lib/memory`, `src/db/schema.ts`. **[FACT — repo]**

**Blockers recorded:** `graphify.net` HTTP 403 (unverified vs official `graphify.com`); `BENCHMARKS.md` not reproduced (benchmark numbers are as-claimed, and are memory benchmarks, not code-nav benchmarks); no measured resource footprint on a 632-file repo; no dependency/CVE audit performed (required before any install).
