import '../styles.scss'
import { createElement, useEffect } from 'react'
import type { ComponentType } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

document.documentElement.classList.add('js-enabled')

// The literal imports are intentional runtime chunk boundaries: do not import a page registry.
const islands = {
  SearchForm: () => import('./SearchForm'),
  SearchExperience: () => import('./SearchExperience'),
  Gallery: () => import('./Gallery'),
  InquiryForm: () => import('./InquiryForm'),
  MobileNav: () => import('./MobileNav'),
}
type IslandName = keyof typeof islands

const started = new WeakSet<HTMLElement>()
const markers = [...document.querySelectorAll<HTMLElement>('[data-island]')]
const sourceSnapshot = window.location.pathname === '/_snapshot-source'
let pending = sourceSnapshot ? markers.length : 0

declare global {
  interface Window {
    __SNAPSHOT_READY__?: boolean
  }
}

function showFailure(cause: unknown) {
  const error = cause instanceof Error ? cause : new Error(String(cause))
  // A failed chunk/props parse must never publish a partial Chromium snapshot.
  window.dispatchEvent(
    new ErrorEvent('error', { error, message: error.message }),
  )
  console.error(error)
}

async function mount(marker: HTMLElement) {
  if (started.has(marker)) return
  started.add(marker)
  try {
    const name = marker.dataset.island as IslandName
    const load = islands[name]
    if (!load) throw new Error(`Unknown island: ${name || '(missing name)'}`)
    const props = JSON.parse(marker.dataset.props ?? '{}') as Record<
      string,
      unknown
    >
    const Component = (await load()).default as ComponentType<
      Record<string, unknown>
    >
    const hasMarkup = marker.children.length > 0

    function Ready() {
      useEffect(() => {
        const fallback = [...(marker.parentElement?.children ?? [])].find(
          (child) =>
            child !== marker &&
            child.getAttribute('data-fallback-for') === name,
        ) as HTMLElement | undefined
        if (fallback) {
          fallback.hidden = true
          fallback.style.display = 'none'
        }
        if (sourceSnapshot && --pending === 0) window.__SNAPSHOT_READY__ = true
      }, [])
      return createElement(Component, props)
    }

    if (hasMarkup) hydrateRoot(marker, createElement(Ready))
    else createRoot(marker).render(createElement(Ready))
  } catch (cause) {
    showFailure(cause)
  }
}

if (sourceSnapshot && pending === 0) window.__SNAPSHOT_READY__ = true
const deferred = markers.filter(
  (marker) => marker.dataset.hydrate === 'visible',
)
if (!sourceSnapshot && deferred.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        observer.unobserve(entry.target)
        void mount(entry.target as HTMLElement)
      }
    },
    { rootMargin: '200px' },
  )
  deferred.forEach((marker) => observer.observe(marker))
} else {
  deferred.forEach((marker) => void mount(marker))
}
markers
  .filter((marker) => marker.dataset.hydrate !== 'visible')
  .forEach((marker) => void mount(marker))
document
  .querySelector<HTMLSelectElement>('.search-page__sort select')
  ?.addEventListener('change', (event) => {
    const select = event.currentTarget as HTMLSelectElement
    select.form?.requestSubmit()
  })
