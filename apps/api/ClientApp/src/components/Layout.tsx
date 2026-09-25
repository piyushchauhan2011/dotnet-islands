import clsx from 'clsx'
import type { ComponentProps, ReactNode } from 'react'

export function Container({ className, ...props }: ComponentProps<'div'>) {
  return <div className={clsx('app-container', className)} {...props} />
}

export function Eyebrow({
  className,
  tone = 'brand',
  ...props
}: ComponentProps<'p'> & { tone?: 'brand' | 'light' }) {
  return (
    <p
      className={clsx(
        'eyebrow',
        tone === 'light' && 'eyebrow--light',
        className,
      )}
      {...props}
    />
  )
}

export function DisplayTitle({ className, ...props }: ComponentProps<'h1'>) {
  return <h1 className={clsx('display-title', className)} {...props} />
}

export function SectionTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={clsx('section-title', className)} {...props} />
}

export function Section({
  className,
  contained = true,
  children,
  ...props
}: ComponentProps<'section'> & { contained?: boolean; children: ReactNode }) {
  return (
    <section className={clsx('content-section', className)} {...props}>
      {contained ? <Container>{children}</Container> : children}
    </section>
  )
}

export function SectionHeader({
  className,
  children,
  action,
}: {
  className?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={clsx('section-header', className)}>
      <div>{children}</div>
      {action}
    </div>
  )
}
