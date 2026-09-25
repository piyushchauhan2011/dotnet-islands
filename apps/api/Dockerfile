FROM node:26.10.0-bookworm-slim AS web-build
RUN npm install --global pnpm@12.6.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --dir apps/api/ClientApp exec vite build

FROM mcr.microsoft.com/dotnet/sdk:10.0.401 AS api-build
WORKDIR /repo
COPY . .
RUN dotnet publish apps/api/api.csproj --configuration Release --output /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=api-build /out ./
COPY --from=web-build /repo/apps/api/wwwroot/assets ./wwwroot/assets
RUN mkdir -p /data/assets /data/media /data/keys
ENV ASPNETCORE_URLS=http://+:8080 \
    MEDIA_DIR=/data/media \
    ASSET_DIR=/data/assets \
    DATA_PROTECTION_KEYS_DIR=/data/keys
EXPOSE 8080
# Keep old hashed assets on the persistent volume while snapshots or caches refer to them.
CMD ["sh", "-c", "cp -R -n /app/wwwroot/assets/. /data/assets/ && exec dotnet api.dll"]
