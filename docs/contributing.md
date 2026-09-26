# Contributing

Start with [Quick start](quick-start.md) to prepare the environment and [Architecture](architecture.md) to identify the owner of a request. Run commands from the repository root.

## Where to change things

- Public pages and server rendering: `apps/api/Pages/`, `apps/api/Public/`.
- Admin APIs and catalog publication: `apps/api/Admin/`; persistence and migrations: `apps/api/Data/`, `apps/api/Migrations/`.
- Public interactive islands, admin SPA, shared React components and styles: `apps/api/ClientApp/src/`.
- Snapshot gateway and capture: `apps/api/Snapshots/`, `apps/snapshot-worker/`.
- Integration and browser coverage: `apps/api.tests/`, `tests/e2e/`; image generation: `scripts/generate-images.ts`.

Preserve the Razor/React boundary and the catalog-edit/snapshot-invalidation transaction. Avoid putting personalized search, inquiry or admin state into public snapshots. Use the existing MVC controller and Razor patterns rather than introducing a second public router.

## Checks

```sh
pnpm build
pnpm lint && pnpm check && pnpm typecheck
pnpm test
```

`pnpm build` restores NuGet packages before the .NET build. `pnpm test` runs .NET integration tests; `TEST_DATABASE_URL` must name a dedicated database ending `_test`. Tests create and remove a unique throwaway sibling database, not the configured application database. Keep PostgreSQL running for these tests.

With a running, seeded snapshot-mode gateway and published snapshots, also run:

```sh
pnpm test:e2e
pnpm lighthouse
```

The browser suite covers published pages, hydration/no-JavaScript fallbacks, live filtered search, and admin/CSRF behavior. Lighthouse covers four public routes, targeting 100 in each category. `pnpm images` regenerates responsive static variants and their manifest when source images change. `pnpm storybook` opens component stories.

For C#: `pnpm format:csharp` applies whitespace formatting; `pnpm check:csharp` verifies formatting and the handwritten 100-column limit; `pnpm lint:csharp` builds both projects with Roslyn analyzers. Root `check` and `lint` include these checks. `.editorconfig` and `CodeMetricsConfig.txt` set method, complexity, coupling and maintainability tripwires; generated migrations and build outputs are excluded from the handwritten line limit. Keep HTTP handlers, validation, persistence and publication in focused units without splitting every class behind an interface.

CI runs concurrent `quality` (build, static checks, isolated .NET tests), `browser` (build, seed, snapshots, Playwright and Lighthouse), and `containers` (both deployment images) jobs. Tests and snapshot outputs are not cached. For release and storage considerations, see [Operations](operations.md).
