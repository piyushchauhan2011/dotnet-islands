import clsx from 'clsx'
import type { ReactNode } from 'react'

export function FormField({
  id,
  label,
  className,
  children,
}: {
  id: string
  label: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={clsx('field', className)}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="control">{children}</div>
    </div>
  )
}
