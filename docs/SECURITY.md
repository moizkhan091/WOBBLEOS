# WOBBLE OS — Security Posture & Vulnerability Policy

## Dependency vulnerability triage (WOB-AUD-016)

`npm audit --omit=dev` reports **2 moderate** advisories (0 high, 0 critical). Both are **build/dev-time
only and NOT reachable in the production runtime**:

| Advisory | Package | Where it runs | Production reachable? |
|---|---|---|---|
| [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) — PostCSS `</style>` stringify XSS | `postcss` (via `next`) | CSS processing during `next build` | **No** — CSS is compiled at build time; postcss does not process untrusted input at runtime. |
| [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) — esbuild dev-server request exposure | `esbuild` (transitive dev tooling) | the esbuild/Next **dev server** (`next dev`) | **No** — production runs `node server.js` (the standalone build). The dev server is never started in the image. |

**Decision:** accepted-with-triage, not force-fixed. `npm audit fix --force` downgrades `next` to `9.x`
(a breaking major) to satisfy the transitive `postcss` range, which is not an acceptable trade for two
non-prod-reachable moderates. No non-breaking fix is currently published for either chain.

**Policy:**
- CI gates on high/critical (`npm audit --omit=dev` at those levels must be clean); moderates are triaged
  here with production-reachability, not auto-blocked.
- Re-run the audit each dependency change; when a non-breaking fix ships for these chains, apply it.
- The production image never starts a dev server and never exposes esbuild/postcss to request input.

## Baseline controls (verified)

- **Auth**: signed, DB-recorded, revocable sessions; revocation now enforced on every mutating route
  (WOB-AUD-004); login rate-limited/locked out (WOB-AUD-009).
- **SSRF**: server-side fetches (source ingestion + n8n outbound handoff) validate scheme + host + every
  resolved IP against a private/metadata denylist (`src/lib/security/url-guard.ts`).
- **Webhooks**: raw-body HMAC, replay window (our producers), pre-parse body caps (WOB-AUD-011).
- **Headers**: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy at the
  app layer (WOB-AUD-012); HSTS at the TLS reverse proxy.
- **Container**: non-root app + workers, private DB (no host port), `cap_drop: ALL`, `no-new-privileges`,
  resource + pid limits, digest-pinned base images (WOB-AUD-018).
- **Image content**: no local storage/secrets/docs/tests baked into the image, enforced by
  `scripts/check-docker-image.mjs` in CI (WOB-AUD-002).

## Reporting

Report suspected vulnerabilities privately to the founders (Moiz, Ali, Ibrahim, Haad) — do not open a
public issue for a security report.
