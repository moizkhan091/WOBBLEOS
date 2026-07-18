# WOBBLE OS — isolated production images (multi-stage; Next.js standalone web + tsx worker).
# Build:  via docker-compose.prod.yml (app + db + workers), or `docker build --target runner -t wobble-os .`
# Targets: migrator (drizzle migrate), runner (web app), worker (general + media/video workers).

# Base image pinned by digest for reproducible builds (WOB-AUD-018). node:22-alpine == npm 10.x, the
# SAME npm that generated package-lock.json, so `npm ci` is strict and reproducible here.
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS base

# ONE build identity shared by every service image (WOB-UAT-026). Compose passes the git SHA as a build
# arg to app + worker + migrator, each service reports it at runtime, and /api/health/version refuses to
# call the stack healthy when they disagree. Without this, a targeted rebuild (`--build app`) silently
# leaves workers on the previous image against an already-migrated schema.
#
# Declared + promoted to ENV in `base` so EVERY derived stage (migrator/runner/worker) inherits it: an
# ARG does not cross a FROM boundary, but an ENV does.
ARG WOBBLE_BUILD_ID=unknown
ENV WOBBLE_BUILD_ID=$WOBBLE_BUILD_ID
LABEL org.opencontainers.image.revision=$WOBBLE_BUILD_ID

# ---- deps: install deps once, cached ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Strict, reproducible install from the committed lockfile. The lockfile records every platform's
# optional binaries (@esbuild/linux-x64, @next/swc-linux-x64-gnu, fsevents, @emnapi/*), so `npm ci`
# succeeds here AND on a developer's Windows/macOS machine (WOB-AUD-008). Dev deps (tsx) included so
# the worker stage can run the TypeScript entrypoints.
RUN npm ci --no-audit --no-fund

# ---- migrator: a LEAN image that can run drizzle-kit migrate (has the CLI + config + migration files, no Next build) ----
FROM base AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json drizzle.config.ts ./
COPY src/db ./src/db
# `drizzle-kit migrate` is ADDITIVE (applies pending migrations only — never push/drop). Reads DATABASE_URL from env.
# Migration 0000 runs `CREATE EXTENSION vector`, which requires the pgvector DB image (see docker-compose.prod.yml).
CMD ["npx", "drizzle-kit", "migrate"]

# ---- build: compile the Next standalone server ----
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner: minimal web runtime (standalone bundle only; no source, no node_modules, no storage) ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_ROOT=/app/storage
# Run as a non-root user.
RUN addgroup -S wobble && adduser -S wobble -G wobble
# The standalone output carries only the server + its traced deps; static + public are copied alongside.
COPY --from=build --chown=wobble:wobble /app/.next/standalone ./
COPY --from=build --chown=wobble:wobble /app/.next/static ./.next/static
COPY --from=build --chown=wobble:wobble /app/public ./public
# Brand reference exemplars — content-render auto-feeds these to the image model so VPS output matches the
# real WOBBLE craft (without them the render falls back to generic-looking images). MUST ship in the image.
COPY --from=build --chown=wobble:wobble /app/assets ./assets
# Migrations are applied by the compose `migrate` step (drizzle-kit) before the app starts; the schema files ride along.
COPY --from=build --chown=wobble:wobble /app/src/db/migrations ./src/db/migrations
# Durable media is a mounted volume at runtime (docker-compose.prod.yml) — created empty + owned by the app user.
RUN mkdir -p /app/storage && chown -R wobble:wobble /app/storage
USER wobble
EXPOSE 3000
# Liveness/readiness — the orchestrator polls /api/health (200 healthy / 503 degraded).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1
CMD ["node", "server.js"]

# ---- worker: general + media/video workers (tsx runtime; NOT the web standalone) ----
# Separate image from `runner` because the workers run the TypeScript entrypoints directly via tsx
# (a devDependency), which the standalone web bundle intentionally excludes. This is why the audited
# image could not run `npm run worker` (`tsx: not found`). This stage carries node_modules (incl tsx),
# the source, tsconfig (for the @/* path alias), and scripts (heartbeat healthcheck). Compose overrides
# the command per service: `npm run worker` (general + scheduler leader) / `npm run worker:video`.
FROM base AS worker
WORKDIR /app
ENV NODE_ENV=production STORAGE_ROOT=/app/storage
RUN addgroup -S wobble && adduser -S wobble -G wobble
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
# Brand reference exemplars — the worker renders durable media jobs too, so it needs the references as well.
COPY assets ./assets
RUN mkdir -p /app/storage && chown -R wobble:wobble /app/storage
USER wobble
CMD ["npm", "run", "worker"]
