# WOBBLE OS V1 — Expanded Additive North Star Capability Specification

**Status:** Locked, mandatory V1 capability expansion  
**Purpose:** Preserve the full WOBBLE OS product vision, explain every capability in operational detail, and prevent future builders from removing, simplifying, or replacing existing working functionality while implementing the North Star.  
**Primary users:** WOBBLE founders and internal teams  
**Applies to:** Claude, Codex, future engineers, agents, product builders, auditors, and implementation sessions  
**Core product rule:** Every capability must be real, browser-usable, backend-proven, client-safe, auditable, budget-aware, versioned, and honest about incomplete or blocked work.

---

# 0. Additive Scope and Preservation Contract

## 0.1 These 28 pillars are additions, not a replacement product

The 28 North Star pillars define major capabilities that must be **added to and integrated with the WOBBLE OS that already exists**.

They are not a replacement list of the only features WOBBLE should contain.

They do not authorize Claude, Codex, or any future builder to remove existing modules, agents, departments, routes, workflows, databases, automations, interfaces, reports, approvals, memory systems, content systems, media systems, audit systems, proposal systems, research systems, or other working functionality merely because that functionality is not named explicitly in this document.

The existing product is the baseline. The North Star expands it.

## 0.2 Existing functionality must be preserved

Before implementing any North Star pillar, the builder must inventory the current system and preserve all working capabilities, including but not limited to:

- existing browser modules and screens;
- existing registered agents;
- existing departments and teams;
- existing job types and durable queues;
- existing worker and scheduler responsibilities;
- existing approval and revision workflows;
- existing memory tiers and knowledge stores;
- existing source intake and research pipelines;
- existing content, media, audit, roadmap, proposal, offer, decision, and client-AIOS workflows;
- existing cost, provider-run, audit-log, health, backup, and restore systems;
- existing integrations, webhooks, n8n handoffs, exports, and governance controls;
- existing tests and verified behavior.

A working capability may be replaced only when all of the following are true:

1. the replacement has a documented reason;
2. the old behavior is inventoried;
3. the new behavior has feature parity or an explicitly approved improvement;
4. data migration and rollback are defined;
5. browser, API, database, worker, audit, and regression tests pass;
6. the founder explicitly approves any meaningful removal or behavior change.

## 0.3 No destructive simplification

Builders must not make WOBBLE easier to implement by:

- deleting existing agents or departments;
- collapsing multiple workflows into a fake single prompt;
- turning backend actions into decorative UI;
- replacing durable jobs with browser-only execution;
- removing approvals, auditability, provenance, cost tracking, or version history;
- weakening client isolation;
- discarding earlier client memory;
- removing functionality because it is difficult to test;
- marking draft or disconnected features as complete without implementing them.

## 0.4 Existing agents and teams must be used and upgraded

Every North Star capability must connect to the existing agent registry, department model, workers, scheduler, approvals, memory, audit, cost, and handoff infrastructure.

Implementation should follow this order:

1. identify the existing agents, departments, workflows, and data models that already support part of the capability;
2. extend those systems where appropriate;
3. add missing agents or teams only when the existing structure cannot fulfil the responsibility;
4. register all new agents and teams in the same authoritative registry;
5. connect them through typed handoffs, durable jobs, event subscriptions, shared client scope, approvals, and audit events;
6. ensure no new capability becomes an isolated parallel mini-application.

## 0.5 The 28 pillars are a mandatory minimum, not a maximum

WOBBLE OS may and should contain additional valuable capabilities beyond these 28.

Claude, Codex, and future builders must proactively discover:

- missing product capabilities;
- useful automations;
- new agent or department needs;
- workflow improvements;
- market-intelligence opportunities;
- UX problems;
- reliability risks;
- governance gaps;
- ways to make WOBBLE more autonomous, useful, and commercially powerful.

Additional improvements must be documented, justified, placed into the implementation plan, and tested. They must not silently replace or weaken existing functionality.

## 0.6 All 28 pillars are intended to be implemented

These are not concept notes.

All 28 pillars are intended to become real WOBBLE OS V1 product capabilities, implemented through controlled branches and acceptance-tested waves.

“Controlled waves” describes sequencing only. It does not mean the later pillars are optional or deferred into an undefined future product.

WOBBLE OS V1 must not be declared complete until the pillars have been implemented, integrated, and accepted according to this document.

---

# 1. Product North Star

A founder should be able to enter a business objective and have WOBBLE:

1. understand the objective and its business context;
2. determine which client, company, market, offer, and constraints apply;
3. gather the required internal knowledge and external intelligence;
4. identify missing information and ask only necessary questions;
5. create a plan with tasks, dependencies, owners, costs, risks, and approvals;
6. assign the correct existing departments and agents;
7. coordinate typed, traceable handoffs between teams;
8. execute work through durable background jobs;
9. evaluate outputs before founder review;
10. request and process revisions;
11. preserve sources, assumptions, decisions, costs, versions, approvals, and outcomes;
12. learn from founder feedback, client results, trusted sources, and system performance;
13. proactively identify risks and opportunities;
14. continue operating without the browser remaining open;
15. never mix clients, invent success, or exceed authority.

WOBBLE must feel like an AI-native company operating system in which specialised teams collaborate through one governed business brain.

---

# 2. Mandatory Integration Architecture

Every pillar must integrate with the following shared WOBBLE foundations.

## 2.1 Identity and scope

Every action must carry:

- authenticated founder or service identity;
- company/workspace identity;
- client identity where applicable;
- objective or task identity;
- role and authority;
- correlation and idempotency IDs.

## 2.2 Shared agent and department registry

Every participating agent must have:

- stable agent ID;
- department ownership;
- capability declaration;
- accepted input and output schemas;
- model/provider policy;
- budget policy;
- approval policy;
- health state;
- version;
- evaluation history.

## 2.3 Durable work system

Important work must use:

- persisted jobs;
- explicit job states;
- leases or ownership;
- retries;
- cancellation;
- timeouts;
- idempotency;
- failure reasons;
- worker heartbeats;
- execution and cost records.

## 2.4 Typed handoffs

Every cross-team handoff must be a structured record rather than loose text.

## 2.5 Memory and knowledge

Every output must specify whether it may update:

- client core memory;
- working memory;
- episodic history;
- company knowledge;
- playbooks;
- benchmark patterns;
- no memory at all.

High-impact memory changes require review.

## 2.6 Audit and observability

Every meaningful action must produce:

- actor;
- time;
- client/workspace;
- source;
- input reference;
- output reference;
- decision;
- cost;
- provider;
- model;
- status;
- failure reason;
- approval or rejection;
- version.

## 2.7 Human approval

WOBBLE may act autonomously only within explicit boundaries.

Actions involving publication, spending, client commitments, deletion, pricing, access, external communication, or material strategic change must follow approval policy.

---

# 3. The 28 Mandatory V1 Capability Pillars

## 1. Autonomous Mission Control

### Purpose

Mission Control turns a founder’s high-level objective into coordinated company execution.

It is the top-level orchestration layer that decides what work must happen, which teams should do it, what information is missing, what order tasks should follow, and where founder approval is required.

### What it does

A founder may enter a goal such as:

> Build and launch a complete growth strategy for Client Alpha within a PKR 1,000,000 quarterly budget.

Mission Control must:

- identify the correct client digital twin;
- interpret the goal, constraints, success criteria, deadline, and budget;
- detect missing information;
- produce a dependency graph;
- select departments and agents;
- generate durable tasks;
- assign quality thresholds;
- estimate cost and duration;
- start eligible tasks;
- wait for dependencies;
- route outputs to evaluators;
- send weak work back for revision;
- pause for required founder decisions;
- re-plan after failures or changed constraints;
- combine approved outputs into final deliverables;
- show progress, blockers, spending, and ownership.

### Integration with existing WOBBLE

Mission Control must use the existing:

- agent registry;
- department registry;
- jobs and workers;
- scheduler;
- approvals;
- audit log;
- cost tracking;
- memory;
- client context;
- offer, audit, proposal, content, and media workflows.

It must not replace those workflows with one giant prompt.

### Founder experience

The founder should see:

- objective;
- plan;
- task graph;
- departments involved;
- active work;
- blockers;
- approvals;
- spend;
- sources;
- outputs;
- final joined result.

### Acceptance proof

One visible-browser objective creates real durable tasks across multiple departments, survives restarts, produces evaluated outputs, and completes without client leakage or duplicate execution.

---

## 2. Structured Department-to-Department Handoffs

### Purpose

Handoffs prevent context loss when work moves from one AI team to another.

### What it does

Every team passes a structured work packet containing:

- source department and agent;
- destination department and agent;
- client/workspace scope;
- objective;
- output being handed off;
- supporting sources;
- facts and assumptions;
- confidence;
- open questions;
- risks;
- rejected directions;
- founder instructions;
- budget used and remaining;
- deadline;
- required next action;
- required approval.

The receiving team must acknowledge, validate, and either accept or reject the handoff.

### Integration with existing WOBBLE

Existing research, source, intelligence, strategy, offer, audit, proposal, content, media, learning, memory, cost, and webhook departments must use the same handoff framework.

### Founder experience

A founder can open any deliverable and see how it moved through the organisation.

### Acceptance proof

Research → Strategy → Offer → Audit → Proposal → Content → Media transfers the correct client context and evidence at every step.

---

## 3. Client Digital Twin

### Purpose

The digital twin gives every agent one authoritative, structured understanding of a client.

### What it does

The twin contains:

- legal and business identity;
- founders and stakeholders;
- products and services;
- business model;
- markets and locations;
- audiences;
- offers and pricing;
- positioning;
- brand voice;
- approved and prohibited claims;
- goals;
- competitors;
- campaigns;
- channels;
- workflows;
- integrations;
- historical decisions;
- approvals and rejections;
- performance data;
- sources;
- risks;
- memory;
- current and historical versions.

It updates through approved source ingestion, founder edits, verified outcomes, and approved memory proposals.

### Integration with existing WOBBLE

Every existing client-scoped module must resolve the twin before work begins. Existing client tables and scope conventions must be reconciled into a clear authoritative client identity model without losing data.

### Founder experience

The founder can inspect, edit, approve, version, export, and audit the client twin.

### Acceptance proof

Three clients with unique canaries remain completely isolated across research, memory, audits, proposals, content, media, jobs, logs, and exports.

---

## 4. Business Knowledge Graph

### Purpose

The graph lets WOBBLE understand relationships, not just retrieve documents.

### What it does

It links:

- companies;
- people;
- offers;
- audiences;
- problems;
- competitors;
- claims;
- sources;
- decisions;
- strategies;
- campaigns;
- experiments;
- content;
- proposals;
- outcomes;
- risks.

Every relationship records provenance, time, confidence, client scope, and validity.

The graph supports questions such as:

- Why do we believe this?
- Which source supports it?
- What depends on this offer?
- Which content is stale?
- Which client decision changed the strategy?
- Which experiment validated this claim?

### Integration with existing WOBBLE

The graph must complement the existing pgvector retrieval and memory system. It must not replace source documents or embeddings; it adds structured relationships and traceability.

### Acceptance proof

A graph query returns the correct client-scoped relationship, evidence, confidence, and affected downstream artifacts.

---

## 5. Evaluator and Quality-Control Department

### Purpose

The evaluator protects founders from weak, unsupported, off-brand, or commercially useless output.

### What it does

It evaluates important outputs for:

- client relevance;
- source support;
- factual accuracy;
- brand alignment;
- strategic logic;
- completeness;
- originality;
- compliance;
- commercial value;
- format requirements;
- cost efficiency;
- confidence.

It can:

- approve;
- request revision;
- block;
- escalate to a founder;
- compare versions;
- detect repeated failure patterns.

### Integration with existing WOBBLE

The evaluator must sit between producing departments and founder approval queues. It must use existing revision, audit, cost, and memory systems.

### Founder experience

The founder sees the score, reasons, sources, weaknesses, revisions, and final recommendation.

### Acceptance proof

A deliberately weak output is rejected, revised by the original team, re-evaluated, and only then shown as ready.

---

## 6. Continuous Learning and Intelligence Engine

### Purpose

This engine ensures WOBBLE becomes more useful over time and continuously discovers information that founders would otherwise never research themselves.

### Internal learning

It learns from:

- founder approvals;
- rejections and reasons;
- edits;
- revision history;
- successful and failed deliverables;
- client preferences;
- campaign performance;
- sales and operational outcomes;
- evaluator results;
- workflow speed;
- provider cost;
- repeated founder questions.

It must distinguish:

- one-off feedback;
- client-specific preference;
- company-wide preference;
- reusable playbook learning;
- temporary working context.

### External source learning

Founders can provide:

- websites;
- newsletters;
- YouTube channels;
- podcast feeds;
- social accounts;
- reports;
- datasets;
- government portals;
- market-research sources;
- competitor pages;
- publications;
- internal folders.

WOBBLE must monitor approved sources automatically rather than requiring founders to repeatedly search them.

### Autonomous discovery

The engine may discover additional sources and developments involving:

- Pakistan business;
- consumer behaviour;
- regulation;
- technology;
- finance;
- culture;
- advertising;
- industries served by WOBBLE;
- unrelated industries where useful ideas may transfer;
- regional and global market changes;
- emerging tools, business models, and distribution channels.

Discovered sources must be scored before trust.

### Intelligence processing

It must:

- ingest and deduplicate;
- detect novelty;
- detect contradictions;
- track source credibility;
- separate fact, interpretation, and hypothesis;
- identify relevance by client;
- create daily/weekly intelligence briefs;
- propose opportunities;
- recommend offer, content, strategy, automation, or experiment changes;
- link every recommendation to evidence;
- avoid silent self-modification.

### Controlled improvement

Learning may produce a proposed:

- memory update;
- prompt change;
- workflow change;
- model-routing change;
- playbook update;
- new agent;
- new guardrail.

Material changes must be evaluated on historical cases and approved before activation.

### Integration with existing WOBBLE

This must extend the existing Research Radar, Source Registry, Intelligence Inbox, Learning Engine, Knowledge Compiler, WOBBLE Brain, memory, approvals, and scheduler.

### Founder experience

Founders choose sources, topics, industries, clients, frequency, and trust rules. WOBBLE then works continuously and surfaces only relevant opportunities and risks.

### Acceptance proof

A new Pakistan or global market development is detected, sourced, ranked, mapped to the correct client, converted into a useful opportunity proposal, and never leaks to another client.

---

## 7. Proactive Agents

### Purpose

Proactive agents keep the company moving without waiting for founders to remember every task.

### What it does

Agents monitor real system conditions and identify:

- stale strategy;
- missing information;
- overdue approval;
- unanswered opportunity;
- underperforming workflow;
- repeated content weakness;
- rising cost;
- failed integration;
- source contradiction;
- competitor action;
- client risk;
- outdated proposal;
- approaching deadline;
- missing follow-up.

They may create recommendations, tasks, briefs, or approval requests within policy.

### Integration with existing WOBBLE

Proactive behavior must be scheduler- and event-driven, persisted as jobs, linked to the responsible department, and visible in the audit log.

### Acceptance proof

A real condition triggers one relevant proactive task, with no duplicate and no uncontrolled external action.

---

## 8. Company Event Bus

### Purpose

The event bus lets departments communicate automatically when business state changes.

### What it does

It publishes events such as:

- client.created;
- source.approved;
- offer.changed;
- strategy.approved;
- proposal.rejected;
- content.finalized;
- media.completed;
- lead.stage_changed;
- budget.exceeded;
- worker.failed;
- integration.failed;
- backup.failed.

Subscribers react through durable, idempotent handlers.

### Integration with existing WOBBLE

Existing webhook replay protection, jobs, scheduler, audit, and client scoping must be reused.

### Acceptance proof

An offer change updates the client twin, marks dependent drafts stale, alerts relevant departments, and creates each effect once.

---

## 9. Scenario and Counterfactual Simulator

### Purpose

The simulator helps founders compare choices before committing money or reputation.

### What it does

It builds scenarios such as:

- conservative;
- aggressive;
- low-budget;
- premium;
- speed-first;
- risk-minimised;
- Pakistan-first;
- international expansion.

It estimates:

- expected result;
- assumptions;
- cost;
- time;
- required team;
- dependencies;
- upside;
- downside;
- confidence;
- evidence;
- early warning indicators.

### Integration with existing WOBBLE

It consumes the client twin, knowledge graph, financial engine, market intelligence, experiments, and offer data.

### Acceptance proof

A founder selects a scenario and downstream execution retains the approved assumptions.

---

## 10. Reusable Skills and Industry Playbooks

### Purpose

Playbooks let WOBBLE repeat successful work without rebuilding the process.

### What it does

A playbook defines:

- intended outcome;
- required inputs;
- departments;
- agents;
- handoff order;
- quality rules;
- approvals;
- budget;
- deadlines;
- source requirements;
- deliverables;
- failure handling;
- measurement.

Examples include dental growth audits, restaurant launches, investor outreach, content engines, onboarding, and Pakistan market entry.

### Integration with existing WOBBLE

Playbooks must use existing skills, departments, agents, jobs, approvals, and templates.

### Acceptance proof

A founder selects a playbook for a new client and obtains a complete scoped execution plan without manual reconstruction.

---

## 11. Multi-Model and Multi-Provider Routing

### Purpose

Different work should use the best model rather than one expensive model for everything.

### What it does

Routing considers:

- complexity;
- modality;
- speed;
- budget;
- privacy;
- reliability;
- provider health;
- context size;
- quality history;
- client restrictions.

It supports fallback, retries, model comparison, and deterministic alternatives.

### Integration with existing WOBBLE

Existing provider-run records, cost tracking, budgets, and workers must govern routing.

### Acceptance proof

The chosen model, reason, cost, fallback, and result are recorded; provider failure does not create false success.

---

## 12. Real Founder Command Centre

### Purpose

The Command Centre gives founders one truthful view of the company and AI workforce.

### What it shows

- active missions;
- pending approvals;
- blockers;
- cost;
- client risk;
- deadlines;
- department health;
- worker health;
- failed jobs;
- opportunities;
- stale artifacts;
- evaluator scores;
- recent decisions;
- system incidents.

Every metric must have a real source and refresh behavior.

### Integration with existing WOBBLE

It must aggregate existing health, audit, cost, approvals, jobs, departments, modules, clients, and scheduler data.

### Acceptance proof

Stopping a worker, creating an approval, or changing cost updates the correct UI state with no hardcoded numbers.

---

## 13. Agent Collaboration and Business Reasoning Trace

### Purpose

Founders need to understand how teams reached a result.

### What it does

For every important deliverable, it shows:

- objective;
- plan;
- teams;
- handoffs;
- sources;
- facts and assumptions;
- evaluator feedback;
- revisions;
- founder decisions;
- cost;
- final result.

It exposes concise evidence-based business reasoning, not private hidden chain-of-thought.

### Integration with existing WOBBLE

It draws from audit logs, handoffs, jobs, approvals, sources, provider runs, and versions.

### Acceptance proof

A founder can reconstruct the complete business history of a deliverable.

---

## 14. Governance, Security, and Control

### Purpose

Governance ensures autonomy remains safe.

### What it includes

- separate founder accounts;
- roles;
- super-admin;
- individual sessions;
- client-level permissions;
- account disablement;
- approval thresholds;
- budgets;
- provider restrictions;
- kill switches;
- encrypted secrets;
- immutable audit history;
- retention;
- export;
- deletion;
- backup and restore;
- incident controls;
- MFA path.

### Integration with existing WOBBLE

Governance applies to every existing and future module, department, agent, job, handoff, and external action.

### Acceptance proof

A lower-authority actor cannot impersonate another founder, exceed budget, publish, delete, or change protected settings without authorization.

---

## 15. Autonomous Global and Pakistan Intelligence Mesh

### Purpose

The mesh continuously finds relevant business developments before founders have to search.

### What it does

It monitors:

- Pakistan markets;
- regional markets;
- global business;
- consumer behaviour;
- policy and regulation;
- finance;
- technology;
- culture;
- advertising;
- specific client niches;
- adjacent industries;
- unrelated sectors with transferable ideas.

It identifies weak signals, trend acceleration, contradictions, and opportunity combinations.

### Integration with existing WOBBLE

It extends Research Radar, Source Registry, Intelligence Inbox, Learning Engine, and the scheduler.

### Acceptance proof

A sourced cross-industry trend becomes a ranked WOBBLE or client opportunity with an explanation of why it matters.

---

## 16. Opportunity-to-Offer Engine

### Purpose

This engine turns intelligence into something the company can sell.

### What it does

It identifies:

- unmet demand;
- urgent pain;
- affected buyer;
- willingness to pay;
- offer concept;
- scope;
- packaging;
- pricing logic;
- delivery model;
- capability requirements;
- risk;
- differentiation;
- experiment plan.

### Integration with existing WOBBLE

It uses research, client twins, competitors, strategy, Offer Lab, financial intelligence, and experiments.

### Acceptance proof

A market signal becomes a source-backed offer proposal with audience, promise, delivery, pricing, risk, and validation plan.

---

## 17. Experimentation and Growth Lab

### Purpose

The Growth Lab tests ideas before WOBBLE treats them as truth.

### What it does

It creates and tracks:

- hypotheses;
- variants;
- audiences;
- budgets;
- metrics;
- durations;
- stopping rules;
- results;
- statistical or practical confidence;
- learning;
- follow-up decision.

It supports offer, content, pricing, funnel, outreach, sales-script, and automation experiments.

### Integration with existing WOBBLE

Experiment outcomes update the knowledge graph, attribution engine, evaluator, offers, and approved learning.

### Acceptance proof

An approved experiment runs, records real results, and changes future recommendations only through the controlled learning path.

---

## 18. Outcome Attribution and Learning from Results

### Purpose

Attribution shows whether WOBBLE’s work created value.

### What it does

It connects:

- source;
- insight;
- decision;
- strategy;
- offer;
- campaign;
- content;
- lead;
- conversion;
- revenue;
- cost;
- agent;
- workflow;
- revision.

It distinguishes correlation from proven causation.

### Integration with existing WOBBLE

It consumes CRM, analytics, cost, provider-run, experiment, campaign, audit, and client data.

### Acceptance proof

A founder can trace a result back to the relevant workflow, evidence, cost, and decision.

---

## 19. Company and Client Digital-Twin Simulator

### Purpose

The simulator predicts how a company may respond to changes.

### What it does

It simulates:

- pricing changes;
- new offers;
- budget changes;
- hiring;
- automation;
- competitor actions;
- regulation;
- market expansion;
- demand shifts;
- capacity constraints.

It displays uncertainty and assumptions.

### Integration with existing WOBBLE

It uses the digital twin, financial engine, market intelligence, scenarios, experiments, and outcomes.

### Acceptance proof

A founder can compare predicted impact and approve one change with assumptions preserved.

---

## 20. Autonomous Revenue and CRM Engine

### Purpose

This engine helps WOBBLE and its clients convert opportunity into revenue.

### What it does

It supports:

- lead capture;
- enrichment;
- qualification;
- scoring;
- routing;
- follow-up;
- proposal tracking;
- stalled-opportunity detection;
- next-best action;
- reactivation;
- forecasting;
- human handoff.

### Integration with existing WOBBLE

It connects to existing integrations, n8n, client twins, offers, proposals, content, audit, costs, and approval policy.

### Acceptance proof

A synthetic lead moves through a real pipeline with traceable actions, no duplicate follow-ups, and correct human approval.

---

## 21. Meeting, Inbox, and Conversation Intelligence

### Purpose

This capability turns unstructured communication into reliable company memory and action.

### What it does

It extracts:

- summary;
- confirmed decisions;
- discussion points;
- commitments;
- tasks;
- owners;
- deadlines;
- client concerns;
- opportunities;
- risks;
- follow-ups;
- CRM updates;
- memory proposals.

It must not present discussion as a confirmed decision.

### Integration with existing WOBBLE

It connects to source intake, transcripts, memory, tasks, CRM, approvals, and audit logs.

### Acceptance proof

A synthetic meeting creates correct tasks and memory proposals while uncertain statements remain clearly marked.

---

## 22. Financial Intelligence and Unit-Economics Engine

### Purpose

This engine tells founders what is profitable, expensive, or financially risky.

### What it does

It tracks:

- revenue;
- direct cost;
- provider cost;
- labour assumptions;
- project profitability;
- client profitability;
- campaign cost;
- margin;
- budget variance;
- cash-flow scenarios;
- pricing recommendations;
- anomalies.

### Integration with existing WOBBLE

It extends cost tracking and connects to CRM, projects, providers, experiments, offers, and outcomes.

### Acceptance proof

A founder can see the traceable cost and estimated margin of a client, workflow, campaign, and AI operation.

---

## 23. Competitive War Room and Market Map

### Purpose

The War Room maintains a living understanding of competitors and market movement.

### What it does

It tracks:

- competitors;
- products;
- offers;
- prices;
- positioning;
- messaging;
- channels;
- launches;
- hiring;
- partnerships;
- reviews;
- customer sentiment;
- strengths;
- weaknesses;
- changes over time.

It separates sourced observation from WOBBLE’s interpretation.

### Integration with existing WOBBLE

It uses Research Radar, Source Registry, intelligence, knowledge graph, opportunities, and alerts.

### Acceptance proof

A material competitor change generates a source-backed alert, impact analysis, and recommended response.

---

## 24. Workflow Mining and Automation Discovery

### Purpose

Workflow mining finds work humans repeatedly perform and proposes automation.

### What it does

It detects:

- repeated manual steps;
- duplicate data entry;
- recurring approvals;
- slow handoffs;
- repeated questions;
- spreadsheet bottlenecks;
- WhatsApp chaos;
- avoidable copying;
- rework;
- agency dependency.

It estimates time saved, cost saved, implementation difficulty, and risk.

### Integration with existing WOBBLE

It analyses audit events, tasks, handoffs, approvals, integrations, and usage patterns.

### Acceptance proof

A repeated manual process becomes a quantified automation proposal and approved workflow design.

---

## 25. System Improvement Council

### Purpose

The Council makes WOBBLE continuously inspect and improve itself.

### What it does

It reviews:

- failed jobs;
- weak outputs;
- expensive workflows;
- slow workflows;
- repeated founder corrections;
- dead buttons;
- unused modules;
- duplicated features;
- missing capabilities;
- stale prompts;
- poor routing;
- quality regression;
- reliability incidents.

It proposes:

- prompt changes;
- workflow redesign;
- new agents;
- new playbooks;
- model routing;
- UI changes;
- data-model improvements;
- automation;
- removal of genuinely obsolete components only through the preservation protocol.

### Integration with existing WOBBLE

It consumes audits, evaluations, costs, incidents, usage, outcomes, revisions, and founder feedback.

### Acceptance proof

A measured weakness creates a proposal, benchmark test, approval, versioned change, and rollback path.

---

## 26. Capability-Gap, Hiring, and Partner Network Engine

### Purpose

This engine identifies what WOBBLE cannot yet do and recommends how to obtain the capability.

### What it does

It compares goals with current:

- agent capabilities;
- human skills;
- integrations;
- software;
- data;
- capacity;
- budget.

It recommends:

- training;
- new agent;
- human hire;
- freelancer;
- agency;
- tool;
- integration;
- partner.

### Integration with existing WOBBLE

It uses Mission Control planning, the agent registry, department capacity, costs, and the knowledge graph.

### Acceptance proof

A missing capability becomes an evidence-based build/buy/hire/partner recommendation.

---

## 27. Private Benchmarking and Pattern Library

### Purpose

This library lets WOBBLE reuse patterns without exposing client data.

### What it does

It stores permissioned and anonymised patterns such as:

- successful workflow shapes;
- common objections;
- offer structures;
- evaluator benchmarks;
- timing;
- failure patterns;
- industry playbook results.

It must prevent reverse identification and raw cross-client retrieval.

### Integration with existing WOBBLE

It connects to learning, evaluations, outcomes, playbooks, privacy policy, and client isolation.

### Acceptance proof

A recommendation improves using an anonymised pattern without exposing another client’s identity, source, wording, or confidential information.

---

## 28. Autonomous Operating Rhythm

### Purpose

This capability runs the company’s recurring management cadence.

### Daily

- founder brief;
- priorities;
- blockers;
- approvals;
- incidents;
- risks;
- opportunities;
- spend;
- system health.

### Weekly

- department performance;
- client status;
- experiments;
- pipeline;
- content and media;
- unresolved decisions;
- quality;
- improvement proposals.

### Monthly

- strategic review;
- profitability;
- client health;
- capability gaps;
- market intelligence;
- workflow improvements;
- roadmap reprioritisation.

### Integration with existing WOBBLE

It uses the scheduler, briefs, Command Centre, departments, clients, costs, audit events, Mission Control, and proactive agents.

### Acceptance proof

Scheduled reports are produced from real system state and create traceable follow-up tasks.

---

# 4. Existing WOBBLE Capabilities Are Still Mandatory

The following categories remain mandatory even when they are not repeated inside every pillar:

- Founder Command Centre;
- Founder Brief;
- WOBBLE Brain;
- Ask WOBBLE;
- Research Radar;
- Source Registry and Library;
- Intelligence Inbox;
- Learning Engine;
- Memory;
- Agent Registry;
- Departments;
- Content Command;
- Library and Scheduler;
- Media Studio;
- Decision Room;
- Offer Lab;
- Audit Workspace;
- Audit Roadmap;
- Quick Pitch;
- Proposal Maker;
- Client AIOS Lab;
- approvals;
- revisions;
- jobs;
- workers;
- scheduler;
- provider runs;
- cost controls;
- audit log;
- health;
- backup and restore;
- n8n and integrations;
- existing exports, settings, webhooks, tools, and workflows.

This list is illustrative, not exhaustive.

A current-feature inventory must be regenerated from the actual code before every major implementation wave.

---

# 5. Non-Negotiable System Qualities

Every existing and new capability must satisfy:

1. **Real backend effect:** no decorative success.
2. **Client isolation:** no cross-client memory, source, output, log, job, or export leakage.
3. **Evidence and provenance:** sourced claims remain traceable.
4. **Human control:** high-impact actions require approval.
5. **Idempotency:** duplicate clicks or events do not duplicate durable effects.
6. **Auditability:** actors, sources, costs, decisions, and revisions are recorded.
7. **Budget awareness:** AI operations respect budgets and kill switches.
8. **Failure honesty:** blocked work is blocked, not successful.
9. **Persistence:** work survives refresh, logout, restart, and container replacement.
10. **Versioning and rollback:** prompts, workflows, playbooks, and outputs remain restorable.
11. **Security:** identity comes from authenticated sessions.
12. **Browser usability:** founders can operate the feature through WOBBLE.
13. **Automated verification:** each capability has unit, integration, and browser coverage.
14. **Independent verification:** critical claims are rechecked by another auditor.
15. **Observability:** health, queues, costs, failures, and performance are visible.
16. **Compatibility:** existing working capabilities remain functional.
17. **Structured integration:** agents and departments communicate through shared WOBBLE infrastructure.
18. **No silent self-modification:** material system improvement follows evaluation and approval.

---

# 6. V1 Delivery Waves

All pillars remain V1 obligations. Waves exist only to keep implementation safe.

## Wave A — Trust and Product Foundation

- preserve and inventory existing features;
- separate founder accounts;
- permissions and governance;
- client isolation;
- real Command Centre data;
- migration integrity;
- durable workers;
- auditability;
- cost controls;
- backup and restore;
- failure honesty;
- removal of fake/dead paths only through approved replacement.

## Wave B — Company and Market Intelligence

- client digital twin;
- knowledge graph;
- Continuous Learning and Intelligence Engine;
- Pakistan and Global Intelligence Mesh;
- Competitive War Room;
- meeting and inbox intelligence;
- Opportunity-to-Offer Engine.

## Wave C — Autonomous Team Execution

- Mission Control;
- typed handoffs;
- event bus;
- proactive agents;
- evaluator department;
- playbooks;
- collaboration trace;
- autonomous operating rhythm.

## Wave D — Commercial and Growth Intelligence

- scenario simulation;
- experiments;
- outcome attribution;
- revenue and CRM engine;
- financial intelligence;
- company/client simulator.

## Wave E — Self-Optimising Company OS

- workflow mining;
- System Improvement Council;
- capability-gap engine;
- private benchmarking;
- multi-model optimisation;
- controlled continuous improvement.

---

# 7. Implementation Rules for Claude and Codex

## Claude implementation responsibility

Claude may:

- inventory;
- design;
- implement;
- run visible browser UAT;
- fix confirmed defects;
- create branches and commits;
- produce evidence.

Claude must not:

- edit main directly;
- merge;
- deploy without explicit approval;
- remove existing working features without preservation proof;
- claim completion without browser and backend evidence.

## Codex verification responsibility

Codex must independently:

- inspect the exact commit;
- compare existing-feature inventory before and after;
- verify no unapproved removal;
- test browser, API, database, worker, handoff, audit, cost, and persistence effects;
- challenge client isolation;
- verify agent/team integration;
- verify acceptance criteria;
- return an explicit verdict.

Codex must not silently fix during audit.

---

# 8. Final V1 Acceptance Standard

WOBBLE OS V1 is complete only when:

- existing working features remain present and verified;
- all 28 pillars have implemented product surfaces;
- all new pillars integrate with the authoritative agent and department architecture;
- department handoffs are structured and durable;
- every meaningful action has a real backend effect;
- critical workflows pass visible browser UAT;
- three-client isolation passes;
- separate founder accounts pass;
- memory, learning, and revision lifecycles pass;
- external intelligence is source-linked;
- autonomous teams perform real work;
- evaluators detect weak work;
- events trigger downstream work exactly once;
- costs and budgets are enforced;
- failure and recovery are honest;
- backup and restore pass;
- no open P0, P1, or P2 defects remain;
- Claude’s evidence passes independent Codex verification;
- founders complete realistic acceptance journeys;
- production deployment passes post-deployment validation.

---

# 9. Standing Product Instruction

Claude, Codex, and future builders must continuously identify additional useful improvements without waiting for founders to remember them.

For each proposed improvement they must document:

- the problem;
- business value;
- supporting evidence;
- interaction with existing features;
- required agents and departments;
- handoffs;
- data and integration requirements;
- risk;
- acceptance criteria;
- recommended V1 wave.

No improvement may silently remove, weaken, or bypass an existing capability.

This document is the permanent additive product North Star unless the founders explicitly revise it.
