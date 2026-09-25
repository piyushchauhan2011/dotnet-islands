import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { IslandDialog } from './IslandDialog'

export type GalleryItem = {
  id: string
  src: string
  alt: string
  caption?: string | null
  category?: string | null
  roomId?: string | null
}

export default function GalleryLightbox({
  items,
  name,
  activeId,
  onActiveChange,
  onClose,
}: {
  items: GalleryItem[]
  name: string
  activeId: string
  onActiveChange: (id: string) => void
  onClose: () => void
}) {
  const [category, setCategory] = useState('All')
  const categories = [
    'All',
    ...new Set(items.map((item) => item.category ?? 'Property')),
  ]
  const visible =
    category === 'All'
      ? items
      : items.filter((item) => (item.category ?? 'Property') === category)
  const index = Math.max(
    0,
    visible.findIndex((item) => item.id === activeId),
  )
  const active = visible[index]
  const move = (step: number) =>
    onActiveChange(visible[(index + step + visible.length) % visible.length].id)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const touchStart = useRef(0)
  return (
    <IslandDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      className="gallery-lightbox"
      contentClassName="gallery-lightbox__content"
      titleId="gallery-title"
      descriptionId="gallery-description"
    >
      <h2 id="gallery-title" className="is-sr-only">
        {name} image gallery
      </h2>
      <p id="gallery-description" className="is-sr-only">
        Use arrow keys or buttons to move between photos.
      </p>
      <header className="gallery-lightbox__header">
        <div className="gallery-lightbox__heading">
          <strong>{name}</strong>
          <small>
            {index + 1} of {visible.length}
          </small>
        </div>
        <button
          type="button"
          className="button is-ghost gallery-lightbox__close button-icon"
          aria-label="Close gallery"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </header>
      <nav
        className="gallery-lightbox__categories"
        aria-label="Photo categories"
      >
        {categories.map((name) => (
          <button
            type="button"
            key={name}
            className={`button is-ghost is-small gallery-lightbox__category${name === category ? ' gallery-lightbox__category--active' : ''}`}
            aria-pressed={name === category}
            onClick={() => {
              setCategory(name)
              const first =
                name === 'All'
                  ? items[0]
                  : items.find((item) => (item.category ?? 'Property') === name)
              if (first) onActiveChange(first.id)
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      <div
        className="gallery-lightbox__stage"
        onTouchStart={(event) => {
          touchStart.current = event.touches[0].clientX
        }}
        onTouchEnd={(event) => {
          const delta = touchStart.current - event.changedTouches[0].clientX
          if (Math.abs(delta) >= 45) move(delta > 0 ? 1 : -1)
        }}
      >
        <img
          className="gallery-lightbox__active-image"
          src={active.src}
          alt={active.alt}
          width="1920"
          height="1080"
        />
        {visible.length > 1 && (
          <>
            <button
              type="button"
              className="button is-ghost gallery-lightbox__previous button-icon-lg"
              aria-label="Previous photo"
              onClick={() => move(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className="button is-ghost gallery-lightbox__next button-icon-lg"
              aria-label="Next photo"
              onClick={() => move(1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      <footer className="gallery-lightbox__footer">
        <div className="gallery-lightbox__caption">
          <span>{active.caption}</span>
          <span>{active.category}</span>
        </div>
        <div className="gallery-lightbox__thumbnails">
          {visible.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`gallery-lightbox__thumbnail${item.id === active.id ? ' gallery-lightbox__thumbnail--active' : ''}`}
              aria-label={`View ${item.caption || item.alt}`}
              aria-current={item.id === active.id ? 'true' : undefined}
              onClick={() => onActiveChange(item.id)}
            >
              <img
                src={item.src}
                alt=""
                width="192"
                height="128"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </footer>
    </IslandDialog>
  )
}
