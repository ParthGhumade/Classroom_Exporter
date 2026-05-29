FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json ./
COPY lib ./lib
COPY artifacts ./artifacts
RUN pnpm install --frozen-lockfile

FROM deps AS build
ENV PORT=10000
ENV BASE_PATH=/
RUN pnpm --filter @workspace/classroom-exporter build
RUN pnpm --filter @workspace/api-server build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json ./
COPY lib ./lib
COPY artifacts/api-server ./artifacts/api-server
COPY artifacts/classroom-exporter/dist ./artifacts/classroom-exporter/dist

RUN pnpm install --prod --frozen-lockfile

EXPOSE 10000
CMD ["node", "artifacts/api-server/dist/index.mjs"]
