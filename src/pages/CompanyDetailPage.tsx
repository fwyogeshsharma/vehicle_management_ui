import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchAll, ApiError } from '../api/client'
import { companies, geo, users } from '../api/resources'
import type { CompanyDetail, Place, State } from '../api/types'
import { Empty, Field, FormError, Notice, Spinner } from '../components/Form'
import { PlacesEditor, placeLabel } from '../components/PlacesEditor'
import { useAsync } from '../components/useAsync'

export function CompanyDetailPage() {
  const id = Number(useParams().id)
  const company = useAsync(() => companies.get(id), [id])

  if (company.loading && !company.data) return <Spinner />
  if (company.error) return <Notice kind="error">{company.error.message}</Notice>
  if (!company.data) return null
  const c = company.data

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>{c.name}</h1>
          <p className="muted">
            {c.gstin ?? 'no GSTIN'}
            {!c.active && ' · retired'}
          </p>
        </div>
      </header>

      <div className="columns">
        <div className="stack">
          <MembersCard company={c} />
          <FleetCard company={c} />
        </div>
        <div className="stack">
          <LocationsCard company={c} />
          <CompanyDetailsCard company={c} onSaved={company.reload} />
        </div>
      </div>
    </div>
  )
}

/**
 * Who is on the books — the other end of "attaching a driver to a company".
 *
 * The same fact is editable from the user's own page and from here, because it is reached
 * from both directions in practice: hiring someone, and staffing a company.
 */
function MembersCard({ company }: { company: CompanyDetail }) {
  const members = useAsync(() => companies.members(company.id), [company.id])
  const everyone = useAsync(
    () => fetchAll((page, page_size) => users.list({ active: true, page, page_size })), [])
  const [pick, setPick] = useState<number | ''>('')
  const [position, setPosition] = useState('Driver')
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const already = new Set((members.data ?? []).map((m) => m.user_id))
  const available = (everyone.data?.items ?? []).filter((u) => !already.has(u.id))

  async function attach(e: React.FormEvent) {
    e.preventDefault()
    if (pick === '') return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      await users.joinCompany(Number(pick), company.id, position, false)
      setPick('')
      members.reload()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  async function detach(userId: number, name: string | null) {
    const who = name ?? 'this user'
    if (
      !window.confirm(
        `Take ${who} off ${company.name}'s books?\n\n` +
          `This also removes every assignment they hold on ${company.name}'s trucks.`,
      )
    )
      return
    setBusy(true)
    setError(null)
    try {
      const left = await users.leaveCompany(userId, company.id)
      setResult(
        left.removed_driver_assignments === 0
          ? `${who} is off the books. They were not driving any of these trucks.`
          : `${who} is off the books, and off ${left.removed_driver_assignments} truck${
              left.removed_driver_assignments === 1 ? '' : 's'
            }.`,
      )
      members.reload()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>On the books</h2>
      {result && <Notice kind="ok">{result}</Notice>}
      {error && <Notice kind="error">{error.message}</Notice>}

      {members.loading && !members.data && <Spinner />}
      {members.data?.length === 0 && (
        <Empty>
          Nobody yet. <strong>Until someone is on the books, none of this company's trucks can
          be assigned a driver.</strong>
        </Empty>
      )}

      {members.data && members.data.length > 0 && (
        <table className="table">
          <tbody>
            {members.data.map((m) => (
              <tr key={m.user_id}>
                <td>
                  <Link to={`/drivers/${m.user_id}`}>{m.name}</Link>
                  <div className="muted small">{m.mobile}</div>
                </td>
                <td>{m.position ?? '—'}</td>
                <td>
                  <span className="badge">{m.user_type}</span>
                  {m.primary && <span className="badge badge-ok">Main employer</span>}
                </td>
                <td className="right">
                  <button
                    type="button"
                    className="link danger"
                    disabled={busy}
                    onClick={() => detach(m.user_id, m.name)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form className="inline-form" onSubmit={attach}>
        <select value={pick} onChange={(e) => setPick(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Add someone…</option>
          {available.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.mobile}) — {u.user_type}
            </option>
          ))}
        </select>
        <input
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder="Position"
          aria-label="Position"
        />
        <button type="submit" disabled={busy || pick === ''}>
          Add to company
        </button>
      </form>
      <p className="muted small">
        Anyone here may be assigned to this company's vehicles. Nobody else can be — that is
        enforced by the database, not just by this screen.
      </p>
    </section>
  )
}

function FleetCard({ company }: { company: CompanyDetail }) {
  const fleet = useAsync(() => companies.vehicles(company.id), [company.id])

  return (
    <section className="card">
      <h2>Fleet</h2>
      {fleet.loading && !fleet.data && <Spinner />}
      {fleet.error && <Notice kind="error">{fleet.error.message}</Notice>}
      {fleet.data?.length === 0 && <Empty>This company owns no vehicles.</Empty>}
      {fleet.data && fleet.data.length > 0 && (
        <table className="table">
          <tbody>
            {fleet.data.map((v) => (
              <tr key={v.id} className={v.active ? '' : 'row-muted'}>
                <td>
                  <Link to={`/vehicles/${v.id}`}>{v.registration_number}</Link>
                </td>
                <td>{v.capacity ?? '—'}</td>
                <td>{!v.active && <span className="badge">Retired</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

/**
 * Where the company operates — and therefore where every one of its trucks runs.
 *
 * Worth stating plainly on this screen: an empty list means its vehicles serve **nowhere**. They
 * do not fall back to preferences of their own, because a company-owned vehicle is not allowed
 * to have any.
 */
function LocationsCard({ company }: { company: CompanyDetail }) {
  const saved = useAsync(() => companies.locations(company.id), [company.id])
  const states = useAsync(() => geo.states(), [])
  const [draft, setDraft] = useState<Place[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)

  const stateNames = new Map((states.data ?? []).map((s: State) => [s.id, s.name]))

  // Resolving a city id to a name costs a request per distinct state, because the API has no
  // "get one city" endpoint -- only the list for a state. One request per state beats the
  // alternative, which is what this screen did first: print "City #223" at the user.
  const usedStates = [...new Set((saved.data ?? []).map((l) => l.state_id))]
  const cityNames = useAsync(async () => {
    const lists = await Promise.all(usedStates.map((id) => geo.citiesOfState(id)))
    const map = new Map<number, string>()
    for (const list of lists) for (const c of list) map.set(c.id, c.name)
    return map
  }, [usedStates.join(',')])

  async function save() {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      await companies.setLocations(company.id, draft)
      setDraft(null)
      saved.reload()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Where it operates</h2>
      {error && <Notice kind="error">{error.message}</Notice>}
      {saved.loading && !saved.data && <Spinner />}

      {saved.data && saved.data.length === 0 && (
        <Notice kind="warn">
          No locations, so <strong>every truck this company owns serves nowhere</strong> and will
          not appear in a city search. That is the rule, not a bug — but it is usually not what
          anyone wants.
        </Notice>
      )}

      {saved.data && saved.data.length > 0 && (
        <ul className="chips">
          {saved.data.map((l) => (
            <li key={l.id} className="chip">
              {l.city_id === null
                ? placeLabel(stateNames.get(l.state_id) ?? 'that state', null)
                : (cityNames.data?.get(l.city_id) ?? '…')}
              {l.city_id !== null && stateNames.get(l.state_id) && (
                <span className="chip-tag">{stateNames.get(l.state_id)}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {draft === null ? (
        <button
          type="button"
          onClick={() =>
            setDraft((saved.data ?? []).map((l) => ({ state_id: l.state_id, city_id: l.city_id })))
          }
        >
          Edit locations
        </button>
      ) : (
        <>
          <PlacesEditor value={draft} onChange={setDraft} disabled={busy} />
          <div className="actions">
            <button type="button" className="primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save locations'}
            </button>
            <button type="button" className="link" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function CompanyDetailsCard({
  company,
  onSaved,
}: {
  company: CompanyDetail
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState(company.name)
  const [mobile, setMobile] = useState(company.mobile ?? '')
  const [email, setEmail] = useState(company.email ?? '')
  const [gstin, setGstin] = useState(company.gstin ?? '')
  const [address, setAddress] = useState(company.address ?? '')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await companies.update(company.id, {
        name,
        mobile: mobile || null,
        email: email || null,
        gstin: gstin || null,
        address: address || null,
        head_office_city_id: company.head_office_city_id,
      })
      setEditing(false)
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive() {
    setBusy(true)
    setError(null)
    try {
      if (company.active) await companies.deactivate(company.id)
      else await companies.restore(company.id)
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <section className="card">
        <h2>Details</h2>
        {error && <Notice kind="error">{error.message}</Notice>}
        <dl className="pairs">
          <dt>Mobile</dt>
          <dd>{company.mobile ?? '—'}</dd>
          <dt>Email</dt>
          <dd>{company.email ?? '—'}</dd>
          <dt>GSTIN</dt>
          <dd>{company.gstin ?? '—'}</dd>
          <dt>Address</dt>
          <dd>{company.address ?? '—'}</dd>
        </dl>
        <div className="actions">
          <button type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button type="button" className="link danger" onClick={toggleActive} disabled={busy}>
            {company.active ? 'Retire company' : 'Reinstate company'}
          </button>
        </div>
        <p className="muted small">
          Retiring keeps the company and its fleet — its vehicles reference it, so it is never
          really deleted.
        </p>
      </section>
    )
  }

  return (
    <form className="card" onSubmit={save}>
      <h2>Details</h2>
      <FormError error={error} />
      <Field label="Name" name="name" error={error}>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <div className="grid-2">
        <Field label="Mobile" name="mobile" error={error}>
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </Field>
        <Field label="Email" name="email" error={error}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
      <Field label="GSTIN" name="gstin" error={error}>
        <input value={gstin} onChange={(e) => setGstin(e.target.value)} />
      </Field>
      <Field
        label="Address"
        name="address"
        error={error}
        hint="Where it is registered — not where it operates. That is the locations above."
      >
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
      </Field>
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="link" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
