# Dockerfile for Pricewatch
# Multi-stage build: install deps, build, then copy to a slim runtime image.

# ---- Build stage ----
FROM oven/bun:1.3 AS builder

WORKDIR /app

# Copy lockfile + package.json first for better layer caching
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy the rest of the source
COPY . .

# Build the standalone Next.js bundle
# Note: you must pass DATABASE_URL at build time for Prisma to generate
# the client. Use a placeholder; the real URL is set at runtime.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN bun run db:generate
RUN bun run build

# ---- Runtime stage ----
FROM oven/bun:1.3-slim AS runtime

WORKDIR /app

# Install just the standalone server files
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# Run migrations on startup, then start the server
CMD ["sh", "-c", "bunx prisma db push --skip-generate && bun server.js"]
