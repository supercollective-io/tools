FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 HUB_DATA_DIR=/data
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY --chown=node:node apps/hub/package.json apps/hub/server.mjs apps/hub/pairing.mjs apps/hub/invitations.mjs apps/hub/run-profiles.mjs ./
COPY --chown=node:node apps/hub/profiles ./profiles
COPY --chown=node:node apps/hub/public ./public
COPY scripts/runtime-origin.mjs /app/runtime-origin.mjs
COPY --chmod=755 scripts/runtime-entrypoint.sh /app/runtime-entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["/app/runtime-entrypoint.sh", "HUB_PUBLIC_ORIGIN"]
CMD ["node", "server.mjs"]
