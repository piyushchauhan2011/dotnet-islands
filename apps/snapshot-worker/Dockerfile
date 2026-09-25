FROM node:26.10.0-bookworm-slim AS build
RUN npm install --global pnpm@12.6.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --dir apps/api/ClientApp exec vite build

# Playwright's image includes the Chromium revision paired with playwright 1.62.1.
FROM mcr.microsoft.com/playwright:v1.62.1-noble
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/apps/api/wwwroot/assets ./apps/api/wwwroot/assets
COPY --from=build /repo/apps/api/Pages ./apps/api/Pages
COPY --from=build /repo/apps/api/Public ./apps/api/Public
COPY --from=build /repo/apps/api/Assets ./apps/api/Assets
COPY --from=build /repo/apps/api/Snapshots ./apps/api/Snapshots
COPY --from=build /repo/apps/snapshot-worker ./apps/snapshot-worker
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    SNAPSHOT_API_ORIGIN=http://api:8080
CMD ["node", "apps/snapshot-worker/worker.mjs"]
