# ── Build stage: compile TypeScript to dist/ ─────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ── Runtime stage: production dependencies + compiled JS only ────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist

# Run as the unprivileged "node" user
USER node
EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/health || exit 1

# Run migrations as a separate release step: `docker compose run --rm backend npm run migrate`
CMD ["node", "dist/server.js"]
