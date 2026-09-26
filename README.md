# Elsewhere hotel catalog

An ASP.NET Core 10 hotel catalog with Razor Pages for public content, React islands for interactive controls, and a protected React admin. A Playwright worker publishes public HTML snapshots to PostgreSQL; visitors do not wait for browser rendering. Booking is an **inquiry**, not a reservation or payment.

## Start here

Install the pinned .NET, Node and pnpm versions (`mise install`), Docker with Compose, and Playwright Chromium. From the repository root:

```sh
cp .env.example .env
# Set matching database passwords in POSTGRES_PASSWORD, DATABASE_URL and TEST_DATABASE_URL;
# replace SNAPSHOT_INTERNAL_TOKEN and ADMIN_PASSWORD before starting.
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
docker compose --env-file .env up -d postgres
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm dev:snapshots
```

Open http://localhost:5000 after the worker publishes the initial snapshots. For Vite HMR without snapshots, use `pnpm dev` instead.

## Documentation

- [Quick start](docs/quick-start.md) — setup, development modes, and first-run troubleshooting.
- [Architecture](docs/architecture.md) — request ownership, snapshots, islands, and data flow.
- [Contributing](docs/contributing.md) — code layout, checks, tests, and change boundaries.
- [Operations](docs/operations.md) — deployment, persistence, security, and publication maintenance.
