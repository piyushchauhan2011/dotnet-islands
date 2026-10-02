/** @jsxImportSource preact */
import { useEffect, useRef } from 'preact/hooks'
import type { ComponentChildren } from 'preact'

export function IslandDialog({
  open,
  onOpenChange,
  className,
  contentClassName,
  titleId,
  descriptionId,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  className: string
  contentClassName: string
  titleId: string
  descriptionId?: string
  children: ComponentChildren
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      element.showModal()
      element
        .querySelector<HTMLElement>('button:not([disabled]), [href]')
        ?.focus()
    } else if (!open && element.open) {
      element.close()
      previousFocus.current?.focus()
    }
  }, [open])
  useEffect(() => {
    const element = dialog.current
    return () => {
      if (element?.open) {
        element.close()
        previousFocus.current?.focus()
      }
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className={`modal ${className}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault()
        onOpenChange(false)
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
    >
      <div className={`modal-content ${contentClassName}`}>{children}</div>
    </dialog>
  )
}
