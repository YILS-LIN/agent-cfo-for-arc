# syntax=docker/dockerfile:1.7
FROM node:22.17.0-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM dependencies AS builder
WORKDIR /app
COPY . .
RUN pnpm build
RUN pnpm verify:standalone
RUN mkdir -p /opt/runtime-fonts && \
  cp -LR node_modules/@expo-google-fonts/noto-sans-sc /opt/runtime-fonts/noto-sans-sc

FROM dependencies AS migrate
WORKDIR /app
COPY . .
CMD ["pnpm", "db:migrate"]

FROM node:22.17.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /opt/runtime-fonts/noto-sans-sc ./node_modules/@expo-google-fonts/noto-sans-sc
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/ready >/dev/null || exit 1
CMD ["node", "server.js"]
