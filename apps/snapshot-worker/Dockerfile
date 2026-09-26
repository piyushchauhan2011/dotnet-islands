FROM node:26.10.0-bookworm-slim AS assets
RUN npm install --global pnpm@12.6.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/api/ClientApp ./apps/api/ClientApp
RUN pnpm --dir apps/api/ClientApp exec vite build

FROM golang:1.26.5-bookworm AS worker-build
WORKDIR /repo/apps/snapshot-worker
COPY apps/snapshot-worker/go.mod apps/snapshot-worker/go.sum ./
RUN go mod download
COPY apps/snapshot-worker/main.go apps/snapshot-worker/capture.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /snapshot-worker .

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=worker-build /snapshot-worker /app/snapshot-worker
COPY --from=assets /repo/apps/api/wwwroot/assets ./apps/api/wwwroot/assets
COPY apps/api/Pages ./apps/api/Pages
COPY apps/api/Public ./apps/api/Public
COPY apps/api/Assets ./apps/api/Assets
COPY apps/snapshot-worker/go.mod apps/snapshot-worker/go.sum ./apps/snapshot-worker/
COPY apps/api/Snapshots ./apps/api/Snapshots
COPY apps/snapshot-worker/main.go apps/snapshot-worker/capture.go ./apps/snapshot-worker/
ENV SNAPSHOT_API_ORIGIN=http://api:8080
CMD ["/app/snapshot-worker"]
