# MEKANIX — Production Dockerfile
# Multi-stage build: install deps → build → run standalone server

# ─── Stage 1: Install dependencies ───
FROM node:20-slim AS deps
WORKDIR /app

# Install bun
RUN npm install -g bun

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ─── Stage 2: Build application ───
FROM node:20-slim AS builder
WORKDIR /app

RUN npm install -g bun

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN bunx prisma generate

# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js
RUN bun run build

# ─── Stage 3: Production runner ───
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma files for migration
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migration then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
