# Operations

See [Quick start](quick-start.md) for a local first run and [Architecture](architecture.md) for the publication flow.

## Container deployment

Set strong, distinct database/admin credentials, `ASPNETCORE_ENVIRONMENT=Production`, and `PUBLIC_ORIGIN` to the externally reachable HTTPS origin. Supply a shared `SNAPSHOT_INTERNAL_TOKEN` of at least 32 characters to both API and worker. Then build and start the services:

```sh
docker compose --env-file .env up --build -d
```

`compose.yaml` points the worker's `SNAPSHOT_API_ORIGIN` at the internal API (`http://api:8080`), not the public origin. It binds API and PostgreSQL ports to localhost; configure public ingress separately. Block `/_snapshot-source` at that ingress as a second boundary; the app also requires `X-Snapshot-Token` and rejects unknown paths. Run the initial migration/seed and finish snapshot publication before directing production traffic to public pages. The compose startup does not run migrations or seed for you; run the repository's `pnpm db:migrate` and `pnpm db:seed` against the intended database, then let the continuous worker drain its queue. For a one-off drain, stop the continuous worker before running `pnpm snapshots:all`.

Deploy API and worker images from the same source together. The worker rejects captures if its Vite manifest does not match the API. Rebuild the worker image when upgrading Playwright so the installed Chromium headless shell matches the pinned package. Local runs instead need `pnpm exec playwright install chromium`.

CI builds both container images to validate their Dockerfiles; it does not push or retain the images. The container job deliberately does not export a remote build cache because exporting its large .NET and Playwright layers took longer than building them in the measured run.

## Local HTTPS Lighthouse audit (DDEV)

The simplest local HTTPS flow, after the [quick start](quick-start.md), uses two terminals:

```sh
# Terminal 1: only if the API is not already running on port 5000
make audit-app
# Terminal 2: once /health responds on port 5000
make https
make lighthouse-https
```

`make audit-app` runs the host API and worker in the foreground with `PUBLIC_ORIGIN=https://hotel-ssr-audit.ddev.site` and `API_LISTEN_URL=http://0.0.0.0:5000`. Start PostgreSQL first as in the quick start. If Compose already runs the API and worker, do **not** start a second API: `make https` proxies the existing port 5000. To publish correct HTTPS canonical URLs with Compose, set `PUBLIC_ORIGIN=https://hotel-ssr-audit.ddev.site` in `.env`, then recreate API and worker with `docker compose --env-file .env up -d --no-deps --force-recreate api snapshot-worker`.

The optional `.ddev` project is an HTTPS reverse proxy for the **published snapshot** app; it does not run the API or replace the repository's PostgreSQL. DDEV terminates TLS at its router and forwards through nginx to the host API at `host.docker.internal:5000`. The equivalent manual host command is:

```sh
PUBLIC_ORIGIN=https://hotel-ssr-audit.ddev.site API_LISTEN_URL=http://0.0.0.0:5000 pnpm dev:snapshots
```

Wait for the first snapshot publications (or the origin-change republish of existing snapshots) before auditing. The worker fingerprints `PUBLIC_ORIGIN` so a restart with the HTTPS origin queues previously published pages for regeneration; until it finishes, old HTML can still contain the previous canonical links. The host API must bind beyond loopback to be reachable from DDEV's container; `0.0.0.0:5000` also exposes it to your LAN unless a host firewall blocks it. Use only on a trusted local network; stop the process afterward. The nginx proxy returns 404 for `/_snapshot-source` and does not cache or bundle CSS/JS. Do not use Vite HMR mode for these measurements: its development assets and localhost URLs are not representative.

Verify the HTTPS endpoint and negotiated protocol before measuring (DDEV must have installed/trusted its local certificate):

```sh
curl --fail --silent --show-error https://hotel-ssr-audit.ddev.site/health
curl -s -o /dev/null -w '%{http_version}\n' --http2 https://hotel-ssr-audit.ddev.site/
make lighthouse-https
```

The second command should report `2` for HTTP/2; avoid `-k` or Chrome certificate-ignoring flags, which change the audit. If local curl lacks HTTP/2 support, inspect the Protocol column in Chromium DevTools Network instead. DDEV's HTTPS endpoint does not imply HTTP/3: verify HTTP/3 separately with a QUIC-capable ingress/client before attributing any score difference to it. Lighthouse reports are written to `.lighthouseci/`. Compare repeated runs with the same machine, Chrome, page content, and Lighthouse settings; local proxy latency and certificate trust affect results. Without `LIGHTHOUSE_ORIGIN`, CI continues to audit `http://127.0.0.1:5000`.

`pnpm lighthouse` runs the repository's desktop preset and is **not** the same experiment as DevTools with Slow 4G/advanced throttling. CI collects three runs per URL and asserts against the representative (median) run: performance must be at least 90, accessibility/best practices/SEO must be 100, LCP at most 2.5 seconds, and CLS at most 0.1. A single perfect performance score is too sensitive to CI runner load. The browser job uploads `.lighthouseci` reports as a `lighthouse-reports` artifact even if assertions fail, so inspect the metric breakdown before changing thresholds. To inspect one desktop URL with a repeatable network/CPU profile instead of the CI assertions, run:

```sh
pnpm exec lhci collect --url=https://hotel-ssr-audit.ddev.site/hotels/jayanagar-common-house --numberOfRuns=3 --settings.throttlingMethod=devtools --settings.throttling.rttMs=150 --settings.throttling.throughputKbps=1600 --settings.throttling.cpuSlowdownMultiplier=4
```

Compare its CLS and filmstrip with the same flags before/after a change; these values are not comparable to the default desktop CI scores or to a differently configured Brave/Chrome DevTools profile. An HTTP/2 connection multiplexes requests but cannot prevent layout shifts caused by client-side markup replacement.

For a JavaScript waterfall audit, rebuild and restart the API **and** snapshot worker, then wait for republished snapshots: older HTML contains Vite-inserted `modulepreload` links captured during publication. The worker removes those hints from new snapshots. On the home page, the search form and menu still hydrate on load, so their React and component chunks are expected; the calendar loads on date-picker activation and the menu dialog only when opened. In DevTools, disable cache and compare requests before and after opening those controls; a preload is a network request, not proof that a chunk executed.

## Public PageSpeed Insights audit (Cloudflare quick tunnel)

PageSpeed Insights needs a publicly reachable URL; `.ddev.site` resolves locally and is not a public ingress to your machine. Install `cloudflared`, start the published-snapshot API and worker on port 5000 (quick start or Compose), then run in another terminal:

```sh
make pagespeed
```

The command checks `/health` and runs `cloudflared tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:5000` **in the foreground**. Copy the newly printed `https://...trycloudflare.com` URL into [PageSpeed Insights](https://pagespeed.web.dev/). DNS may take a minute to become available; check `curl --fail https://<your-tunnel-host>/health` and a public page/asset before submitting. `http2` selects the tunnel's outbound connection to Cloudflare; it does not establish which protocol a visitor negotiates with the Cloudflare edge.

**The quick tunnel exposes the entire local API, including admin routes, to anyone with the URL.** It does not inherit DDEV's `/_snapshot-source` block (the app still requires its internal token). Use strong admin credentials and an isolated audit environment with non-sensitive content; do not treat this as production ingress or leave it running unattended. Quick tunnels are temporary, have no uptime guarantee, and receive a new hostname on restart.

Published HTML stores absolute canonical URLs and the sitemap origin. If it was captured for localhost or DDEV, PageSpeed can still request the tunnel URL, but its canonical/sitemap metadata points elsewhere. For an audit of the final public metadata **with Compose**, keep `make pagespeed` running, then in a separate terminal set the **exact newly printed HTTPS URL** as `PUBLIC_ORIGIN` and recreate the API and worker:

```sh
PUBLIC_ORIGIN=https://<your-tunnel-host> docker compose --env-file .env up -d --no-deps --force-recreate api snapshot-worker
```

Wait for republishing before measuring; verify `curl -s https://<your-tunnel-host>/ | grep canonical` shows the tunnel origin. The worker fingerprints the origin and requeues previously published pages. A hostname change requires another republish. PageSpeed Insights runs from Google's infrastructure and may report different scores than `make lighthouse-https` (local Chrome and the repo's desktop preset).

### Stop and restore

- Press **Ctrl-C** in the `make pagespeed` terminal to close the tunnel. If it was started separately, stop that `cloudflared` process instead; do not rely on closing a browser tab. A background tunnel can be stopped by its PID (`kill <pid>`).
- Press **Ctrl-C** in the `make audit-app` terminal to stop the host API/worker. Run `make https-stop` to stop DDEV; that does not stop the API or PostgreSQL.
- If you temporarily changed Compose's origin, restore the desired `PUBLIC_ORIGIN` in `.env` (or use its prior value), then run `docker compose --env-file .env up -d --no-deps --force-recreate api snapshot-worker` and wait for republishing again. To stop Compose services without deleting database/media volumes, use `docker compose --env-file .env stop`. Do **not** use `down -v` unless you intend to delete persistent data.

## Persistent state and recovery

Keep PostgreSQL data, uploaded media (`MEDIA_DIR`), Data Protection keys (`DATA_PROTECTION_KEYS_DIR`), and hashed assets across releases. Compose mounts `postgres_data`, `media_data`, `protection_keys`, and `asset_data`; the API uses `/data/media`, `/data/keys`, and `/data/assets`. Old hashed assets must remain available while stored or cached snapshots reference them; locally these are in `apps/api/wwwroot/assets`. The server reads the Vite manifest on startup, so restart it after an asset rebuild.

`pnpm images` generates both browser image variants and `wwwroot/images/image-manifest.json`, which Razor uses for responsive catalog cards. Commit the manifest alongside new variants and deploy them together. Fingerprinted `/images/gen/` files cache for a year; original `/images/` paths cache for one day because editors may replace them without changing the URL. Public and admin CSS are separate build entries; rebuild the API and worker together before measuring changes to public snapshots.

If an image's file is missing, its database metadata cannot recreate it: re-upload the original and replace the old image path in affected content. If a new page stays 503, inspect worker logs and snapshot jobs; failed captures back off and do not publish partial HTML. Existing pages keep their last complete capture until a replacement is ready. Unpublished content is a real 404 and is removed from the sitemap. Admin seeding never rotates an existing user's credentials or overwrites edited catalog records.
