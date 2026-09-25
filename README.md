# Elsewhere hotel catalog

One ASP.NET Core 10 application serves the public Razor Pages, JSON APIs, static assets, and the protected admin React SPA. React is independently mounted only where visitors interact: search/date controls, mobile navigation, gallery, and inquiries. A separate Playwright/Chromium worker publishes completed public HTML to PostgreSQL; visitors never wait for a browser render. Booking is an **inquiry**, not a reservation or payment.

## Requirements and first run

Install .NET SDK 10.0.401, Node 26.10.0, pnpm 12.6.0, Docker with Compose, and Chromium for Playwright (`pnpm exec playwright install chromium`). `mise install` can install the pinned toolchains. Run from the repository root:

```sh
cp .env.example .env
# Set the same database password in POSTGRES_PASSWORD, DATABASE_URL, and TEST_DATABASE_URL.
# Replace SNAPSHOT_INTERNAL_TOKEN (openssl rand -hex 32) and ADMIN_PASSWORD.
pnpm install --frozen-lockfile
docker compose --env-file .env up -d postgres
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm dev:snapshots
```

`pnpm dev:snapshots` builds the current Vite manifest, then starts the .NET server and the worker; the worker drains the initial queue automatically. Run `pnpm snapshots:all` only when the continuous worker is stopped and you want to drain a finite queue. Public canonical URLs return 503 with `Retry-After` until their first snapshot is published; `/health` and APIs stay available. If the server was already running, restart it after rebuilding assets so it reads the new manifest. `pnpm dev` runs .NET and Vite on ports 5000/3000 with HMR and serves Razor Pages live; it does not require the snapshot worker. The Vite server is an asset development server, **not** another public app/router.

For a container deployment, set strong distinct credentials, `ASPNETCORE_ENVIRONMENT=Production`, `PUBLIC_ORIGIN` to the externally reachable HTTPS origin, persistent PostgreSQL/media/data-protection-key volumes, and run `docker compose --env-file .env up --build -d`. The api and worker images build the same manifest; retain previous hashed assets while cached or stored snapshots reference them. API/worker startup requires a 32+ character shared internal token in snapshot mode. Point the worker's `SNAPSHOT_API_ORIGIN` to the internal .NET service, not the public hostname. Block `/_snapshot-source` at the public ingress as a second boundary; the application also requires `X-Snapshot-Token` and rejects unknown paths. The initial migration/seed and `pnpm snapshots:all` must finish before routing production traffic to the public pages.

## Routes and publication

| Surface | Owner | Cache/index policy |
| --- | --- | --- |
| `/`, `/destinations`, `/destinations/{slug}`, `/hotels/{slug}`, hotel offers, `/blog`, blog posts, bare `/search` | Razor page + PostgreSQL Chromium snapshot | Canonical HTML; public cache (60 s plus revalidation) |
| `/search?...` | Razor page + independent React filters | Live results, `noindex,follow`; private, no-store |
| `/inquire?hotel=...` | Razor page + React form | Private, no-store, noindex; CSRF-protected POST |
| `/admin/login`, `/admin/*` | Razor document guard + React Router (admin root only); protected MVC APIs | Private, no-store, noindex |
| `/api/*`, `/media/{id}/{variant}` | Attribute-routed .NET MVC JSON controllers; allowlisted image variants | API responses or immutable image variants |

The search page renders hotel cards in Razor beside a filter island; results use two columns on desktop and one on mobile. Sorting is a progressively enhanced GET form and pagination uses ordinary links, so both still work without JavaScript.

Razor renders the article, catalog, hero, cards, metadata, canonical URL, and JSON-LD. The worker visits a token-protected Razor source route, waits for every independent island to mount, preserves the complete document and CSS, and records versioned HTML atomically only if the leased job version still matches. The browser capture does not run in a visitor request. Changes from the CMS transactionally queue affected routes and immediately remove unpublished/renamed URLs. An existing complete snapshot remains available during regeneration; a new route is 503 until its first capture. Unpublished content is removed from the live sitemap and is a real 404. Search facets and inquiry/admin state are never copied into shared snapshots. A generated snapshot contains React island markup and the matching island runtime; without JavaScript the catalog and fallback mobile navigation/search form remain navigable.

Admin login uses a 12-hour HttpOnly SameSite cookie backed by persistent .NET Data Protection keys and a double-submit CSRF token. JSON endpoints use MVC controllers; protected admin actions recheck the cookie's user against the database and require CSRF for writes. Catalog publication and snapshot invalidation share one EF transaction. The initial admin credentials seed only when no admin exists; reseeding does not rotate them or overwrite edited catalog rows. Uploaded media and keys must live on persistent storage.

The `/admin` React root uses React Router for Overview, inbox, media and catalog list/editor navigation, including browser Back/Forward. In-app links and mutations re-fetch protected API data without a document reload; login, logout and expired API sessions replace the full document so the Razor `AdminPageModel` guard runs again. Public Razor links and React islands are not routed through the admin SPA. The admin pages retain the shared Razor site header/footer, private/no-store and noindex policies, and no canonical URLs; login displays a JavaScript-required notice without scripting.

The reference fixture uses the same hero photograph for most generated destinations, hotels, offers, and posts. Replace those placeholder images per record through the admin media editor; reseeding preserves existing catalog edits.

The media library stores originals and generated WebP variants under `MEDIA_DIR`.
Keep that directory or its Docker volume with the database across deployments.
If a library entry reports a missing file, its database metadata cannot recreate
the image: re-upload the original and replace its old image path in affected
content.

The `/destinations` index uses the shared destination cards in a three-, two-, or one-column grid as the viewport narrows; destination detail pages keep their full-bleed hero.

Hotel details use a cropped, interactive gallery with direct image links without JavaScript, followed by highlights, room cards, grouped facilities, nearby places, native expandable FAQs, guest reviews and room-specific inquiry links. The layouts stack without horizontal overflow on mobile.

Offer details pair the hotel photo with dates and a direct inquiry action, followed by the offer terms, benefits and a second request card. Both actions preserve the selected offer in the inquiry URL; the page is readable without JavaScript and stacks on mobile.

The `/inquire` page keeps the selected hotel, room and offer beside the request form on desktop, then stacks the stay context above the form on mobile. It renders the selected stay and a JavaScript-disabled notice in Razor; date selection and submission hydrate in the form island.

The `/blog` index features its first story with image and excerpt side by side, then uses two-column story cards (stacked on mobile); article pages use a full-width hero and centered rich content, including published hotel embeds.

## Verification and maintenance

```sh
pnpm build
pnpm lint && pnpm check && pnpm typecheck
pnpm test                     # .NET tests create and drop their own DB under TEST_DATABASE_URL
pnpm test:e2e                # requires a running snapshot-mode gateway + seeded snapshots
pnpm lighthouse              # four public routes; target 100 in each category
pnpm snapshots:all           # drain publish queue after a release/edit
```

`TEST_DATABASE_URL` must point to a dedicated database whose name ends `_test`; integration tests create a unique throwaway sibling database and delete only that database. The browser suite exercises the published pages, hydration/no-JavaScript fallback, filtered live search and protected admin/CSRF behavior. `pnpm images` regenerates responsive static image variants and the image manifest. The Vite manifest is read once on server startup; retain old content hashes in `wwwroot/assets` locally and the persistent `/data/assets` volume in containers so cached snapshots can still load them. Inspect the worker log/job table if a new route stays 503: failed captures back off and do not publish partial HTML. An existing page keeps serving its last complete capture until a replacement is ready. `robots.txt` and `sitemap.xml` are served by the gateway from the published catalog.

### C# quality

`pnpm format:csharp` applies `dotnet format whitespace` to the API and integration
tests. `pnpm check:csharp` verifies that formatting and rejects handwritten `.cs`
lines over 100 columns; wrap long expressions manually because `dotnet format`
does not enforce line length. `pnpm lint:csharp` builds both projects with Roslyn
analyzers. The root `pnpm check` and `pnpm lint` commands run these C# gates
alongside the existing frontend checks, including in CI. Run from the repository
root; restore is automatic. EF-generated migrations and build outputs are excluded
from the handwritten column limit.

`.editorconfig` enforces formatting, a 60-line/40-statement method limit, and
bounded regex execution. `CodeMetricsConfig.txt` limits cyclomatic complexity to
15, class coupling to 60 types, method coupling to 30 types, and sets the
maintainability-index floor to 10. These are review tripwires, not a substitute
for SOLID: keep HTTP handlers, validation, persistence, and publication in
focused units; depend on abstractions at external I/O boundaries rather than
adding one interface per class; preserve observable routes and transaction
boundaries when extracting helpers.
