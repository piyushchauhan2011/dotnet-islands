import type { Meta, StoryObj } from '@storybook/react-vite'

import { DisplayTitle, Eyebrow, SectionTitle } from '#/components/Layout'
import { FormField } from '#/components/forms/FormField'

const meta = {
  title: 'Design System/Overview',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const tokens = [
  {
    name: 'Background cream',
    token: 'var(--app-body-bg)',
    value: '#f7f4ed',
    usage: 'Page canvas and calm section backgrounds',
    className: 'design-system__swatch--background',
  },
  {
    name: 'Foreground ink',
    token: 'var(--app-body-color)',
    value: '#1d2926',
    usage: 'Primary copy and editorial headings',
    className: 'design-system__swatch--foreground',
  },
  {
    name: 'Primary forest',
    token: 'var(--app-primary)',
    value: '#18342f',
    usage: 'Primary actions, hero overlays, high-emphasis panels',
    className: 'design-system__swatch--primary',
  },
  {
    name: 'Secondary sand',
    token: 'var(--app-secondary)',
    value: '#e8dfd0',
    usage: 'Subtle cards, tags, and secondary controls',
    className: 'design-system__swatch--secondary',
  },
  {
    name: 'Muted linen',
    token: 'var(--app-muted)',
    value: '#eee9df',
    usage: 'Quiet surfaces and grouped form areas',
    className: 'design-system__swatch--muted',
  },
  {
    name: 'Accent warm sand',
    token: 'var(--app-accent)',
    value: '#efe2d1',
    usage: 'Highlights, selected ranges, and callouts',
    className: 'design-system__swatch--accent',
  },
  {
    name: 'Danger red',
    token: 'var(--app-danger)',
    value: '#b42318',
    usage: 'Validation errors and destructive feedback only',
    className: 'design-system__swatch--danger',
  },
  {
    name: 'Success green',
    token: 'var(--app-success)',
    value: '#2f6f4e',
    usage: 'Confirmed fields, saved states, and completion feedback',
    className: 'design-system__swatch--success',
  },
  {
    name: 'Warning amber',
    token: 'var(--app-warning)',
    value: '#9a5b13',
    usage: 'Non-blocking validation, optional details, and cautions',
    className: 'design-system__swatch--warning',
  },
] as const

function CardSurface({
  title,
  children,
  className,
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <article className={`card ${className ?? ''}`}>
      {title ? (
        <header className="design-system__card-header">
          <h2 className="design-system__card-title">{title}</h2>
        </header>
      ) : null}
      <div className="card-content">{children}</div>
    </article>
  )
}

function TokenSwatch({ token }: { token: (typeof tokens)[number] }) {
  return (
    <CardSurface className="design-system__token">
      <div className={`design-system__swatch ${token.className}`}>
        <strong>{token.name}</strong>
        <span>{token.value}</span>
      </div>
      <h2 className="design-system__token-name">{token.token}</h2>
      <p>{token.usage}</p>
    </CardSurface>
  )
}

function DemoForm() {
  return (
    <CardSurface title="Form pattern">
      <p>Fields use warm neutral borders and amber focus rings.</p>
      <div className="design-system__form">
        <FormField label="Name" id="storybook-name">
          <input
            className="input"
            id="storybook-name"
            placeholder="Ada Lovelace"
          />
        </FormField>
        <FormField label="Email" id="storybook-email">
          <input
            className="input"
            id="storybook-email"
            type="email"
            placeholder="ada@example.com"
          />
        </FormField>
        <FormField label="Travel notes" id="storybook-notes">
          <textarea
            className="textarea"
            id="storybook-notes"
            placeholder="Tell us about the trip..."
          />
        </FormField>
        <button className="button is-primary" type="button">
          Send inquiry
        </button>
      </div>
    </CardSurface>
  )
}

export const DesignSystem: Story = {
  render: () => (
    <main className="design-system">
      <div className="design-system__container">
        <section>
          <Eyebrow>ACCESSIBLE BRAND PALETTE</Eyebrow>
          <DisplayTitle>Thoughtful stays, naturally selected</DisplayTitle>
          <p className="design-system__lede">
            A calm, nature-led palette: deep forest for action, warm sand for
            softness, and a cream canvas for comfortable reading.
          </p>
        </section>
        <section className="design-system__tokens">
          {tokens.map((token) => (
            <TokenSwatch token={token} key={token.name} />
          ))}
        </section>
        <section className="design-system__split">
          <div className="design-system__stack">
            <div>
              <Eyebrow>TYPOGRAPHY</Eyebrow>
              <SectionTitle>Editorial scale</SectionTitle>
            </div>
            <CardSurface>
              <div className="design-system__typography">
                <DisplayTitle>Memorable stays</DisplayTitle>
                <SectionTitle>Hotels with a sense of place</SectionTitle>
                <p>Body copy uses high-contrast ink on a soft cream canvas.</p>
              </div>
            </CardSurface>
            <CardSurface title="Buttons and tags">
              <div className="design-system__actions">
                <button className="button is-primary" type="button">
                  Primary action
                </button>
                <button className="button is-secondary" type="button">
                  Secondary
                </button>
                <button className="button is-primary is-outlined" type="button">
                  Outline
                </button>
                <button className="button is-ghost" type="button">
                  Ghost
                </button>
                <button className="button is-text" type="button">
                  Text link
                </button>
                <button className="button is-primary" type="button" disabled>
                  Disabled
                </button>
              </div>
              <div className="design-system__actions">
                <span className="tag is-primary">Featured</span>
                <span className="tag is-secondary is-rounded">Slow travel</span>
                <span className="tag is-light">Independent</span>
              </div>
            </CardSurface>
          </div>
          <DemoForm />
        </section>
        <section className="design-system__contrast">
          <Eyebrow tone="light">CONTRAST CHECK</Eyebrow>
          <SectionTitle>Forest on cream: 12.1:1</SectionTitle>
          <p>
            The core forest/cream pairing exceeds WCAG AAA for normal text,
            while warm neutral surfaces preserve clear hierarchy.
          </p>
        </section>
      </div>
    </main>
  ),
}

export const ColorPalette: Story = {
  render: () => (
    <main className="design-system">
      <div className="design-system__container">
        <section>
          <Eyebrow>COLOR TOKENS</Eyebrow>
          <DisplayTitle>Palette usage examples</DisplayTitle>
          <p className="design-system__lede">
            Bulma primitives and application tokens keep hotel, destination,
            admin, and marketing screens aligned.
          </p>
        </section>
        <section className="design-system__tokens design-system__tokens--large">
          {tokens.map((token) => (
            <TokenSwatch token={token} key={token.name} />
          ))}
        </section>
      </div>
    </main>
  ),
}

export const FormValidationExamples: Story = {
  render: () => (
    <main className="design-system">
      <div className="design-system__container">
        <section>
          <Eyebrow>FORM VALIDATION</Eyebrow>
          <DisplayTitle>Field states and inquiry examples</DisplayTitle>
          <p className="design-system__lede">
            Invalid fields use aria-invalid and linked feedback; success,
            warning, and danger remain distinct without relying on color alone.
          </p>
        </section>
        <section className="design-system__alerts">
          <div className="notification is-success">
            <h2>Success validation</h2>
            Use when data is saved, available, or confirmed.
          </div>
          <div className="notification is-warning">
            <h2>Warning validation</h2>
            Use for recoverable issues and non-blocking cautions.
          </div>
          <div className="notification is-danger">
            <h2>Error validation</h2>
            Use when submission is blocked until fields are fixed.
          </div>
        </section>
        <section className="design-system__split">
          <CardSurface title="Field states">
            <div className="design-system__form">
              <FormField label="Completed field" id="valid-name">
                <input
                  className="input"
                  id="valid-name"
                  value="Maya Chen"
                  readOnly
                />
              </FormField>
              <p className="help">Readonly values show saved content.</p>
              <FormField label="Required email" id="required-email">
                <input
                  className="input"
                  id="required-email"
                  placeholder="guest@example.com"
                  required
                  type="email"
                />
              </FormField>
              <FormField label="Success email" id="valid-email">
                <input
                  className="input is-success"
                  id="valid-email"
                  value="maya@example.com"
                  readOnly
                  aria-describedby="valid-email-help"
                />
              </FormField>
              <p className="help is-success" id="valid-email-help">
                Email format looks good.
              </p>
              <FormField label="Invalid email" id="invalid-email">
                <input
                  className="input is-danger"
                  id="invalid-email"
                  value="maya@"
                  readOnly
                  aria-invalid="true"
                  aria-describedby="invalid-email-error"
                />
              </FormField>
              <p className="help is-danger" id="invalid-email-error">
                Enter a complete email address, for example maya@example.com.
              </p>
              <FormField label="Disabled promo code" id="disabled-code">
                <input
                  className="input"
                  id="disabled-code"
                  placeholder="Not available"
                  disabled
                />
              </FormField>
            </div>
          </CardSurface>
          <CardSurface title="Inquiry example">
            <div className="design-system__form">
              <div className="notification is-warning">
                <h2>Deposit timing warning</h2>
                This offer may require a 50% deposit within 24 hours.
              </div>
              <div className="notification is-danger" role="alert">
                <h2>Check 2 fields</h2>
                Arrival date is required and party size must be at least one
                guest.
              </div>
              <FormField label="Arrival date" id="arrival-date">
                <input
                  className="input is-danger"
                  id="arrival-date"
                  type="date"
                  aria-invalid="true"
                  aria-describedby="arrival-date-error"
                />
              </FormField>
              <p className="help is-danger" id="arrival-date-error">
                Choose an arrival date.
              </p>
              <FormField label="Guests" id="party-size">
                <input
                  className="input is-danger"
                  id="party-size"
                  type="number"
                  min="1"
                  value="0"
                  readOnly
                  aria-invalid="true"
                  aria-describedby="party-size-error"
                />
              </FormField>
              <p className="help is-danger" id="party-size-error">
                Add at least one guest.
              </p>
              <FormField label="Special requests" id="special-requests">
                <textarea
                  className="textarea is-success"
                  id="special-requests"
                  value="Quiet room away from elevator."
                  readOnly
                  aria-describedby="special-requests-help"
                />
              </FormField>
              <p className="help is-success" id="special-requests-help">
                Request saved to the inquiry draft.
              </p>
              <div className="design-system__actions">
                <button className="button is-primary" type="button">
                  Review inquiry
                </button>
                <button className="button is-primary is-outlined" type="button">
                  Save draft
                </button>
              </div>
            </div>
          </CardSurface>
        </section>
      </div>
    </main>
  ),
}
