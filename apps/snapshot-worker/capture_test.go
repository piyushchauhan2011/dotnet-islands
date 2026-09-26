package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/chromedp/chromedp"
)

func TestRenderPublishesSafeHydratableHTML(t *testing.T) {
	const token = "12345678901234567890123456789012"
	const runtime = "/assets/runtime.js"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Snapshot-Token") != token {
			http.Error(w, "no token", http.StatusForbidden)
			return
		}
		switch r.URL.Path {
		case "/_snapshot-source":
			if r.URL.Query().Get("path") != "/" {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte(`<!doctype html><html class="js-enabled"><head><link rel="canonical" href="` + "http://" + r.Host + `/"></head><body><h1>Catalog</h1><div data-fallback-for="gallery" hidden style="display:none">Fallback</div><div data-island="gallery"><span>Interactive</span></div><div data-island="nav"><span>Links</span></div><script src="` + runtime + `"></script></body></html>`))
		case runtime:
			w.Header().Set("Content-Type", "text/javascript")
			_, _ = w.Write([]byte(`document.querySelector('[data-island="nav"]').append('first', 'second'); window.__SNAPSHOT_READY__ = true;`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	allocator, closeAllocator := chromedp.NewExecAllocator(context.Background(), browserOptions()...)
	defer closeAllocator()
	browser, closeBrowser := chromedp.NewContext(allocator)
	defer closeBrowser()
	if err := chromedp.Run(browser); err != nil {
		t.Fatalf("Chrome/Chromium required: %v", err)
	}
	w := worker{browser: browser, origin: server.URL, token: token, runtime: runtime}
	html, err := w.render(job{path: "/"})
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{`data-fallback-for="gallery"`, `data-island="gallery"></div>`, `first<!---->second`} {
		if !strings.Contains(html, expected) {
			t.Errorf("missing %q in snapshot: %s", expected, html)
		}
	}
	for _, forbidden := range []string{token, "js-enabled", "Interactive", "display:none", " hidden"} {
		if strings.Contains(html, forbidden) {
			t.Errorf("unexpected %q in snapshot: %s", forbidden, html)
		}
	}
}

func TestRenderRejectsNoncanonicalPage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/assets/runtime.js" {
			w.Header().Set("Content-Type", "text/javascript")
			_, _ = w.Write([]byte(`window.__SNAPSHOT_READY__ = true;`))
			return
		}
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<!doctype html><html><head><link rel="canonical" href="https://example.com/other"></head><body><h1>Wrong page</h1><script src="/assets/runtime.js"></script></body></html>`))
	}))
	defer server.Close()
	allocator, closeAllocator := chromedp.NewExecAllocator(context.Background(), browserOptions()...)
	defer closeAllocator()
	browser, closeBrowser := chromedp.NewContext(allocator)
	defer closeBrowser()
	if err := chromedp.Run(browser); err != nil {
		t.Fatalf("Chrome/Chromium required: %v", err)
	}
	w := worker{browser: browser, origin: server.URL, runtime: "/assets/runtime.js"}
	_, err := w.render(job{path: "/"})
	if err == nil || !strings.Contains(err.Error(), "invalid snapshot") {
		t.Fatalf("expected canonical validation, got %v", err)
	}
}
