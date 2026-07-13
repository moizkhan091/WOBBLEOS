# WOBBLE OS — isolated production image (multi-stage; Next.js standalone output).
# Build:  docker build -t wobble-os .
# Run:    via docker-compose.prod.yml (app + postgres), or standalone with DATABASE_URL + SESSION_SECRET set.

# ---- deps: install production + build deps once, cached ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build: compile the Next standalone server ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner: minimal runtime (standalone bundle only) ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Run as a non-root user.
RUN addgroup -S wobble && adduser -S wobble -G wobble
# The standalone output carries only the server + its traced deps; static + public are copied alongside.
COPY --from=build --chown=wobble:wobble /app/.next/standalone ./
COPY --from=build --chown=wobble:wobble /app/.next/static ./.next/static
COPY --from=build --chown=wobble:wobble /app/public ./public
# Migrations are applied by the compose `migrate` step (drizzle-kit) before the app starts; the schema files ride along.
COPY --from=build --chown=wobble:wobble /app/src/db/migrations ./src/db/migrations
USER wobble
EXPOSE 3000
# Liveness/readiness — the orchestrator polls /api/health (200 healthy / 503 degraded).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1
CMD ["node", "server.js"]
