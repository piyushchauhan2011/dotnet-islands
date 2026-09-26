package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/fetch"
	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"
)

type snapshot struct {
	HTML           string   `json:"html"`
	Canonical      string   `json:"canonical"`
	H1             int      `json:"h1"`
	Unrendered     int      `json:"unrendered"`
	Scripts        []string `json:"executableScripts"`
	HasPrivateForm bool     `json:"hasPrivateForm"`
}

const serialize = `(() => {
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const h1 = document.querySelectorAll('h1').length;
  const islands = [...document.querySelectorAll('[data-island]')];
  const executableScripts = [...document.querySelectorAll('script[src]')].map(node => node.getAttribute('src'));
  const hasPrivateForm = Boolean(document.querySelector('input[name="__RequestVerificationToken"], input[name="password"]'));
  const root = document.documentElement.cloneNode(true);
  // CSR creates adjacent text nodes; keep the hydration boundaries React expects.
  for (const island of root.querySelectorAll('[data-island]')) {
    const walker = document.createTreeWalker(island, NodeFilter.SHOW_TEXT);
    const adjacent = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.previousSibling?.nodeType === Node.TEXT_NODE) adjacent.push(node);
    }
    for (const node of adjacent) node.before(document.createComment(''));
  }
  for (const island of root.querySelectorAll('[data-island]')) {
    const fallback = [...(island.parentElement?.children ?? [])].find(
      child => child !== island && child.getAttribute('data-fallback-for') === island.getAttribute('data-island'));
    if (fallback) island.replaceChildren();
  }
  root.classList.remove('js-enabled');
  for (const fallback of root.querySelectorAll('[data-fallback-for]')) {
    fallback.removeAttribute('hidden');
    fallback.style.removeProperty('display');
  }
  return { html: '<!doctype html>\n' + root.outerHTML, canonical, h1,
    unrendered: islands.filter(node => !node.firstElementChild).length,
    executableScripts, hasPrivateForm };
})()`

func (w worker) render(item job) (string, error) {
	ctx, cancel := chromedp.NewContext(w.browser)
	defer cancel()
	ctx, timeout := context.WithTimeout(ctx, 65*time.Second)
	defer timeout()
	source := w.origin + "/_snapshot-source?path=" + url.QueryEscape(item.path)
	var mu sync.Mutex
	var failures []string
	status := 0
	addFailure := func(message string) {
		mu.Lock()
		failures = append(failures, message)
		mu.Unlock()
	}
	chromedp.ListenTarget(ctx, func(event any) {
		switch e := event.(type) {
		case *fetch.EventRequestPaused:
			go func() {
				request, err := url.Parse(e.Request.URL)
				if err != nil || request.Scheme+"://"+request.Host != w.origin {
					_ = chromedp.Run(ctx, fetch.FailRequest(e.RequestID, network.ErrorReasonBlockedByClient))
					return
				}
				_ = chromedp.Run(ctx, fetch.ContinueRequest(e.RequestID))
			}()
		case *network.EventResponseReceived:
			mu.Lock()
			if e.Response.URL == source && e.Type == network.ResourceTypeDocument {
				status = int(e.Response.Status)
			}
			if e.Response.Status >= 400 {
				failures = append(failures, fmt.Sprintf("%d %s", int(e.Response.Status), e.Response.URL))
			}
			mu.Unlock()
		case *runtime.EventExceptionThrown:
			message := e.ExceptionDetails.Text
			if e.ExceptionDetails.Exception != nil && e.ExceptionDetails.Exception.Description != "" {
				message = e.ExceptionDetails.Exception.Description
			}
			addFailure(message)
		case *runtime.EventConsoleAPICalled:
			if e.Type == runtime.APITypeError {
				var parts []string
				for _, arg := range e.Args {
					parts = append(parts, string(arg.Value))
				}
				addFailure("console: " + strings.Join(parts, " "))
			}
		}
	})
	if err := chromedp.Run(ctx,
		network.Enable(), fetch.Enable(),
		network.SetExtraHTTPHeaders(network.Headers{"X-Snapshot-Token": w.token}),
		chromedp.EmulateViewport(1440, 900),
		emulation.SetEmulatedMedia().WithFeatures([]*emulation.MediaFeature{{Name: "prefers-reduced-motion", Value: "reduce"}}),
		chromedp.Navigate(source),
		chromedp.Poll("window.__SNAPSHOT_READY__ === true", nil),
	); err != nil {
		return "", fmt.Errorf("render %s: %w", item.path, err)
	}
	mu.Lock()
	capturedStatus, errorsSeen := status, append([]string(nil), failures...)
	mu.Unlock()
	if capturedStatus != 200 {
		return "", fmt.Errorf("source returned HTTP %d: %s", capturedStatus, item.path)
	}
	if len(errorsSeen) > 0 {
		return "", fmt.Errorf("browser errors for %s: %.400s", item.path, strings.Join(errorsSeen, "; "))
	}
	var result snapshot
	if err := chromedp.Run(ctx, chromedp.Evaluate(serialize, &result)); err != nil {
		return "", err
	}
	canonical, err := url.Parse(result.Canonical)
	if err != nil || result.Canonical == "" || canonical.Path != item.path || result.H1 != 1 || result.Unrendered != 0 || result.HasPrivateForm ||
		len(result.Scripts) != 1 || result.Scripts[0] != w.runtime || strings.Contains(result.HTML, w.token) {
		details, _ := json.Marshal(struct {
			Canonical  string   `json:"canonical"`
			H1         int      `json:"h1"`
			Unrendered int      `json:"unrendered"`
			Scripts    []string `json:"scripts"`
		}{result.Canonical, result.H1, result.Unrendered, result.Scripts})
		return "", fmt.Errorf("invalid snapshot for %s: %s", item.path, details)
	}
	return result.HTML, nil
}
