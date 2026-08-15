# syntax=docker.io/docker/dockerfile:1

FROM node:24-alpine as base

WORKDIR /app

# Install site dependencies (without common package for dev)
COPY site/package.json .
COPY site/yarn.lock .
# Remove common package dependency for development
RUN sed -i '/"@ploufbag\/common":/d' package.json
RUN yarn install

COPY site/src ./src
COPY site/public ./public
COPY site/next.config.js .
COPY site/tsconfig.json .

# Next.js collects completely anonymous telemetry data about general usage. Learn more here: https://nextjs.org/telemetry
# Uncomment the following line to disable telemetry at run time
# ENV NEXT_TELEMETRY_DISABLED 1

# Note: Don't expose ports here, Compose will handle that for us

# Start Next.js in development mode based on the preferred package manager
CMD yarn dev
