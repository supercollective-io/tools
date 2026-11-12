# syntax=docker/dockerfile:1
FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS base
WORKDIR /app
RUN npm install --global --allow-scripts=pnpm pnpm@12.18.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/puck/package.json apps/puck/package.json

FROM base AS build
RUN pnpm install --frozen-lockfile --filter puck
COPY apps/puck apps/puck
RUN pnpm --dir apps/puck build

FROM base AS production-dependencies
RUN pnpm install --frozen-lockfile --prod --filter puck

FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/puck.sqlite \
    PUCK_ROOM_CAPACITY=140 \
    PUCK_HTTP_MUTATION_LIMIT=240
WORKDIR /app/apps/puck
COPY --from=production-dependencies --chown=node:node /app/node_modules /app/node_modules
COPY --from=production-dependencies --chown=node:node /app/apps/puck/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/puck/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/puck/build ./build
COPY --from=build --chown=node:node /app/apps/puck/server ./server
COPY --from=build --chown=node:node /app/apps/puck/src/lib/core ./src/lib/core
RUN mkdir -p /data && chown node:node /data
COPY scripts/runtime-origin.mjs /app/runtime-origin.mjs
COPY --chmod=755 scripts/runtime-entrypoint.sh /app/runtime-entrypoint.sh
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["/app/runtime-entrypoint.sh", "PUBLIC_ORIGIN"]
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server/index.ts"]
