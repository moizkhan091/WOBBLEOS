# WOBBLE OS - Self-Healing / Self-Improving Loops Audit

Date: 2026-07-01
Author: Claude (point 4 of the 2026-07-01 founder clarifications)
Companion: `docs/CONTENT_CREATIVE_EXCELLENCE_SYSTEM.md`, `docs/SELF_IMPROVING_INTELLIGENCE_LAYER.md`, `docs/INTELLIGENCE_REQUIREMENTS_COVERAGE_MATRIX.md`, `docs/BUILD_SEQUENCE_TRACKER.md`.

Purpose: the founder flagged that there are likely self-healing/self-improving loops we have NOT captured, across the whole OS - not just content text. This is the sweep. Every area is checked for: does a loop exist, what signal feeds it, what it proposes, which chunk owns it, and whether there is a GAP.

Non-negotiable rule for EVERY loop below: it observes real data -> proposes an improvement -> the proposal is APPROVAL-GATED -> on approval it updates the relevant store -> the change is audited. Nothing self-modifies Core Brain / production references / prompts / pricing silently.

## The universal loop shape

`signal (real outcome/data)  ->  detector/analyzer (worker)  ->  improvement proposal (approval item, evidence-linked, confidence-scored)  ->  founder approval  ->  update the owning store (skill / reference / knowledge / setting / playbook)  ->  audit + measure next time`

## Coverage matrix (every area)

| # | Area | What the loop should learn/improve | Signal in | Proposes | Owning chunk | Status |
|---|------|-----------------------------------|-----------|----------|--------------|--------|
| 1 | Content text - hooks/angles/formats/post-types | which hooks/angles/formats win, add to swipe/knowledge | post performance + gate scores | new/updated knowledge entries + skill updates | 43 Content KB, 47 Attribution, 34 Skill Registry | KB/attribution PLANNED; skill registry DONE (34) |
| 2 | Captions / CTAs | which caption styles + CTAs convert | performance + click/conv | knowledge + skill-rule updates | 43, 47, 34 | PLANNED |
| 3 | Design / visual references (static + carousel) | grow + rank the reference banks; discover new styles | approved refs + reference winRate | new references (Design Reference Hunter) + demote weak refs | 21 Reference Library, 51 Design Reference Hunter (NEW), 47 winRate | banks PLANNED (21); hunter NEW/PLANNED (51) |
| 4 | Brain / knowledge | consolidate raw research into trusted, ranked knowledge | sources + usage + outcomes | memory-update proposals; stale-flagging | 13 Learning Engine, 44 Knowledge Hunters, 36 Dreamer | substrate DONE (10/50); learning PLANNED (13/44) |
| 5 | Sources / research | which sources/creators are worth trusting; auto-pickup | source outcomes + trust tiers | trust-tier changes; new research targets | 12 Research Radar, 09 trust levels | trust DONE (09); radar/auto-pickup PLANNED (12) |
| 6 | Competitor intelligence | detect competitor moves + patterns | competitor transcripts/stats | competitor pattern entries + counter-actions | 44 Hunters, 38 Social Intel | PLANNED |
| 7 | Offers | which offers/packaging win; retire losers | offer test results (conv/LTV) | offer experiment proposals; retire/scale | 25 Offer Lab | PLANNED - loop must be explicit, not just CRUD |
| 8 | Outbound / cold email | which sequences/touches get replies | reply/positive-reply rates | sequence + copy improvement proposals | 46 Engagement, (gap) outbound-perf | GAP - outbound performance loop not explicitly owned |
| 9 | SEO / blog | which briefs/keywords/AEO answers rank + get cited | Search Console + AI-citation data | brief/keyword/internal-link proposals | 37 SEO Engine | PLANNED |
| 10 | Social | best next post; competitor cadence; outliers | platform stats + post performance | next-post recs feeding Content Command | 38 Social Intel, 47 | PLANNED |
| 11 | Website | conversion signals -> what content/pages to make | website/search analytics | insight rollups to Memory/Ask | 39 Website Analytics | PLANNED |
| 12 | Pricing | willingness-to-pay + price-test outcomes | offer/checkout data | price-change proposals (approval-gated) | (gap) - Offer Lab adjacent | GAP - no explicit pricing loop yet |
| 13 | Models / cost | pick better/cheaper models per role over time | model_runs cost/latency/quality | model-role change proposals | 36 Dreamer (cost dim), 28 Settings, 35 Connections | Dreamer PLANNED (36); registries 34 DONE / 35 next |
| 14 | Prompts / skills | improve the SOPs themselves from outcomes | gate scores + performance | skill-version proposals -> approval | 34 Skill Registry (DONE), 36 Dreamer proposes | registry DONE; auto-propose from Dreamer PLANNED (36) |
| 15 | Quality gates (text + visual) | tune thresholds/rules from what actually performed | approved-vs-rejected + post outcomes | gate rule/threshold proposals | 17 Text Gate, 22 Visual Gate, 36 | text gate DONE (17); tuning loop PLANNED |
| 16 | Approvals / guardrails | learn from approve/reject to auto-tune confidence + do-not-say | approval history | new guardrails / gate changes | 04 (base) + 17 + 36 | base DONE; learning PLANNED (36) |
| 17 | Engagement / community | which replies land; which DMs become leads | comment/DM outcomes | reply-style + routing proposals | 46 Engagement AI | PLANNED |
| 18 | Client AIOS | improve client playbooks from results | client outcomes (hours saved etc.) | playbook improvement proposals | 26 Client Lab, 44 patterns | PLANNED |
| 19 | Repurposing | which repurposes of one idea win | per-format performance | repurposing-strategy proposals | 49 Repurposing, 47 | PLANNED |
| 20 | Strategy / calendar | tune pillars + cadence to goals from performance | performance vs goals | pillar/cadence proposals | 45 Calendar Planner | PLANNED |
| 21 | Voice of customer | real audience language -> hooks/angles | comments/reviews/DMs mining | hook/angle knowledge entries | 48 VoC Mining | PLANNED |
| 22 | The OS itself (meta) | audit ALL of the above for missing loops nightly | everything (audit_logs, runs, proposals) | improvement proposals incl. "you are missing a loop for X" | 36 AI OS Auditor / Dreaming Engine | PLANNED - this doc is its checklist |

## Gaps to add explicitly (so they are not missed)

- **#3 / #51 Design Reference Hunter (NEW capability, now tracked):** scouts new designs (Pinterest/Dribbble/creators), proposes to approval, on approval files into the correct static/carousel reference bank with a vision-model style descriptor. One-reference-per-asset selection + winRate demotion. Added to the tracker as Chunk 51.
- **#8 Outbound performance loop:** no chunk explicitly owns "learn which cold sequences/touches get replies and propose copy/sequence changes." Assign to Chunk 46 (Engagement) or add a dedicated outbound-performance loop.
- **#12 Pricing loop:** no explicit self-improving pricing loop. Decide owner (Offer Lab 25 adjacent) before pricing work.
- **#7 Offers, #15/#16 gate + guardrail tuning, #14 auto-skill-proposals:** these must be built as LOOPS (observe -> propose -> approve), not just CRUD screens. Flag in each chunk's acceptance.

## How the Dreaming Engine (Chunk 36) uses this doc

Chunk 36 (AI OS Auditor / WOBBLE Dreaming Engine) should treat rows 1-22 as its standing checklist. Each nightly run: for each area, check whether the loop exists and is producing approved improvements; if an area has data but no improvement proposals, raise an "under-served loop" proposal. This is how we catch loops we missed - the auditor audits its own coverage.

Treat this list as LIVING, not final. When a new module is added, add its loop row here first.
