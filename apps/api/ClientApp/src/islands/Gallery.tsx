import { Expand } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import type { GalleryItem } from './GalleryLightbox'

// Keep the full-screen gallery out of the initial island chunk; it is only needed after a visitor opens a photo.
const GalleryLightbox = lazy(() => import('./GalleryLightbox'))

export default function Gallery({
  items,
  name,
}: {
  items: GalleryItem[]
  name: string
}) {
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState(items[0]?.id ?? '')
  if (!items.length) return null
  return (
    <>
      <div className="gallery-grid">
        {items.slice(0, 5).map((item, index) => (
          <button
            type="button"
            key={item.id}
            className={`gallery-grid__item${index === 0 ? ' gallery-grid__item--primary' : ''}${index === 3 ? ' gallery-grid__item--fourth' : ''}${index === 4 ? ' gallery-grid__item--fifth' : ''}`}
            aria-label={`Open ${name} gallery image ${index + 1} — ${item.category ?? 'property'}`}
            onClick={() => {
              setActiveId(item.id)
              setOpen(true)
            }}
          >
            <span className="gallery-grid__image-wrap">
              <img
                className="gallery-grid__image"
                src={item.src}
                alt={item.alt}
                loading={index === 0 ? 'eager' : 'lazy'}
                fetchPriority={index === 0 ? 'high' : 'auto'}
              />
            </span>
            {index > 0 && (
              <span className="gallery-grid__category">{item.category}</span>
            )}
          </button>
        ))}
        <button
          type="button"
          className="button is-secondary gallery-grid__all"
          onClick={() => {
            setActiveId(items[0].id)
            setOpen(true)
          }}
        >
          <Expand aria-hidden="true" /> View all {items.length} photos
        </button>
      </div>
      {open && (
        <Suspense fallback={null}>
          <GalleryLightbox
            items={items}
            name={name}
            activeId={activeId}
            onActiveChange={setActiveId}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  )
}
