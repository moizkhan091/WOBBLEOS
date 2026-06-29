# WOBBLE OS V2 PRD

This folder is the working home for WOBBLE OS V2.

WOBBLE OS is one complete internal operating system for the four WOBBLE founders, not a demo and not a limited MVP. It combines WOBBLE Brain, Ask WOBBLE, Research Radar, Source Library, Learning Engine, Content Command Center, Media Studio, Client AIOS Lab, Decision Room, Offer Lab, Automations, Approvals, Memory, Costs, Audit Log, Settings, n8n handoff layer, worker system, backup/restore system, kill switches, and operational controls.

Golden workflow: source/research -> learning -> strategy -> content/media -> self-review -> founder approval -> n8n handoff.

## Non-negotiables

- Build in this folder: `C:\Wobble OS`.
- Public WOBBLE website routes remain untouched.
- Internal OS runs behind a private route/subdomain.
- One shared login, but every approval captures explicit founder attribution.
- Store secrets only in environment variables.
- Use Drizzle migrations and create pgvector extension in the first migration.
- Workers run as separate persistent Node processes, never inside Next.js request lifecycle.
- n8n webhooks use HMAC, timestamp replay protection, idempotency, retries, failure logs, dead letters, and manual retry.
- Media/video jobs are isolated from web/API compute.
- Company assets are never auto-deleted.
- Bad AI outputs do not enter founder approvals.

## Design direction

Premium black WOBBLE command center with electric lime `#B8FF2C`, restrained blue/orange accents, orb/dot-field visual language, and Apple Liquid Glass-inspired panels: translucent, blurred, refractive, readable, and hierarchy-first. The interface should feel like a serious AI operating system, not a SaaS template.
