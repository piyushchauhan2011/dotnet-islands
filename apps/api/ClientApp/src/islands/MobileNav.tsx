import { ChevronRight, Menu, Search, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'

// The modal implementation is only needed after opening the mobile menu.
const IslandDialog = lazy(async () => ({
  default: (await import('./IslandDialog')).IslandDialog,
}))

export default function MobileNav({
  links,
}: {
  links: { label: string; href: string; description?: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [openedOnce, setOpenedOnce] = useState(false)
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(
      '.site-header[data-overlay="true"]',
    )
    const sentinel = document.querySelector('.site-header__sentinel')
    if (!header || !sentinel) return

    const scrim = header.querySelector('.site-header__scrim')
    const brand = header.querySelector('.brand')
    const search = header.querySelector('.site-header__search-button')
    const observer = new IntersectionObserver(([entry]) => {
      const solid = !entry.isIntersecting
      header.classList.toggle('site-header--solid', solid)
      header.classList.toggle('site-header--overlay', !solid)
      scrim?.classList.toggle('site-header__scrim--hidden', solid)
      brand?.classList.toggle('brand--light', !solid)
      search?.classList.toggle('is-primary', solid)
      search?.classList.toggle('site-header__search-button--overlay', !solid)
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])
  const currentPath =
    window.location.pathname === '/_snapshot-source'
      ? new URLSearchParams(window.location.search).get('path')
      : window.location.pathname
  return (
    <>
      <button
        type="button"
        className="button is-ghost button-icon site-header__mobile-toggle"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => {
          setOpenedOnce(true)
          setOpen(true)
        }}
      >
        <Menu aria-hidden="true" />
      </button>
      {openedOnce && (
        <Suspense fallback={null}>
          <IslandDialog
            open={open}
            onOpenChange={setOpen}
            className="mobile-navigation"
            contentClassName="mobile-navigation__content"
            titleId="mobile-navigation-title"
            descriptionId="mobile-navigation-description"
          >
            <header className="mobile-navigation__header">
              <div>
                <h2 id="mobile-navigation-title">
                  <a href="/">
                    Elsewhere<span className="brand__mark">.</span>
                  </a>
                </h2>
                <p
                  id="mobile-navigation-description"
                  className="mobile-navigation__description"
                >
                  Independent hotels and slower journeys, selected with care.
                </p>
              </div>
              <button
                type="button"
                className="button is-ghost button-icon mobile-navigation__close"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="mobile-navigation__body">
              <nav
                className="mobile-navigation__links"
                aria-label="Mobile navigation"
              >
                {links.map(({ label, href, description }) => (
                  <a
                    key={href}
                    href={href}
                    className="mobile-navigation__link"
                    aria-current={currentPath === href ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <span className="mobile-navigation__icon">
                      <ChevronRight aria-hidden="true" />
                    </span>
                    <span>
                      {label}
                      {description && <span>{description}</span>}
                    </span>
                    <ChevronRight aria-hidden="true" />
                  </a>
                ))}
              </nav>
              <div className="mobile-navigation__footer">
                <a
                  href="/search"
                  className="button is-primary mobile-navigation__search"
                >
                  <Search aria-hidden="true" /> Find a stay
                </a>
                <p>
                  Search curated hotels by destination, style, and amenities.
                </p>
              </div>
            </div>
          </IslandDialog>
        </Suspense>
      )}
    </>
  )
}
