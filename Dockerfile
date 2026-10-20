# Multi-stage Dockerfile for CollectFlow Frontend (TanStack Start on Node.js 22 SSR)
ARG NODE_VERSION=22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

# Copy dependency manifests strictly (lockfile required for deterministic builds)
COPY package.json package-lock.json ./

# Strict deterministic dependency installation (fails if lockfile is missing or out of sync)
RUN npm ci

# Copy source tree
COPY . .

# Build portable Node SSR bundle
ENV NODE_ENV=production
ENV NITRO_PRESET=node-server
ENV VITE_API_MODE=live
ENV VITE_API_BASE_URL=""

RUN npm run build

# Stage 2: Minimal production runtime stage
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="collectflow-frontend" \
      org.opencontainers.image.description="CollectFlow SSR Frontend" \
      org.opencontainers.image.source="https://github.com/AnishB-Personal/cash-flow-buddy-101" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.vendor="CollectFlow"

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Create unprivileged system user and group, and prune development tools from runner stage
RUN addgroup -g 10001 -S collectflow && \
    adduser -u 10001 -S collectflow -G collectflow && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Copy production artifacts from builder
COPY --from=builder --chown=collectflow:collectflow /app/.output .output

# Switch to non-root user
USER collectflow

# Expose internal port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

# Start portable Nitro SSR server
CMD ["node", ".output/server/index.mjs"]
