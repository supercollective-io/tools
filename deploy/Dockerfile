# syntax=docker/dockerfile:1
FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS node
FROM node AS build
WORKDIR /app
RUN npm install --global --allow-scripts=pnpm pnpm@12.16.1 && node -p process.arch && pnpm --version
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/polymind/package.json apps/polymind/package.json
RUN --mount=type=cache,id=polymind-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --ignore-scripts --prefer-offline --store-dir /pnpm/store
COPY apps/polymind apps/polymind

FROM ghcr.io/astral-sh/uv:0.11.28@sha256:0f36cb9361a3346885ca3677e3767016687b5a170c1a6b88465ec14aefec90aa AS uv
FROM python:3.12.13-slim-bookworm@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2 AS runtime
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
COPY packages/match/pyproject.toml packages/match/pyproject.toml
COPY packages/match/src packages/match/src
COPY workers/matching workers/matching
RUN uv sync --project workers/matching --frozen --no-dev --no-editable --no-cache --python /usr/local/bin/python3
# Keep Node's extra shared library with the same pinned source image.
COPY --from=node /usr/lib/*-linux-gnu/libatomic.so.1.* /usr/local/lib/
RUN ldconfig && node --version && python --version && uv --version
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/polymind/node_modules ./apps/polymind/node_modules
COPY --from=build /app/apps/polymind/src ./apps/polymind/src
COPY --from=build /app/apps/polymind/package.json ./apps/polymind/package.json
COPY scripts/backup.mjs scripts/restore-check.mjs ./scripts/
RUN groupadd --gid 10001 polymind && useradd --uid 10001 --gid polymind --no-create-home polymind && mkdir /data && chown polymind:polymind /data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data/polymind MATCHING_PYTHON=/app/workers/matching/.venv/bin/python
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/polymind/src/session-cli.ts"]
