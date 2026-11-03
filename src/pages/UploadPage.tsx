import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError, apiBaseUrl, parseApiError } from '../api/client'
import type { Capacity, City, Place, State } from '../api/types'
import { Field, FormError, Notice, Spinner } from '../components/Form'
import { PlacesPickerView } from '../components/PlacesPicker'

/**
 * Send a truck's details and photos without signing in, through a personal secret link
 * (`/u/<token>`). For someone who has an account but cannot use the app.
 *
 * Deliberately NOT built on the shared `api` client: that one attaches the signed-in user's
 * bearer token when there is one, and a 401 from it signs the app out. An administrator testing
 * this page in their own browser would otherwise send the entry as themselves, or be bounced to
 * the login page by an expired token on a route that needs none. This page speaks only to
 * `/api/public/upload/<token>`, and which person the entry belongs to is decided by the server
 * from the token -- nothing here can choose it.
 *
 * **Nothing on the form is required.** The CSR who rings the driver can use whatever arrives.
 */

const MAX_PHOTOS = 5

/** The loads that are common enough to deserve a button. Everything else is in the dropdown. */
const QUICK_TONS = [9, 12, 25, 30]

type Check = { state: 'checking' } | { state: 'ok'; name: string } | { state: 'bad'; message: string }

interface Masters {
  states: { id: number; code: string; name: string; cities: { id: number; name: string }[] }[]
  capacities: { id: number; label: string; tons: number | string }[]
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

export function UploadPage() {
  const { token = '' } = useParams()
  const base = `${apiBaseUrl}/api/public/upload/${encodeURIComponent(token)}`
  const [check, setCheck] = useState<Check>({ state: 'checking' })
  const [masters, setMasters] = useState<Masters | null>(null)

  const [files, setFiles] = useState<File[]>([])
  const [plate, setPlate] = useState('')
  const [mobile, setMobile] = useState('')
  const [owner, setOwner] = useState('')
  const [capacityId, setCapacityId] = useState<number | null>(null)
  const [places, setPlaces] = useState<Place[]>([])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [sent, setSent] = useState<number>(0)
  const picker = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    fetch(base)
      .then(async (r) => {
        if (!live) return
        if (!r.ok) {
          setCheck({
            state: 'bad',
            message:
              r.status === 404
                ? 'This link is not valid any more. Ask for a new one.'
                : `The server returned ${r.status}.`,
          })
          return
        }
        setCheck({ state: 'ok', name: ((await r.json()) as { name: string }).name })
        // The pick lists are a convenience: if they fail to load the form still works, just
        // without suggestions and the capacity buttons.
        fetch(`${base}/masters`)
          .then((m) => (m.ok ? m.json() : null))
          .then((m) => live && m && setMasters(m as Masters))
          .catch(() => {})
      })
      .catch(() => live && setCheck({ state: 'bad', message: 'Cannot reach the server.' }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Shaped like the signed-in screens' lists so the same location picker can be reused.
  const states: State[] = useMemo(
    () => (masters?.states ?? []).map((s) => ({ id: s.id, code: s.code, name: s.name })),
    [masters],
  )
  const cities: City[] = useMemo(
    () =>
      (masters?.states ?? []).flatMap((s) =>
        s.cities.map((c) => ({ id: c.id, name: c.name, state_id: s.id, active: true })),
      ),
    [masters],
  )
  const capacities: (Capacity & { n: number })[] = useMemo(
    () =>
      (masters?.capacities ?? []).map((c) => ({
        id: c.id,
        label: c.label,
        tons: String(c.tons),
        active: true,
        n: Number(c.tons),
      })),
    [masters],
  )
  const quick = QUICK_TONS.map((t) => capacities.find((c) => c.n === t)).filter(
    (c): c is Capacity & { n: number } => !!c,
  )
  const others = capacities.filter((c) => !QUICK_TONS.includes(c.n))
  const otherPicked = others.some((c) => c.id === capacityId)

  function addFiles(list: FileList | null) {
    if (!list) return
    // Copied NOW, not inside the state updater. A FileList is live: clearing the input below
    // empties it, and the updater runs later, so reading `list` there yields no photos at all.
    const chosen = Array.from(list)
    setFiles((current) => [...current, ...chosen].slice(0, MAX_PHOTOS))
    // So choosing the same photo again after removing it still fires onChange.
    if (picker.current) picker.current.value = ''
  }

  const empty =
    files.length === 0 &&
    !plate.trim() &&
    !mobile.trim() &&
    !owner.trim() &&
    capacityId === null &&
    places.length === 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    // Not a requirement, only a guard against a stray tap on Send with nothing filled in.
    if (empty && !window.confirm('Nothing has been filled in. Send an empty entry anyway?')) return
    setBusy(true)
    setError(null)
    const form = new FormData()
    files.forEach((f) => form.append('images', f))
    const add = (name: string, value: string) => value.trim() && form.append(name, value.trim())
    add('reported_plate', plate.toUpperCase())
    add('reported_mobile', mobile)
    add('owner', owner)
    if (capacityId !== null) form.append('capacity_id', String(capacityId))
    if (places.length > 0) form.append('places', JSON.stringify(places))
    form.append('captured_at', new Date().toISOString())

    try {
      const response = await fetch(`${base}/photos`, { method: 'POST', body: form })
      if (!response.ok) {
        throw parseApiError(response.status, await readJson(response))
      }
      setSent((n) => n + 1)
      setFiles([])
      setPlate('')
      setMobile('')
      setOwner('')
      setCapacityId(null)
      setPlaces([])
      window.scrollTo({ top: 0 })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError(0, 'Could not send. Check your connection and try again.'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (check.state === 'checking') {
    return (
      <div className="login-page">
        <Spinner />
      </div>
    )
  }
  if (check.state === 'bad') {
    return (
      <div className="login-page">
        <div className="card login-card">
          <h1>Vehicle Management</h1>
          <Notice kind="error">{check.message}</Notice>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page upload-page">
      <form className="card login-card" onSubmit={submit}>
        <h1>Add a vehicle</h1>
        <p className="muted">
          Sending as <strong>{check.name}</strong>. Fill in whatever you know — nothing is
          required.
        </p>

        {sent > 0 && (
          <Notice kind="ok">
            Sent{sent > 1 ? ` (${sent} so far)` : ''}. You can add another vehicle below.
          </Notice>
        )}
        <FormError error={error} />

        <Field label={`Photos (up to ${MAX_PHOTOS})`} name="images">
          <input
            ref={picker}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => addFiles(e.target.files)}
            disabled={files.length >= MAX_PHOTOS}
          />
        </Field>
        {files.length > 0 && (
          <ul className="upload-files">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                {f.name}{' '}
                <button
                  type="button"
                  className="link upload-remove"
                  onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <Field label="Registration number" name="reported_plate" error={error}>
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            autoCapitalize="characters"
            placeholder="MH12AB1234"
          />
        </Field>

        <Field label="Owner" name="owner" error={error}>
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Owner or company name"
          />
        </Field>

        <Field label="Driver / owner mobile" name="reported_mobile" error={error}>
          <input
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            inputMode="tel"
            placeholder="10-digit number"
          />
        </Field>

        {capacities.length > 0 && (
          <fieldset className="field cap-group">
            <legend className="field-label">Capacity</legend>
            <div className="cap-options">
              {quick.map((c) => (
                <label key={c.id} className="cap-option">
                  <input
                    type="radio"
                    name="capacity"
                    checked={capacityId === c.id}
                    onChange={() => setCapacityId(c.id)}
                  />
                  <span>{c.n} ton</span>
                </label>
              ))}
            </div>
            <select
              value={otherPicked ? String(capacityId) : ''}
              onChange={(e) => setCapacityId(e.target.value ? Number(e.target.value) : null)}
              aria-label="Other capacity"
            >
              <option value="">Other capacity…</option>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {capacityId !== null && (
              <button
                type="button"
                className="link upload-remove"
                onClick={() => setCapacityId(null)}
              >
                clear
              </button>
            )}
          </fieldset>
        )}

        <div className="field">
          <span className="field-label">Where does it run? (add as many as you like)</span>
          {masters ? (
            <PlacesPickerView states={states} cities={cities} value={places} onChange={setPlaces} />
          ) : (
            <p className="muted small">Loading places…</p>
          )}
        </div>

        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
