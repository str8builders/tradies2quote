# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# tradies2quote — production container for self-hosting on a VPS.
# Multi-stage build against Next.js 16 `output: "standalone"`.
#
# NOTE: NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time,
# so they must be passed as --build-arg (see docker-compose.yml `args:`).
# Server-only secrets (service role, API keys) are injected at RUN time via
# the compose `env_file:` and must NOT be baked into the image.
# ---------------------------------------------------------------------------

FROM node:22-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---- deps: install with a warm, cacheable layer -----------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile the standalone server ---------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public (client-inlined) build-time config. Provided via compose build args.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_T2Q_WEATHER_IMPACT
ARG NEXT_PUBLIC_T2Q_WEATHER_PLANNING
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_PUBLIC_T2Q_WEATHER_IMPACT=$NEXT_PUBLIC_T2Q_WEATHER_IMPACT \
    NEXT_PUBLIC_T2Q_WEATHER_PLANNING=$NEXT_PUBLIC_T2Q_WEATHER_PLANNING \
    NODE_ENV=production \
    # Opt into the standalone server bundle (next.config.ts gates `output:
    # "standalone"` on this so `next start` deploys stay unaffected).
    BUILD_STANDALONE=1

RUN npm run build

# ---- runner: minimal runtime image ------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs nextjs

# Standalone server + static assets + public/ (traced runtime only).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
# The standalone server entrypoint Next emits at the project root.
CMD ["node", "server.js"]
