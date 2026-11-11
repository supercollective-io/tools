FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS build

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/puck.sqlite \
    PUCK_ROOM_CAPACITY=140 \
    PUCK_HTTP_MUTATION_LIMIT=240

WORKDIR /app
RUN npm install --global pnpm@12.18.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod=false
COPY . .
RUN pnpm build \
    && pnpm prune --prod

FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/puck.sqlite \
    PUCK_ROOM_CAPACITY=140 \
    PUCK_HTTP_MUTATION_LIMIT=240

WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/src/lib/core ./src/lib/core
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server/index.ts"]
