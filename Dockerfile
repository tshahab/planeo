FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV npm_config_store_dir="/pnpm/store"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm db:generate

FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:generate && pnpm db:deploy && pnpm db:seed && pnpm dev --hostname 0.0.0.0"]

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm exec prisma validate
RUN pnpm exec eslint src
RUN pnpm exec tsc --noEmit
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm build

FROM node:22-alpine AS production
ENV NODE_ENV="production"
ENV HOSTNAME="0.0.0.0"
ENV PORT="3000"
WORKDIR /app
RUN mkdir -p /app/storage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD node -e "fetch('http://localhost:3000/api/health/ready').then(response => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "server.js"]
