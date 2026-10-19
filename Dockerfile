# Multi-stage Dockerfile for CollectFlow Frontend (TanStack Start on Node.js 22 SSR)

# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install all dependencies required for the build
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source tree
COPY . .

# Build portable Node SSR bundle
ENV NODE_ENV=production
ENV NITRO_PRESET=node-server
ENV VITE_API_MODE=live
ENV VITE_API_BASE_URL=""

RUN npm run build

# Stage 2: Minimal production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Create unprivileged system user and group
RUN addgroup -g 10001 -S collectflow && \
    adduser -u 10001 -S collectflow -G collectflow

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
