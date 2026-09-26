# Architecture

One ASP.NET Core application owns public Razor Pages, JSON APIs, static assets, and the protected admin document. PostgreSQL stores the catalog and published HTML; a separate Go/chromedp worker captures pages. See [Quick start](quick-start.md) to run both processes.

## Request ownership

| Surface | Implementation | Delivery policy |
| --- | --- | --- |
| `/`, `/destinations`, destination/hotel/offer pages, `/blog`, posts, bare `/search` | Razor page, then PostgreSQL Chromium snapshot | Canonical public HTML; 60-second public cache plus revalidation |
| `/search?...` | Razor results and independent React filters | Live, private/no-store; `noindex,follow` |
| `/inquire?hotel=...` | Razor stay context and React form | Private/no-store, noindex; CSRF-protected submission |
| `/admin/login`, `/admin/*` | Razor document guard and admin-root React Router | Private/no-store, noindex; protected MVC APIs |
| `/api/*`, `/media/{id}/{variant}` | Attribute-routed MVC controllers | JSON or allowlisted image variants |

Razor owns the article and catalog content, hero/cards, metadata, canonical URL and JSON-LD. React mounts only the interactive public islands (search/date controls, mobile navigation, gallery, inquiry form); it does not route public pages. Search results, sort/pagination GET forms, gallery links and catalog content remain available without JavaScript, while interactive filters and inquiry submission require it. The admin SPA alone uses React Router, including Back/Forward navigation; login, logout and expired sessions replace the document so the Razor guard runs again.

## Publication flow

```text
Admin catalog edit ── EF transaction ──> catalog + affected snapshot jobs (PostgreSQL)
                                         │
                                         v
                              chromedp worker leases a job
                                         │
                                         v
                    token-protected Razor /_snapshot-source route
                                         │
                                         v
                         wait for islands → capture complete HTML
                                         │
                                         v
                        atomically publish if job version matches
                                         │
                                         v
                        gateway serves snapshot to public visitor
```

The worker does not render during visitor requests. It waits for independent islands to mount and keeps the complete document and CSS. For islands with Razor fallbacks, published HTML retains one fallback and an empty island marker; JavaScript replaces the fallback on mount. Search facets, inquiries and admin state are never put into shared snapshots. Edits queue affected routes in the same EF transaction as catalog publication. An old complete snapshot stays available during regeneration; a new URL returns 503 until its first capture. Unpublished or renamed URLs are removed immediately, return 404, and disappear from the live sitemap. The gateway also serves `robots.txt` and `sitemap.xml` from the published catalog.

## Data and security boundaries

- `apps/api/Pages/` and `apps/api/Public/` implement public Razor/API behavior; `apps/api/Snapshots/` gates snapshot responses. `apps/snapshot-worker/main.go` and `capture.go` capture and publish.
- `apps/api/Data/` and `apps/api/Migrations/` hold EF persistence; `apps/api/Admin/` handles admin APIs, catalog edits, media, and invalidation. `apps/api/ClientApp/src/islands/` contains public mounts; `src/admin/` contains the admin SPA.
- Admin login uses a 12-hour HttpOnly SameSite cookie with persistent Data Protection keys. Protected APIs recheck the cookie user against the database and require double-submit CSRF for writes.
- The source route requires `X-Snapshot-Token` matching `SNAPSHOT_INTERNAL_TOKEN` and rejects unknown paths. Keep that route inaccessible at the public ingress too. Media originals and generated WebP variants live under `MEDIA_DIR`; persist the directory with the database.

Deployment details are in [Operations](operations.md).
