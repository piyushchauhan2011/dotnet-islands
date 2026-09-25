FROM node:26.10.0-bookworm-slim AS build
RUN npm install --global pnpm@12.6.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --dir apps/api/ClientApp exec vite build

# The worker only launches headless Chromium; omit the full browser and other engines.
FROM node:26.10.0-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
RUN ./node_modules/.bin/playwright install --with-deps --only-shell chromium
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/apps/api/wwwroot/assets ./apps/api/wwwroot/assets
COPY --from=build /repo/apps/api/Pages ./apps/api/Pages
COPY --from=build /repo/apps/api/Public ./apps/api/Public
COPY --from=build /repo/apps/api/Assets ./apps/api/Assets
COPY --from=build /repo/apps/api/Snapshots ./apps/api/Snapshots
COPY --from=build /repo/apps/snapshot-worker ./apps/snapshot-worker
ENV NODE_ENV=production \
    SNAPSHOT_API_ORIGIN=http://api:8080
CMD ["node", "apps/snapshot-worker/worker.mjs"]
