# syntax=docker.io/docker/dockerfile:1

FROM node:22-alpine AS base

# Step 1. Rebuild the source code only when needed
FROM base AS builder

WORKDIR /app

# Copy common package and build it
COPY common ./common
WORKDIR /app/common
RUN yarn install && yarn build

# Install site dependencies
WORKDIR /app
COPY site/package.json ./
COPY site/yarn.lock ./
# Fix the common package path for Docker context
RUN sed -i 's|"file:../common"|"file:./common"|g' package.json
# Omit --production flag for TypeScript devDependencies
RUN yarn install

COPY site/src ./src
COPY site/public ./public
COPY site/next.config.js .
COPY site/tsconfig.json .

# Buildtime.
#
# The DATABASE_* args that used to live here are gone. They existed because the
# Next build statically prerendered /flights, /pilots and /sites, each of which
# queries before reaching any dynamic API. That made the image build require
# network access to the production database — impossible from a CI runner, given
# the instance only allowlists two /32 addresses — and it baked the production DB
# password into an image layer, where it stays readable to anyone who can pull
# the image. The root layout now declares force-dynamic, so no page body runs at
# build time and no connection is opened.
#
# NEXT_PUBLIC_MAPBOX_TOKEN stays: NEXT_PUBLIC_* values are genuinely inlined into
# the client bundle at build time, and it is a publishable token by design.
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ENV NEXT_PUBLIC_MAPBOX_TOKEN=${NEXT_PUBLIC_MAPBOX_TOKEN}

# Build Next.js
RUN yarn build;

# Step 2. Production image, copy all the files and run next
FROM base AS runner

WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

CMD ["node", "server.js"]
