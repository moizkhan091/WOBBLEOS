# WOBBLE OS V1 — AI Workforce and Continuous Intelligence Addendum

**Status:** Binding addendum to `WOBBLE_OS_V1_EXPANDED_ADDITIVE_NORTH_STAR.md`  
**Purpose:** Remove all ambiguity about how departments, agents, prompts, fresh-data research, cross-team communication, autonomous execution, and self-improvement must work.  
**Scope:** Additive. Existing working WOBBLE features must remain.

## 1. AI Workforce Completeness Contract

Every operational department must be a real operating unit, not merely a card, prompt, database row, or UI label.

Except for explicit human control planes, each department must define the team it actually needs, which may include:

- Department Orchestrator or Team Lead
- Specialist Agents
- Research or Source Agent
- Execution Agent
- Quality Evaluator
- Memory or Knowledge Steward
- Governance and Risk Rules
- Cost and Budget Policy
- Human Approval Owner

The exact team must fit the department. Do not create decorative or duplicate agents just to make a team count look complete.

Every department must define and implement:

- department charter and business purpose;
- operating model;
- orchestrator or human owner;
- member agents and service-owned agents;
- strong versioned prompts;
- accepted inputs and output schemas;
- supported workflows and durable job types;
- worker ownership;
- inbound and outbound typed handoffs;
- tools and integrations;
- source and freshness policy;
- memory-write policy;
- client-scope policy;
- approval policy;
- model and provider routing;
- cost limits;
- retry, timeout, cancellation, idempotency, and failure behavior;
- health and readiness criteria;
- audit events;
- browser surfaces;
- API and database effects;
- automated and visible-browser acceptance tests.

No intended operational department may remain `0/0`, unstaffed, disconnected, UI-only, prompt-only, missing durable execution, missing evaluation, or falsely marked healthy.

## 2. Agent Contract

Every active agent must have:

- stable agent ID;
- owning department;
- execution role: member, orchestrator, service agent, evaluator, or control-plane helper;
- status and version;
- capability declaration;
- strong system prompt and task prompt;
- required evidence and source freshness;
- client-context requirements;
- uncertainty and unsupported-claim controls;
- accepted input and output schemas;
- job types;
- worker or scheduler ownership;
- tools;
- model/provider policy;
- fallback;
- timeout;
- retry;
- idempotency;
- cancellation;
- budget;
- approval threshold;
- memory permissions;
- client-access rules;
- audit requirements;
- kill switch;
- evaluator and minimum quality score;
- benchmark cases;
- founder-feedback loop;
- outcome tracking;
- rollback.

An agent is not operational merely because it has a prompt or registry row.

## 3. Fresh Data and External Intelligence Contract

WOBBLE must not rely only on static model knowledge or old internal documents.

Founders may provide:

- websites;
- newsletters;
- YouTube channels;
- podcasts;
- social accounts;
- reports;
- PDFs;
- folders;
- datasets;
- government portals;
- competitor pages;
- publications;
- internal company information.

WOBBLE must monitor approved sources automatically.

WOBBLE must also proactively discover potentially useful:

- new sources;
- articles;
- reports;
- experts;
- channels;
- datasets;
- AI models;
- AI services;
- software tools;
- APIs;
- automation platforms;
- distribution channels;
- advertising platforms;
- regulations;
- Pakistan-specific developments;
- regional developments;
- global developments;
- niche changes;
- cross-industry patterns.

Examples include finding:

- a new AI model that improves a WOBBLE workflow;
- a better image or video provider;
- a cheaper or stronger service;
- a new sales or publishing channel;
- a Pakistan business trend;
- a regulatory change;
- a competitor offer;
- a business model from another industry that can be adapted;
- a new research source;
- a new automation opportunity.

Every external item must record:

- source and origin;
- date published and date ingested;
- author or publisher;
- topic, geography, and client relevance;
- credibility, novelty, and confidence;
- contradiction status;
- expiry or review date;
- provenance;
- whether it is fact, interpretation, hypothesis, or recommendation.

WOBBLE must deduplicate, detect stale information, detect contradictions, compare sources, preserve citations, and prevent cross-client leakage.

Required cadences include continuous monitoring where justified, daily intelligence, weekly market briefs, monthly strategic scans, event-triggered research, founder-requested deep research, Pakistan-wide business intelligence, and global cross-industry opportunity research.

## 4. Cross-Team Communication Contract

Teams must communicate through structured, durable mechanisms:

- mission/task graph;
- typed handoff records;
- event bus;
- durable jobs;
- client digital twin;
- source references;
- approvals;
- revisions;
- audit log;
- cost records;
- memory proposals.

Every handoff must contain:

- sending and receiving team;
- client and workspace;
- objective;
- sources;
- confirmed facts;
- assumptions;
- confidence;
- open questions;
- risks;
- founder decisions;
- rejected directions;
- output version;
- budget used and remaining;
- deadline;
- required next action;
- required approval.

Receiving teams must validate handoffs. Invalid or incomplete handoffs must be rejected with reasons. Duplicate events must not create duplicate work. Changing an upstream assumption must mark affected downstream work stale.

## 5. Autonomous Operation Contract

WOBBLE must keep operating after founders close the browser.

Required behavior:

- durable background jobs;
- scheduled workflows;
- proactive opportunity detection;
- dependency-aware execution;
- retries and recovery;
- workload prioritization;
- budget enforcement;
- worker health;
- queue visibility;
- incident creation;
- founder escalation;
- autonomous daily, weekly, and monthly operating rhythm.

WOBBLE may autonomously research, summarize, classify, prepare drafts, create internal tasks, evaluate work, identify risks, refresh intelligence, and run approved playbooks within budget.

WOBBLE must seek approval before publishing, overspending, external commitments, pricing changes, destructive actions, security-policy changes, access changes, or material prompt/workflow activation.

## 6. Dual Self-Improvement Contract

Self-improvement means two things.

### A. Improving WOBBLE itself

WOBBLE must inspect:

- failed jobs;
- weak outputs;
- repeated founder corrections;
- expensive or slow workflows;
- dead buttons;
- missing integrations;
- stale prompts;
- bad model routing;
- unreliable providers;
- poor handoffs;
- quality regression;
- missing capabilities.

It may propose:

- prompt revisions;
- new agents;
- new departments;
- new tools;
- new providers;
- workflow redesign;
- UI improvements;
- data-model changes;
- playbooks;
- evaluations;
- safeguards.

### B. Improving business intelligence and work quality

WOBBLE must learn from:

- new sources;
- new articles;
- new channels;
- new market data;
- new AI tools and services;
- new business models;
- new competitors;
- new regulations;
- founder decisions;
- client outcomes;
- campaign outcomes;
- sales outcomes;
- experiments;
- successful and failed offers.

This learning must improve offers, strategies, audits, proposals, content, media direction, automations, and internal workflows.

Material changes must follow:

1. observe;
2. gather evidence;
3. create proposal;
4. define benefit and risk;
5. test against benchmarks and historical cases;
6. compare with current version;
7. obtain approval;
8. activate a versioned change;
9. monitor outcomes;
10. roll back if quality declines.

WOBBLE must never silently rewrite production prompts, workflows, policies, or code.

## 7. AI Service and Tool Discovery

WOBBLE must maintain an AI capability radar covering:

- foundation and reasoning models;
- image and video models;
- audio, voice, and transcription services;
- embeddings and retrieval;
- research tools;
- browser agents;
- automation tools;
- data providers;
- CRM and publishing tools;
- APIs;
- open-source models;
- local/private deployment options.

Each candidate must be evaluated for usefulness, quality, cost, latency, privacy, reliability, regional availability, licensing, security, integration effort, fallback value, and which WOBBLE workflows it can improve.

WOBBLE may recommend adoption but may not activate paid services, transmit client data, or alter provider policy without approval.

## 8. Department Strength Standard

A department is strong only when it has:

- a clear charter;
- the right team;
- strong versioned prompts;
- fresh information where required;
- approved tools;
- structured handoffs;
- quality evaluation;
- memory integration;
- client isolation;
- budget controls;
- failure handling;
- visible work;
- real outputs;
- auditability;
- outcome measurement;
- improvement feedback.

A description, card, prompt, or untested agent is not enough.

## 9. Completion and Testing Standard

For every department and major agent, proof must include:

visible browser action  
→ API request  
→ authenticated actor  
→ client scope  
→ database state  
→ durable job  
→ correct worker  
→ correct agent and department  
→ fresh source use where required  
→ output  
→ typed handoff  
→ evaluator  
→ approval or revision  
→ audit event  
→ provider and cost record  
→ persistence after restart  
→ no cross-client leakage.

Required campaign tests include:

- all existing modules;
- all intended operational departments;
- all active agents;
- three synthetic clients with unique canaries;
- concurrent founder sessions;
- client switching;
- long-term memory simulation;
- revisions;
- audit, roadmap, proposal, content, design, media, and publishing workflows;
- fresh research;
- Pakistan intelligence;
- cross-industry opportunity discovery;
- new AI-service discovery;
- provider failure;
- worker failure;
- duplicate events;
- cost limits;
- backup and destructive restore;
- browser console and network audit;
- full release gates;
- full Playwright.

“Not ready” is a checkpoint, not the end. Confirmed issues return to implementation and re-audit until readiness is achieved.

## 10. Preservation and Expansion Rule

This addendum does not replace existing WOBBLE functionality.

Builders must preserve existing working modules, teams, prompts, workflows, agents, departments, integrations, jobs, memory, approvals, and tests.

New capabilities must connect to the same authoritative infrastructure. Do not create isolated parallel systems or simplify WOBBLE into a few generic agents.

The intended result is a continuously learning, AI-run, founder-governed company operating system, not a dashboard with disconnected AI buttons.
