import '../admin.scss'
import { LockKeyhole } from 'lucide-react'
import { createRoot } from 'react-dom/client'
import {
  BrowserRouter,
  Link,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { RichEditor } from './RichEditor'
import type { RichNode } from './RichEditor'

type Row = Record<string, unknown> & {
  id: string
  status?: string
  name?: string
  title?: string
  slug?: string
}
type Pickers = Record<string, { id: string; name: string }[]>
type Dashboard = {
  counts: Record<string, number>
  inquiries: { inquiry: Row; hotelName: string }[]
  media: (Row & {
    variants: Record<string, string>
    alt: string
    filename: string
  })[]
}
const sections = ['destinations', 'hotels', 'rooms', 'offers', 'posts'] as const
type Section = (typeof sections)[number]
const labels: Record<string, string> = {
  destinations: 'Destinations',
  hotels: 'Hotels',
  rooms: 'Rooms',
  offers: 'Offers',
  posts: 'Journal posts',
  inquiries: 'Inquiries',
  media: 'Media library',
}
const singularLabels: Record<Section, string> = {
  destinations: 'destination',
  hotels: 'hotel',
  rooms: 'room',
  offers: 'offer',
  posts: 'journal post',
}
const fields: Record<
  Section,
  {
    name: string
    label: string
    type?: string
    picker?: string
    optional?: boolean
    wide?: boolean
  }[]
> = {
  destinations: [
    { name: 'name', label: 'Name' },
    { name: 'slug', label: 'Slug' },
    { name: 'country', label: 'Country' },
    { name: 'eyebrow', label: 'Eyebrow' },
    { name: 'summary', label: 'Summary', wide: true },
    { name: 'heroImage', label: 'Image path' },
    { name: 'seoTitle', label: 'SEO title' },
    { name: 'seoDescription', label: 'SEO description', wide: true },
  ],
  hotels: [
    { name: 'name', label: 'Name' },
    { name: 'slug', label: 'Slug' },
    { name: 'destinationId', label: 'Destination', picker: 'destinations' },
    { name: 'propertyType', label: 'Property type' },
    { name: 'address', label: 'Address' },
    { name: 'rating', label: 'Rating (0–5)', type: 'number' },
    { name: 'priceFrom', label: 'Price from', type: 'number' },
    { name: 'currency', label: 'Currency' },
    { name: 'latitude', label: 'Latitude', type: 'number', optional: true },
    { name: 'longitude', label: 'Longitude', type: 'number', optional: true },
    { name: 'summary', label: 'Summary', wide: true },
    { name: 'description', label: 'Description', wide: true },
    { name: 'heroImage', label: 'Image path' },
    { name: 'seoTitle', label: 'SEO title' },
    { name: 'seoDescription', label: 'SEO description', wide: true },
  ],
  rooms: [
    { name: 'name', label: 'Name' },
    { name: 'slug', label: 'Slug' },
    { name: 'hotelId', label: 'Hotel', picker: 'hotels' },
    { name: 'priceFrom', label: 'Price from', type: 'number' },
    { name: 'maxGuests', label: 'Maximum guests', type: 'number' },
    { name: 'sizeSqm', label: 'Size (m²)', type: 'number', optional: true },
    { name: 'bed', label: 'Bed' },
    { name: 'summary', label: 'Summary', wide: true },
    { name: 'image', label: 'Image path' },
  ],
  offers: [
    { name: 'title', label: 'Title' },
    { name: 'slug', label: 'Slug' },
    { name: 'hotelId', label: 'Hotel', picker: 'hotels' },
    {
      name: 'discountPercent',
      label: 'Discount percent',
      type: 'number',
      optional: true,
    },
    { name: 'validFrom', label: 'Valid from', type: 'date', optional: true },
    { name: 'validTo', label: 'Valid to', type: 'date', optional: true },
    { name: 'summary', label: 'Summary', wide: true },
    { name: 'terms', label: 'Terms', wide: true },
    { name: 'image', label: 'Image path' },
  ],
  posts: [
    { name: 'title', label: 'Title' },
    { name: 'slug', label: 'Slug' },
    { name: 'author', label: 'Author' },
    { name: 'excerpt', label: 'Excerpt', wide: true },
    { name: 'heroImage', label: 'Image path' },
    { name: 'seoTitle', label: 'SEO title' },
    { name: 'seoDescription', label: 'SEO description', wide: true },
  ],
}
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.method && init.method !== 'GET') {
    const response = await fetch('/api/csrf', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (!response.ok)
      throw new Error('Cannot obtain a security token. Refresh and try again.')
    headers.set(
      'X-CSRF-Token',
      ((await response.json()) as { csrfToken: string }).csrfToken,
    )
    if (typeof init.body === 'string')
      headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`/api/admin${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (response.status === 401) {
    if (path !== '/login') window.location.replace('/admin/login')
    throw new Error('Session expired. Sign in again.')
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      title?: string
      error?: string
      message?: string
      errors?: Record<string, string[]>
    }
    throw new Error(
      body.errors
        ? Object.entries(body.errors)
            .map(([name, errors]) => `${name}: ${errors.join(', ')}`)
            .join('; ')
        : (body.error ??
            body.message ??
            body.title ??
            `Request failed (${response.status}).`),
    )
  }
  return response.json() as Promise<T>
}
function App() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="inquiries" element={<Inbox />} />
        <Route path="media" element={<Media />} />
        {sections.map((kind) => (
          <Route path={kind} key={kind}>
            <Route index element={<Listing kind={kind} />} />
            <Route path=":id" element={<CatalogEditor kind={kind} />} />
          </Route>
        ))}
        <Route path="*" element={<p>Section not found.</p>} />
      </Route>
    </Routes>
  )
}

function CatalogEditor({ kind }: { kind: Section }) {
  const { id } = useParams()
  return <Editor key={`${kind}/${id}`} kind={kind} id={id!} />
}

function Shell() {
  const location = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])
  return <ShellContent key={location.pathname} pathname={location.pathname} />
}

function ShellContent({ pathname }: { pathname: string }) {
  const [error, setError] = useState('')
  const parts = pathname.split('/').filter(Boolean)
  const section = parts[0] ?? 'overview'
  const nav = [
    { label: 'Overview', path: '/admin' },
    ...[
      'inquiries',
      'hotels',
      'rooms',
      'offers',
      'destinations',
      'posts',
      'media',
    ].map((key) => ({ label: labels[key], path: `/admin/${key}` })),
  ]
  return (
    <div className="admin-shell">
      <div className="admin-shell__layout">
        <aside className="admin-shell__sidebar">
          <div className="admin-shell__sidebar-inner">
            <div className="admin-shell__brand">
              <Link to="/">Elsewhere</Link>
              <p>Admin studio</p>
            </div>
            <nav className="admin-shell__nav" aria-label="Admin navigation">
              {nav.map((item) => (
                <NavLink
                  key={item.path}
                  to={
                    item.path === '/admin'
                      ? '/'
                      : item.path.slice('/admin'.length)
                  }
                  end
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="admin-shell__signout">
              <button
                className="button is-ghost"
                onClick={() => {
                  void api('/logout', { method: 'POST' })
                    .then(() => window.location.replace('/admin/login'))
                    .catch((cause) => setError(String(cause)))
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </aside>
        <div className="admin-shell__main">
          <header className="admin-shell__header">
            <p className="eyebrow">ELSEWHERE ADMIN</p>
            <h1>
              {parts[1]
                ? `${parts[1] === 'new' ? 'New' : 'Edit'} ${singularLabels[section as Section] ?? section}`
                : (labels[section] ?? 'Overview')}
            </h1>
          </header>
          {error && (
            <p className="notification is-danger" role="alert">
              {error}
            </p>
          )}
          <Outlet />
        </div>
      </div>
    </div>
  )
}
function Login() {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      await api('/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
        }),
      })
      window.location.replace('/admin')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPending(false)
    }
  }
  return (
    <div className="admin-login">
      <section className="card">
        <header className="admin-login__header">
          <LockKeyhole aria-hidden="true" />
          <p className="eyebrow">ELSEWHERE ADMIN</p>
          <h1 className="admin-login__title">Welcome back.</h1>
        </header>
        <div className="card-content">
          <form onSubmit={(event) => void submit(event)}>
            <div className="field">
              <label className="label" htmlFor="admin-email">
                Email
              </label>
              <div className="control">
                <input
                  className="input"
                  id="admin-email"
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="admin-password">
                Password
              </label>
              <div className="control">
                <input
                  className="input"
                  id="admin-password"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>
            {error && (
              <p className="notification is-danger" role="alert">
                {error}
              </p>
            )}
            <button
              disabled={pending}
              className="button is-primary is-fullwidth"
              type="submit"
            >
              {pending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
function Load<T>({
  url,
  children,
}: {
  url: string
  children: (value: T, reload: () => void) => ReactNode
}) {
  const [state, setState] = useState<{ value?: T; error?: string }>({})
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let active = true
    void api<T>(url)
      .then((value) => {
        if (active) setState({ value })
      })
      .catch((cause) => {
        if (active) setState({ error: String(cause) })
      })
    return () => {
      active = false
    }
  }, [url, version])
  if (state.error)
    return (
      <p className="notification is-danger" role="alert">
        {state.error}
      </p>
    )
  if (state.value === undefined) return <p role="status">Loading…</p>
  return (
    <>
      {children(state.value, () => {
        setState({})
        setVersion((current) => current + 1)
      })}
    </>
  )
}
function Overview() {
  const navigate = useNavigate()
  return (
    <Load<Dashboard> url="/dashboard">
      {(data) => (
        <>
          <div className="admin-dashboard__stats">
            {Object.entries(data.counts).map(([name, value]) => (
              <div className="card" key={name}>
                <div className="card-content">
                  <span>{labels[name] ?? name}</span>
                  <strong>{value}</strong>
                </div>
              </div>
            ))}
          </div>
          <section className="card admin-dashboard__section">
            <div className="card-content">
              <h2 className="admin-dashboard__section-title">
                Recent inquiries
              </h2>
              {data.inquiries.length ? (
                <table className="table is-fullwidth">
                  <thead>
                    <tr>
                      <th>Guest</th>
                      <th>Hotel</th>
                      <th>Dates</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.inquiries
                      .slice(0, 8)
                      .map(({ inquiry, hotelName }) => (
                        <tr key={inquiry.id}>
                          <td>{String(inquiry.name)}</td>
                          <td>{hotelName}</td>
                          <td>
                            {String(inquiry.checkIn)} –{' '}
                            {String(inquiry.checkOut)}
                          </td>
                          <td>{inquiry.status}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <p>No inquiries yet.</p>
              )}
              <button className="button" onClick={() => navigate('/inquiries')}>
                Open inbox
              </button>
            </div>
          </section>
        </>
      )}
    </Load>
  )
}
function Listing({ kind }: { kind: Section }) {
  const navigate = useNavigate()
  return (
    <Load<Row[]> url={`/${kind}`}>
      {(rows) => (
        <section className="card admin-dashboard__section">
          <div className="card-content">
            <button
              className="button is-primary"
              onClick={() => navigate(`/${kind}/new`)}
            >
              New {kind.slice(0, -1)}
            </button>
            <div className="table-container">
              <table className="table is-fullwidth is-striped">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slug</th>
                    <th>Status</th>
                    <th>Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{String(row.name ?? row.title ?? '')}</td>
                      <td>{row.slug}</td>
                      <td>{row.status}</td>
                      <td>
                        <button
                          className="button is-small"
                          onClick={() =>
                            navigate(`/${kind}/${encodeURIComponent(row.id)}`)
                          }
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <p>No records yet.</p>}
          </div>
        </section>
      )}
    </Load>
  )
}
function Editor({ kind, id }: { kind: Section; id: string }) {
  const navigate = useNavigate()
  return (
    <Load<{ record: Row | null; pickers: Pickers }>
      url={`/${kind}/${encodeURIComponent(id)}`}
    >
      {(data, reload) => (
        <EditorForm
          key={`${data.record?.id ?? 'new'}/${data.record?.status ?? ''}/${data.record?.updatedAt ?? ''}`}
          kind={kind}
          data={data}
          navigate={navigate}
          reload={reload}
        />
      )}
    </Load>
  )
}
function EditorForm({
  kind,
  data,
  navigate,
  reload,
}: {
  kind: Section
  data: { record: Row | null; pickers: Pickers }
  navigate: (url: string) => void
  reload: () => void
}) {
  const record = data.record
  const [rich, setRich] = useState<RichNode[]>(
    Array.isArray(record?.content) ? (record.content as RichNode[]) : [],
  )
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const values = new FormData(event.currentTarget)
    const body: Record<string, unknown> = {
      kind: kind === 'posts' ? 'post' : kind.slice(0, -1),
      status: values.get('status'),
      slug: values.get('slug'),
    }
    if (record) body.id = record.id
    for (const field of fields[kind]) {
      const raw = String(values.get(field.name) ?? '')
      body[field.name] =
        field.optional && !raw
          ? null
          : field.type === 'number'
            ? Number(raw)
            : raw
    }
    if (kind === 'destinations' || kind === 'posts') body.content = rich
    try {
      const saved = await api<{ id: string }>(`/${kind}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (record) reload()
      else navigate(`/${kind}/${encodeURIComponent(saved.id)}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }
  async function publish() {
    if (!record) return
    setPending(true)
    setError('')
    try {
      await api(`/${kind}/${encodeURIComponent(record.id)}/publish`, {
        method: 'POST',
        body: JSON.stringify({
          status: record.status === 'published' ? 'draft' : 'published',
        }),
      })
      reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPending(false)
    }
  }
  return (
    <div className="admin-content-form">
      <button
        type="button"
        className="admin-content-form__back"
        onClick={() => navigate(`/${kind}`)}
      >
        <span aria-hidden="true">←</span> All {labels[kind].toLowerCase()}
      </button>
      <form
        className="admin-content-form__form"
        onSubmit={(event) => void submit(event)}
      >
        <section className="card">
          <div className="card-content admin-content-form__grid">
            <label className="field">
              <span className="label">Publication status</span>
              <span className="select is-fullwidth">
                <select name="status" defaultValue={record?.status ?? 'draft'}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </span>
            </label>
            {fields[kind].map((field) => (
              <label
                className={`field ${field.wide ? 'admin-content-form__field--wide' : ''}`}
                key={field.name}
              >
                <span className="label">{field.label}</span>
                {field.picker ? (
                  <span className="select is-fullwidth">
                    <select
                      name={field.name}
                      defaultValue={String(record?.[field.name] ?? '')}
                      required
                    >
                      <option value="">
                        Choose {field.label.toLowerCase()}
                      </option>
                      {(data.pickers[field.picker] ?? []).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </span>
                ) : field.wide ? (
                  <textarea
                    className="textarea"
                    name={field.name}
                    defaultValue={String(record?.[field.name] ?? '')}
                    required={!field.optional}
                    rows={4}
                  />
                ) : (
                  <input
                    className="input"
                    name={field.name}
                    type={field.type ?? 'text'}
                    defaultValue={String(
                      record?.[field.name] ??
                        (field.name === 'heroImage' || field.name === 'image'
                          ? '/images/hero-1280.webp'
                          : field.name === 'currency'
                            ? 'USD'
                            : field.name === 'rating'
                              ? '4.5'
                              : ''),
                    )}
                    required={!field.optional}
                    step={
                      field.name === 'rating' ||
                      field.name === 'latitude' ||
                      field.name === 'longitude'
                        ? 'any'
                        : undefined
                    }
                    min={field.type === 'number' ? '0' : undefined}
                    pattern={
                      field.name === 'slug'
                        ? '[a-z0-9]+(?:-[a-z0-9]+)*'
                        : undefined
                    }
                  />
                )}
              </label>
            ))}
          </div>
        </section>
        {(kind === 'destinations' || kind === 'posts') && (
          <section className="card">
            <div className="card-content">
              <h2>Rich content</h2>
              <RichEditor
                initial={rich}
                pickers={data.pickers}
                onChange={setRich}
              />
            </div>
          </section>
        )}
        {error && (
          <p className="notification is-danger" role="alert">
            {error}
          </p>
        )}
        <div className="buttons">
          <button
            type="submit"
            disabled={pending}
            className="button is-primary"
          >
            {pending ? 'Saving…' : 'Save content'}
          </button>
          {record && (
            <button
              type="button"
              disabled={pending}
              className="button"
              onClick={() => void publish()}
            >
              {record.status === 'published' ? 'Unpublish' : 'Publish'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
function Inbox() {
  const [error, setError] = useState('')
  return (
    <Load<Dashboard> url="/dashboard">
      {(data, reload) => (
        <section className="card admin-dashboard__section">
          <div className="card-content">
            <h2 className="admin-dashboard__section-title">Guest inquiries</h2>
            {error && (
              <p className="notification is-danger" role="alert">
                {error}
              </p>
            )}
            <div className="table-container">
              <table className="table is-fullwidth">
                <thead>
                  <tr>
                    <th>Guest</th>
                    <th>Hotel / dates</th>
                    <th>Contact</th>
                    <th>Message</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.inquiries.map(({ inquiry, hotelName }) => (
                    <tr key={inquiry.id}>
                      <td>
                        <strong>{String(inquiry.name)}</strong>
                        <br />
                        <small>{inquiry.id}</small>
                      </td>
                      <td>
                        {hotelName}
                        <br />
                        {String(inquiry.checkIn)} – {String(inquiry.checkOut)}
                      </td>
                      <td>
                        <a
                          href={`mailto:${encodeURIComponent(String(inquiry.email))}`}
                        >
                          {String(inquiry.email)}
                        </a>
                        <br />
                        {String(inquiry.phone ?? '')}
                      </td>
                      <td>{String(inquiry.message ?? '')}</td>
                      <td>
                        <select
                          className="select"
                          aria-label={`Status for ${String(inquiry.name)}`}
                          value={inquiry.status}
                          onChange={(event) => {
                            void api(
                              `/inquiries/${encodeURIComponent(inquiry.id)}/status`,
                              {
                                method: 'POST',
                                body: JSON.stringify({
                                  status: event.target.value,
                                }),
                              },
                            )
                              .then(reload)
                              .catch((cause) => setError(String(cause)))
                          }}
                        >
                          <option value="new">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="closed">Closed</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.inquiries.length && <p>No inquiries yet.</p>}
          </div>
        </section>
      )}
    </Load>
  )
}
function Media() {
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [upload, setUpload] = useState(false)
  const [version, setVersion] = useState(0)
  const [selection, setSelection] = useState<{
    file: File
    url: string
  } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [unavailable, setUnavailable] = useState<Record<string, boolean>>({})
  const [copyStatus, setCopyStatus] = useState<{
    id: string
    message: string
  } | null>(null)

  useEffect(() => {
    return () => {
      if (selection) URL.revokeObjectURL(selection.url)
    }
  }, [selection])

  function chooseFile(file?: File) {
    setError('')
    setNotice('')
    if (!file) {
      setSelection(null)
    } else if (
      !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(
        file.type,
      )
    ) {
      setSelection(null)
      setError('Choose a JPEG, PNG, WebP or AVIF image.')
    } else if (file.size > 10 * 1024 * 1024) {
      setSelection(null)
      setError('The image must be 10 MB or smaller.')
    } else {
      setSelection({ file, url: URL.createObjectURL(file) })
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selection) {
      setError('Choose an image to upload.')
      return
    }
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    form.set('file', selection.file)
    setUpload(true)
    setError('')
    setNotice('')
    try {
      await api('/media', { method: 'POST', body: form })
      formElement.reset()
      setSelection(null)
      setUnavailable({})
      setCopyStatus(null)
      setNotice('Image uploaded. The media library is updating.')
      setVersion((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setUpload(false)
    }
  }

  async function copyPath(id: string, path: string) {
    try {
      await navigator.clipboard.writeText(path)
      setCopyStatus({ id, message: 'Path copied.' })
    } catch {
      setCopyStatus({ id, message: 'Could not copy. Select the path below.' })
    }
  }

  return (
    <div className="media-library">
      <section className="card admin-dashboard__section">
        <div className="card-content">
          <h2 className="admin-dashboard__section-title">Upload an image</h2>
          <p className="media-library__description">
            Add an original image to use across your site.
          </p>
          <form
            onSubmit={(event) => void submit(event)}
            className="media-library__upload"
          >
            <label
              className={`media-library__dropzone${dragging ? ' media-library__dropzone--dragging' : ''}`}
              onDragEnter={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault()
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                  setDragging(false)
              }}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                if (!upload) chooseFile(event.dataTransfer.files[0])
              }}
            >
              <input
                className="media-library__file-input"
                type="file"
                name="file"
                aria-label="Choose an image (JPEG, PNG, WebP or AVIF)"
                accept="image/jpeg,image/png,image/webp,image/avif"
                aria-describedby="media-file-help"
                disabled={upload}
                onChange={(event) => chooseFile(event.currentTarget.files?.[0])}
              />
              {selection ? (
                <img
                  className="media-library__preview"
                  src={selection.url}
                  alt={`Preview of ${selection.file.name}`}
                />
              ) : (
                <span className="media-library__prompt">
                  <span aria-hidden="true">＋</span>
                  <span>Choose or drop an image</span>
                </span>
              )}
            </label>
            <div className="media-library__fields">
              <p className="media-library__help" id="media-file-help">
                {selection
                  ? `Selected: ${selection.file.name}`
                  : 'JPEG, PNG, WebP or AVIF · up to 10 MB'}
              </p>
              <div className="field">
                <label className="label" htmlFor="media-alt">
                  Alternative text
                </label>
                <input
                  className="input"
                  id="media-alt"
                  name="alt"
                  minLength={2}
                  maxLength={240}
                  placeholder="Describe the image for visitors"
                  required
                  disabled={upload}
                />
              </div>
              <div className="field media-library__caption-field">
                <label className="label" htmlFor="media-caption">
                  Caption{' '}
                  <span className="media-library__optional">(optional)</span>
                </label>
                <input
                  className="input"
                  id="media-caption"
                  name="caption"
                  maxLength={500}
                  placeholder="Add context to the image"
                  disabled={upload}
                />
              </div>
            </div>
            <button
              disabled={upload || !selection}
              className="button is-primary media-library__submit"
              type="submit"
            >
              {upload ? 'Uploading…' : 'Upload image'}
            </button>
            {error && (
              <p role="alert" className="notification is-danger">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="notification is-success">
                {notice}
              </p>
            )}
          </form>
        </div>
      </section>
      <Load<Dashboard> key={version} url="/dashboard">
        {(data) => (
          <section className="card admin-dashboard__section">
            <div className="card-content">
              <h2 className="admin-dashboard__section-title">Media library</h2>
              <p className="media-library__description">
                Copy a large image path to use in a page or journal post.
              </p>
              {data.media.length ? (
                <div className="media-library__grid">
                  {data.media.map((asset) => (
                    <article className="media-library__asset" key={asset.id}>
                      <div className="media-library__asset-image">
                        {unavailable[asset.id] || !asset.variants.thumbnail ? (
                          <p className="media-library__unavailable">
                            File unavailable; upload original again. The saved
                            path below will not show an image. Use the new path
                            after re-uploading.
                          </p>
                        ) : (
                          <img
                            src={asset.variants.thumbnail}
                            alt={asset.alt}
                            width="240"
                            height="160"
                            loading="lazy"
                            onError={() =>
                              setUnavailable((state) => ({
                                ...state,
                                [asset.id]: true,
                              }))
                            }
                          />
                        )}
                      </div>
                      <div className="media-library__asset-copy">
                        <strong title={asset.filename}>{asset.filename}</strong>
                        <small>{asset.alt}</small>
                        <label
                          className="label"
                          htmlFor={`media-path-${asset.id}`}
                        >
                          Large image path
                        </label>
                        <div className="media-library__path">
                          <input
                            id={`media-path-${asset.id}`}
                            className="input"
                            readOnly
                            value={asset.variants.large ?? ''}
                            onFocus={(event) => event.currentTarget.select()}
                            onClick={(event) => event.currentTarget.select()}
                          />
                          <button
                            type="button"
                            className="button"
                            disabled={
                              !asset.variants.large || unavailable[asset.id]
                            }
                            onClick={() =>
                              void copyPath(asset.id, asset.variants.large)
                            }
                            aria-label={`Copy large image path for ${asset.filename}`}
                          >
                            Copy
                          </button>
                        </div>
                        {copyStatus?.id === asset.id && (
                          <small role="status">{copyStatus.message}</small>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="media-library__empty">
                  <div>
                    <p>No images uploaded yet.</p>
                    <small>Choose an image above to get started.</small>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </Load>
    </div>
  )
}

createRoot(document.getElementById('admin-root')!).render(
  <BrowserRouter basename="/admin">
    <App />
  </BrowserRouter>,
)
