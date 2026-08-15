FROM node:22-alpine

WORKDIR /app

# Install build tools needed for some dependencies
RUN apk add --no-cache python3 make g++

# Install common package dependencies and build it
COPY common/package.json ./common/package.json
COPY common/yarn.lock ./common/yarn.lock
COPY common/tsconfig.json ./common/tsconfig.json
WORKDIR /app/common
RUN yarn install

# Copy common source and build it
COPY common/src ./src
RUN yarn build

# Install functions dependencies
WORKDIR /app
COPY functions/package.json ./
COPY functions/yarn.lock ./
# Remove common package dependency for development and install
RUN sed -i '/"@ploufbag\/common":/d' package.json
RUN yarn install

# Create node_modules symlink to built common package
RUN mkdir -p node_modules/@ploufbag
RUN ln -sf /app/common node_modules/@ploufbag/common

# Copy source files
COPY functions/src ./src
COPY functions/dev.tsconfig.json .
COPY functions/tsconfig.json .