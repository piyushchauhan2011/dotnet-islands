FROM node:26.10.0-bookworm-slim AS build
RUN npm install --global pnpm@12.6.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --dir apps/web/ClientApp exec vite build

# The worker only launches headless Chromium; omit the full browser and other engines.
FROM node:26.10.0-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
RUN ./node_modules/.bin/playwright install --with-deps --only-shell chromium
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/apps/web/wwwroot/assets ./apps/web/wwwroot/assets
COPY --from=build /repo/apps/web/Pages ./apps/web/Pages
COPY --from=build /repo/apps/web/Public ./apps/web/Public
COPY --from=build /repo/apps/web/Assets ./apps/web/Assets
COPY --from=build /repo/apps/web/Snapshots ./apps/web/Snapshots
COPY --from=build /repo/apps/snapshot-worker ./apps/snapshot-worker
ENV NODE_ENV=production \
    SNAPSHOT_API_ORIGIN=http://api:8080
CMD ["node", "apps/snapshot-worker/worker.mjs"]
