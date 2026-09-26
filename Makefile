.PHONY: help audit-app https lighthouse-https pagespeed https-stop

DDEV_ORIGIN := https://hotel-ssr-audit.ddev.site
LOCAL_ORIGIN := http://127.0.0.1:5000

help:
	@printf '%s\n' \
	  'make https             Start DDEV HTTPS proxy for the app on port 5000' \
	  'make audit-app         Run host API and snapshot worker with DDEV canonical URLs (foreground)' \
	  'make lighthouse-https  Audit DDEV HTTPS pages locally with Lighthouse CI' \
	  'make pagespeed         Expose the running app with a temporary public Cloudflare URL (foreground)' \
	  'make https-stop        Stop the DDEV proxy (does not stop the app)' \
	  'Stop foreground commands with Ctrl-C; see docs/operations.md for cleanup.'

https:
	@command -v ddev >/dev/null || { echo 'Install DDEV first: https://ddev.com/get-started/' >&2; exit 1; }
	ddev start
	@curl --fail --silent --show-error $(DDEV_ORIGIN)/health >/dev/null || { echo 'HTTPS proxy is up, but the app is not reachable; see docs/operations.md' >&2; exit 1; }
	@echo 'HTTPS app: $(DDEV_ORIGIN)'

audit-app:
	@echo 'Starting API and worker with DDEV canonical origin; stop with Ctrl-C.'
	PUBLIC_ORIGIN=$(DDEV_ORIGIN) API_LISTEN_URL=http://0.0.0.0:5000 pnpm dev:snapshots

lighthouse-https:
	@curl --fail --silent --show-error $(DDEV_ORIGIN)/health >/dev/null
	LIGHTHOUSE_ORIGIN=$(DDEV_ORIGIN) pnpm lighthouse

pagespeed:
	@command -v cloudflared >/dev/null || { echo 'Install cloudflared first: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/' >&2; exit 1; }
	@curl --fail --silent --show-error $(LOCAL_ORIGIN)/health >/dev/null || { echo 'Start the app on localhost:5000 first; see docs/operations.md' >&2; exit 1; }
	@echo 'Cloudflare will print the public URL below. Stop the tunnel with Ctrl-C.'
	cloudflared tunnel --no-autoupdate --protocol http2 --url $(LOCAL_ORIGIN)

https-stop:
	ddev stop
