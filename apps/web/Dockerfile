FROM node:26.10.0-bookworm-slim AS web-build
RUN npm install --global pnpm@12.6.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --dir apps/web/ClientApp exec vite build

FROM mcr.microsoft.com/dotnet/sdk:10.0.401 AS api-build
WORKDIR /repo
COPY global.json Directory.Build.props CodeMetricsConfig.txt ./
COPY apps/web/api.csproj apps/web/
RUN dotnet restore apps/web/api.csproj
COPY . .
RUN dotnet publish apps/web/api.csproj --no-restore --configuration Release --output /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=api-build /out ./
COPY --from=web-build /repo/apps/web/wwwroot/assets ./wwwroot/assets
RUN mkdir -p /data/assets /data/media /data/keys
ENV ASPNETCORE_URLS=http://+:8080 \
    MEDIA_DIR=/data/media \
    ASSET_DIR=/data/assets \
    DATA_PROTECTION_KEYS_DIR=/data/keys
EXPOSE 8080
# Keep old hashed assets on the persistent volume while snapshots or caches refer to them.
CMD ["sh", "-c", "cp -R -n /app/wwwroot/assets/. /data/assets/ && exec dotnet api.dll"]
