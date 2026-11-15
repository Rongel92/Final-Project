# syntax=docker/dockerfile:1

# ============================================================================
# Laptop Resale — single-origin production image.
# Builds the React SPA and the Express/Prisma API, then serves BOTH from one
# Node process on port 8080. The same image is used for the prod and test
# containers (see docker-compose.yml).
# ============================================================================

# ---- Stage 1: build the client SPA ----------------------------------------
FROM node:22-bookworm-slim AS client-build
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: build the server (TypeScript + Prisma client) ----------------
FROM node:22-bookworm-slim AS server-build
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate && npm run build

# ---- Stage 3: runtime ------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app

# Server dependencies (incl. Prisma CLI for `migrate deploy`) + generated client.
COPY --from=server-build /server/node_modules ./node_modules
COPY --from=server-build /server/dist ./dist
COPY --from=server-build /server/package.json ./package.json
COPY server/prisma ./prisma
# Fonts embedded in the signed-agreement PDF (resolved from WORKDIR /app).
COPY server/assets ./assets

# NOTE: NO secrets or environment URLs are baked into the image. All runtime
# configuration (secrets, URLs, cookie flags) is injected at deploy time via an
# env file / orchestrator secrets — see docker-compose.yml + deploy/*.env.

# Built SPA served single-origin by Express.
COPY --from=client-build /client/dist ./client-dist
ENV CLIENT_DIST_DIR=/app/client-dist

# Structural (non-secret) defaults. The PostgreSQL DATABASE_URL is injected at
# deploy time (never baked in). All data (records, sessions, uploaded forms and
# laptop images) lives in PostgreSQL, so the container is stateless.
ENV PORT=8080

EXPOSE 8080
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# OpenShift runs the container with an arbitrary non-root UID that always belongs
# to group 0, so make /app (incl. the /app/data volume) group-0 owned and
# group-writable. This also keeps it non-root on plain Docker.
RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/data/uploads \
  && chgrp -R 0 /app \
  && chmod -R g=u /app

# Non-root. OpenShift overrides this with a random UID (still in group 0); on
# plain Docker it runs as 1001. Group-0 perms above make /app writable either way.
USER 1001

# Container-level liveness probe against the API health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
