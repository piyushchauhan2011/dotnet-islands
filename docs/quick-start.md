# Quick start

Run commands from the repository root. For system design, see [Architecture](architecture.md); for checks and code ownership, see [Contributing](contributing.md).

## Prerequisites

- .NET SDK 10.0.401, Node 26.10.0, pnpm 12.6.0 (pinned in `mise.toml`; `mise install` can install them).
- Docker with Compose for PostgreSQL.
- Playwright Chromium for local snapshot publishing.

## Prepare the database and catalog

```sh
cp .env.example .env
# Edit .env: use the same password in POSTGRES_PASSWORD, DATABASE_URL and TEST_DATABASE_URL.
# Replace SNAPSHOT_INTERNAL_TOKEN (generate with openssl rand -hex 32) and ADMIN_PASSWORD.
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
docker compose --env-file .env up -d postgres
pnpm build
pnpm db:migrate
pnpm db:seed
```

Keep `TEST_DATABASE_URL` pointed at a separate database ending in `_test`, not the application database. `pnpm db:seed` creates the initial admin only if none exists and preserves edited catalog rows on subsequent runs. The reference fixture reuses a hero image for many records; replace it through the admin media editor as needed. The seed creates no guest inquiries.

## Run the app

For published public pages (the production-like path):

```sh
pnpm dev:snapshots
```

This builds the Vite manifest, then starts .NET and the continuous Chromium worker. Open http://localhost:5000 after initial captures finish. A new canonical URL returns 503 with `Retry-After` until its first snapshot is published; `/health` and APIs remain available. Use `pnpm snapshots:all` **only with the continuous worker stopped** to drain a finite queue.

For live Razor development and Vite HMR, instead run:

```sh
pnpm dev
```

The .NET app runs at http://localhost:5000 and Vite serves assets at http://localhost:3000. Vite is not a separate public app or router. This mode does not require the snapshot worker. If you rebuild assets while the .NET server is already running in snapshot mode, restart the server to reload its manifest. Keep previous hashed assets while existing snapshots reference them.

If a newly published URL remains 503, check the worker log and snapshot job table: failed captures back off and never publish partial HTML. See [Operations](operations.md) for deployment and recovery notes.
