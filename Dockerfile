# Multi-stage production build for backend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install all dependencies including devDependencies for TypeScript compilation
RUN npm ci

# Copy source code and config
COPY . .

# Multi-stage runner image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy tsx and source files
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

# Run with unprivileged user for security
USER node

EXPOSE 5000

CMD ["npx", "tsx", "src/server.ts"]
