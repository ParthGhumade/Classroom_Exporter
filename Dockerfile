FROM node:22-slim AS base
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

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json ./
COPY lib ./lib
COPY --from=build /app/artifacts/api-server ./artifacts/api-server
COPY --from=build /app/artifacts/classroom-exporter/dist ./artifacts/classroom-exporter/dist

RUN pnpm install --prod --frozen-lockfile

USER node
EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:10000/api/healthz', (r) => { if (r.statusCode !== 200) process.exit(1) }).on('error', () => process.exit(1))"

CMD ["node", "artifacts/api-server/dist/index.mjs"]
