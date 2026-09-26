# Operations

See [Quick start](quick-start.md) for a local first run and [Architecture](architecture.md) for the publication flow.

## Container deployment

Set strong, distinct database/admin credentials, `ASPNETCORE_ENVIRONMENT=Production`, and `PUBLIC_ORIGIN` to the externally reachable HTTPS origin. Supply a shared `SNAPSHOT_INTERNAL_TOKEN` of at least 32 characters to both API and worker. Then build and start the services:

```sh
docker compose --env-file .env up --build -d
```

`compose.yaml` points the worker's `SNAPSHOT_API_ORIGIN` at the internal API (`http://api:8080`), not the public origin. It binds API and PostgreSQL ports to localhost; configure public ingress separately. Block `/_snapshot-source` at that ingress as a second boundary; the app also requires `X-Snapshot-Token` and rejects unknown paths. Run the initial migration/seed and finish snapshot publication before directing production traffic to public pages. The compose startup does not run migrations or seed for you; run the repository's `pnpm db:migrate` and `pnpm db:seed` against the intended database, then let the continuous worker drain its queue. For a one-off drain, stop the continuous worker before running `pnpm snapshots:all`.

Deploy API and worker images from the same source together. The worker rejects captures if its Vite manifest does not match the API. Rebuild the worker image when upgrading Playwright so the installed Chromium headless shell matches the pinned package. Local runs instead need `pnpm exec playwright install chromium`.

## Persistent state and recovery

Keep PostgreSQL data, uploaded media (`MEDIA_DIR`), Data Protection keys (`DATA_PROTECTION_KEYS_DIR`), and hashed assets across releases. Compose mounts `postgres_data`, `media_data`, `protection_keys`, and `asset_data`; the API uses `/data/media`, `/data/keys`, and `/data/assets`. Old hashed assets must remain available while stored or cached snapshots reference them; locally these are in `apps/api/wwwroot/assets`. The server reads the Vite manifest on startup, so restart it after an asset rebuild.

If an image's file is missing, its database metadata cannot recreate it: re-upload the original and replace the old image path in affected content. If a new page stays 503, inspect worker logs and snapshot jobs; failed captures back off and do not publish partial HTML. Existing pages keep their last complete capture until a replacement is ready. Unpublished content is a real 404 and is removed from the sitemap. Admin seeding never rotates an existing user's credentials or overwrites edited catalog records.
