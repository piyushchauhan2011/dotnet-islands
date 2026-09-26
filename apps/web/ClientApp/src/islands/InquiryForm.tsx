import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { DatePicker } from './DatePicker'

type Field =
  | 'hotelId'
  | 'roomId'
  | 'offerId'
  | 'checkIn'
  | 'checkOut'
  | 'adults'
  | 'children'
  | 'name'
  | 'email'
  | 'phone'
  | 'message'
  | 'website'
type FieldErrors = Partial<Record<Field, string[]>>
export type InquiryFormProps = {
  hotel: { id: string; name: string; slug: string }
  room?: { id: string; name: string } | null
  offer?: { id: string; title: string } | null
}

export default function InquiryForm({ hotel, room, offer }: InquiryFormProps) {
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [reference, setReference] = useState('')
  const today = new Date()
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setError('')
    const nextErrors: FieldErrors = {}
    if (!checkIn || checkIn < todayString)
      nextErrors.checkIn = ['Choose a check-in date today or later.']
    if (!checkOut || checkOut <= checkIn)
      nextErrors.checkOut = ['Check-out must be after check-in.']
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }
    setErrors({})
    setPending(true)
    const form = new FormData(event.currentTarget)
    try {
      const csrfResponse = await fetch('/api/csrf', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!csrfResponse.ok)
        throw new Error('Unable to prepare your request. Please try again.')
      const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string }
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          hotelId: hotel.id,
          roomId: room?.id,
          offerId: offer?.id,
          checkIn,
          checkOut,
          adults: Number(form.get('adults')),
          children: Number(form.get('children')),
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          phone: String(form.get('phone') ?? ''),
          message: String(form.get('message') ?? ''),
          website: String(form.get('website') ?? ''),
        }),
      })
      const result = (await response.json()) as {
        reference?: string
        id?: string
        fieldErrors?: FieldErrors
        error?: string
      }
      if (!response.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors)
        else
          setError(
            result.error || 'Your inquiry could not be sent. Please try again.',
          )
        return
      }
      if (!result.reference && !result.id)
        throw new Error(
          'Your inquiry could not be confirmed. Please contact us.',
        )
      setReference((result.reference || result.id!.slice(0, 8)).toUpperCase())
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Your inquiry could not be sent. Please try again.',
      )
    } finally {
      setPending(false)
    }
  }

  if (reference)
    return (
      <div className="inquiry-page__success" role="status">
        <CheckCircle2 aria-hidden="true" />
        <p className="eyebrow">INQUIRY RECEIVED</p>
        <h2 className="display-title">
          We’ll take it <em>from here.</em>
        </h2>
        <p>
          Your reference is <strong>{reference}</strong>. The hotel team can now
          review your request and follow up using the contact details supplied.
        </p>
        <p>
          This is an inquiry, not a confirmed reservation. No payment has been
          taken.
        </p>
        <a
          className="button is-primary"
          href={`/hotels/${encodeURIComponent(hotel.slug)}`}
        >
          Explore more stays
        </a>
      </div>
    )

  const fieldError = (field: Field) =>
    errors[field]?.[0] && (
      <p className="help is-danger" id={`inquiry-${field}-error`}>
        {errors[field]?.[0]}
      </p>
    )
  return (
    <article className="card inquiry-page__card">
      <div className="card-content">
        <form onSubmit={(event) => void submit(event)}>
          <h2>Stay details</h2>
          <p>
            This is a request, not a confirmed reservation. No payment is taken.
          </p>
          <div className="inquiry-page__form-grid">
            <div className="field">
              <label className="label" htmlFor="inquiry-check-in">
                Check in
              </label>
              <DatePicker
                id="inquiry-check-in"
                name="checkIn"
                value={checkIn}
                onValueChange={(value) => {
                  setCheckIn(value)
                  if (checkOut && checkOut <= value) setCheckOut('')
                }}
                min={todayString}
                placeholder="Choose date"
                required
                className="input"
              />
              {fieldError('checkIn')}
            </div>
            <div className="field">
              <label className="label" htmlFor="inquiry-check-out">
                Check out
              </label>
              <DatePicker
                id="inquiry-check-out"
                name="checkOut"
                value={checkOut}
                onValueChange={setCheckOut}
                min={
                  checkIn
                    ? (() => {
                        const date = new Date(`${checkIn}T12:00:00`)
                        date.setDate(date.getDate() + 1)
                        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                      })()
                    : todayString
                }
                placeholder="Choose date"
                required
                className="input"
              />
              {fieldError('checkOut')}
            </div>
            <div className="field">
              <label className="label" htmlFor="inquiry-adults">
                Adults
              </label>
              <div className="select is-fullwidth">
                <select id="inquiry-adults" name="adults" defaultValue="2">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              {fieldError('adults')}
            </div>
            <div className="field">
              <label className="label" htmlFor="inquiry-children">
                Children
              </label>
              <div className="select is-fullwidth">
                <select id="inquiry-children" name="children" defaultValue="0">
                  {Array.from({ length: 9 }, (_, i) => i).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              {fieldError('children')}
            </div>
          </div>
          <h2>Your details</h2>
          <div className="inquiry-page__form-grid">
            <div className="field">
              <label className="label" htmlFor="guest-name">
                Full name
              </label>
              <input
                className="input"
                id="guest-name"
                required
                name="name"
                minLength={2}
                maxLength={100}
                autoComplete="name"
                aria-invalid={!!errors.name}
                aria-describedby={
                  errors.name ? 'inquiry-name-error' : undefined
                }
              />
              {fieldError('name')}
            </div>
            <div className="field">
              <label className="label" htmlFor="guest-email">
                Email
              </label>
              <input
                className="input"
                id="guest-email"
                required
                type="email"
                name="email"
                maxLength={160}
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby={
                  errors.email ? 'inquiry-email-error' : undefined
                }
              />
              {fieldError('email')}
            </div>
            <div className="field">
              <label className="label" htmlFor="guest-phone">
                Phone, optional
              </label>
              <input
                className="input"
                id="guest-phone"
                name="phone"
                maxLength={40}
                autoComplete="tel"
              />
              {fieldError('phone')}
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="guest-message">
              Anything we should know?
            </label>
            <textarea
              className="textarea"
              id="guest-message"
              name="message"
              rows={5}
              maxLength={1200}
              placeholder="Celebrations, accessibility needs, arrival plans…"
            />
            {fieldError('message')}
          </div>
          <div className="inquiry-page__honeypot" aria-hidden="true">
            <label htmlFor="inquiry-website">Website</label>
            <input
              id="inquiry-website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
          {(errors.hotelId || errors.roomId || errors.offerId) && (
            <div className="notification is-danger" role="alert">
              {[
                ...(errors.hotelId ?? []),
                ...(errors.roomId ?? []),
                ...(errors.offerId ?? []),
              ].join(' ')}
            </div>
          )}
          {error && (
            <div className="notification is-danger" role="alert">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="button is-primary is-fullwidth"
            disabled={pending}
          >
            {pending ? 'Sending…' : 'Send inquiry'}
          </button>
          <small className="inquiry-page__privacy">
            <ShieldCheck aria-hidden="true" /> Your details are used only to
            respond to this request.
          </small>
        </form>
      </div>
    </article>
  )
}
