import { CalendarDays } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'

const Calendar = lazy(async () => ({
  default: (await import('./Calendar')).default,
}))

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : undefined
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function DatePicker({
  id,
  name,
  value,
  onValueChange,
  placeholder,
  required,
  min,
  className,
}: {
  id: string
  name: string
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  required?: boolean
  min?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const selected = parseDate(value)
  const lowerBound = parseDate(min ?? '')

  useEffect(() => {
    if (!open) return
    const pointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', pointer)
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('pointerdown', pointer)
      document.removeEventListener('keydown', keyboard)
    }
  }, [open])

  return (
    <div ref={root} className="date-picker">
      <input type="hidden" name={name} value={value} />
      <button
        ref={trigger}
        id={id}
        type="button"
        className={`button is-ghost date-picker__trigger ${!selected ? 'date-picker__trigger--placeholder ' : ''}${className ?? ''}`}
        aria-expanded={open}
        aria-controls={`${id}-popover`}
        aria-required={required}
        onClick={() => setOpen(!open)}
      >
        <CalendarDays aria-hidden="true" />{' '}
        {selected
          ? new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }).format(selected)
          : placeholder}
      </button>
      {open && (
        <div
          className="date-picker__popover"
          id={`${id}-popover`}
          role="dialog"
          aria-label={`${placeholder} calendar`}
        >
          <Suspense
            fallback={
              <div className="date-picker__loading">Loading calendar…</div>
            }
          >
            <Calendar
              selected={selected}
              disabled={lowerBound ? { before: lowerBound } : undefined}
              onSelect={(date) => {
                onValueChange(date ? isoDate(date) : '')
                setOpen(false)
                requestAnimationFrame(() => trigger.current?.focus())
              }}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
}

export function followingDate(value: string) {
  const date = parseDate(value)
  if (!date) return undefined
  date.setDate(date.getDate() + 1)
  return isoDate(date)
}
